"""Discovery-Plugin: kapselt nmap für Port- und Dienst-Erkennung.

Ruft nmap als externen Prozess auf (kein Nachbau der Scan-Logik) und
übersetzt dessen XML-Output in Findings. Dienste, die bekanntermaßen oft
missbraucht werden (Telnet, SMB, RDP, offene Datenbanken, ...), werden
höher eingestuft, besonders wenn das Gerät von außen erreichbar ist.
"""
from __future__ import annotations

import subprocess
import xml.etree.ElementTree as ET

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

NETWORK_TYPES = {
    AssetType.NETWORK_DEVICE, AssetType.IOT_DEVICE, AssetType.HOST,
    AssetType.WEB_SERVICE, AssetType.TOYCHAIN_NODE,
}

# Port -> (Kurzname, Erklärung, Schweregrad intern, Schweregrad wenn von außen erreichbar)
RISKY_SERVICES: dict[int, tuple[str, str, Severity, Severity]] = {
    21: ("FTP", "überträgt Passwörter unverschlüsselt", Severity.MEDIUM, Severity.HIGH),
    23: ("Telnet", "überträgt alles unverschlüsselt und ist ein Hauptziel von IoT-Botnetzen", Severity.HIGH, Severity.CRITICAL),
    445: ("SMB", "Dateifreigabe, häufiges Ziel von Ransomware-Würmern", Severity.MEDIUM, Severity.CRITICAL),
    1900: ("UPnP/SSDP", "kann Ports im Router ohne Nachfrage öffnen", Severity.LOW, Severity.HIGH),
    1883: ("MQTT ohne TLS", "Smart-Home-Nachrichten unverschlüsselt", Severity.MEDIUM, Severity.HIGH),
    2375: ("Docker-API ohne TLS", "erlaubt volle Kontrolle über den Rechner", Severity.CRITICAL, Severity.CRITICAL),
    3389: ("RDP", "Fernzugriff, häufig per Passwort-Raten angegriffen", Severity.MEDIUM, Severity.HIGH),
    5900: ("VNC", "Bildschirmfreigabe, oft schwach geschützt", Severity.MEDIUM, Severity.HIGH),
    6379: ("Redis", "Datenbank, oft ohne Passwort", Severity.HIGH, Severity.CRITICAL),
    9200: ("Elasticsearch", "Datenbank, oft ohne Passwort", Severity.HIGH, Severity.CRITICAL),
    27017: ("MongoDB", "Datenbank, oft ohne Passwort", Severity.HIGH, Severity.CRITICAL),
}


class NmapDiscoveryPlugin(Plugin):
    name = "nmap-discovery"
    category = "Information Gathering"
    kali_equivalent = "nmap"
    phase = ScanPhase.DISCOVERY
    station = Station.RADAR
    explanation = "findet offene Türen (Ports) und welche Dienste dahinter laufen"

    def is_available(self) -> bool:
        return self.tool_installed("nmap")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type in NETWORK_TYPES and bool(asset.target())

    def run(self, asset: Asset) -> list[Finding]:
        result = subprocess.run(
            ["nmap", "-sV", "-oX", "-", asset.target()],
            capture_output=True, text=True, timeout=600,
        )
        return self.parse(result.stdout, asset)

    def parse(self, xml_output: str, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        try:
            root = ET.fromstring(xml_output)
        except ET.ParseError:
            return findings

        for port in root.findall(".//port"):
            state = port.find("state")
            if state is None or state.get("state") != "open":
                continue

            port_id = int(port.get("portid", "0"))
            service = port.find("service")
            service_name = service.get("name", "unbekannt") if service is not None else "unbekannt"
            product = service.get("product", "") if service is not None else ""
            version = service.get("version", "") if service is not None else ""
            detected = f"{product} {version}".strip()

            risky = RISKY_SERVICES.get(port_id)
            if risky:
                label, why, sev_internal, sev_external = risky
                severity = sev_external if asset.externally_reachable else sev_internal
                findings.append(self.finding(
                    asset,
                    f"Riskanter Dienst offen: {label} (Port {port_id})",
                    severity,
                    description=f"{label} {why}. Erkannt: {detected or service_name}.",
                    recommendation=(
                        f"{label} abschalten, wenn nicht nötig. Sonst nur im eigenen Netz erlauben, "
                        "nie per Portfreigabe ins Internet, und mit starkem Passwort bzw. Verschlüsselung absichern."
                    ),
                ))
                continue

            findings.append(self.finding(
                asset,
                f"Offener Port {port_id}/{port.get('protocol')}: {service_name}",
                Severity.INFO,
                description=f"Erkannter Dienst: {detected}" if detected else "Dienst ohne Versionsangabe.",
                recommendation=(
                    "Prüfen, ob dieser Dienst erreichbar sein muss; nicht benötigte Dienste deaktivieren."
                ),
            ))

        return findings
