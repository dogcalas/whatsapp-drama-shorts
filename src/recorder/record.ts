import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import type { Script } from "../types/script.ts";
import { buildTimeline } from "../audio/timeline.ts";
import { muxVideoAudio, renderAudioTrack } from "../audio/synth.ts";

export interface RecordOptions {
  script: Script;
  outputPath: string; // .webm or .mp4 (mp4 triggers ffmpeg post-process with audio)
  speed?: number;
  startDelayMs?: number;
  endHoldMs?: number;
  withAudio?: boolean; // default true when outputPath ends with .mp4
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SIMULATOR_DIR = path.resolve(__dirname, "..", "simulator");
const SIMULATOR_INDEX = path.join(SIMULATOR_DIR, "index.html");

/**
 * Records the simulator playing the given script and writes a video file.
 * Playwright records to WebM (VP8/VP9). If the requested outputPath ends in
 * .mp4 we keep the .webm next to it and write a note; converting to MP4 is
 * left to the caller (ffmpeg, recommended in README).
 */
export async function recordScript(opts: RecordOptions): Promise<string> {
  const { script } = opts;
  const outDir = path.dirname(opts.outputPath);
  await fs.mkdir(outDir, { recursive: true });

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

    const page = await context.newPage();
    const url = pathToFileURL(SIMULATOR_INDEX).toString();
    await page.goto(url);
    await page.waitForFunction(() => (window as any).__playReady === true);

    // Tiny settle so the first frame is the empty chat (good for the hook).
    await page.waitForTimeout(400);

    await page.evaluate(
      async ([script, options]) => {
        await (window as any).__playScript(script, options);
      },
      [
        script,
        {
          speed: opts.speed ?? 1,
          startDelayMs: opts.startDelayMs ?? 600,
          endHoldMs: opts.endHoldMs ?? 1800,
        },
      ] as const,
    );

    // Close to flush the video.
    const video = page.video();
    await page.close();
    await context.close();

    if (!video) throw new Error("Playwright did not produce a video.");
    const rawPath = await video.path();

    const wantsMp4 = opts.outputPath.endsWith(".mp4");
    const withAudio = opts.withAudio ?? wantsMp4;

    if (!withAudio) {
      const finalPath = opts.outputPath.endsWith(".webm")
        ? opts.outputPath
        : opts.outputPath.replace(/\.mp4$/i, "") + ".webm";
      await fs.rename(rawPath, finalPath);
      return finalPath;
    }

    // Build the audio track from the script timeline, then mux into mp4.
    const { events, durationSec } = buildTimeline(opts.script, {
      startDelayMs: opts.startDelayMs ?? 600,
      endHoldMs: opts.endHoldMs ?? 1500,
      speed: opts.speed ?? 1,
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
    });
    await fs.unlink(rawPath).catch(() => {});
    await fs.unlink(audioPath).catch(() => {});
    return mp4Path;
  } finally {
    await browser.close();
  }
}
