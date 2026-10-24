"""Config-Audit-Plugin: kapselt Lynis für Host-Hardening-Checks
(Dateirechte, veraltete Pakete, unsichere Kernel-Parameter, u.ä.).
"""
from __future__ import annotations

import re
import subprocess
import tempfile
import uuid
from pathlib import Path

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase


class LynisAuditPlugin(Plugin):
    """Läuft nur auf Assets vom Typ HOST (lokale Ausführung)."""

    name = "lynis-audit"
    category = "Vulnerability Analysis"
    kali_equivalent = "lynis"
    phase = ScanPhase.CONFIG_AUDIT
    station = Station.SHIELDS
    explanation = "prüft die Härtung dieses Rechners: Rechte, Updates, Kernel-Einstellungen"

    def is_available(self) -> bool:
        return self.tool_installed("lynis")

    def applies_to(self, asset: Asset) -> bool:
        # Lynis prüft immer das System, auf dem es läuft.
        return asset.is_local and asset.asset_type in (AssetType.HOST, AssetType.TOYCHAIN_NODE)

    def run(self, asset: Asset) -> list[Finding]:
        with tempfile.TemporaryDirectory() as tmp:
            report_path = Path(tmp) / "lynis-report.dat"
            subprocess.run(
                ["lynis", "audit", "system", "--quick", f"--report-file={report_path}"],
                capture_output=True, text=True, timeout=900,
            )
            if not report_path.exists():
                return []
            return self.parse(report_path.read_text(encoding="utf-8", errors="ignore"), asset)

    def parse(self, report_text: str, asset: Asset) -> list[Finding]:
        findings: list[Finding] = []
        for line in report_text.splitlines():
            match = re.match(r"warning\[\]=(.+)", line)
            if not match:
                continue
            message = match.group(1).split("|")[0]

            parts = match.group(1).split("|")
            test_id = parts[0] if len(parts) > 1 else ""
            text = parts[1] if len(parts) > 1 else parts[0]
            findings.append(self.finding(
                asset,
                f"Härtungs-Hinweis: {text}" if text else "Lynis-Hardening-Hinweis",
                Severity.MEDIUM,
                description=f"Lynis-Test {test_id}: {text}" if test_id else message,
                recommendation=(
                    f"Details: https://cisofy.com/lynis/controls/{test_id}/" if test_id
                    else "Siehe Lynis-Dokumentation zum betroffenen Test."
                ),
            ))

        return findings
