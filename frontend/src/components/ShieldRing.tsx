import { useEffect, useState } from "react";
import type { StationId } from "../lib/types";
import { RING_STATIONS } from "../lib/types";
import { useT } from "../i18n";
import { Icon } from "./Icon";

const C = 200;

function polar(r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(r1: number, r2: number, a0: number, a1: number) {
  const [x0, y0] = polar(r2, a0);
  const [x1, y1] = polar(r2, a1);
  const [x2, y2] = polar(r1, a1);
  const [x3, y3] = polar(r1, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r2} ${r2} 0 ${large} 1 ${x1} ${y1}L${x2} ${y2}A${r1} ${r1} 0 ${large} 0 ${x3} ${y3}Z`;
}

function strokeArc(r: number, a0: number, a1: number) {
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

export function statusOf(score: number) {
  return score >= 75 ? "ok" : score >= 55 ? "warn" : "bad";
}

/** Eight-pointed star (two interlaced squares), the girih motif of the Sternenwacht. */
function GirihStar({ r }: { r: number }) {
  const sq = (rot: number) =>
    [0, 90, 180, 270].map((d) => polar(r, d + rot).join(",")).join(" ");
  const inner = r * 0.72;
  const oct = Array.from({ length: 8 }, (_, i) => polar(inner, i * 45 + 22.5).join(",")).join(" ");
  return (
    <g className="ring-star">
      <polygon points={sq(0)} />
      <polygon points={sq(45)} />
      <polygon points={oct} className="ring-star-inner" />
    </g>
  );
}

function useCountUp(target: number, ms = 1100) {
  const [v, setV] = useState(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.motion === "reduced") {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function ShieldRing({
  score,
  stations,
  gradeLabel,
  onSelect,
}: {
  score: number | null;
  stations: Record<StationId, number> | null;
  gradeLabel: string;
  onSelect?: (s: StationId) => void;
}) {
  const t = useT();
  const shown = useCountUp(score ?? 0);
  const seg = 360 / RING_STATIONS.length;
  const gap = 2.4;

  return (
    <div className="ring-wrap">
      <svg viewBox="0 0 400 400" className="ring" role="img" aria-label={t("ring.aria", { score: score ?? "–" })}>
        <defs>
          <radialGradient id="ringCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--shield)" stopOpacity="0.20" />
            <stop offset="70%" stopColor="var(--shield)" stopOpacity="0.03" />
            <stop offset="100%" stopColor="var(--shield)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={190} className="ring-ticks" />
        <circle cx={C} cy={C} r={182} className="ring-hair" />
        <circle cx={C} cy={C} r={120} fill="url(#ringCore)" />
        {RING_STATIONS.map((id, i) => {
          const a0 = i * seg - seg / 2 + gap / 2;
          const a1 = (i + 1) * seg - seg / 2 - gap / 2;
          const value = stations ? stations[id] : null;
          const st = value == null ? "off" : statusOf(value);
          const mid = (a0 + a1) / 2;
          const [ix, iy] = polar(148, mid);
          const charge = value == null ? 0 : (a1 - a0) * (value / 100);
          return (
            <g
              key={id}
              className={`ring-seg ring-${st}`}
              style={{ ["--i" as string]: i }}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${t(`station.${id}`)}: ${value ?? "–"}`}
              onClick={() => onSelect?.(id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect?.(id);
                }
              }}
            >
              <path d={arc(128, 168, a0, a1)} className="ring-body" />
              {charge > 0 && <path d={strokeArc(175, a0, a0 + charge)} className="ring-charge" />}
              <svg x={ix - 11} y={iy - 11} width={22} height={22} viewBox="0 0 24 24" className="ring-icon">
                <Icon name={id} size={22} />
              </svg>
            </g>
          );
        })}
        <GirihStar r={104} />
        <text x={C} y={C + 8} className="ring-score" textAnchor="middle">
          {score == null ? "–" : shown}
        </text>
        <text x={C} y={C + 40} className="ring-sub" textAnchor="middle">
          {t("ring.unit")}
        </text>
      </svg>
      <p className="ring-grade">{gradeLabel}</p>
    </div>
  );
}
