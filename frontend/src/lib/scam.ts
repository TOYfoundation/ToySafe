// Scam detector: runs completely on this device. Nothing is sent anywhere.
import rules from "@content/scam_rules.json";

export interface RuleHit {
  id: string;
  title: string;
  fact: string;
  weight: number;
  match: string;
}

export interface LinkIssue {
  id: string;
  weight: number;
  detail: string;
}

export interface LinkReport {
  url: string;
  host: string;
  issues: LinkIssue[];
}

export interface ScamReport {
  score: number; // 0..100
  verdict: "safe" | "caution" | "scam";
  hits: RuleHit[];
  links: LinkReport[];
  phraseLeak: boolean;
}

interface Rule {
  id: string;
  weight: number;
  title: string;
  patterns: string[];
  fact: string;
}

const compiled = (rules.rules as Rule[]).map((r) => ({
  ...r,
  regex: r.patterns.map((p) => new RegExp(p, "iu")),
}));

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<>"')]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:[a-z]{2,24})(?:\/[^\s<>"')]*)?)/giu;

export function officialDomains(extra: string[] = []): string[] {
  return [...(rules.official_domains as string[]), ...extra].map((d) => d.toLowerCase().replace(/^\*\./, ""));
}

function skeleton(s: string): string {
  // Map look-alike characters to their plain twin so "t0ypay" and "tоypay" (Cyrillic о) reveal themselves.
  let out = s.toLowerCase();
  const map = rules.link_checks.homoglyphs as Record<string, string>;
  for (const [from, to] of Object.entries(map).sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(from).join(to);
  }
  return out;
}

export function checkLink(raw: string, extraOfficial: string[] = []): LinkReport {
  const issues: LinkIssue[] = [];
  let url: URL | null = null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    url = new URL(withScheme);
  } catch {
    return { url: raw, host: raw, issues: [{ id: "invalid", weight: 30, detail: "link.invalid" }] };
  }
  const host = url.hostname.toLowerCase();
  const official = officialDomains(extraOfficial);
  const isOfficial = official.some((d) => host === d || host.endsWith(`.${d}`));
  const labels = host.split(".");
  const tld = labels[labels.length - 1];

  if (url.protocol === "http:") issues.push({ id: "http", weight: 15, detail: "link.http" });
  if (raw.includes("@") && /^[a-z]+:\/\/[^/]*@/i.test(withScheme)) issues.push({ id: "userinfo", weight: 40, detail: "link.userinfo" });
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) issues.push({ id: "ip", weight: 30, detail: "link.ip" });
  if (host.includes("xn--")) issues.push({ id: "punycode", weight: 35, detail: "link.punycode" });
  if (/[^\x00-\x7f]/.test(host)) issues.push({ id: "unicode", weight: 35, detail: "link.unicode" });
  if ((rules.link_checks.shorteners as string[]).includes(host)) issues.push({ id: "shortener", weight: 20, detail: "link.shortener" });
  if ((rules.link_checks.suspicious_tlds as string[]).includes(tld)) issues.push({ id: "tld", weight: 20, detail: "link.tld" });
  if (labels.length > 4) issues.push({ id: "subdomains", weight: 10, detail: "link.subdomains" });

  if (!isOfficial) {
    const plain = host;
    const skel = skeleton(host);
    for (const brand of rules.brand_keywords as string[]) {
      if (plain.includes(brand)) {
        issues.push({ id: "brand", weight: 35, detail: "link.brand" });
        break;
      }
      if (skel.includes(brand)) {
        issues.push({ id: "lookalike", weight: 50, detail: "link.lookalike" });
        break;
      }
    }
  }
  return { url: raw, host, issues };
}

const PHRASE_RE = /\b([a-z]{3,8})(\s+[a-z]{3,8}){11,23}\b/;

/** True if the text looks like a 12–24 word recovery phrase. */
export function looksLikePhrase(text: string): boolean {
  const m = text.toLowerCase().match(PHRASE_RE);
  if (!m) return false;
  const n = m[0].trim().split(/\s+/).length;
  return [12, 15, 18, 21, 24].includes(n);
}

export function analyzeMessage(text: string, extraOfficial: string[] = []): ScamReport {
  const hits: RuleHit[] = [];
  for (const r of compiled) {
    for (const re of r.regex) {
      const m = text.match(re);
      if (m) {
        hits.push({ id: r.id, title: r.title, fact: r.fact, weight: r.weight, match: m[0] });
        break;
      }
    }
  }
  const links: LinkReport[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_RE)) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(u) || /^\d+(\.\d+)+$/.test(u)) continue;
    seen.add(u);
    links.push(checkLink(u, extraOfficial));
  }
  const phraseLeak = looksLikePhrase(text);
  // Combine like independent warnings: 1 - Π(1 - w)
  const weights = [
    ...hits.map((h) => h.weight),
    ...links.flatMap((l) => l.issues.map((i) => i.weight)),
    ...(phraseLeak ? [90] : []),
  ];
  const score = Math.round(100 * (1 - weights.reduce((acc, w) => acc * (1 - Math.min(w, 99) / 100), 1)));
  const verdict = score >= 60 ? "scam" : score >= 25 ? "caution" : "safe";
  return { score, verdict, hits, links, phraseLeak };
}
