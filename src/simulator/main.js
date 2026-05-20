// Player that animates a Script in a WhatsApp-like UI.
// Runs in the browser. The orchestrator (Playwright) calls
// window.__playScript(script) and awaits it.

const SENDER_COLOR_CLASSES = ["color-1", "color-2", "color-3"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function svgUse(href, className) {
  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(NS, "svg");
  if (className) svg.setAttribute("class", className);
  const use = document.createElementNS(NS, "use");
  use.setAttributeNS(XLINK, "href", href);
  use.setAttribute("href", href);
  svg.appendChild(use);
  return svg;
}

function chatEl() {
  const node = document.getElementById("chat");
  if (!node) throw new Error("#chat missing");
  return node;
}

function scrollToBottom() {
  const c = chatEl();
  c.scrollTop = c.scrollHeight;
}

function pad2(n) {
  return n.toString().padStart(2, "0");
}

function formatTime(hh, mm, lang) {
  if (lang === "en") {
    const ampm = hh >= 12 ? "PM" : "AM";
    const h12 = hh % 12 || 12;
    return `${h12}:${pad2(mm)} ${ampm}`;
  }
  return `${pad2(hh)}:${pad2(mm)}`;
}

function precomputeTimes(script) {
  const [sh, sm] = (script.meta.startTime || "22:14").split(":").map(Number);
  const baseMs = sh * 3600000 + sm * 60000;
  let elapsed = 0;
  return script.messages.map((m) => {
    elapsed += (m.preDelayMs || 0) + (m.typingMs || 0);
    const total = baseMs + elapsed;
    const hh = Math.floor(total / 3600000) % 24;
    const mm = Math.floor((total % 3600000) / 60000);
    return { hh, mm };
  });
}

function setStatusBar(script) {
  const sbTime = document.getElementById("sb-time");
  const [sh, sm] = (script.meta.startTime || "22:14").split(":").map(Number);
  sbTime.textContent = formatTime(sh, sm, script.meta.language);
}

function setHeader(script) {
  const others = script.participants.filter((p) => !p.isOwner);

  const headerName = document.getElementById("header-name");
  const headerStatus = document.getElementById("header-status");
  const headerAvatar = document.getElementById("header-avatar");
  const datePill = document.getElementById("date-pill");

  headerName.textContent = script.isGroup
    ? script.chatName
    : others[0]?.name ?? script.chatName;

  if (script.isGroup) {
    headerStatus.textContent = script.participants.map((p) => p.name).join(", ");
  } else {
    headerStatus.textContent = script.meta.language === "es" ? "en línea" : "online";
  }

  const initialSource = script.isGroup
    ? script.chatName
    : others[0]?.name ?? "?";
  headerAvatar.textContent = (
    others[0]?.avatarInitial ?? initialSource.trim()[0] ?? "?"
  ).toUpperCase();
  if (others[0]?.color) headerAvatar.style.background = others[0].color;

  datePill.textContent = script.meta.language === "es" ? "Hoy" : "Today";
}

function colorClassForSender(script, fromId) {
  const incoming = script.participants.filter((p) => !p.isOwner).map((p) => p.id);
  const idx = incoming.indexOf(fromId);
  return SENDER_COLOR_CLASSES[Math.max(0, idx) % SENDER_COLOR_CLASSES.length];
}

function buildBubble(script, msg, isOwner, displayedTime, isContinued) {
  const row = el("div", `row ${isOwner ? "out" : "in"}${isContinued ? " continued" : ""}`);
  const bubble = el(
    "div",
    `bubble ${msg.emphasis || "normal"} ${colorClassForSender(script, msg.from)}`,
  );

  if (script.isGroup && !isOwner && !isContinued) {
    const senderName = el("div", "sender-name");
    const sender = script.participants.find((p) => p.id === msg.from);
    senderName.textContent = sender?.name ?? msg.from;
    bubble.appendChild(senderName);
  }

  if (msg.kind === "voice") {
    bubble.classList.add("voice");
    const play = el("div", "play");
    play.textContent = "▶";
    const wave = el("div", "wave");
    const duration = el("div", "duration");
    const secs = msg.voiceSeconds ?? 10;
    duration.textContent = `0:${secs.toString().padStart(2, "0")}`;
    bubble.append(play, wave, duration);
  } else {
    bubble.appendChild(document.createTextNode(msg.text));
  }

  const meta = el("div", "meta");
  const time = el("span");
  time.textContent = displayedTime;
  meta.appendChild(time);
  if (isOwner) {
    meta.appendChild(svgUse("#icon-tick", "tick-svg"));
  }
  bubble.appendChild(meta);
  row.appendChild(bubble);
  return { row, meta };
}

function buildTypingRow(script, fromId) {
  const row = el("div", "row in typing");
  const bubble = el("div", `bubble ${colorClassForSender(script, fromId)}`);
  for (let i = 0; i < 3; i++) bubble.appendChild(el("div", "typing-dot"));
  row.appendChild(bubble);
  return row;
}

async function playScript(script, opts = {}) {
  const speed = opts.speed ?? 1;
  const scale = (ms) => Math.max(0, Math.round(ms / speed));

  const chat = chatEl();
  chat.querySelectorAll(".row").forEach((n) => n.remove());

  setStatusBar(script);
  setHeader(script);

  const headerStatus = document.getElementById("header-status");
  const originalStatus = headerStatus.textContent;

  const times = precomputeTimes(script);

  if (opts.startDelayMs) await sleep(scale(opts.startDelayMs));

  let prevFrom = null;
  for (let i = 0; i < script.messages.length; i++) {
    const msg = script.messages[i];
    const sender = script.participants.find((p) => p.id === msg.from);
    const isOwner = sender?.isOwner ?? false;
    const isContinued = msg.from === prevFrom;

    if (msg.preDelayMs > 0) await sleep(scale(msg.preDelayMs));

    let typingRow = null;
    if (!isOwner && msg.typingMs > 0) {
      headerStatus.textContent =
        script.meta.language === "es" ? "escribiendo…" : "typing…";
      typingRow = buildTypingRow(script, msg.from);
      chat.appendChild(typingRow);
      scrollToBottom();
      await sleep(scale(msg.typingMs));
      headerStatus.textContent = originalStatus;
    } else if (isOwner && msg.typingMs > 0) {
      await sleep(scale(Math.min(msg.typingMs, 1200)));
    }

    if (typingRow) typingRow.remove();

    const t = times[i];
    const display = formatTime(t.hh, t.mm, script.meta.language);
    const { row, meta } = buildBubble(script, msg, isOwner, display, isContinued);
    chat.appendChild(row);
    scrollToBottom();

    if (isOwner) {
      const tick = meta.querySelector(".tick-svg");
      if (tick) {
        await sleep(scale(Math.min(msg.readDelayMs, 600)));
        if (msg.readDelayMs > 600) await sleep(scale(msg.readDelayMs - 600));
        tick.classList.add("read");
      }
    }
    prevFrom = msg.from;
  }

  await sleep(scale(opts.endHoldMs ?? 1800));
}

// Render a static script (no animation, no delays). Useful for snapshots.
async function renderStatic(script) {
  const chat = chatEl();
  chat.querySelectorAll(".row").forEach((n) => n.remove());
  document.body.classList.add("no-anim");
  setStatusBar(script);
  setHeader(script);
  const times = precomputeTimes(script);
  let prevFrom = null;
  script.messages.forEach((msg, i) => {
    const sender = script.participants.find((p) => p.id === msg.from);
    const isOwner = sender?.isOwner ?? false;
    const isContinued = msg.from === prevFrom;
    const t = times[i];
    const display = formatTime(t.hh, t.mm, script.meta.language);
    const { row, meta } = buildBubble(script, msg, isOwner, display, isContinued);
    if (isOwner) {
      const tick = meta.querySelector(".tick-svg");
      if (tick) tick.classList.add("read");
    }
    chat.appendChild(row);
    prevFrom = msg.from;
  });
  scrollToBottom();
}

window.__playReady = true;
window.__playScript = playScript;
window.__renderStatic = renderStatic;
