import type { Device } from "../lib/types";
import { useT } from "../i18n";

function hashAngle(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 0xffffffff;
}

/** Radar screen: each device is a blip. Unknown devices pulse until someone vouches for them. */
export function RadarScope({
  devices,
  known,
  selected,
  onSelect,
  scanning,
}: {
  devices: Device[];
  known: (d: Device) => boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  scanning?: boolean;
}) {
  const t = useT();
  return (
    <div className={`radar ${scanning ? "is-scanning" : ""}`}>
      <svg viewBox="0 0 300 300" className="radar-svg" aria-hidden="true">
        {[140, 105, 70, 35].map((r) => (
          <circle key={r} cx={150} cy={150} r={r} className="radar-grid" />
        ))}
        <path d="M150 10V290M10 150H290" className="radar-grid" />
      </svg>
      <div className="radar-sweep" aria-hidden="true" />
      <ul className="radar-blips" aria-label={t("radar.blips")}>
        {devices.map((d) => {
          const a = hashAngle(d.id) * Math.PI * 2;
          const isKnown = known(d);
          const dist = d.kind === "router" ? 0.08 : 0.35 + hashAngle(d.ip) * 0.55;
          const x = 50 + Math.cos(a) * dist * 46;
          const y = 50 + Math.sin(a) * dist * 46;
          return (
            <li key={d.id} style={{ left: `${x}%`, top: `${y}%`, ["--delay" as string]: `${(a / (Math.PI * 2)) * 4}s` }}>
              <button
                type="button"
                className={`blip ${isKnown ? "blip-known" : "blip-unknown"} ${selected === d.id ? "is-selected" : ""}`}
                onClick={() => onSelect(d.id)}
                aria-pressed={selected === d.id}
                aria-label={`${d.name}, ${d.vendor}, ${isKnown ? t("radar.known") : t("radar.unknown")}`}
              >
                <span className="blip-dot" />
                <span className="blip-label">{d.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
