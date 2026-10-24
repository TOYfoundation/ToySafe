// Import/export of scan targets in the same format as backend/assets.example.json (CLI-compatible).
import { ASSET_TYPES, type Asset, type AssetType } from "./types";

const TEXT_FIELDS = ["ip_address", "hostname", "url", "path", "image", "mac_address", "owner"] as const;

/** Parses an assets.json file. Throws an Error with a readable message (German i18n key) on bad input. */
export function parseAssets(text: string): Asset[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("assets.err.json");
  }
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 256) throw new Error("assets.err.list");
  const seen = new Set<string>();
  return raw.map((item) => {
    const a = item as Record<string, unknown>;
    const id = String(a.id ?? "").trim().slice(0, 64);
    const name = String(a.name ?? "").trim().slice(0, 120);
    const type = a.asset_type as AssetType;
    if (!id || !name || !ASSET_TYPES.includes(type) || seen.has(id)) throw new Error("assets.err.item");
    seen.add(id);
    const out: Asset = {
      id,
      name,
      asset_type: type,
      ip_address: "",
      criticality: Math.min(5, Math.max(1, Number(a.criticality) || 3)),
      externally_reachable: a.externally_reachable === true,
      is_local: a.is_local === true,
    };
    for (const f of TEXT_FIELDS) if (typeof a[f] === "string") (out as unknown as Record<string, unknown>)[f] = (a[f] as string).slice(0, 2048);
    return out;
  });
}

/** Serialises targets without empty fields, ready for `python -m toysafe.cli scan`. */
export function exportAssets(assets: Asset[]): string {
  const clean = assets.map((a) =>
    Object.fromEntries(Object.entries(a).filter(([, v]) => v !== "" && v !== null && v !== undefined && v !== false)),
  );
  return JSON.stringify(clean, null, 2) + "\n";
}
