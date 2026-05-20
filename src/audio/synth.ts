import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SFX_DIR = path.resolve(__dirname, "..", "..", "assets", "sfx");

/**
 * Synthesize the three short sound effects with ffmpeg if they don't exist yet.
 * Produces .wav files small enough to commit (a few KB each).
 *  - key.wav    : keystroke tick (~25 ms)
 *  - send.wav   : message-sent whoosh (~250 ms, rising)
 *  - receive.wav: incoming notification (~600 ms, two-tone)
 */
export async function ensureSfx(): Promise<void> {
  await fs.mkdir(SFX_DIR, { recursive: true });
  const have = async (f: string) =>
    fs
      .access(path.join(SFX_DIR, f))
      .then(() => true)
      .catch(() => false);

  if (!(await have("key.wav"))) {
    // Short, soft click around 2.2 kHz with a quick decay envelope.
    await exec("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=2200:duration=0.025",
      "-af",
      "volume=0.35,afade=t=out:st=0.005:d=0.02",
      "-ar",
      "44100",
      "-ac",
      "1",
      path.join(SFX_DIR, "key.wav"),
    ]);
  }

  if (!(await have("send.wav"))) {
    // Upward chirp 600 → 1400 Hz, soft volume, ~180 ms.
    await exec("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=600:duration=0.18,asetrate=44100*1.0",
      "-af",
      "volume=0.45,afade=t=out:st=0.08:d=0.1,aresample=44100",
      "-ar",
      "44100",
      "-ac",
      "1",
      path.join(SFX_DIR, "send.wav"),
    ]);
  }

  if (!(await have("receive.wav"))) {
    // Two-tone notification: 900 Hz then 1200 Hz, ~500 ms total.
    await exec("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=900:duration=0.13",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=1200:duration=0.16",
      "-filter_complex",
      "[0:a]volume=0.45,afade=t=out:st=0.07:d=0.06[a0];" +
        "[1:a]volume=0.45,adelay=160|160,afade=t=out:st=0.1:d=0.06[a1];" +
        "[a0][a1]amix=inputs=2:normalize=0",
      "-ar",
      "44100",
      "-ac",
      "1",
      path.join(SFX_DIR, "receive.wav"),
    ]);
  }
}

export interface TimelineEvent {
  tSec: number;
  kind: "key" | "send" | "receive";
}

/**
 * Renders a single mono WAV audio track that mixes all timeline events at
 * their requested offsets. Uses ffmpeg amix + adelay filters.
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

  // Build ffmpeg filter graph: one input per event (re-using the small wav
  // files), each delayed with adelay, then amixed together.
  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];

  events.forEach((evt, i) => {
    inputs.push("-i", path.join(SFX_DIR, `${evt.kind}.wav`));
    const ms = Math.max(0, Math.round(evt.tSec * 1000));
    filters.push(`[${i}:a]adelay=${ms}|${ms},apad[a${i}]`);
    labels.push(`[a${i}]`);
  });

  const filter =
    filters.join(";") +
    ";" +
    labels.join("") +
    `amix=inputs=${events.length}:normalize=0:dropout_transition=0,` +
    `atrim=duration=${durationSec.toFixed(3)},` +
    `asetpts=PTS-STARTPTS`;

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

export async function muxVideoAudio(args: {
  videoPath: string;
  audioPath: string;
  outputPath: string;
}): Promise<void> {
  await exec("ffmpeg", [
    "-y",
    "-i",
    args.videoPath,
    "-i",
    args.audioPath,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
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
