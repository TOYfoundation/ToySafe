// Passphrase strength estimate and generator. Runs locally, nothing is stored or sent.
import { WORDS } from "./wordlist";

const COMMON = new Set(
  [
    "passwort", "password", "hallo", "geheim", "admin", "qwertz", "qwerty", "asdf", "letmein", "sommer", "winter",
    "fussball", "schatz", "liebe", "dragon", "monkey", "master", "toycoin", "toypay", "toyverse", "bitcoin", "ethereum",
    "iloveyou", "welcome", "willkommen", "test", "login", "abc", "abcdef", "baseball", "superman", "batman", "pokemon",
    "minecraft", "fortnite", "bagdad", "sesam", "oeffnedich",
  ].map((w) => w.toLowerCase()),
);

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", $: "s", "!": "i" };

export interface Strength {
  bits: number;
  level: 0 | 1 | 2 | 3 | 4;
  notes: string[]; // i18n keys
}

function unleet(s: string) {
  return [...s.toLowerCase()].map((c) => LEET[c] ?? c).join("");
}

export function estimate(pass: string): Strength {
  const notes: string[] = [];
  if (!pass) return { bits: 0, level: 0, notes };
  const tokens = pass.split(/[\s\-_.,;:+/|]+/).filter(Boolean);
  let bits = 0;
  const used = new Set<string>();
  for (const tok of tokens) {
    const plain = unleet(tok);
    const letters = plain.replace(/[^a-zäöüß]/g, "");
    const digits = tok.replace(/\D/g, "");
    const symbols = tok.replace(/[\p{L}\p{N}]/gu, "");
    if (used.has(plain)) {
      notes.push("pass.repeat");
      continue;
    }
    used.add(plain);
    if (COMMON.has(letters) || COMMON.has(plain)) {
      bits += 4;
      notes.push("pass.common");
    } else if (/^(.)\1+$/.test(plain) || /^(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf)/.test(plain)) {
      bits += 3;
      notes.push("pass.sequence");
    } else if (letters.length >= 4) {
      // A typed word is assumed to come from a large everyday vocabulary (~10k–40k words).
      bits += letters.length >= 5 ? 15 : 13;
    } else if (letters.length > 0) {
      bits += letters.length * 2.5;
    }
    if (digits) {
      if (/^(19|20)\d\d$/.test(digits)) {
        bits += 4;
        notes.push("pass.year");
      } else bits += Math.min(digits.length * 3.32, 20);
    }
    bits += Math.min(symbols.length, 3) * 3;
    if (tok !== tok.toLowerCase() && tok !== tok.toUpperCase()) bits += 1;
  }
  if (tokens.length > 1) bits += Math.log2(tokens.length); // separators/ordering, small bonus
  if (tokens.length < 4 && pass.length >= 8) notes.push("pass.moreWords");
  if (/[@$!0-9]/.test(pass) && tokens.length < 3) notes.push("pass.leet");
  bits = Math.round(bits);
  const level = bits >= 70 ? 4 : bits >= 60 ? 3 : bits >= 45 ? 2 : bits >= 28 ? 1 : 0;
  return { bits, level, notes: [...new Set(notes)] };
}

function randomIndex(max: number): number {
  // Unbiased random integer in [0, max) from the browser's CSPRNG.
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generate(count = 7, sep = "-"): string {
  return Array.from({ length: count }, () => WORDS[randomIndex(WORDS.length)]).join(sep);
}

export const BITS_PER_WORD = Math.log2(WORDS.length);
