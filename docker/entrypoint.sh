#!/usr/bin/env bash
# Bootstrap Xvfb + PulseAudio inside the container, then exec the CLI.
set -euo pipefail

DISPLAY_NUM="${DISPLAY:-:99}"

# --- Xvfb ---
if ! pgrep -x Xvfb >/dev/null 2>&1; then
  rm -f "/tmp/.X${DISPLAY_NUM#:}-lock"
  Xvfb "$DISPLAY_NUM" -screen 0 1080x2000x24 -ac >/tmp/xvfb.log 2>&1 &
  for _ in $(seq 1 30); do
    pgrep -x Xvfb >/dev/null && break
    sleep 0.1
  done
fi

# --- PulseAudio (user mode) ---
mkdir -p "$XDG_RUNTIME_DIR" && chmod 700 "$XDG_RUNTIME_DIR"
if ! pgrep -x pulseaudio >/dev/null 2>&1; then
  pulseaudio --start --exit-idle-time=-1 --log-target=stderr
  for _ in $(seq 1 30); do
    pactl info >/dev/null 2>&1 && break
    sleep 0.1
  done
fi

# Hand off to the CLI. `--screen` is the default in CMD; users override via
# the docker run arguments.
exec npx tsx src/cli.ts "$@"
