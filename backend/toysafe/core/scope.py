"""Scope-Bestätigung (Startfreigabe).

Bevor ToySafe ein Gerät aktiv prüft, muss der Nutzer bestätigen, dass er
Eigentümer ist oder eine Erlaubnis hat. Zusätzlich müssen alle Ziele in den
erklärten Netzen bzw. Domains liegen. Öffentliche IP-Adressen sind nur mit
ausdrücklicher Freigabe erlaubt. Jede Bestätigung wird lokal protokolliert.
"""
from __future__ import annotations

import hashlib
import ipaddress
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib.parse import urlparse

from toysafe.core.models import Asset, AssetType, utcnow

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
SCOPE_LOG_PATH = DATA_DIR / "scope_log.jsonl"

STATEMENT_VERSION = "2026-10-1"
STATEMENT_DE = (
    "Ich bestätige, dass ich Eigentümer der angegebenen Geräte, Netze, Dienste und "
    "Repositories bin oder eine ausdrückliche, schriftliche Erlaubnis zur Prüfung habe. "
    "Ich prüfe keine fremden Systeme. Mir ist bekannt, dass unerlaubte Scans in vielen "
    "Ländern strafbar sind (in Deutschland u. a. §§ 202a ff. und 303b StGB)."
)

# Asset-Typen, die nur lokal gelesen werden und keinen Netzwerkverkehr erzeugen.
LOCAL_ONLY_TYPES = {AssetType.CODE_REPOSITORY, AssetType.CONTAINER_IMAGE}


class ScopeError(ValueError):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


@dataclass
class ScopeDeclaration:
    operator: str                                  # wer startet den Scan
    confirmed: bool                                # Häkchen bei STATEMENT_DE
    networks: list[str] = field(default_factory=list)   # CIDRs, IPs oder Domains
    allow_public_targets: bool = False             # öffentliche IPs/Domains ausdrücklich erlaubt
    statement_version: str = STATEMENT_VERSION


def statement_hash() -> str:
    return hashlib.sha256(f"{STATEMENT_VERSION}:{STATEMENT_DE}".encode()).hexdigest()[:16]


def _parse_networks(entries: list[str]) -> tuple[list[ipaddress._BaseNetwork], list[str]]:
    nets, domains = [], []
    for raw in entries:
        entry = raw.strip().lower()
        if not entry:
            continue
        try:
            nets.append(ipaddress.ip_network(entry, strict=False))
        except ValueError:
            domains.append(entry.lstrip("*."))
    return nets, domains


def _host_of(asset: Asset) -> str | None:
    if asset.hostname:
        return asset.hostname.lower()
    if asset.url:
        return (urlparse(asset.url).hostname or "").lower() or None
    return None


def _domain_allowed(host: str, domains: list[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def validate_scope(scope: ScopeDeclaration, assets: list[Asset]) -> None:
    """Wirft ScopeError mit verständlichen Gründen, wenn etwas nicht passt."""
    problems: list[str] = []
    if not scope.confirmed:
        problems.append("Die Startfreigabe wurde nicht bestätigt.")
    if not scope.operator.strip():
        problems.append("Bitte angeben, wer den Scan startet.")
    if scope.statement_version != STATEMENT_VERSION:
        problems.append("Die Erklärung hat sich geändert. Bitte neu bestätigen.")

    nets, domains = _parse_networks(scope.networks)

    for asset in assets:
        if asset.asset_type in LOCAL_ONLY_TYPES or (asset.is_local and not asset.ip_address):
            continue

        if asset.ip_address:
            try:
                target_net = ipaddress.ip_network(asset.ip_address, strict=False)
            except ValueError:
                problems.append(f"{asset.name}: '{asset.ip_address}' ist keine gültige IP-Adresse.")
                continue
            if not any(target_net.version == n.version and target_net.subnet_of(n) for n in nets):
                problems.append(f"{asset.name}: {asset.ip_address} liegt außerhalb der freigegebenen Netze.")
            elif target_net.is_global and not scope.allow_public_targets:
                problems.append(
                    f"{asset.name}: {asset.ip_address} ist eine öffentliche Adresse. "
                    "Dafür ist die ausdrückliche Freigabe für öffentliche Ziele nötig."
                )

        host = _host_of(asset)
        if host:
            if not _domain_allowed(host, domains):
                problems.append(f"{asset.name}: {host} steht nicht in der Freigabe.")
            elif not scope.allow_public_targets and not host.endswith((".local", ".lan", ".home.arpa", ".internal")):
                problems.append(
                    f"{asset.name}: {host} ist ein öffentlicher Name. "
                    "Dafür ist die ausdrückliche Freigabe für öffentliche Ziele nötig."
                )

    if problems:
        raise ScopeError(problems)


def log_confirmation(scope: ScopeDeclaration, assets: list[Asset], log_path: Path = SCOPE_LOG_PATH) -> dict:
    entry = {
        "at": utcnow().isoformat(),
        "operator": scope.operator,
        "networks": scope.networks,
        "allow_public_targets": scope.allow_public_targets,
        "statement_version": scope.statement_version,
        "statement_hash": statement_hash(),
        "asset_ids": [a.id for a in assets],
    }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return entry


def read_log(limit: int = 50, log_path: Path = SCOPE_LOG_PATH) -> list[dict]:
    if not log_path.exists():
        return []
    lines = log_path.read_text(encoding="utf-8").splitlines()[-limit:]
    return [json.loads(line) for line in lines if line.strip()]


def scope_as_dict(scope: ScopeDeclaration) -> dict:
    return asdict(scope)
