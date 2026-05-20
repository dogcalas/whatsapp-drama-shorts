import "dotenv/config";
import { Command } from "commander";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateScript } from "./generator/index.ts";
import {
  LanguageSchema,
  ThemeSchema,
  validateScript,
  type Language,
  type Script,
  type Theme,
} from "./types/script.ts";
import { recordScript } from "./recorder/record.ts";
import { recordScriptScreen } from "./recorder/record-screen.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "output");

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

async function loadScript(file: string): Promise<Script> {
  const raw = await fs.readFile(file, "utf8");
  return validateScript(JSON.parse(raw));
}

async function saveScript(script: Script, file: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(script, null, 2), "utf8");
}

const program = new Command();

program
  .name("whatsapp-drama-shorts")
  .description("Generate dramatic WhatsApp conversations and render them to vertical short videos.");

program
  .command("generate")
  .description("Generate a script JSON using Claude.")
  .option("-t, --theme <theme>", "drama theme", "infidelity")
  .option("-l, --language <lang>", "es | en", "es")
  .option("-p, --prompt <text>", "extra direction for the generator")
  .option("-o, --out <file>", "output JSON path (defaults to ./output/<slug>.json)")
  .option("--model <id>", "override the Claude model")
  .action(async (opts) => {
    const theme = ThemeSchema.parse(opts.theme) as Theme;
    const language = LanguageSchema.parse(opts.language) as Language;
    process.stdout.write(`Generating ${theme} drama in ${language}…\n`);
    const script = await generateScript({
      theme,
      language,
      customPrompt: opts.prompt,
      model: opts.model,
    });
    const outFile =
      opts.out ??
      path.join(
        OUTPUT_DIR,
        `${timestamp()}-${slugify(script.meta.title)}.json`,
      );
    await saveScript(script, outFile);
    process.stdout.write(
      `✓ Script saved: ${path.relative(ROOT, outFile)}\n` +
        `  Title: ${script.meta.title}\n` +
        `  Hook:  ${script.meta.hook}\n` +
        `  Twist: ${script.meta.twist}\n` +
        `  Messages: ${script.messages.length}\n` +
        `  Est. duration: ${script.meta.estimatedDurationSeconds}s\n`,
    );
  });

program
  .command("render")
  .description("Render an existing script JSON to a video (.mp4 with audio).")
  .requiredOption("-i, --in <file>", "script JSON file")
  .option("-o, --out <file>", "output video path (.mp4 or .webm)")
  .option("--speed <n>", "playback speed multiplier", parseFloat, 1)
  .option("--no-audio", "skip audio synthesis (.webm only, faster)")
  .option(
    "--screen",
    "Linux only: capture screen + audio with ffmpeg/Xvfb/PulseAudio (perfect A/V sync)",
  )
  .action(async (opts) => {
    const script = await loadScript(opts.in);
    const ext = opts.audio === false ? "webm" : "mp4";
    const outFile =
      opts.out ??
      path.join(
        OUTPUT_DIR,
        `${timestamp()}-${slugify(script.meta.title)}.${ext}`,
      );
    process.stdout.write(`Rendering "${script.meta.title}"…\n`);
    if (opts.screen) {
      const written = await recordScriptScreen({
        script,
        outputPath: outFile,
        speed: opts.speed,
      });
      process.stdout.write(`✓ Video saved: ${path.relative(ROOT, written)}\n`);
      return;
    }
    const written = await recordScript({
      script,
      outputPath: outFile,
      speed: opts.speed,
      withAudio: opts.audio !== false,
    });
    process.stdout.write(`✓ Video saved: ${path.relative(ROOT, written)}\n`);
  });

program
  .command("shoot")
  .description("Generate + render in one step.")
  .option("-t, --theme <theme>", "drama theme", "infidelity")
  .option("-l, --language <lang>", "es | en", "es")
  .option("-p, --prompt <text>", "extra direction for the generator")
  .option("--speed <n>", "playback speed multiplier", parseFloat, 1)
  .option("--model <id>", "override the Claude model")
  .option(
    "--screen",
    "Linux only: capture screen + audio with ffmpeg/Xvfb/PulseAudio",
  )
  .action(async (opts) => {
    const theme = ThemeSchema.parse(opts.theme) as Theme;
    const language = LanguageSchema.parse(opts.language) as Language;
    process.stdout.write(`Generating ${theme} drama in ${language}…\n`);
    const script = await generateScript({
      theme,
      language,
      customPrompt: opts.prompt,
      model: opts.model,
    });
    const base = path.join(
      OUTPUT_DIR,
      `${timestamp()}-${slugify(script.meta.title)}`,
    );
    await saveScript(script, `${base}.json`);
    process.stdout.write(`✓ Script: ${path.relative(ROOT, base)}.json\n`);
    process.stdout.write(`  Title: ${script.meta.title}\n`);
    process.stdout.write(`  Hook:  ${script.meta.hook}\n`);
    process.stdout.write(`  Twist: ${script.meta.twist}\n`);
    process.stdout.write(`Rendering…\n`);
    const written = opts.screen
      ? await recordScriptScreen({
          script,
          outputPath: `${base}.mp4`,
          speed: opts.speed,
        })
      : await recordScript({
          script,
          outputPath: `${base}.mp4`,
          speed: opts.speed,
          withAudio: true,
        });
    process.stdout.write(`✓ Video: ${path.relative(ROOT, written)}\n`);
  });

program
  .command("serve")
  .description("Serve the simulator with a script for in-browser preview.")
  .requiredOption("-i, --in <file>", "script JSON file")
  .option("--port <n>", "port", (v) => parseInt(v, 10), 5173)
  .option("--speed <n>", "playback speed multiplier", parseFloat, 1)
  .action(async (opts) => {
    const script = await loadScript(opts.in);
    const simDir = path.join(ROOT, "src", "simulator");

    const server = http.createServer(async (req, res) => {
      const urlPath = (req.url ?? "/").split("?")[0];
      if (urlPath === "/script.json") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ script, speed: opts.speed }));
        return;
      }
      const target = urlPath === "/" ? "/preview.html" : urlPath;
      if (target === "/preview.html") {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.end(previewHtml());
        return;
      }
      const filePath = path.join(simDir, target.replace(/^\//, ""));
      try {
        const data = await fs.readFile(filePath);
        res.setHeader("Content-Type", mimeOf(filePath));
        res.end(data);
      } catch {
        res.statusCode = 404;
        res.end("not found");
      }
    });

    server.listen(opts.port, () => {
      process.stdout.write(
        `Preview server: http://localhost:${opts.port}/\nScript: ${opts.in}\n`,
      );
    });

    // keep alive
    process.on("SIGINT", () => {
      server.close();
      process.exit(0);
    });
    void pathToFileURL; // silence unused import in some toolchains
  });

function mimeOf(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json";
  return "application/octet-stream";
}

function previewHtml(): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Preview</title>
<style>
  html,body{margin:0;background:#111;display:flex;align-items:center;justify-content:center;min-height:100vh}
  iframe{width:540px;height:960px;border:0;transform-origin:top left;transform:scale(0.5);position:absolute;top:0;left:50%;margin-left:-270px}
</style>
</head><body>
<iframe id="f" src="/index.html"></iframe>
<script>
  const f = document.getElementById('f');
  f.addEventListener('load', async () => {
    const w = f.contentWindow;
    const res = await fetch('/script.json');
    const { script, speed } = await res.json();
    const wait = () => new Promise(r => {
      const t = setInterval(() => { if (w.__playReady) { clearInterval(t); r(); } }, 50);
    });
    await wait();
    w.__playScript(script, { speed });
  });
</script>
</body></html>`;
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
