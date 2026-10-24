"""Host-Audit-Plugin: erkennt unerwünschte/riskante Software auf dem Gerät.

Zwei unabhängige Erkennungswege:
1. Prozess-/Kommandozeilen-Abgleich gegen bekannte Signaturen (Miner,
   RMM-/Fernzugriffstools) - siehe config/software_signatures.yaml
2. Netzwerk-Indikator: ausgehende Verbindungen zu Ports/Hostnamen, die
   typisch für Mining-Pools (Stratum-Protokoll) sind. Das greift auch dann,
   wenn ein Miner seinen Prozessnamen tarnt - ist dafür ein schwächerer
   Indikator und wird separat markiert.

Die ToyCoin-Ausnahme (offizieller ToyCoin-Miner über die TOYPAY-Wallet)
gilt für beide Wege. Sie liegt in config/local_overrides.yaml - getrennt
von der automatisch aktualisierten Basis-Signaturliste
(config/software_signatures.yaml), damit der Update-Job (app/core/updater.py)
sie nie überschreiben kann.

Erkennung erfolgt ausschließlich über laufende Prozesse/Verbindungen
(psutil) und Abgleich mit einer Signaturliste - kein Eingriff in fremde
Systeme, nur Auslesen des eigenen/autorisierten Geräts.
"""
from __future__ import annotations

import socket
import uuid
from pathlib import Path
from typing import Optional

import psutil
import yaml

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

SIGNATURES_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "software_signatures.yaml"
OVERRIDES_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "local_overrides.yaml"

_SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
}


class UnwantedSoftwarePlugin(Plugin):
    """Läuft nur auf Assets vom Typ HOST - benötigt lokalen Prozess-/Netzwerkzugriff."""

    name = "unwanted-software-audit"
    category = "Host Hardening"
    kali_equivalent = "kein direktes Äquivalent (vergleichbar mit Application Whitelisting / EDR)"
    phase = ScanPhase.DEEP_DIVE
    station = Station.VAULT
    explanation = "sucht fremde Miner und Fernwartungs-Tools; der offizielle ToyCoin-Miner ist erlaubt"

    def __init__(self, signatures_path: Path = SIGNATURES_PATH, overrides_path: Path = OVERRIDES_PATH) -> None:
        self._signatures = self._load_merged(signatures_path, overrides_path)
        self._allowlist_patterns = {
            m.lower()
            for entry in self._signatures.get("allowlist", [])
            for m in entry.get("matches", [])
        }

    @staticmethod
    def _load_yaml(path: Path) -> dict:
        if not path.exists():
            return {}
        return yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    def _load_merged(self, signatures_path: Path, overrides_path: Path) -> dict:
        """Führt Basis-Signaturen (update-fähig) und lokale Overrides
        (nie automatisch überschrieben) zusammen. Die Allowlist kommt
        ausschließlich aus den Overrides.
        """
        base = self._load_yaml(signatures_path)
        overrides = self._load_yaml(overrides_path)

        merged = dict(base)
        merged["allowlist"] = overrides.get("allowlist", [])

        for category, extra_patterns in (overrides.get("additional_patterns") or {}).items():
            if category in merged:
                merged[category] = dict(merged[category])
                merged[category]["patterns"] = list(merged[category].get("patterns", [])) + list(extra_patterns)

        return merged

    def is_available(self) -> bool:
        return bool(self._signatures)

    def applies_to(self, asset: Asset) -> bool:
        # Prozesse und Verbindungen lassen sich nur auf dem eigenen Gerät lesen.
        return asset.is_local and asset.asset_type in (AssetType.HOST, AssetType.TOYCHAIN_NODE)

    def run(self, asset: Asset) -> list[Finding]:
        findings = self._check_process_signatures(asset)
        findings.extend(self._check_network_indicators(asset))
        return findings

    # -- Erkennungsweg 1: Prozess-/Kommandozeilen-Signaturen -----------------

    def _check_process_signatures(self, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        processes = self._running_process_signatures()

        for category, rule in self._signatures.items():
            if category in ("allowlist", "cryptominer_network_indicators"):
                continue

            for pattern in rule.get("patterns", []):
                for proc_signature in processes:
                    if pattern.lower() not in proc_signature.lower():
                        continue
                    if self._is_allowlisted(proc_signature):
                        continue  # z.B. der offizielle ToyCoin-Miner

                    findings.append(Finding(
                        id=str(uuid.uuid4()),
                        station=self.station,
                        asset_id=asset.id,
                        title=f"Unerwünschte Software erkannt: {proc_signature.strip()[:80]}",
                        description=f"Kategorie '{category}' – Prozess passt auf Signatur '{pattern}'.",
                        severity=_SEVERITY_MAP.get(rule.get("severity", "medium"), Severity.MEDIUM),
                        source_plugin=self.name,
                        recommendation=rule.get("recommendation", "").strip(),
                    ))

        return findings

    @staticmethod
    def _running_process_signatures() -> set[str]:
        """Sammelt Prozessnamen und Kommandozeilen laufender Prozesse."""
        signatures: set[str] = set()
        for proc in psutil.process_iter(["name", "cmdline"]):
            info = proc.info
            if info.get("name"):
                signatures.add(info["name"])
            if info.get("cmdline"):
                signatures.add(" ".join(info["cmdline"]))
        return {s for s in signatures if s}

    # -- Erkennungsweg 2: Netzwerk-Indikator (Mining-Pool-Verbindungen) ------

    def _check_network_indicators(self, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        rule = self._signatures.get("cryptominer_network_indicators")
        if not rule:
            return findings

        suspicious_ports = set(rule.get("ports", []))
        known_hostnames = [h.lower() for h in rule.get("known_pool_hostnames", [])]

        for conn in psutil.net_connections(kind="tcp"):
            if conn.status != psutil.CONN_ESTABLISHED or not conn.raddr:
                continue

            remote_ip, remote_port = conn.raddr.ip, conn.raddr.port
            hostname = self._reverse_lookup(remote_ip)

            port_hit = remote_port in suspicious_ports
            hostname_hit = bool(hostname) and any(h in hostname.lower() for h in known_hostnames)
            if not (port_hit or hostname_hit):
                continue

            owning_process = self._process_name(conn.pid)
            if owning_process and self._is_allowlisted(owning_process):
                continue  # z.B. der offizielle ToyCoin-Miner

            findings.append(Finding(
                id=str(uuid.uuid4()),
                station=self.station,
                asset_id=asset.id,
                title=(
                    f"Verdächtige Mining-Verbindung: {remote_ip}:{remote_port}"
                    + (f" ({hostname})" if hostname else "")
                ),
                description=(
                    f"Prozess '{owning_process or 'unbekannt'}' (PID {conn.pid}) hält eine Verbindung "
                    f"zu {remote_ip}:{remote_port}, die zu einem für Mining-Pools typischen "
                    f"Port/Hostnamen passt."
                ),
                severity=_SEVERITY_MAP.get(rule.get("severity", "medium"), Severity.MEDIUM),
                source_plugin=self.name,
                recommendation=rule.get("recommendation", "").strip(),
            ))

        return findings

    def _is_allowlisted(self, signature: str) -> bool:
        return any(allow in signature.lower() for allow in self._allowlist_patterns)

    @staticmethod
    def _reverse_lookup(ip: str) -> Optional[str]:
        try:
            return socket.gethostbyaddr(ip)[0]
        except (socket.herror, socket.gaierror, OSError):
            return None

    @staticmethod
    def _process_name(pid: Optional[int]) -> Optional[str]:
        if pid is None:
            return None
        try:
            return psutil.Process(pid).name()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None
