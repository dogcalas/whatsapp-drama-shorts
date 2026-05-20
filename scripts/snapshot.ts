import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { validateScript, type Script } from "../src/types/script.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SIM = path.join(ROOT, "src", "simulator", "index.html");
const SCRIPT_FILE = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(ROOT, "examples", "sample-es-infidelity.json");
const OUT = path.join(ROOT, "output", "shots");

await fs.mkdir(OUT, { recursive: true });
const script = validateScript(JSON.parse(await fs.readFile(SCRIPT_FILE, "utf8")));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1080, height: 1920 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(pathToFileURL(SIM).toString());
await page.waitForFunction(() => (window as any).__playReady === true);

// Make sure Roboto is loaded before we snapshot.
await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());

const targets = [4, 8, 12, script.messages.length];

for (const count of targets) {
  const partial: Script = {
    ...script,
    messages: script.messages.slice(0, count),
  };
  await page.evaluate((s) => (window as any).__renderStatic(s), partial);
  // Give layout one frame.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => r(null))),
  );
  const name = `step-${String(count).padStart(2, "0")}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
}

await browser.close();
console.log("Wrote", targets.map((t) => `step-${String(t).padStart(2, "0")}.png`).join(", "), "to", OUT);
