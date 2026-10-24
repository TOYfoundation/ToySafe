// Checks that de.json and en.json have the same keys and that every literal t("…") key exists.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const de = JSON.parse(readFileSync("src/i18n/locales/de.json", "utf8"));
const en = JSON.parse(readFileSync("src/i18n/locales/en.json", "utf8"));
const problems = [];
for (const k of Object.keys(de)) if (!(k in en)) problems.push(`en missing: ${k}`);
for (const k of Object.keys(en)) if (!(k in de)) problems.push(`de missing: ${k}`);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}
const KEY = /\bt\(\s*"([a-zA-Z0-9_.-]+)"/g;
const LITERAL = /"((?:nav|bridge|vault|comms|op|pass|link)\.[a-zA-Z0-9_.-]+)"/g;
for (const file of walk("src")) {
  const src = readFileSync(file, "utf8");
  for (const re of [KEY, LITERAL]) {
    for (const m of src.matchAll(re)) {
      const k = m[1];
      if (k.endsWith(".")) continue;
      if (!(k in de) && !Object.keys(de).some((x) => x.startsWith(`${k}.`))) problems.push(`${file}: unknown key ${k}`);
    }
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${Object.keys(de).length} keys in de and en`);
