import { chromium } from "playwright";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import type { Script } from "../types/script.ts";

const exec = promisify(execFile);

export interface ScreenRecordOptions {
  script: Script;
  outputPath: string;
  speed?: number;
  startDelayMs?: number;
  endHoldMs?: number;
  /** X display number (default :99) */
  display?: string;
  /** Frame rate of capture (default 30) */
  fps?: number;
  /** Don't kill Xvfb / PulseAudio afterwards (faster successive runs). */
  keepBackgroundServices?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const SIMULATOR_DIR = path.resolve(__dirname, "..", "simulator");
const SIMULATOR_INDEX = path.join(SIMULATOR_DIR, "index.html");
const SFX_DIR = path.join(ROOT, "assets", "sfx");

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await exec("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function isProcessRunning(name: string): Promise<boolean> {
  try {
    await exec("pgrep", ["-x", name]);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000, intervalMs = 100): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("waitFor timed out");
}

export async function recordScriptScreen(opts: ScreenRecordOptions): Promise<string> {
  if (os.platform() !== "linux") {
    throw new Error(
      "Screen-capture recording requires Linux (Xvfb + PulseAudio). " +
        "On macOS/Windows, run the default recorder (without --screen).",
    );
  }

  for (const tool of ["Xvfb", "pulseaudio", "ffmpeg", "pactl"]) {
    if (!(await commandExists(tool))) {
      throw new Error(
        `Required tool not found: ${tool}. Install with: ` +
          `apt-get install -y xvfb pulseaudio pulseaudio-utils ffmpeg`,
      );
    }
  }

  const { script } = opts;
  const display = opts.display ?? ":99";
  const fps = opts.fps ?? 30;
  const outputPath = opts.outputPath.endsWith(".mp4")
    ? opts.outputPath
    : opts.outputPath.replace(/\.(webm|mp4)$/i, "") + ".mp4";
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // ----- Background services -----
  const cleanupTasks: Array<() => Promise<void>> = [];

  // 1) Xvfb. Screen is 1080×2000 so Chrome's UI bar (~80px tab strip +
  // URL bar with no window manager to suppress them) sits in the top 80px
  // and the actual 1080×1920 viewport sits beneath. ffmpeg then captures
  // only that 1080×1920 region.
  if (!(await isProcessRunning("Xvfb"))) {
    await fs.unlink(`/tmp/.X${display.slice(1)}-lock`).catch(() => {});
    const xvfb = spawn(
      "Xvfb",
      [display, "-screen", "0", "1080x2000x24", "-ac"],
      { detached: true, stdio: "ignore" },
    );
    xvfb.unref();
    if (!opts.keepBackgroundServices) {
      cleanupTasks.push(async () => {
        try {
          process.kill(xvfb.pid!, "SIGTERM");
        } catch {}
      });
    }
    await waitFor(() => isProcessRunning("Xvfb"), 5000);
    // Small additional settle for the X server to accept connections.
    await new Promise((r) => setTimeout(r, 300));
  }

  // 2) PulseAudio (user mode). Use XDG_RUNTIME_DIR matching $UID.
  const runtimeDir = `/run/user/${process.getuid?.() ?? 0}`;
  await fs.mkdir(runtimeDir, { recursive: true }).catch(() => {});
  const pulseEnv = {
    ...process.env,
    DISPLAY: display,
    XDG_RUNTIME_DIR: runtimeDir,
  };
  if (!(await isProcessRunning("pulseaudio"))) {
    await exec("pulseaudio", ["--start", "--exit-idle-time=-1"], {
      env: pulseEnv,
    });
    await waitFor(() => isProcessRunning("pulseaudio"), 5000);
    if (!opts.keepBackgroundServices) {
      cleanupTasks.push(async () => {
        try {
          await exec("pulseaudio", ["--kill"], { env: pulseEnv });
        } catch {}
      });
    }
  }

  // ----- Chromium under Xvfb -----
  // Window size matches the Xvfb screen (1080×2000). Chrome's tab strip +
  // URL bar take the top ~80px; the page content area is the remaining
  // 1920px which is exactly what we crop in ffmpeg below.
  const browser = await chromium.launch({
    headless: false,
    env: pulseEnv,
    args: [
      "--no-sandbox",
      "--window-size=1080,2000",
      "--window-position=0,0",
      "--start-maximized",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-features=Translate,InfiniteSessionRestore",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });

  let ffmpeg: ReturnType<typeof spawn> | null = null;
  try {
    const context = await browser.newContext({
      viewport: { width: 1080, height: 1920 },
    });
    const page = await context.newPage();

    // Serve the bundled SFX files to the in-browser fetch() calls.
    await page.route("**/sfx/*.mp3", async (route, request) => {
      const url = new URL(request.url());
      const filename = path.basename(url.pathname);
      try {
        const buf = await fs.readFile(path.join(SFX_DIR, filename));
        await route.fulfill({ contentType: "audio/mpeg", body: buf });
      } catch {
        await route.fulfill({ status: 404, body: "not found" });
      }
    });

    await page.goto(pathToFileURL(SIMULATOR_INDEX).toString());
    await page.waitForFunction(() => (window as any).__playReady === true);
    // Let fonts + SFX decode before recording starts.
    await page.waitForTimeout(400);

    // ----- Start ffmpeg recording (both x11 and pulse inputs) -----
    // Key sync flags:
    //   -use_wallclock_as_timestamps 1 forces ffmpeg to stamp each frame
    //   with the system clock at capture instant, so the two inputs share
    //   the same time reference regardless of their internal buffering.
    //   Without this, PulseAudio's monitor source preroll (~1-2 s) ends up
    //   marking early audio packets at t=0 → audio appears "ahead" of
    //   video by that preroll amount.
    //   -draw_mouse 0 hides the X cursor in the capture.
    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-thread_queue_size",
      "1024",
      "-use_wallclock_as_timestamps",
      "1",
      "-f",
      "x11grab",
      "-draw_mouse",
      "0",
      "-framerate",
      String(fps),
      "-video_size",
      "1080x1920",
      "-i",
      `${display}.0+0,80`,
      "-thread_queue_size",
      "1024",
      "-use_wallclock_as_timestamps",
      "1",
      "-f",
      "pulse",
      "-i",
      "default",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      outputPath,
    ];
    ffmpeg = spawn("ffmpeg", ffmpegArgs, { env: pulseEnv });

    // PulseAudio's monitor source typically needs ~1.5 s to deliver its
    // first usable packet; if we evaluate playScript before that, the
    // initial audio events fall on silence in the recording.
    await new Promise((r) => setTimeout(r, 1800));

    // ----- Drive the player -----
    const startDelayMs = opts.startDelayMs ?? 600;
    const endHoldMs = opts.endHoldMs ?? 1500;
    const speed = opts.speed ?? 1;
    await page.evaluate(
      async ([script, options]) => {
        await (window as any).__playScript(script, options);
      },
      [script, { speed, startDelayMs, endHoldMs }] as const,
    );

    // Hold a moment so trailing audio (last receive, fades) lands in the file.
    await new Promise((r) => setTimeout(r, 400));

    // ----- Stop ffmpeg gracefully -----
    await new Promise<void>((resolve) => {
      const f = ffmpeg!;
      f.on("close", () => resolve());
      // SIGINT lets ffmpeg flush + write the MP4 trailer.
      f.stdin?.write("q");
      try {
        f.kill("SIGINT");
      } catch {}
      // Hard fallback.
      setTimeout(() => {
        try {
          f.kill("SIGKILL");
        } catch {}
        resolve();
      }, 5000);
    });

    await page.close();
    await context.close();
    return outputPath;
  } finally {
    await browser.close().catch(() => {});
    for (const task of cleanupTasks) await task().catch(() => {});
  }
}
