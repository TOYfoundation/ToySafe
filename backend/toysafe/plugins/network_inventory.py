"""Radar-Plugin: findet alle Geräte in einem eigenen Netzsegment und vergleicht
sie mit dem bekannten Inventar.

Nutzt `nmap -sn` (Ping-Scan, keine Port-Scans) auf ein Subnetz, das der
Nutzer in der Startfreigabe als eigenes Netz erklärt hat. Jedes Gerät, das
weder in der Asset-Liste noch in config/inventory.yaml steht, wird als
"Unbekanntes Gerät" gemeldet: ein typisches Zeichen für ein vergessenes
IoT-Gerät, einen Gast oder einen Eindringling im WLAN.
"""
from __future__ import annotations

import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

INVENTORY_PATH = Path(__file__).resolve().parent.parent.parent / "config" / "inventory.yaml"


def _norm_mac(mac: str | None) -> str | None:
    return mac.lower().replace("-", ":") if mac else None


class NetworkInventoryPlugin(Plugin):
    name = "network-inventory"
    category = "Information Gathering"
    kali_equivalent = "nmap -sn / netdiscover"
    phase = ScanPhase.DISCOVERY
    station = Station.RADAR
    explanation = "zählt alle Geräte im Netz und sucht Unbekannte"

    def __init__(self, inventory_path: Path = INVENTORY_PATH, known_assets: list[Asset] | None = None) -> None:
        self._inventory_path = inventory_path
        self._known_assets = known_assets or []

    def set_known_assets(self, assets: list[Asset]) -> None:
        self._known_assets = assets

    def is_available(self) -> bool:
        return self.tool_installed("nmap")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.NETWORK_SEGMENT and bool(asset.ip_address)

    def run(self, asset: Asset) -> list[Finding]:
        result = subprocess.run(
            ["nmap", "-sn", "-oX", "-", asset.ip_address],
            capture_output=True, text=True, timeout=600,
        )
        return self.compare(self.parse_hosts(result.stdout), asset)

    @staticmethod
    def parse_hosts(xml_output: str) -> list[dict]:
        hosts: list[dict] = []
        try:
            root = ET.fromstring(xml_output)
        except ET.ParseError:
            return hosts
        for host in root.findall("host"):
            status = host.find("status")
            if status is not None and status.get("state") != "up":
                continue
            entry: dict = {"ip": None, "mac": None, "vendor": None, "hostname": None}
            for addr in host.findall("address"):
                if addr.get("addrtype") in ("ipv4", "ipv6"):
                    entry["ip"] = addr.get("addr")
                elif addr.get("addrtype") == "mac":
                    entry["mac"] = _norm_mac(addr.get("addr"))
                    entry["vendor"] = addr.get("vendor")
            name = host.find("hostnames/hostname")
            if name is not None:
                entry["hostname"] = name.get("name")
            if entry["ip"]:
                hosts.append(entry)
        return hosts

    def _known(self) -> tuple[set[str], set[str]]:
        ips = {a.ip_address for a in self._known_assets if a.ip_address}
        macs = {_norm_mac(a.mac_address) for a in self._known_assets if a.mac_address}
        if self._inventory_path.exists():
            data = yaml.safe_load(self._inventory_path.read_text(encoding="utf-8")) or {}
            for dev in data.get("devices", []):
                if dev.get("ip"):
                    ips.add(dev["ip"])
                if dev.get("mac"):
                    macs.add(_norm_mac(dev["mac"]))
        return ips, {m for m in macs if m}

    def compare(self, hosts: list[dict], segment: Asset) -> list[Finding]:
        known_ips, known_macs = self._known()
        findings = [self.finding(
            segment, f"Radar: {len(hosts)} Geräte aktiv in {segment.ip_address}", Severity.INFO,
            description="Anzahl der Geräte, die auf einen Ping-Scan geantwortet haben.",
            recommendation="Inventar in config/inventory.yaml pflegen, damit neue Geräte sofort auffallen.",
        )]
        for h in hosts:
            if (h["mac"] and h["mac"] in known_macs) or (not h["mac"] and h["ip"] in known_ips):
                continue
            if h["mac"] is None and h["ip"] in known_ips:
                continue
            label = h["hostname"] or h["vendor"] or "ohne Namen"
            findings.append(self.finding(
                segment, f"Unbekanntes Gerät im Netz: {h['ip']} ({label})", Severity.MEDIUM,
                description=(
                    f"IP {h['ip']}, MAC {h['mac'] or 'unbekannt'}, Hersteller {h['vendor'] or 'unbekannt'}. "
                    "Das Gerät steht nicht im Inventar."
                ),
                recommendation=(
                    "Klären, wem das Gerät gehört. Wenn es bekannt ist: ins Inventar aufnehmen. "
                    "Wenn nicht: WLAN-Passwort ändern, Gäste ins Gastnetz, IoT-Geräte in ein eigenes Netz."
                ),
            ))
        return findings
