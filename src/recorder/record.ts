import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import type { Script } from "../types/script.ts";
import {
  muxVideoAudio,
  renderAudioTrack,
  type TimelineEvent,
} from "../audio/synth.ts";

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

interface RawEvent {
  tMs: number;
  kind: "type-start" | "type-end" | "receive";
}

function eventsToTimeline(raw: RawEvent[]): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  let typingStart: number | null = null;
  for (const e of raw) {
    if (e.kind === "type-start") {
      typingStart = e.tMs;
    } else if (e.kind === "type-end") {
      if (typingStart != null) {
        out.push({
          tSec: typingStart / 1000,
          kind: "type",
          durationMs: Math.max(80, e.tMs - typingStart),
        });
        typingStart = null;
      }
    } else if (e.kind === "receive") {
      out.push({ tSec: e.tMs / 1000, kind: "receive" });
    }
  }
  return out;
}

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

    // Will be populated as the page fires audio notifications. Timestamps
    // are captured at receipt in Node, relative to playStartT (set below).
    const rawEvents: RawEvent[] = [];
    let playStartT = 0;

    await page.exposeFunction("__audioNotify", (kind: RawEvent["kind"]) => {
      if (playStartT === 0) return;
      rawEvents.push({ tMs: Date.now() - playStartT, kind });
    });

    const url = pathToFileURL(SIMULATOR_INDEX).toString();
    await page.goto(url);
    await page.waitForFunction(() => (window as any).__playReady === true);
    await page.waitForTimeout(200);

    playStartT = Date.now();
    await page.evaluate(
      async ([script, options]) => {
        await (window as any).__playScript(script, options);
      },
      [script, { speed, startDelayMs, endHoldMs }] as const,
    );
    const playEndT = Date.now();

    const video = page.video();
    await page.close();
    await context.close();

    if (!video) throw new Error("Playwright did not produce a video.");
    const rawPath = await video.path();

    const wantsMp4 = opts.outputPath.endsWith(".mp4");
    const withAudio = opts.withAudio ?? wantsMp4;
    const videoTrimMs = Math.max(0, playStartT - recordStartT);

    if (!withAudio) {
      const finalPath = opts.outputPath.endsWith(".webm")
        ? opts.outputPath
        : opts.outputPath.replace(/\.mp4$/i, "") + ".webm";
      await fs.rename(rawPath, finalPath);
      return finalPath;
    }

    const events = eventsToTimeline(rawEvents);
    const durationSec = (playEndT - playStartT) / 1000 + 0.2;
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
