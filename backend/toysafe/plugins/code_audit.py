"""Betreiber-Plugins für eigenen Code und eigene Container.

- SecretsScanPlugin: gitleaks findet Passwörter, API-Schlüssel und private
  Schlüssel, die versehentlich in einem Repository gelandet sind. Treffer
  werden immer geschwärzt (--redact), ToySafe zeigt nie das Geheimnis selbst.
- DependencyAuditPlugin: osv-scanner gleicht Abhängigkeiten (Cargo.lock,
  package-lock.json, requirements.txt, ...) mit der OSV-Datenbank ab.
- ContainerScanPlugin: trivy prüft eigene Container-Images auf bekannte Lücken.

Alle drei lesen nur lokale Dateien bzw. eigene Images.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

from toysafe.core.models import Asset, AssetType, Finding, Severity, Station
from toysafe.core.plugin_base import Plugin, ScanPhase

_SEV = {
    "CRITICAL": Severity.CRITICAL, "HIGH": Severity.HIGH, "MEDIUM": Severity.MEDIUM,
    "MODERATE": Severity.MEDIUM, "LOW": Severity.LOW,
}


def _cvss_to_severity(score: float | None) -> Severity:
    if score is None:
        return Severity.MEDIUM
    if score >= 9:
        return Severity.CRITICAL
    if score >= 7:
        return Severity.HIGH
    if score >= 4:
        return Severity.MEDIUM
    return Severity.LOW


class SecretsScanPlugin(Plugin):
    name = "secrets-scan"
    category = "Password Attacks (nur eigene Dateien)"
    kali_equivalent = "gitleaks / trufflehog"
    phase = ScanPhase.CONFIG_AUDIT
    station = Station.OPERATOR
    explanation = "sucht versehentlich eingecheckte Passwörter und Schlüssel im eigenen Code"

    def is_available(self) -> bool:
        return self.tool_installed("gitleaks")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.CODE_REPOSITORY and bool(asset.path)

    def run(self, asset: Asset) -> list[Finding]:
        with tempfile.TemporaryDirectory() as tmp:
            report = Path(tmp) / "gitleaks.json"
            subprocess.run(
                ["gitleaks", "detect", "--source", asset.path or ".", "--redact", "--no-banner",
                 "--report-format", "json", "--report-path", str(report)],
                capture_output=True, text=True, timeout=900,
            )
            if not report.exists():
                return []
            return self.parse(report.read_text(encoding="utf-8"), asset)

    def parse(self, json_text: str, asset: Asset) -> list[Finding]:
        try:
            leaks = json.loads(json_text) or []
        except json.JSONDecodeError:
            return []
        findings = []
        for leak in leaks:
            rule = leak.get("RuleID", "secret")
            critical = any(k in rule.lower() for k in ("private-key", "privatekey", "mnemonic", "seed"))
            findings.append(self.finding(
                asset,
                f"Geheimnis im Code: {rule} in {leak.get('File', '?')}:{leak.get('StartLine', '?')}",
                Severity.CRITICAL if critical else Severity.HIGH,
                description=(
                    f"{leak.get('Description', rule)}. Commit {str(leak.get('Commit', ''))[:10] or 'Arbeitskopie'}. "
                    "Der Inhalt wird von ToySafe nicht angezeigt."
                ),
                recommendation=(
                    "Geheimnis sofort beim Anbieter widerrufen und neu erzeugen (Löschen aus dem Code reicht nicht, "
                    "es bleibt in der Git-Historie). Danach Secrets nur über Umgebungsvariablen oder einen Tresor "
                    "laden und gitleaks als pre-commit-Hook aktivieren."
                ),
                reference_url="https://github.com/gitleaks/gitleaks",
            ))
        return findings


class DependencyAuditPlugin(Plugin):
    name = "dependency-audit"
    category = "Vulnerability Analysis"
    kali_equivalent = "osv-scanner / pip-audit / cargo-audit"
    phase = ScanPhase.VULNERABILITY_SCAN
    station = Station.OPERATOR
    explanation = "prüft verwendete Bibliotheken gegen die OSV-Schwachstellendatenbank"

    def is_available(self) -> bool:
        return self.tool_installed("osv-scanner")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.CODE_REPOSITORY and bool(asset.path)

    def run(self, asset: Asset) -> list[Finding]:
        # v2-Syntax zuerst, dann v1 als Rückfall.
        for cmd in (
            ["osv-scanner", "scan", "source", "--format", "json", "-r", asset.path or "."],
            ["osv-scanner", "--format", "json", "-r", asset.path or "."],
        ):
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
            if result.stdout.strip().startswith("{"):
                return self.parse(result.stdout, asset)
        return []

    def parse(self, json_text: str, asset: Asset) -> list[Finding]:
        try:
            data = json.loads(json_text)
        except json.JSONDecodeError:
            return []
        findings = []
        for result in data.get("results", []):
            source = result.get("source", {}).get("path", "")
            for pkg in result.get("packages", []):
                info = pkg.get("package", {})
                max_sev: dict[str, float | None] = {}
                for group in pkg.get("groups", []):
                    raw = group.get("max_severity")
                    for vid in group.get("ids", []):
                        try:
                            max_sev[vid] = float(raw) if raw not in (None, "") else None
                        except ValueError:
                            max_sev[vid] = None
                for vuln in pkg.get("vulnerabilities", []):
                    vid = vuln.get("id", "?")
                    cvss = max_sev.get(vid)
                    severity = _cvss_to_severity(cvss)
                    db_sev = str((vuln.get("database_specific") or {}).get("severity", "")).upper()
                    if cvss is None and db_sev in _SEV:
                        severity = _SEV[db_sev]
                    aliases = [a for a in vuln.get("aliases", []) if a.startswith("CVE-")]
                    findings.append(self.finding(
                        asset,
                        f"Bibliothek mit Lücke: {info.get('name')} {info.get('version')} ({vid})",
                        severity,
                        description=f"{vuln.get('summary') or vuln.get('details', '')[:300]} – Quelle: {source}",
                        recommendation=(
                            "Auf eine reparierte Version aktualisieren und Lockfile neu erzeugen. "
                            "Wenn kein Update existiert: prüfen, ob die betroffene Funktion genutzt wird."
                        ),
                        cve_ids=aliases,
                        cvss_score=cvss,
                        reference_url=f"https://osv.dev/vulnerability/{vid}",
                    ))
        return findings


class ContainerScanPlugin(Plugin):
    name = "container-scan"
    category = "Vulnerability Analysis"
    kali_equivalent = "trivy / grype"
    phase = ScanPhase.VULNERABILITY_SCAN
    station = Station.OPERATOR
    explanation = "prüft eigene Container-Images auf veraltete Pakete mit Lücken"

    def is_available(self) -> bool:
        return self.tool_installed("trivy")

    def applies_to(self, asset: Asset) -> bool:
        return asset.asset_type == AssetType.CONTAINER_IMAGE and bool(asset.image)

    def run(self, asset: Asset) -> list[Finding]:
        result = subprocess.run(
            ["trivy", "image", "--quiet", "--format", "json", "--scanners", "vuln", asset.image or ""],
            capture_output=True, text=True, timeout=1800,
        )
        return self.parse(result.stdout, asset)

    def parse(self, json_text: str, asset: Asset) -> list[Finding]:
        try:
            data = json.loads(json_text)
        except json.JSONDecodeError:
            return []
        findings = []
        for result in data.get("Results", []) or []:
            for v in result.get("Vulnerabilities", []) or []:
                sev = _SEV.get(str(v.get("Severity", "")).upper(), Severity.INFO)
                cvss = None
                for vendor in (v.get("CVSS") or {}).values():
                    cvss = vendor.get("V3Score") or cvss
                vid = v.get("VulnerabilityID", "?")
                fixed = v.get("FixedVersion")
                findings.append(self.finding(
                    asset,
                    f"Container: {v.get('PkgName')} {v.get('InstalledVersion')} ({vid})",
                    sev,
                    description=v.get("Title") or v.get("Description", "")[:300],
                    recommendation=(
                        f"Basis-Image aktualisieren bzw. {v.get('PkgName')} auf {fixed} heben und neu bauen."
                        if fixed else "Noch kein Fix verfügbar: Paket entfernen, wenn möglich, oder Basis-Image wechseln."
                    ),
                    cve_ids=[vid] if vid.startswith("CVE-") else [],
                    cvss_score=cvss,
                    reference_url=v.get("PrimaryURL"),
                ))
        return findings
