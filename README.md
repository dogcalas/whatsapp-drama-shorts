# WhatsApp Drama Shorts

Generate dramatic WhatsApp-style conversations with Claude and render them as
vertical short videos (1080×1920, ready for YouTube Shorts / Instagram Reels).

## Pipeline

```
 [theme] ──► generator (Claude) ──► script.json ──► simulator (HTML/CSS) ──► recorder (Playwright) ──► video.webm
```

1. **Generator** — `src/generator/` uses Claude (`@anthropic-ai/sdk`) with a
   carefully tuned drama-writing system prompt (Spanish / English). It returns a
   strict JSON script with characters, messages, and **realistic per-message
   timings** (pre-delay, typing duration, read delay, emphasis).
2. **Simulator** — `src/simulator/` is a vertical 1080×1920 HTML page styled
   like WhatsApp dark mode. `main.js` consumes the script and animates it:
   typing indicator (header + bubble), staggered ticks (sent → read), pacing,
   group sender colors, voice-note bubbles, dramatic emphasis.
3. **Recorder** — `src/recorder/record.ts` opens the simulator in headless
   Chromium via Playwright with the viewport sized to the short, plays the
   script, and saves a `.webm` recording.

## Setup

```bash
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm install            # installs deps + chromium via postinstall
```

## Commands

```bash
# 1) Generate a script only (no video)
npm run generate -- --theme infidelity --language es

# 2) Render an existing script JSON to a video
npm run render -- --in output/<file>.json

# 3) Do both in one shot
npm run shoot -- --theme gossip --language en --speed 1

# 4) Preview a script in your browser (no recording)
npm run serve -- --in examples/sample-es-infidelity.json
# open http://localhost:5173/
```

Available themes: `love`, `infidelity`, `work_betrayal`, `gossip`,
`family_secret`, `friendship_breakup`.

You can steer the generator with `--prompt`:

```bash
npm run shoot -- --theme infidelity --language es \
  --prompt "Protagonista mujer de 25. La traición la descubre la mejor amiga."
```

## Convert WebM → MP4 (for upload)

Playwright records to WebM. Convert with ffmpeg:

```bash
ffmpeg -i output/short.webm -c:v libx264 -pix_fmt yuv420p \
  -movflags +faststart output/short.mp4
```

## Script JSON shape (summary)

```jsonc
{
  "meta": { "title": "...", "theme": "infidelity", "language": "es",
            "hook": "...", "twist": "...", "estimatedDurationSeconds": 55 },
  "chatName": "Diego ❤️",
  "isGroup": false,
  "participants": [
    { "id": "a", "name": "Sofi",  "isOwner": true,  "avatarInitial": "S" },
    { "id": "b", "name": "Diego", "isOwner": false, "color": "#7f5af0" }
  ],
  "messages": [
    { "from": "b", "kind": "text", "text": "amor ya casi salgo",
      "preDelayMs": 600, "typingMs": 1400, "readDelayMs": 600,
      "emphasis": "normal" }
  ]
}
```

See `examples/sample-es-infidelity.json` for a hand-tuned example you can
render without spending API calls.

## Roadmap

- Auto-upload to YouTube Shorts and Instagram Reels (next iteration).
- Optional background music + notification SFX.
- Voice-note audio synthesis (TTS).
- Thumbnail / caption generator from `meta.hook`.
