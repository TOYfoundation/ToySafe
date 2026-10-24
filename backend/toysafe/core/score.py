"""Schildstärke: eine verständliche Gesamtzahl (0-100) für das Cockpit.

Die Zahl ersetzt nicht die priorisierte Liste, sie zeigt nur auf einen
Blick, wie es steht. Jeder Fund zieht Punkte ab, schwere Funde stärker.
Aktiv ausgenutzte Lücken und von außen erreichbare Geräte wiegen schwerer.
Die Kurve ist abflachend: zehn kleine Hinweise wiegen nicht so viel wie
eine kritische Lücke, und die Zahl wird nie negativ.
"""
from __future__ import annotations

import math
from collections import Counter

from toysafe.core.models import Asset, Finding, Severity, Station

PENALTY = {
    Severity.CRITICAL: 30.0,
    Severity.HIGH: 14.0,
    Severity.MEDIUM: 5.0,
    Severity.LOW: 1.5,
    Severity.INFO: 0.0,
}
KEV_PENALTY = 20.0
EXTERNAL_FACTOR = 1.3
SCALE = 90.0
# Stations carry only part of the load, so their curve is steeper. Otherwise every station
# could look green while the total is weak.
STATION_SCALE = SCALE / 2

GRADES = [
    (90, "stabil", "Schilde stabil"),
    (75, "gut", "Schilde gut, kleine Lücken"),
    (55, "angeschlagen", "Schilde angeschlagen"),
    (35, "schwach", "Schilde schwach"),
    (0, "kritisch", "Schilde kritisch"),
]


def _penalty(finding: Finding, asset: Asset | None) -> float:
    p = PENALTY[finding.severity]
    if finding.is_actively_exploited:
        p += KEV_PENALTY
    if asset is not None and asset.externally_reachable:
        p *= EXTERNAL_FACTOR
    return p


def _to_score(total_penalty: float, scale: float = SCALE) -> int:
    return round(100 * math.exp(-total_penalty / scale))


def grade_for(score: int) -> tuple[str, str]:
    for threshold, key, label in GRADES:
        if score >= threshold:
            return key, label
    return GRADES[-1][1], GRADES[-1][2]


def shield_strength(findings: list[Finding], assets: list[Asset]) -> dict:
    assets_by_id = {a.id: a for a in assets}
    total = 0.0
    per_station: dict[str, float] = {s.value: 0.0 for s in Station}
    for f in findings:
        p = _penalty(f, assets_by_id.get(f.asset_id))
        total += p
        per_station[f.station.value] += p

    score = _to_score(total)
    key, label = grade_for(score)
    counts = Counter(f.severity.value for f in findings)
    return {
        "score": score,
        "grade": key,
        "label": label,
        "counts": {s.value: counts.get(s.value, 0) for s in Severity},
        "kev": sum(1 for f in findings if f.is_actively_exploited),
        "stations": {k: _to_score(v, STATION_SCALE) for k, v in per_station.items()},
    }
