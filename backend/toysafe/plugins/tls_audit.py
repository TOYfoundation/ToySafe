"""TLS-Audit: kapselt testssl.sh für Webdienste und Knoten-Endpunkte.

Prüft Protokolle, Cipher, Zertifikat und bekannte TLS-Schwachstellen
(Heartbleed, ROBOT, ...). testssl.sh verbindet sich nur wie ein normaler
Client und liest die Antworten aus.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

_SEVERITY_MAP = {
    "CRITICAL": Severity.CRITICAL,
    "HIGH": Severity.HIGH,
    "MEDIUM": Severity.MEDIUM,
    "LOW": Severity.LOW,
}


class TLSAuditPlugin(Plugin):
    name = "tls-audit"
    category = "Vulnerability Analysis"
    kali_equivalent = "testssl.sh / sslscan"
    phase = ScanPhase.EXTERNAL_SURFACE
    station = Station.OPERATOR
    explanation = "prüft die Verschlüsselung (TLS) und das Zertifikat"

    def is_available(self) -> bool:
        return self.tool_installed("testssl.sh") or self.tool_installed("testssl")

    def applies_to(self, asset: Asset) -> bool:
        if asset.asset_type not in (AssetType.WEB_SERVICE, AssetType.TOYCHAIN_NODE):
            return False
        return bool(asset.url and urlparse(asset.url).scheme == "https") or bool(asset.hostname)

    @staticmethod
    def _target(asset: Asset) -> str:
        if asset.url:
            parsed = urlparse(asset.url)
            return f"{parsed.hostname}:{parsed.port or 443}"
        return f"{asset.hostname}:443"

    def run(self, asset: Asset) -> list[Finding]:
        binary = "testssl.sh" if self.tool_installed("testssl.sh") else "testssl"
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "testssl.json"
            subprocess.run(
                [binary, "--quiet", "--warnings", "off", "--color", "0", "--jsonfile", str(out), self._target(asset)],
                capture_output=True, text=True, timeout=1200,
            )
            if not out.exists():
                return []
            return self.parse(out.read_text(encoding="utf-8", errors="ignore"), asset)

    def parse(self, json_text: str, asset: Asset) -> list[Finding]:
        try:
            entries = json.loads(json_text)
        except json.JSONDecodeError:
            return []
        if isinstance(entries, dict):  # --jsonfile-pretty
            entries = [f for block in entries.get("scanResult", []) for v in block.values() if isinstance(v, list) for f in v]

        findings: list[Finding] = []
        for e in entries:
            severity = _SEVERITY_MAP.get(str(e.get("severity", "")).upper())
            if severity is None:
                continue
            cve = [c for c in str(e.get("cve", "")).split() if c.startswith("CVE-")]
            findings.append(self.finding(
                asset,
                f"TLS: {e.get('id', 'Befund')} – {str(e.get('finding', ''))[:90]}",
                severity,
                description=str(e.get("finding", "")),
                recommendation=(
                    "Nur TLS 1.2 und 1.3 erlauben, moderne Cipher-Suiten nutzen, Zertifikat rechtzeitig erneuern "
                    "(z. B. automatisch mit Let's Encrypt). Vorlage: Mozilla SSL Configuration Generator."
                ),
                cve_ids=cve,
                reference_url="https://ssl-config.mozilla.org/",
            ))
        return findings
