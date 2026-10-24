import de from "./locales/de.json";
import en from "./locales/en.json";
import { getState, useStore } from "../lib/store";

type Dict = Record<string, string>;
const LOCALES: Record<string, Dict> = { de, en };
export const LANGS = [
  { code: "de", name: "Deutsch" },
  { code: "en", name: "English" },
] as const;

/** German is the source, English the fallback (same rule as ToyVerse-web). */
export function translate(lang: string, key: string, vars?: Record<string, string | number>): string {
  let s = LOCALES[lang]?.[key] ?? en[key as keyof typeof en] ?? de[key as keyof typeof de] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function t(key: string, vars?: Record<string, string | number>) {
  return translate(getState().settings.lang, key, vars);
}

/** Hook version: re-renders when the language changes. */
export function useT() {
  const lang = useStore((s) => s.settings.lang);
  return (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
