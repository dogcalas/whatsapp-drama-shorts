import type { Script } from "../types/script.ts";
import type { TimelineEvent } from "./synth.ts";

interface BuildOptions {
  startDelayMs: number;
  endHoldMs: number;
  /** Same speed factor used by the player. */
  speed: number;
  /** Keystroke cadence (ms between ticks). */
  keystrokeIntervalMs: number;
  /** Min delay between consecutive keystrokes (defensive). */
  minIntervalMs: number;
}

const DEFAULTS: BuildOptions = {
  startDelayMs: 600,
  endHoldMs: 1500,
  speed: 1,
  keystrokeIntervalMs: 180,
  minIntervalMs: 90,
};

/**
 * Returns the sequence of audio events to play during a render of `script`.
 * Mirrors the player's scheduling exactly so events line up with the picture.
 *
 *  - owner messages → typing keystrokes during the typingMs window + a send
 *    whoosh at the moment the bubble appears
 *  - incoming messages → a receive notification at the moment the bubble lands
 */
export function buildTimeline(
  script: Script,
  opts: Partial<BuildOptions> = {},
): { events: TimelineEvent[]; durationSec: number } {
  const o = { ...DEFAULTS, ...opts };
  const scale = (ms: number) => ms / o.speed;
  let tMs = scale(o.startDelayMs);
  const events: TimelineEvent[] = [];

  for (const msg of script.messages) {
    tMs += scale(msg.preDelayMs);
    const sender = script.participants.find((p) => p.id === msg.from);
    const isOwner = sender?.isOwner ?? false;

    // The player computes per-char delay as max(28, min(140, typingMs / len)).
    // We approximate keystroke ticks with a fixed cadence inside the typing
    // window so the audio doesn't get cluttered when messages are long.
    const typingMs = scale(
      isOwner
        ? Math.max(msg.typingMs, msg.text.length * 50)
        : msg.typingMs,
    );

    if (isOwner && typingMs > 0) {
      const interval = Math.max(o.minIntervalMs, scale(o.keystrokeIntervalMs));
      // Cap keystrokes per message to keep the ffmpeg filter graph small.
      const maxTicks = Math.min(
        Math.floor(typingMs / interval),
        Math.min(msg.text.length, 14),
      );
      for (let k = 0; k < maxTicks; k++) {
        const at = tMs + interval * (k + 0.5);
        events.push({ tSec: at / 1000, kind: "key" });
      }
      tMs += typingMs;
      // Tiny pause before tapping send, matches player.
      tMs += scale(200);
      events.push({ tSec: tMs / 1000, kind: "send" });
      // Bubble fly animation duration before next message scheduling.
      tMs += scale(380);
    } else {
      // Incoming: typing indicator runs for typingMs, then bubble pops.
      tMs += typingMs;
      events.push({ tSec: tMs / 1000, kind: "receive" });
    }
  }

  const durationSec = (tMs + scale(o.endHoldMs)) / 1000;
  return { events, durationSec };
}
