# WhatsApp Drama Shorts

Generate dramatic WhatsApp conversations with Claude and render them as
vertical short videos (1080×1920, with audio) ready for YouTube Shorts and
Instagram Reels.

```
[tema] ──► generator (Claude) ──► script.json ──► simulator (HTML/CSS) ──► recorder (Playwright + ffmpeg) ──► video.mp4
```

## Requirements

- **Node.js 20+**
- **ffmpeg** on `PATH` (used to build the audio track and mux video+audio)
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg`
  - Windows: download from [ffmpeg.org](https://ffmpeg.org/download.html) and add `bin` to PATH
- An **Anthropic API key** for script generation

## Setup

```bash
git clone <repo-url>
cd whatsapp-drama-shorts
npm install                 # installs deps; postinstall fetches Chromium for Playwright
cp .env.example .env        # then put your ANTHROPIC_API_KEY in it
```

> The Chromium download happens automatically through `playwright install`.
> If you're behind a firewall set `PLAYWRIGHT_BROWSERS_PATH` to a writable
> directory.

## One-shot pipeline

Generate a script and render it to MP4 in one command:

```bash
npm run shoot -- --theme infidelity --language es
```

Output lands in `output/<timestamp>-<slug>.mp4` along with the script JSON.

## Step-by-step

```bash
# 1. Generate a script (cheap; you can re-render the same script many times)
npm run generate -- --theme gossip --language es

# 2. Render an existing script to .mp4 (with audio) or .webm (no audio)
npm run render -- --in output/<file>.json
npm run render -- --in output/<file>.json --no-audio   # webm, faster

# 3. Preview in the browser without recording (handy while tuning the look)
npm run serve -- --in examples/sample-es-infidelity.json
# then open http://localhost:5173/
```

Available themes: `love`, `infidelity`, `work_betrayal`, `gossip`,
`family_secret`, `friendship_breakup`.

Steer the generator with `--prompt`:

```bash
npm run shoot -- --theme infidelity --language es \
  --prompt "Protagonista mujer de 25. Descubre la traición vía una historia de Instagram. Final: la mejor amiga estaba involucrada."
```

## Perfect-sync mode (Linux only): `--screen`

The default recorder uses Playwright's WebM recordVideo and synthesises
the audio track in Node, then muxes them together. That works but can
drift on some systems because the two streams come from different clocks.

The screen-capture recorder ditches that completely: it runs headed
Chromium under Xvfb, plays the audio **inside the browser** via Web
Audio API, and uses ffmpeg to capture both screen (`x11grab`) and audio
(`pulse`) from the SAME wall-clock at the same time. A/V sync is exact
by construction — there is no second timeline to align.

Extra requirements:

```bash
sudo apt-get install -y xvfb pulseaudio pulseaudio-utils ffmpeg
```

Usage — just add `--screen`:

```bash
npm run shoot -- --theme work_betrayal --language es --screen
npm run render -- --in output/<file>.json --screen
```

The recorder takes care of starting Xvfb and PulseAudio for you on the
first run.

## Debugging A/V sync (default recorder)

If you stick with the default recorder and audio drifts, set
`DRAMA_DEBUG=1`. It prints:

```
[debug] recordStartT=... playStartT=... anchor=... trim=...ms events=...
```

- `trim` is how many ms of the recorded WebM front are skipped to align
  with the page-side audio anchor.
- `events` is the number of audio events received from the page; expect
  ~2 per outgoing message (type-start, type-end) + 1 receive per incoming
  + 1 send per outgoing.

## Layout of the repo

```
src/
├── types/script.ts          # Zod schema for the conversation JSON
├── generator/
│   ├── index.ts             # Anthropic client (Sonnet 4.6 + prompt cache)
│   └── prompts.ts           # Drama system prompts (es/en)
├── simulator/
│   ├── index.html           # 1080x1920 WhatsApp-style UI
│   ├── styles.css
│   └── main.js              # Player; emits audio events via window.__audioNotify
├── recorder/
│   └── record.ts            # Playwright-driven recording + ffmpeg mux
├── audio/
│   └── synth.ts             # Build audio track from event timestamps, mux mp4
└── cli.ts                   # generate | render | shoot | serve
assets/sfx/
├── typing.mp3               # iPhone keyboard loop (skipped first 3 s, +40% tempo)
├── receive.mp3              # incoming message ding
└── send.mp3                 # outgoing pop
examples/
└── sample-es-infidelity.json # hand-tuned script for offline testing
```

## How sync works (and where it can break)

1. The player runs entirely in headless Chromium under Playwright. It
   captures `window.__playStartPerf = performance.now()` right after the
   avatars finish preloading, and also sends Node a wall-clock anchor at
   that exact instant.
2. Each visual change in the UI (caret appears in composer, last char
   typed, bubble appended to chat) calls `fire(kind)` which forwards
   `(performance.now() - __playStartPerf)` to Node.
3. Node ignores its own clock for these timestamps — it uses the page's
   own values, so CDP transport latency doesn't accumulate in the
   timeline.
4. After playback, ffmpeg synthesizes a single mono WAV from those event
   timestamps (`adelay` per event + `amix`), and muxes it with the WebM
   trimmed to start at the page-anchor wall-clock instant. The MP4 is
   re-encoded to constant 30 fps so players that don't handle Playwright's
   VFR WebM well don't drift.

If you still see drift, please run with `DRAMA_DEBUG=1` and share the
`[debug]` line along with the file — that's enough to narrow it down.

## Roadmap

- Background music + per-theme music library
- Realistic auto-generated avatars (currently pravatar.cc by name seed;
  falls back to coloured initials when offline)
- Auto-upload to YouTube Shorts and Instagram Reels (OAuth + API)
- Caption + hashtags from `meta.hook` and `meta.twist`
- Batch generation (10 dramas → schedule uploads)
