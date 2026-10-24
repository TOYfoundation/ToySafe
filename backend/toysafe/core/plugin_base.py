"""Einheitliche Schnittstelle, die jedes Scan-/Audit-Modul implementieren muss.

Ein Plugin kapselt ein bestehendes, etabliertes Tool (nmap, OpenVAS, Nuclei,
testssl.sh, Lynis, gitleaks, ...) und übersetzt dessen Output in
standardisierte Findings. Hier wird kein Angriffscode geschrieben - nur
Aufruf, Parsing und Normalisierung der Ergebnisse bestehender Tools.
"""
from __future__ import annotations

import shutil
import uuid
from abc import ABC, abstractmethod
from enum import Enum

from toysafe.core.models import Asset, Finding, Severity, Station


class ScanPhase(str, Enum):
    """Bestimmt die Reihenfolge, in der Plugins ausgeführt werden."""
    DISCOVERY = "1_discovery"            # Hosts/Geräte finden
    EXTERNAL_SURFACE = "2_external"      # von außen erreichbare Dienste zuerst
    VULNERABILITY_SCAN = "3_vuln_scan"   # bekannte CVEs abgleichen
    CONFIG_AUDIT = "4_config_audit"      # Hardening-/Konfigurationsprüfung
    DEEP_DIVE = "5_deep_dive"            # gezielte Tiefenprüfung pro Asset


PHASE_LABEL_DE = {
    ScanPhase.DISCOVERY: "Erkundung",
    ScanPhase.EXTERNAL_SURFACE: "Außenhülle",
    ScanPhase.VULNERABILITY_SCAN: "Schwachstellen",
    ScanPhase.CONFIG_AUDIT: "Härtung",
    ScanPhase.DEEP_DIVE: "Tiefenprüfung",
}


class Plugin(ABC):
    name: str
    category: str              # z. B. "Information Gathering", "Vulnerability Analysis"
    kali_equivalent: str       # welches Kali-/Standard-Tool dieses Plugin kapselt
    phase: ScanPhase
    station: Station = Station.SHIELDS
    explanation: str = ""      # Ein Satz für das Cockpit: was passiert hier und warum?

    @abstractmethod
    def is_available(self) -> bool:
        """Prüft, ob das zugrunde liegende Tool installiert/erreichbar ist."""

    def applies_to(self, asset: Asset) -> bool:
        """Ob dieses Plugin für das Asset sinnvoll ist. Standard: immer."""
        return True

    @abstractmethod
    def run(self, asset: Asset) -> list[Finding]:
        """Führt den Scan für ein Asset aus und liefert normalisierte Findings."""

    # -- Hilfen für Plugins ---------------------------------------------------

    @staticmethod
    def tool_installed(binary: str) -> bool:
        return shutil.which(binary) is not None

    def finding(self, asset: Asset, title: str, severity: Severity, description: str = "",
                recommendation: str = "", **extra) -> Finding:
        extra.setdefault("station", self.station)
        return Finding(
            id=str(uuid.uuid4()),
            asset_id=asset.id,
            title=title,
            description=description,
            severity=severity,
            source_plugin=self.name,
            recommendation=recommendation,
            **extra,
        )
