// End-to-end check: plays every Level 7 mission in a real browser using the answers from the content file.
// Usage: npm run build && npx vite preview --port 4173 &  then  node tools/playthrough.mjs http://localhost:4173
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:4173";
const level = JSON.parse(readFileSync(new URL("../../content/level7/missions.json", import.meta.url), "utf8"));
const PASS = "Kamel-Wolke-Gabel-Laterne-Spiegel";

const btn = (page, name) => page.getByRole("button", { name, exact: true });

async function solveStep(page, step) {
  const stage = page.locator(".stepwrap");
  switch (step.type) {
    case "dialog":
      await btn(stage, "Weiter").click();
      return false;
    case "choice":
      await stage.locator(".opt", { hasText: step.options.find((o) => o.correct).text }).click();
      break;
    case "multi":
      for (const o of step.options.filter((o) => o.correct)) await stage.locator("label.opt", { hasText: o.text }).click();
      await btn(stage, "Prüfen").click();
      break;
    case "classify":
      for (const it of step.items) {
        const label = step.buckets.find((b) => b.id === it.answer).label;
        await stage.locator(".classify > li", { hasText: it.text }).getByRole("radio", { name: label, exact: true }).click();
      }
      await btn(stage, "Prüfen").click();
      break;
    case "order": {
      const want = step.items.map((i) => i.text);
      for (let guard = 0; guard < 60; guard++) {
        const now = await stage.locator(".order-text").allTextContents();
        const pos = now.findIndex((t, i) => t !== want[i]);
        if (pos < 0) break;
        const from = now.indexOf(want[pos]);
        await stage.locator(".order > li").nth(from).getByRole("button", { name: "Nach oben" }).click();
      }
      await btn(stage, "Prüfen").click();
      break;
    }
    case "toggle":
      for (const it of step.items) {
        const sw = stage.locator(".toggles > li", { hasText: it.label }).getByRole("switch");
        if ((await sw.getAttribute("aria-checked")) !== String(it.target)) await sw.click();
      }
      await btn(stage, "Prüfen").click();
      break;
    case "passphrase":
      await stage.locator(".pass-input").fill(PASS);
      await btn(stage, "Prüfen").click();
      break;
    case "find":
      for (const l of step.lines.filter((l) => l.suspicious)) await stage.locator(".logline", { hasText: l.text }).click();
      await btn(stage, "Prüfen").click();
      break;
    case "match":
      for (const l of step.left) {
        const r = step.right.find((x) => x.id === step.solution[l.id]);
        await stage.locator(".match > li", { hasText: l.text }).locator("select").selectOption({ label: r.text });
      }
      await btn(stage, "Prüfen").click();
      break;
    case "chat":
      for (const turn of step.turns) {
        await stage.locator(".opt", { hasText: turn.options.find((o) => o.correct).text }).click();
      }
      break;
    case "timed":
      await stage.getByRole("button", { name: /^Start/ }).click();
      for (let i = 0; i < step.items.length; i++) {
        const text = (await stage.locator(".timed-card").textContent()).trim();
        const item = step.items.find((x) => x.text === text);
        const label = step.buckets.find((b) => b.id === item.answer).label;
        await stage.locator(".timed-buckets").getByRole("button", { name: label, exact: true }).click();
      }
      break;
    case "consensus":
      for (const m of step.members.filter((m) => m.stance !== "yes")) {
        if (await stage.locator(".gate.is-open").count()) break;
        await stage.locator(".council > li", { hasText: m.name }).locator(".opt", { hasText: m.options.find((o) => o.correct).text }).click();
      }
      break;
    case "compare":
      for (let i = 0; i < step.pairs.length; i++) {
        await stage.locator(".pairs > li").nth(i).getByRole("radio", { name: step.pairs[i].same ? "gleich" : "verschieden" }).click();
      }
      await btn(stage, "Prüfen").click();
      break;
    default:
      throw new Error(`unknown step ${step.type}`);
  }
  await stage.locator(".step-ok").waitFor({ timeout: 4000 });
  await btn(stage, "Weiter").click();
  return true;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let ok = 0;
for (const m of level.missions) {
  await page.goto(`${base}/#/academy/${m.id}`);
  for (let i = 0; i < m.intro.length; i++) {
    await btn(page, i + 1 < m.intro.length ? "Weiter" : "Mission beginnen").click();
  }
  for (const step of m.steps) await solveStep(page, step);
  await btn(page, "Belohnung abholen").click();
  const seal = (await page.locator(".reward h2").textContent()).trim();
  const stars = await page.locator(".stars span.on").count();
  if (seal !== m.reward.seal || stars !== 3) throw new Error(`${m.id}: seal ${seal}, stars ${stars}`);
  ok++;
  console.log(`ok  ${m.id}  ${stars}★  ${seal}`);
}
await page.goto(`${base}/#/academy`);
const done = await page.locator(".kv dd").first().textContent();
console.log(`progress shown: ${done}`);
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${ok}/${level.missions.length} missions solved with 3 stars`);
