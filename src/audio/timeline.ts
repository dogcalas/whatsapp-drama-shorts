import type { Script } from "../types/script.ts";
import type { TimelineEvent } from "./synth.ts";

interface BuildOptions {
  startDelayMs: number;
  endHoldMs: number;
  /** Same speed factor used by the player. */
  speed: number;
}

const DEFAULTS: BuildOptions = {
  startDelayMs: 600,
  endHoldMs: 1500,
  speed: 1,
};

/**
 * Returns the sequence of audio events to play during a render of `script`.
 * Mirrors the player's scheduling so events line up with the picture.
 *
 *  - owner messages → one "type" event spanning the typing window. The
 *    user-provided iPhone-keyboard sound already contains many discrete
 *    keystrokes, so we just play a slice of it as long as the typing.
 *  - incoming messages → a "receive" notification at the moment the bubble
 *    lands.
 *
 *  Send events are intentionally omitted (per spec).
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

    // The player computes the effective typing duration this way for the
    // composer (so 2-char messages still get a visible typing animation).
    const typingMs = scale(
      isOwner
        ? Math.max(msg.typingMs, msg.text.length * 50)
        : msg.typingMs,
    );

    if (isOwner) {
      if (typingMs > 0) {
        events.push({ tSec: tMs / 1000, kind: "type", durationMs: typingMs });
      }
      tMs += typingMs;
      // Tiny pause before the player taps send (matches main.js).
      tMs += scale(200);
      // Send animation duration before next message scheduling.
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
