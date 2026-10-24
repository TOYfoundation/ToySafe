"""Knoten-Wache: Härtung eines eigenen ToyChain-Knotens bzw. Validators.

Grundlage sind die Vorgaben aus Safehaigit/toycoin (Spezifikation und
TOYPAY-Wallet-Doku):
- Validator-Schlüssel (BLS) sind getrennt vom Geld-Schlüssel. Der
  Geld-Schlüssel gehört nicht auf das Validator-Gerät.
- Mitsignieren nur auf einem Gerät (Entscheidung 80): ein zweiter laufender
  Knoten mit demselben Schlüssel wäre gefährlich.
- ToyScan färbt A4 gelb, wenn Zeitstempel dauerhaft mehr als 5 Sekunden von
  unabhängigen Zeitquellen abweichen. Deshalb prüft TimeSyncPlugin die Uhr.

Ports, Prozessnamen und Pfade stehen in config/toynode.yaml, weil der
Knoten (Meilensteine M6/M7) noch im Bau ist. Alles wird nur lokal gelesen.
"""
from __future__ import annotations

import os
import re
import stat
import subprocess
from pathlib import Path

import psutil
import yaml

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "toynode.yaml"


def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    return yaml.safe_load(path.read_text(encoding="utf-8")) or {}


class ToyNodeAuditPlugin(Plugin):
    name = "toynode-audit"
    category = "Host Hardening"
    kali_equivalent = "kein Äquivalent (ToyChain-spezifisch)"
    phase = ScanPhase.DEEP_DIVE
    station = Station.OPERATOR
    explanation = "prüft deinen ToyChain-Knoten: Rechte, offene Schnittstellen, Schlüssel-Trennung"

    def __init__(self, config_path: Path = CONFIG_PATH) -> None:
        self._cfg = _load(config_path)

    def is_available(self) -> bool:
        return bool(self._cfg)

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.TOYCHAIN_NODE and asset.is_local

    def _node_processes(self) -> list[psutil.Process]:
        names = {n.lower() for n in self._cfg.get("process_names", [])}
        procs = []
        for p in psutil.process_iter(["name", "username"]):
            if (p.info.get("name") or "").lower() in names:
                procs.append(p)
        return procs

    def run(self, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        procs = self._node_processes()

        if not procs:
            findings.append(self.finding(asset, "Kein laufender ToyChain-Knoten gefunden", Severity.INFO,
                                         description="Prozessnamen aus config/toynode.yaml wurden nicht gefunden."))
        if len(procs) > 1:
            findings.append(self.finding(
                asset, f"{len(procs)} Knoten-Prozesse gleichzeitig", Severity.HIGH,
                description="Laufen zwei Knoten mit demselben Signier-Schlüssel, droht doppeltes Signieren.",
                recommendation="Nur einen Knoten mit Signier-Schlüssel betreiben (Mitsignieren nur auf einem Gerät).",
            ))
        for p in procs:
            if p.info.get("username") in ("root", "SYSTEM"):
                findings.append(self.finding(
                    asset, "Knoten läuft mit Administratorrechten", Severity.HIGH,
                    description=f"Prozess {p.info.get('name')} (PID {p.pid}) läuft als {p.info.get('username')}.",
                    recommendation="Eigenen Systembenutzer ohne Login anlegen (z. B. 'toynode') und den Dienst damit starten.",
                ))

        findings += self.check_listening(psutil.net_connections(kind="inet"), asset)
        findings += self.check_key_files(asset)
        return findings

    def check_listening(self, connections, asset: Asset) -> list[Finding]:
        findings = []
        rpc_ports = set(self._cfg.get("rpc_ports", []))
        for c in connections:
            if c.status != psutil.CONN_LISTEN or not c.laddr:
                continue
            if c.laddr.port in rpc_ports and c.laddr.ip in ("0.0.0.0", "::"):
                findings.append(self.finding(
                    asset, f"RPC-Schnittstelle offen für alle (Port {c.laddr.port})", Severity.HIGH,
                    description="Die Steuer-Schnittstelle des Knotens lauscht auf allen Netzwerkkarten.",
                    recommendation="RPC nur an 127.0.0.1 binden. Fernzugriff nur über SSH-Tunnel oder VPN.",
                ))
        return findings

    def check_key_files(self, asset: Asset) -> list[Finding]:
        findings = []
        for raw in self._cfg.get("validator_key_files", []):
            path = Path(os.path.expanduser(raw))
            if not path.exists():
                continue
            mode = path.stat().st_mode
            if mode & (stat.S_IRWXG | stat.S_IRWXO):
                findings.append(self.finding(
                    asset, f"Schlüsseldatei für andere lesbar: {path.name}", Severity.CRITICAL,
                    description=f"Rechte {oct(mode & 0o777)} – andere Benutzer können den Validator-Schlüssel lesen.",
                    recommendation=f"chmod 600 {path} und Eigentümer auf den Knoten-Benutzer setzen.",
                ))
        for raw in self._cfg.get("money_key_indicators", []):
            path = Path(os.path.expanduser(raw))
            if path.exists():
                findings.append(self.finding(
                    asset, "Geld-Schlüssel auf dem Validator-Gerät gefunden", Severity.HIGH,
                    station=Station.VAULT,
                    description=f"{path} sieht nach einer Wallet-Datei aus. Validator- und Geld-Schlüssel sollen getrennt sein.",
                    recommendation="Wallet auf ein anderes Gerät (oder Hardware-Wallet) umziehen; hier nur den BLS-Signierschlüssel lassen.",
                ))
        return findings


_OFFSET_RE = re.compile(r"System time\s*:\s*([\d.]+) seconds (fast|slow)")


def parse_chrony(output: str) -> float | None:
    m = _OFFSET_RE.search(output)
    return float(m.group(1)) if m else None


class TimeSyncPlugin(Plugin):
    name = "time-sync"
    category = "Host Hardening"
    kali_equivalent = "chronyc / timedatectl"
    phase = ScanPhase.CONFIG_AUDIT
    station = Station.OPERATOR
    explanation = "prüft, ob die Uhr stimmt – wichtig für Zertifikate, Logs und Blockzeiten"

    def is_available(self) -> bool:
        return self.tool_installed("chronyc") or self.tool_installed("timedatectl")

    def applies_to(self, asset: Asset) -> bool:
        return asset.is_local and asset.asset_type in (AssetType.HOST, AssetType.TOYCHAIN_NODE)

    def run(self, asset: Asset) -> list[Finding]:
        offset = None
        synced = None
        if self.tool_installed("chronyc"):
            out = subprocess.run(["chronyc", "tracking"], capture_output=True, text=True, timeout=20).stdout
            offset = parse_chrony(out)
        if self.tool_installed("timedatectl"):
            out = subprocess.run(["timedatectl", "show", "-p", "NTPSynchronized", "--value"],
                                 capture_output=True, text=True, timeout=20).stdout.strip()
            synced = out == "yes" if out else None
        return self.evaluate(offset, synced, asset)

    def evaluate(self, offset: float | None, synced: bool | None, asset: Asset) -> list[Finding]:
        node = asset.asset_type == AssetType.TOYCHAIN_NODE
        if synced is False:
            return [self.finding(
                asset, "Uhr wird nicht synchronisiert", Severity.HIGH if node else Severity.MEDIUM,
                description="Ohne Zeitabgleich driften Uhren ab. Zertifikate, Logs und Blockzeitstempel werden unzuverlässig.",
                recommendation="NTP aktivieren: 'timedatectl set-ntp true' oder chrony installieren.",
            )]
        if offset is not None and offset > 1.0:
            sev = Severity.HIGH if (node and offset > 5) else Severity.MEDIUM
            return [self.finding(
                asset, f"Uhr weicht um {offset:.1f} s ab", sev,
                description="ToyScan meldet A4 gelb, wenn Zeitstempel dauerhaft mehr als 5 Sekunden abweichen.",
                recommendation="Zeitquelle prüfen (chrony mit mehreren NTP-Servern), Firewall für UDP 123 ausgehend erlauben.",
            )]
        return []
