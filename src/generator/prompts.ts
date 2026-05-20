import type { Language, Theme } from "../types/script.ts";

const THEME_BRIEFS_ES: Record<Theme, string> = {
  love:
    "Una historia de amor con un giro inesperado: confesión tardía, reencuentro, malentendido que casi rompe la relación.",
  infidelity:
    "Una infidelidad descubierta por accidente (mensaje equivocado, foto, amiga que vio algo). Tensión emocional alta.",
  work_betrayal:
    "Traición en el trabajo: un compañero robó una idea, filtró un secreto, o saboteó un ascenso.",
  gossip:
    "Chisme entre amigas/os que escala: un secreto se filtra y alguien queda expuesto frente al grupo.",
  family_secret:
    "Un secreto familiar que sale a la luz: paternidad oculta, herencia, hermano desconocido.",
  friendship_breakup:
    "Una amistad de años se rompe por una traición pequeña que destapa algo más grande.",
};

const THEME_BRIEFS_EN: Record<Theme, string> = {
  love:
    "A love story with an unexpected twist: late confession, reunion, misunderstanding that almost broke them.",
  infidelity:
    "An affair uncovered by accident (wrong message, photo, friend who saw something). High emotional tension.",
  work_betrayal:
    "Workplace betrayal: a coworker stole an idea, leaked a secret, or sabotaged a promotion.",
  gossip:
    "Gossip among friends escalates: a secret leaks and someone is exposed in front of the group.",
  family_secret:
    "A family secret comes out: hidden paternity, inheritance, unknown sibling.",
  friendship_breakup:
    "A long friendship breaks over a small betrayal that uncovers something bigger.",
};

export function buildSystemPrompt(language: Language): string {
  if (language === "es") {
    return `Eres un guionista experto en micro-dramas para redes sociales (YouTube Shorts e Instagram Reels). Tu especialidad: conversaciones de WhatsApp que enganchan en los primeros 3 segundos y mantienen al espectador hasta el final.

REGLAS DURAS:
- Devuelve EXCLUSIVAMENTE un JSON válido que cumpla el schema indicado. Nada de markdown, nada de comentarios, nada de texto antes o después.
- Idioma de TODOS los mensajes: español neutro latino, coloquial, natural. Usa muletillas reales ("osea", "jajaja", "no manches", "en serio", "bro", "amiga", "qué onda", "porfa", "xfa"). Errores de tipeo ocasionales (sin abusar). Minúsculas en general — la gente real no escribe con mayúsculas perfectas.
- Tono humano: dudas, "...", "espera", "ya vi", "estás ahí?". Mezcla mensajes cortos (1-4 palabras) con alguno más largo cuando la emoción lo pide.
- Emojis con moderación, donde una persona real los pondría. Nunca decorativos.
- SOLO MENSAJES DE TEXTO. NO uses kind="voice" ni kind="image_placeholder". Cada mensaje debe ser kind="text". Si una información llegaría normalmente por audio, haz que un personaje la parafrasee o la cite textualmente en un mensaje de texto.
- Duración total estimada del video: 75-110 segundos. Apunta a 90s. Cuenta: cada mensaje suma preDelayMs + typingMs + ~600ms de animación.
- Mínimo 22 mensajes, ideal 26-32. Para llegar a esa densidad: mensajes cortos encadenados (la gente real manda 3-4 mensajes seguidos en lugar de un párrafo), reacciones intermedias ("qué", "espera", "no"), confirmaciones y preguntas.
- Estructura dramática obligatoria (4 actos, NO 3):
  1) HOOK (mensajes 1-3): algo que detenga el scroll. Una frase que prometa drama. "tengo que contarte algo", "no vas a creer lo que vi", "es sobre [persona]". Tiene que ser específico, no genérico.
  2) DESARROLLO (mensajes 4-10): la historia se revela poco a poco. Detalles concretos (hora, lugar, descripción física), evidencia. La víctima hace preguntas y empieza a dudar.
  3) PRIMER TWIST (mensajes 11-16): un primer giro que cambia quién es el villano o cuál es el verdadero secreto. NO el twist obvio. La víctima procesa, hay confrontación.
  4) CONTRA-TWIST O ESCALADA FINAL (mensajes 17-24): un segundo golpe que recontextualiza otra vez. Puede ser: la víctima ya sabía, había una tercera persona involucrada, la "víctima" es en realidad el culpable, las consecuencias acaban de empezar.
  5) CIERRE (últimos 2-3 mensajes): corto, devastador. Puede ser silencio ("..."), una bomba final ("nos vemos en el juzgado"), o un cliffhanger que deje al espectador queriendo más.
- VARIEDAD DE FINALES: NO siempre el final cómico tipo "jaja era una sorpresa". Alterna: tragedia real (alguien queda destrozado), venganza fría (la víctima se vuelve atacante), confesión inesperada de un secreto peor, consecuencia legal/familiar grave, o cliffhanger abierto.
- 2 o 3 participantes. Cuando haya 3, alguno de ellos puede entrar a mitad de la conversación (drama de "te metí al grupo" o reenvío). Si son 3, que sea claramente un grupo (chatName tipo "Las brujas 🔮" o "Trabajo 💀").
- isOwner=true para el personaje cuya vista mostramos (sus mensajes van a la derecha en verde). Elige al protagonista que más conviene al drama: normalmente quien recibe la información o vive la revelación.
- TIMINGS REALISTAS pero TENSOS — NO uses pausas largas:
  - preDelayMs: pausa antes de empezar a escribir. Normal: 500-1200ms. Después de algo fuerte: 1500-2500ms. NUNCA pongas más de 3500ms, y eso solo DOS veces como máximo (los dos twists).
  - typingMs: tiempo del indicador "escribiendo...". Aproximadamente 40ms por caracter del mensaje, mínimo 400ms, máximo 3500ms. Mensajes cortos casi sin typing visible (200-400ms).
  - readDelayMs: 300-1000ms normalmente. Máximo 1500ms.
  - Total preDelay+typing entre 70-100 segundos. Apunta a 80s.
  - emphasis: "dramatic" en los twists, "angry" en confrontación, "sad" en quiebre emocional, "cold" cuando alguien responde seco a propósito.

TEMA ESPECÍFICO PARA ESTE GUION: __THEME_BRIEF__

OUTPUT: Solo el JSON. Empieza con { y termina con }.`;
  }

  return `You are an expert writer of micro-dramas for social media (YouTube Shorts and Instagram Reels). Your specialty: WhatsApp conversations that hook viewers in the first 3 seconds and hold them to the end.

HARD RULES:
- Return ONLY valid JSON matching the schema. No markdown, no comments, no text before or after.
- Language for ALL messages: natural, casual English. Real chat: "omg", "wait what", "are u serious", lowercase mostly, occasional typos. People don't write with perfect grammar.
- Human tone: hesitation, "...", "you there?", "wait". Mix short messages (1-4 words) with longer ones when emotion demands it.
- Emojis sparingly, where a real person would use them. Never decorative.
- TEXT MESSAGES ONLY. Do NOT use kind="voice" or kind="image_placeholder". Every message must be kind="text". If a piece of information would normally be in an audio, have a character paraphrase or quote it verbatim in a text message.
- Estimated total video duration: 75-110 seconds. Aim for 90s.
- Minimum 22 messages, ideally 26-32. Achieve that density via short messages chained back-to-back (real people send 3-4 short messages in a row instead of one paragraph) and reactions ("what", "wait", "no").
- Mandatory four-act structure (NOT three):
  1) HOOK (msgs 1-3): something that stops the scroll. Specific, not generic. "i need to tell you something", "you won't believe what i saw at...".
  2) BUILD (msgs 4-10): the story reveals slowly. Concrete details (time, place, physical description), evidence. The victim asks questions and starts doubting.
  3) FIRST TWIST (msgs 11-16): a turn that flips who's the villain or what the real secret is. Not the obvious twist. The victim processes; there's confrontation.
  4) COUNTER-TWIST OR FINAL ESCALATION (msgs 17-24): a second blow that recontextualizes again. The victim knew all along, there was a third party, the "victim" is actually guilty, the legal/family consequences just started.
  5) CLOSE (last 2-3): short, devastating. Silence ("..."), a final bomb, or open cliffhanger.
- ENDING VARIETY: do NOT always end with the comic "haha it was a surprise" beat. Rotate among: real tragedy (someone destroyed), cold revenge (victim becomes attacker), unexpected confession of a worse secret, grave legal/family consequence, open cliffhanger.
- 2 or 3 participants. With 3, someone can join mid-conversation (forwarded chat, added to group). If 3, clearly a group (chatName like "The coven 🔮" or "Work 💀").
- isOwner=true for the character whose view we show (their messages go right in green). Pick the protagonist who fits the drama: usually the one receiving info or living the reveal.
- REALISTIC but TENSE timings — NO long pauses:
  - preDelayMs: pause before typing starts. Normal: 500-1200ms. After something heavy: 1500-2500ms. NEVER more than 3500ms; use that at most TWICE (the two twists).
  - typingMs: "typing..." indicator time. About 40ms per char, min 400ms, max 3500ms. Short messages almost no visible typing (200-400ms).
  - readDelayMs: 300-1000ms normally. Max 1500ms.
  - Total preDelay+typing should be 70-100 seconds. Aim for 80s.
  - emphasis: "dramatic" on twists, "angry" on confrontation, "sad" on emotional break, "cold" when someone replies dryly on purpose.

SPECIFIC THEME FOR THIS SCRIPT: __THEME_BRIEF__

OUTPUT: Just the JSON. Start with { and end with }.`;
}

export function buildUserPrompt(args: {
  language: Language;
  theme: Theme;
  customPrompt?: string;
}): { system: string; user: string } {
  const briefs = args.language === "es" ? THEME_BRIEFS_ES : THEME_BRIEFS_EN;
  const themeBrief = briefs[args.theme];
  const system = buildSystemPrompt(args.language).replace(
    "__THEME_BRIEF__",
    themeBrief,
  );

  const schemaHint = `JSON SCHEMA (exact shape):
{
  "meta": {
    "title": string,
    "theme": "${args.theme}",
    "language": "${args.language}",
    "hook": string,           // 1-line teaser for thumbnail/caption
    "twist": string,          // 1-line description of the surprise
    "estimatedDurationSeconds": number   // 15-180
  },
  "chatName": string,
  "isGroup": boolean,
  "participants": [
    { "id": "a", "name": string, "isOwner": true,  "color": "#RRGGBB"?, "avatarInitial": string? },
    { "id": "b", "name": string, "isOwner": false, "color": "#RRGGBB"?, "avatarInitial": string? }
    // optional third: { "id": "c", ... }
  ],
  "messages": [
    {
      "from": "a"|"b"|"c",
      "kind": "text" | "voice" | "image_placeholder",
      "text": string,
      "preDelayMs": number,    // 0-15000
      "typingMs": number,      // 0-15000
      "readDelayMs": number,   // 0-10000
      "emphasis": "normal"|"dramatic"|"angry"|"sad"|"cold",
      "voiceSeconds": number?  // only if kind="voice"
    }
    // 8 to 30 messages total
  ]
}`;

  const extra = args.customPrompt
    ? `\n\nADDITIONAL DIRECTION FROM USER:\n${args.customPrompt}`
    : "";

  const user =
    args.language === "es"
      ? `Genera UN micro-drama original ahora.\n\n${schemaHint}${extra}\n\nDevuelve únicamente el JSON.`
      : `Generate ONE original micro-drama now.\n\n${schemaHint}${extra}\n\nReturn only the JSON.`;

  return { system, user };
}
