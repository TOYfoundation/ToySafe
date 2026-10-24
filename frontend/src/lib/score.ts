// Mirrors backend/toysafe/core/priority.py and score.py so demo mode behaves like the engine.
import type { Asset, Finding, Score, Severity, StationId } from "./types";
import { RING_STATIONS, SEVERITIES } from "./types";

const FALLBACK_CVSS: Record<Severity, number> = { critical: 9.5, high: 7.5, medium: 5, low: 2.5, info: 0 };
const PENALTY: Record<Severity, number> = { critical: 30, high: 14, medium: 5, low: 1.5, info: 0 };

export function priority(f: Finding, a?: Asset): number {
  let s = (f.cvss_score ?? FALLBACK_CVSS[f.severity]) * 10;
  if (f.is_actively_exploited) s += 1000;
  if (a) {
    s += a.criticality * 15;
    if (a.externally_reachable) s += 50;
  }
  return s;
}

export function sortFindings(findings: Finding[], assets: Asset[]): Finding[] {
  const byId = new Map(assets.map((a) => [a.id, a]));
  return [...findings].sort((x, y) => priority(y, byId.get(y.asset_id)) - priority(x, byId.get(x.asset_id)));
}

const toScore = (p: number, scale = 90) => Math.round(100 * Math.exp(-p / scale));
const STATION_SCALE = 45; // steeper per station, see backend score.py

const GRADES: [number, Score["grade"], string][] = [
  [90, "stabil", "Schilde stabil"],
  [75, "gut", "Schilde gut, kleine Lücken"],
  [55, "angeschlagen", "Schilde angeschlagen"],
  [35, "schwach", "Schilde schwach"],
  [0, "kritisch", "Schilde kritisch"],
];

export function shieldStrength(findings: Finding[], assets: Asset[]): Score {
  const byId = new Map(assets.map((a) => [a.id, a]));
  let total = 0;
  const per = Object.fromEntries(RING_STATIONS.map((s) => [s, 0])) as Record<StationId, number>;
  for (const f of findings) {
    let p = PENALTY[f.severity] + (f.is_actively_exploited ? 20 : 0);
    if (byId.get(f.asset_id)?.externally_reachable) p *= 1.3;
    total += p;
    per[f.station] = (per[f.station] ?? 0) + p;
  }
  const score = toScore(total);
  const [, grade, label] = GRADES.find(([t]) => score >= t) ?? GRADES[GRADES.length - 1];
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, findings.filter((f) => f.severity === s).length])) as Record<
    Severity,
    number
  >;
  return {
    score,
    grade,
    label,
    counts,
    kev: findings.filter((f) => f.is_actively_exploited).length,
    stations: Object.fromEntries(RING_STATIONS.map((s) => [s, toScore(per[s], STATION_SCALE)])) as Record<StationId, number>,
  };
}
