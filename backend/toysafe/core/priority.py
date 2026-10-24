"""Priorisierungs-Engine: entscheidet, in welcher Reihenfolge Findings
abgearbeitet und wie sie im Cockpit sortiert werden.

Faktoren (in dieser Gewichtung):
1. Aktiv ausgenutzte Lücken (CISA-KEV-Liste)   -> immer zuerst
2. CVSS-Score bzw. Schweregrad                  -> höher = dringender
3. Kritikalität des Assets (vom Nutzer gesetzt) -> z. B. Router > Test-PC
4. Externe Erreichbarkeit des Assets            -> von außen sichtbar = dringender
"""
from __future__ import annotations

from toysafe.core.models import Asset, Finding, Severity

# Ersatzwert, wenn ein Tool keinen CVSS-Score liefert (z. B. Lynis, Header-Check).
SEVERITY_FALLBACK_CVSS = {
    Severity.CRITICAL: 9.5,
    Severity.HIGH: 7.5,
    Severity.MEDIUM: 5.0,
    Severity.LOW: 2.5,
    Severity.INFO: 0.0,
}


def priority_score(finding: Finding, asset: Asset | None) -> float:
    cvss = finding.cvss_score if finding.cvss_score is not None else SEVERITY_FALLBACK_CVSS[finding.severity]
    score = cvss * 10

    if finding.is_actively_exploited:
        score += 1000  # KEV-Treffer überstimmt alles andere

    if asset is not None:
        score += asset.criticality * 15
        if asset.externally_reachable:
            score += 50

    return score


def sort_findings(findings: list[Finding], assets_by_id: dict[str, Asset]) -> list[Finding]:
    return sorted(
        findings,
        key=lambda f: priority_score(f, assets_by_id.get(f.asset_id)),
        reverse=True,
    )
