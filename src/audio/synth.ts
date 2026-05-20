import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.resolve(__dirname, "..", "..", "assets", "sfx");

const TYPING_SRC = path.join(SFX_DIR, "typing.mp3");
const RECEIVE_SRC = path.join(SFX_DIR, "receive.mp3");
const SEND_SRC = path.join(SFX_DIR, "send.mp3");

async function exists(p: string): Promise<boolean> {
  return fs
    .access(p)
    .then(() => true)
    .catch(() => false);
}

export async function ensureSfx(): Promise<void> {
  for (const p of [TYPING_SRC, RECEIVE_SRC, SEND_SRC]) {
    if (!(await exists(p))) {
      throw new Error(`Missing audio asset: ${path.relative(process.cwd(), p)}`);
    }
  }
}

export type TimelineEvent =
  | { tSec: number; kind: "type"; durationMs: number }
  | { tSec: number; kind: "receive" }
  | { tSec: number; kind: "send" };

/**
 * Render a mono audio track that plays the typing sound during each owner
 * message's typing window and the receive sound at each incoming message.
 *
 * Strategy: each event becomes one ffmpeg input; the input is delayed with
 * `adelay`, "typing" events are also trimmed to their duration with `atrim`,
 * and a final `amix` blends them all into one track padded with silence to
 * the requested duration.
 */
export async function renderAudioTrack(args: {
  events: TimelineEvent[];
  durationSec: number;
  outputPath: string;
}): Promise<void> {
  await ensureSfx();
  const { events, durationSec, outputPath } = args;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  if (events.length === 0) {
    await exec("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=mono:sample_rate=44100:duration=${durationSec.toFixed(3)}`,
      outputPath,
    ]);
    return;
  }

  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];

  // The user's typing.mp3 has sparse keystrokes in the first ~3 seconds, then
  // settles into a continuous flurry. Skip the slow intro and speed up 40%
  // so the cadence matches the visual typing rhythm.
  const TYPING_SS = 3.0;
  const TYPING_TEMPO = 1.4;

  events.forEach((evt, i) => {
    const delayMs = Math.max(0, Math.round(evt.tSec * 1000));
    if (evt.kind === "type") {
      inputs.push("-ss", String(TYPING_SS), "-i", TYPING_SRC);
      // After atempo=1.4 each second of source becomes 1/1.4 ≈ 0.714s of
      // output. We want the OUTPUT to last `durationMs`, so we trim the
      // source to durationMs*tempo first, then apply atempo.
      const srcDur = (evt.durationMs / 1000) * TYPING_TEMPO;
      const outDur = evt.durationMs / 1000;
      const fadeStart = Math.max(0, outDur - 0.08).toFixed(3);
      filters.push(
        `[${i}:a]atrim=duration=${srcDur.toFixed(3)},asetpts=PTS-STARTPTS,` +
          `atempo=${TYPING_TEMPO},` +
          `afade=t=in:st=0:d=0.04,afade=t=out:st=${fadeStart}:d=0.08,` +
          `volume=0.9,` +
          `adelay=${delayMs}|${delayMs},apad[a${i}]`,
      );
    } else if (evt.kind === "receive") {
      inputs.push("-i", RECEIVE_SRC);
      filters.push(
        `[${i}:a]volume=0.95,adelay=${delayMs}|${delayMs},apad[a${i}]`,
      );
    } else {
      inputs.push("-i", SEND_SRC);
      filters.push(
        `[${i}:a]volume=0.85,adelay=${delayMs}|${delayMs},apad[a${i}]`,
      );
    }
    labels.push(`[a${i}]`);
  });

  const filter =
    filters.join(";") +
    ";" +
    labels.join("") +
    `amix=inputs=${events.length}:normalize=0:dropout_transition=0,` +
    `atrim=duration=${durationSec.toFixed(3)},asetpts=PTS-STARTPTS`;

  await exec("ffmpeg", [
    "-y",
    ...inputs,
    "-filter_complex",
    filter,
    "-ar",
    "44100",
    "-ac",
    "1",
    outputPath,
  ]);
}

/**
 * Mux video + audio into MP4. Optionally trims the front of the video by
 * `videoTrimMs` so that t=0 in the output matches the moment the player
 * began executing — without this the recording includes the Playwright
 * page-load preamble and audio drifts ahead of picture.
 */
export async function muxVideoAudio(args: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  videoTrimMs?: number;
}): Promise<void> {
  const trim = Math.max(0, args.videoTrimMs ?? 0);
  // -ss AFTER -i is frame-accurate (decodes from start, then seeks).
  // -r 30 + -vsync cfr forces a constant frame rate output; Playwright's
  // WebM is VFR and some players progressively drift relative to a CFR
  // audio track when the source has uneven frame spacing.
  const trimArgs = trim > 0 ? ["-ss", (trim / 1000).toFixed(3)] : [];
  await exec("ffmpeg", [
    "-y",
    "-i",
    args.videoPath,
    "-i",
    args.audioPath,
    ...trimArgs,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-vsync",
    "cfr",
    "-movflags",
    "+faststart",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-shortest",
    args.outputPath,
  ]);
}
