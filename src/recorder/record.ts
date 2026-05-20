import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import type { Script } from "../types/script.ts";
import { buildTimeline } from "../audio/timeline.ts";
import { muxVideoAudio, renderAudioTrack } from "../audio/synth.ts";

export interface RecordOptions {
  script: Script;
  outputPath: string;
  speed?: number;
  startDelayMs?: number;
  endHoldMs?: number;
  withAudio?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIMULATOR_DIR = path.resolve(__dirname, "..", "simulator");
const SIMULATOR_INDEX = path.join(SIMULATOR_DIR, "index.html");

export async function recordScript(opts: RecordOptions): Promise<string> {
  const { script } = opts;
  const outDir = path.dirname(opts.outputPath);
  await fs.mkdir(outDir, { recursive: true });

  const startDelayMs = opts.startDelayMs ?? 600;
  const endHoldMs = opts.endHoldMs ?? 1500;
  const speed = opts.speed ?? 1;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: 1,
      recordVideo: {
        dir: outDir,
        size: { width: 1080, height: 1920 },
      },
    });

    const recordStartT = Date.now();
    const page = await context.newPage();
    const url = pathToFileURL(SIMULATOR_INDEX).toString();
    await page.goto(url);
    await page.waitForFunction(() => (window as any).__playReady === true);
    // Tiny settle so fonts and first frame land before we hit "play".
    await page.waitForTimeout(200);

    const playStartT = Date.now();
    await page.evaluate(
      async ([script, options]) => {
        await (window as any).__playScript(script, options);
      },
      [script, { speed, startDelayMs, endHoldMs }] as const,
    );

    const video = page.video();
    await page.close();
    await context.close();

    if (!video) throw new Error("Playwright did not produce a video.");
    const rawPath = await video.path();

    const wantsMp4 = opts.outputPath.endsWith(".mp4");
    const withAudio = opts.withAudio ?? wantsMp4;

    // Offset between recording start and the moment the player began playing.
    // We trim the video's front so t=0 in the final file matches the first
    // moment that the chat UI is animated by the player.
    const videoTrimMs = Math.max(0, playStartT - recordStartT);

    if (!withAudio) {
      const finalPath = opts.outputPath.endsWith(".webm")
        ? opts.outputPath
        : opts.outputPath.replace(/\.mp4$/i, "") + ".webm";
      await fs.rename(rawPath, finalPath);
      return finalPath;
    }

    const { events, durationSec } = buildTimeline(script, {
      startDelayMs,
      endHoldMs,
      speed,
    });
    const audioPath = rawPath.replace(/\.webm$/, ".wav");
    await renderAudioTrack({ events, durationSec, outputPath: audioPath });

    const mp4Path = wantsMp4
      ? opts.outputPath
      : opts.outputPath.replace(/\.webm$/i, "") + ".mp4";
    await muxVideoAudio({
      videoPath: rawPath,
      audioPath,
      outputPath: mp4Path,
      videoTrimMs,
    });
    await fs.unlink(rawPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    return mp4Path;
  } finally {
    await browser.close();
  }
}
