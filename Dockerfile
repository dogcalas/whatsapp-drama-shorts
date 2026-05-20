# whatsapp-drama-shorts — Docker image for VPS deployment.
#
# Uses Microsoft's Playwright image so Chromium and all its system libs are
# pre-installed and version-matched, then layers in Xvfb + PulseAudio +
# ffmpeg required by the screen-capture recorder.
#
# Build:
#   docker build -t drama-shorts .
#
# Run (one-shot drama):
#   docker run --rm \
#     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
#     -v $(pwd)/output:/app/output \
#     drama-shorts \
#     shoot --theme infidelity --language es --screen
#
# Run (interactive):
#   docker run --rm -it \
#     -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
#     -v $(pwd)/output:/app/output \
#     --entrypoint bash drama-shorts
FROM mcr.microsoft.com/playwright:v1.56.1-jammy

ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    DISPLAY=:99 \
    XDG_RUNTIME_DIR=/run/user/0 \
    PULSE_RUNTIME_PATH=/run/user/0/pulse

# Xvfb + PulseAudio + ffmpeg + small utilities used by the recorder.
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        xvfb \
        pulseaudio \
        pulseaudio-utils \
        ffmpeg \
        dbus-x11 \
        ca-certificates \
        procps && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /run/user/0/pulse && \
    chmod 700 /run/user/0

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts && \
    # Skip the postinstall (browser install) since the base image already has it.
    true

COPY . .

# Output and tmp dirs (mountable as volumes).
RUN mkdir -p output assets/sfx

# Ensure the Playwright browsers path matches the base image.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Entry script bootstraps Xvfb + PulseAudio, then runs the CLI.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["shoot", "--theme", "infidelity", "--language", "es", "--screen"]
