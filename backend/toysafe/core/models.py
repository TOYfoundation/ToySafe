"""Zentrale Datenmodelle für Assets, Findings und Scan-Ergebnisse."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AssetType(str, Enum):
    NETWORK_DEVICE = "network_device"     # Router, Switch, Access Point
    IOT_DEVICE = "iot_device"             # Kamera, Smart-TV, Steckdose, Spielzeug
    HOST = "host"                         # eigener Rechner / Server
    WEB_SERVICE = "web_service"           # Webseite / API (z. B. ToyVerse-Web, ToyScan)
    NETWORK_SEGMENT = "network_segment"   # ganzes Subnetz, z. B. 192.168.1.0/24 (Radar)
    TOYCHAIN_NODE = "toychain_node"       # eigener ToyChain-Knoten / Validator
    CODE_REPOSITORY = "code_repository"   # eigenes Git-Repository (Secrets, Abhängigkeiten)
    CONTAINER_IMAGE = "container_image"   # eigenes Container-Image


class Station(str, Enum):
    """Cockpit-Station, in der ein Finding angezeigt wird."""
    RADAR = "radar"            # Netzwerk & Geräte
    SHIELDS = "shields"        # Schwachstellen & Härtung
    IDENTITY = "identity"      # Konten, Passwörter, Mail-Identität
    VAULT = "vault"            # TOYPAY-Wallet, Miner, Krypto-Hygiene
    OPERATOR = "operator"      # Betreiber: Knoten, Webdienste, Code, Container
    COMMS = "comms"            # WLAN, Funk, Kommunikation


@dataclass
class Asset:
    id: str
    name: str
    asset_type: AssetType
    ip_address: str = ""                  # IP oder CIDR (bei NETWORK_SEGMENT)
    hostname: Optional[str] = None        # z. B. toyverse.example
    url: Optional[str] = None             # z. B. https://toyverse.example
    path: Optional[str] = None            # lokaler Pfad (Repository)
    image: Optional[str] = None           # Container-Image, z. B. ghcr.io/org/app:1.2
    mac_address: Optional[str] = None     # für den Inventar-Abgleich im Radar
    criticality: int = 3                  # 1 (niedrig) - 5 (sehr kritisch), vom Nutzer gesetzt
    externally_reachable: bool = False
    is_local: bool = False                # das Gerät, auf dem ToySafe selbst läuft
    owner: Optional[str] = None           # wer ist verantwortlich (Crew-Rolle/Person)

    def target(self) -> str:
        """Bestes Ziel für netzwerkbasierte Tools."""
        return self.hostname or self.ip_address


@dataclass
class Finding:
    id: str
    asset_id: str
    title: str
    description: str
    severity: Severity
    source_plugin: str                      # z. B. "nmap-discovery", "openvas", "lynis"
    cve_ids: list[str] = field(default_factory=list)
    cvss_score: Optional[float] = None
    is_actively_exploited: bool = False     # Abgleich mit CISA-KEV-Liste
    recommendation: str = ""
    reference_url: Optional[str] = None
    station: Station = Station.SHIELDS
    discovered_at: datetime = field(default_factory=utcnow)
