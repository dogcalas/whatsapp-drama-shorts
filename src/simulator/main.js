// Player that animates a Script in a WhatsApp-like UI.
// Runs in the browser. The orchestrator (Playwright) calls
// window.__playScript(script) and awaits it.

const SENDER_COLOR_CLASSES = ["color-1", "color-2", "color-3"];
const DEFAULT_AVATAR_BG = ["#6a7d8a", "#7f5af0", "#e67e7e", "#3aa386", "#f5c451"];

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

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function avatarUrlFor(p) {
  if (p.avatarUrl) return p.avatarUrl;
  const seed = p.avatarSeed || p.name;
  const n = (hashSeed(seed) % 70) + 1; // pravatar has 1..70 IDs
  return `https://i.pravatar.cc/200?img=${n}`;
}

function setAvatar(target, p) {
  // Render an <img> in the avatar element. If it fails, fall back to initials.
  target.innerHTML = "";
  const initials = (
    p.avatarInitial ?? (p.name?.trim()[0] ?? "?")
  ).toUpperCase();
  const initialNode = document.createTextNode(initials);
  target.appendChild(initialNode);
  if (p.color) target.style.background = p.color;
  else target.style.background = DEFAULT_AVATAR_BG[hashSeed(p.name) % DEFAULT_AVATAR_BG.length];

  const img = document.createElement("img");
  img.referrerPolicy = "no-referrer";
  img.alt = p.name;
  img.onload = () => {
    // remove initial fallback once the image is in
    if (initialNode.parentNode === target) target.removeChild(initialNode);
  };
  img.onerror = () => {
    img.remove();
  };
  img.src = avatarUrlFor(p);
  target.appendChild(img);
}

async function preloadAvatars(script) {
  const promises = script.participants.map(
    (p) =>
      new Promise((resolve) => {
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = avatarUrlFor(p);
        setTimeout(resolve, 3000); // hard cap
      }),
  );
  await Promise.all(promises);
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

  if (script.isGroup) {
    // Group avatar: stack of first two others — for simplicity use the first.
    setAvatar(headerAvatar, others[0] ?? script.participants[0]);
  } else {
    setAvatar(headerAvatar, others[0] ?? script.participants[0]);
  }

  datePill.textContent = script.meta.language === "es" ? "Hoy" : "Today";
}

function colorClassForSender(script, fromId) {
  const incoming = script.participants.filter((p) => !p.isOwner).map((p) => p.id);
  const idx = incoming.indexOf(fromId);
  return SENDER_COLOR_CLASSES[Math.max(0, idx) % SENDER_COLOR_CLASSES.length];
}

function buildBubble(script, msg, isOwner, displayedTime, isContinued, extraClass) {
  const row = el(
    "div",
    `row ${isOwner ? "out" : "in"}${isContinued ? " continued" : ""}${extraClass ? " " + extraClass : ""}`,
  );

  // Group chat: render sender avatar to the left of incoming bubbles (only on
  // the first message of a run from that sender).
  if (script.isGroup && !isOwner) {
    const slot = el("div", "msg-avatar-slot");
    if (!isContinued) {
      const av = el("div", "msg-avatar");
      const sender = script.participants.find((p) => p.id === msg.from);
      if (sender) setAvatar(av, sender);
      slot.appendChild(av);
    }
    row.appendChild(slot);
  }

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

  bubble.appendChild(document.createTextNode(msg.text));

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
  if (script.isGroup) {
    const slot = el("div", "msg-avatar-slot");
    const av = el("div", "msg-avatar");
    const sender = script.participants.find((p) => p.id === fromId);
    if (sender) setAvatar(av, sender);
    slot.appendChild(av);
    row.appendChild(slot);
  }
  const bubble = el("div", `bubble ${colorClassForSender(script, fromId)}`);
  for (let i = 0; i < 3; i++) bubble.appendChild(el("div", "typing-dot"));
  row.appendChild(bubble);
  return row;
}

/* ---------------- Composer typing for owner messages ---------------- */

function composer() {
  return {
    box: document.getElementById("composer-input"),
    placeholder: document.getElementById("composer-placeholder"),
    typed: document.getElementById("composer-typed"),
    sendBtn: document.getElementById("send-btn"),
  };
}

function resetComposer() {
  const c = composer();
  c.box.classList.remove("typing");
  c.typed.textContent = "";
  c.sendBtn.classList.remove("has-text", "pressed");
}

// Fire-and-forget audio notification. The recorder hooks `__audioNotify`
// via Playwright's exposeFunction and timestamps each call when it arrives,
// so audio aligns with the *actual* moment the UI updated (resilient to any
// JS/DOM overhead that would otherwise drift our pre-computed timeline).
function fire(kind) {
  try {
    if (typeof window.__audioNotify === "function") window.__audioNotify(kind);
  } catch {
    // no-op
  }
}

async function typeIntoComposer(text, totalMs) {
  const c = composer();
  c.box.classList.add("typing");
  c.sendBtn.classList.add("has-text");
  c.typed.textContent = "";

  if (text.length === 0) return;
  fire("type-start");
  const perChar = Math.max(28, Math.min(140, totalMs / text.length));
  for (let i = 0; i < text.length; i++) {
    c.typed.textContent += text[i];
    const jitter = perChar * (0.7 + Math.random() * 0.6);
    await sleep(jitter);
  }
  fire("type-end");
}

async function sendFromComposer(script, msg, displayedTime, isContinued) {
  const c = composer();
  c.sendBtn.classList.add("pressed");
  await sleep(120);
  c.sendBtn.classList.remove("pressed");

  // Build the actual chat bubble with the fly-up animation.
  const chat = chatEl();
  const built = buildBubble(script, msg, true, displayedTime, isContinued, "flying");
  chat.appendChild(built.row);
  scrollToBottom();

  // Clear the composer mid-flight so it feels like the text "left".
  resetComposer();

  // Let the fly animation play out before resolving.
  await sleep(380);
  return built;
}

/* ---------------- Main playback loop ---------------- */

async function playScript(script, opts = {}) {
  const speed = opts.speed ?? 1;
  const scale = (ms) => Math.max(0, Math.round(ms / speed));

  const chat = chatEl();
  chat.querySelectorAll(".row").forEach((n) => n.remove());
  resetComposer();

  setStatusBar(script);
  setHeader(script);
  await preloadAvatars(script);

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
    const t = times[i];
    const display = formatTime(t.hh, t.mm, script.meta.language);

    if (msg.preDelayMs > 0) await sleep(scale(msg.preDelayMs));

    if (!isOwner) {
      // Show "escribiendo…" header + typing bubble for incoming.
      headerStatus.textContent =
        script.meta.language === "es" ? "escribiendo…" : "typing…";
      const typingRow = buildTypingRow(script, msg.from);
      chat.appendChild(typingRow);
      scrollToBottom();
      if (msg.typingMs > 0) await sleep(scale(msg.typingMs));
      typingRow.remove();
      headerStatus.textContent = originalStatus;

      const built = buildBubble(script, msg, false, display, isContinued, "receiving");
      chat.appendChild(built.row);
      fire("receive");
      scrollToBottom();
    } else {
      // Owner: type in composer, then send.
      await typeIntoComposer(msg.text, scale(Math.max(msg.typingMs, msg.text.length * 50)));
      // Tiny pause to "look at the text" before tapping send.
      await sleep(scale(200));
      const built = await sendFromComposer(script, msg, display, isContinued);
      const tick = built.meta.querySelector(".tick-svg");
      if (tick) {
        await sleep(scale(Math.min(msg.readDelayMs, 600)));
        if (msg.readDelayMs > 600) await sleep(scale(msg.readDelayMs - 600));
        tick.classList.add("read");
      }
    }

    prevFrom = msg.from;
  }

  await sleep(scale(opts.endHoldMs ?? 1500));
}

/* ---------------- Static render (for snapshots) ---------------- */

async function renderStatic(script) {
  const chat = chatEl();
  chat.querySelectorAll(".row").forEach((n) => n.remove());
  document.body.classList.add("no-anim");
  setStatusBar(script);
  setHeader(script);
  await preloadAvatars(script);
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
