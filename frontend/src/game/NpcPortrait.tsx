import type { Npc } from "./types";

/** Medallion portrait: initial inside an eight-pointed star frame, tinted with the NPC's colour. */
export function NpcPortrait({ npc, size = 64 }: { npc?: Npc; size?: number }) {
  const color = npc?.color ?? "var(--brass)";
  const initial = (npc?.name.replace(/^(Kapitänin|Wächter|Siegelmeisterin|Schmied|Münzmeister|Karawanenführerin|Bibliothekar|Großmutter|Funkmeisterin)\s+/, "") ?? "?").slice(0, 1);
  const pts = (r: number, rot: number) =>
    [0, 90, 180, 270].map((d) => {
      const a = ((d + rot - 90) * Math.PI) / 180;
      return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
    }).join(" ");
  return (
    <svg className="npc" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={npc?.name ?? ""}>
      <polygon points={pts(48, 0)} fill="var(--panel-2)" stroke={color} strokeWidth="2.5" />
      <polygon points={pts(48, 45)} fill="var(--panel-2)" stroke={color} strokeWidth="2.5" />
      <circle cx="50" cy="50" r="30" fill={color} fillOpacity="0.16" stroke={color} strokeOpacity="0.6" />
      <text x="50" y="62" textAnchor="middle" className="npc-initial" fill={color}>
        {initial}
      </text>
    </svg>
  );
}
