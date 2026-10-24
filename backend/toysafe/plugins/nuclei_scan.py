"""Vulnerability-Scan-Plugin: kapselt Nuclei (ProjectDiscovery).

Die Nuclei-Templates werden von einer aktiven Community laufend um neue
Bedrohungen ergänzt - genau darüber deckt diese App auch neue
Schwachstellen ab, ohne dass hier eigene Exploit-Logik entwickelt wird.
`-update-templates` sorgt dafür, dass vor jedem Lauf die aktuellsten
Templates gezogen werden (Teil des Self-Update-Mechanismus).
"""
from __future__ import annotations

import json
import subprocess
import uuid

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

_SEVERITY_MAP = {
    "critical": Severity.CRITICAL,
    "high": Severity.HIGH,
    "medium": Severity.MEDIUM,
    "low": Severity.LOW,
    "info": Severity.INFO,
}


class NucleiScanPlugin(Plugin):
    name = "nuclei-scan"
    category = "Vulnerability Analysis"
    kali_equivalent = "nuclei"
    phase = ScanPhase.VULNERABILITY_SCAN
    station = Station.SHIELDS
    explanation = "vergleicht Dienste mit tausenden bekannten Schwachstellen-Mustern der Community"

    def is_available(self) -> bool:
        return self.tool_installed("nuclei")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type in {
            AssetType.NETWORK_DEVICE, AssetType.IOT_DEVICE, AssetType.HOST,
            AssetType.WEB_SERVICE, AssetType.TOYCHAIN_NODE,
        } and bool(asset.url or asset.target())

    def run(self, asset: Asset) -> list[Finding]:
        result = subprocess.run(
            ["nuclei", "-target", asset.url or asset.target(), "-jsonl", "-silent", "-update-templates"],
            capture_output=True, text=True, timeout=1800,
        )
        return self.parse(result.stdout, asset)

    def parse(self, jsonl_output: str, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        for line in jsonl_output.splitlines():
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            info = entry.get("info", {})
            classification = info.get("classification") or {}

            findings.append(Finding(
                id=str(uuid.uuid4()),
                asset_id=asset.id,
                title=info.get("name", entry.get("template-id", "Nuclei-Treffer")),
                description=info.get("description", ""),
                severity=_SEVERITY_MAP.get(info.get("severity", "info"), Severity.INFO),
                source_plugin=self.name,
                cve_ids=classification.get("cve-id") or [],
                cvss_score=classification.get("cvss-score"),
                recommendation=info.get("remediation", "Siehe Template-Referenz für Details zur Behebung."),
                reference_url=(info.get("reference") or [None])[0],
            ))

        return findings
