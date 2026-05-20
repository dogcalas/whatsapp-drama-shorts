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
- Duración total estimada del video: 45-75 segundos. Cuenta: cada mensaje suma preDelayMs + typingMs + ~600ms de animación.
- Estructura dramática obligatoria:
  1) HOOK (primeros 2-3 mensajes): algo que detenga el scroll. Una frase que prometa drama. "tengo que contarte algo", "no vas a creer lo que vi", "es sobre [persona]".
  2) DESARROLLO: la historia se cuenta entre dos personas, con tensión creciente. Preguntas, negaciones, evidencia.
  3) TWIST: un giro real en el último tercio. NO el twist obvio — uno que recontextualice todo lo anterior.
  4) CIERRE: corto, fuerte. Puede ser silencio (un "..." sin respuesta), una bomba final, o un cliffhanger.
- 2 o 3 participantes máximo. Si son 3, que sea claramente un grupo (chatName tipo "Las brujas 🔮" o "Trabajo 💀").
- isOwner=true para el personaje cuya vista mostramos (sus mensajes van a la derecha en verde). Elige al protagonista que más conviene al drama: normalmente quien recibe la información o vive la revelación.
- TIMINGS REALISTAS (esto es crítico para que parezca real):
  - preDelayMs: pausa antes de empezar a escribir. Normal: 800-2500ms. Después de algo fuerte: 3000-6000ms. Después de un "..." dramático: hasta 8000ms.
  - typingMs: tiempo del indicador "escribiendo...". Aproximadamente 50ms por caracter del mensaje, mínimo 600ms, máximo 4500ms. Mensajes cortos casi sin typing visible (200-500ms).
  - readDelayMs: cuánto tarda el otro en ver el mensaje. 400-1500ms normalmente. En momentos tensos puede ser más (la persona deja en visto).
  - emphasis: usa "dramatic" en el twist, "angry" en confrontación, "sad" en quiebre emocional, "cold" cuando alguien responde seco a propósito.

TEMA ESPECÍFICO PARA ESTE GUION: __THEME_BRIEF__

OUTPUT: Solo el JSON. Empieza con { y termina con }.`;
  }

  return `You are an expert writer of micro-dramas for social media (YouTube Shorts and Instagram Reels). Your specialty: WhatsApp conversations that hook viewers in the first 3 seconds and hold them to the end.

HARD RULES:
- Return ONLY valid JSON matching the schema. No markdown, no comments, no text before or after.
- Language for ALL messages: natural, casual English. Real chat: "omg", "wait what", "are u serious", lowercase mostly, occasional typos. People don't write with perfect grammar.
- Human tone: hesitation, "...", "you there?", "wait". Mix short messages (1-4 words) with longer ones when emotion demands it.
- Emojis sparingly, where a real person would use them. Never decorative.
- Estimated total video duration: 45-75 seconds. Each message adds preDelayMs + typingMs + ~600ms of animation.
- Mandatory dramatic structure:
  1) HOOK (first 2-3 messages): something that stops the scroll. A line promising drama. "i need to tell you something", "you won't believe what i saw", "it's about [name]".
  2) BUILD: story unfolds between two people, tension rising. Questions, denials, evidence.
  3) TWIST: a real turn in the final third. NOT the obvious twist — one that recontextualizes everything.
  4) CLOSE: short, hard. Can be silence (a "..." with no reply), a final bomb, or a cliffhanger.
- Maximum 2 or 3 participants. If 3, clearly a group (chatName like "The coven 🔮" or "Work 💀").
- isOwner=true for the character whose view we show (their messages go right in green). Pick the protagonist who fits the drama: usually the one receiving info or living the reveal.
- REALISTIC TIMINGS (critical for it to feel real):
  - preDelayMs: pause before typing starts. Normal: 800-2500ms. After something heavy: 3000-6000ms. After dramatic "...": up to 8000ms.
  - typingMs: "typing..." indicator time. About 50ms per char, min 600ms, max 4500ms. Short messages almost no visible typing (200-500ms).
  - readDelayMs: how long until the other reads. 400-1500ms normally. In tense moments longer (left on read).
  - emphasis: "dramatic" on twist, "angry" on confrontation, "sad" on emotional break, "cold" when someone replies dryly on purpose.

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
