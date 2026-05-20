import { z } from "zod";

export const ThemeSchema = z.enum([
  "love",
  "infidelity",
  "work_betrayal",
  "gossip",
  "family_secret",
  "friendship_breakup",
]);
export type Theme = z.infer<typeof ThemeSchema>;

export const LanguageSchema = z.enum(["es", "en"]);
export type Language = z.infer<typeof LanguageSchema>;

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  isOwner: z.boolean(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  avatarInitial: z.string().max(2).optional(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const MessageKindSchema = z.enum(["text", "voice", "image_placeholder"]);

export const MessageSchema = z.object({
  from: z.string().min(1),
  kind: MessageKindSchema.default("text"),
  text: z.string().min(1),
  preDelayMs: z.number().int().min(0).max(15000),
  typingMs: z.number().int().min(0).max(15000),
  readDelayMs: z.number().int().min(0).max(10000).default(800),
  emphasis: z
    .enum(["normal", "dramatic", "angry", "sad", "cold"])
    .default("normal"),
  voiceSeconds: z.number().int().min(1).max(120).optional(),
});
export type Message = z.infer<typeof MessageSchema>;

export const ScriptSchema = z.object({
  meta: z.object({
    title: z.string().min(1),
    theme: ThemeSchema,
    language: LanguageSchema,
    hook: z.string().min(1),
    twist: z.string().min(1),
    estimatedDurationSeconds: z.number().int().min(15).max(180),
    startTime: z
      .string()
      .regex(/^([01]?\d|2[0-3]):[0-5]\d$/)
      .default("22:14"),
  }),
  chatName: z.string().min(1),
  isGroup: z.boolean().default(false),
  participants: z.array(ParticipantSchema).min(2).max(4),
  messages: z.array(MessageSchema).min(6).max(60),
});
export type Script = z.infer<typeof ScriptSchema>;

export function validateScript(input: unknown): Script {
  const parsed = ScriptSchema.parse(input);
  const ownerCount = parsed.participants.filter((p) => p.isOwner).length;
  if (ownerCount !== 1) {
    throw new Error(
      `Exactly one participant must have isOwner=true (got ${ownerCount}).`,
    );
  }
  const ids = new Set(parsed.participants.map((p) => p.id));
  for (const m of parsed.messages) {
    if (!ids.has(m.from)) {
      throw new Error(`Message references unknown participant id: ${m.from}`);
    }
  }
  return parsed;
}
