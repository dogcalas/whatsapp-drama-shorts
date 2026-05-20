import Anthropic from "@anthropic-ai/sdk";
import {
  type Language,
  type Script,
  type Theme,
  validateScript,
} from "../types/script.ts";
import { buildUserPrompt } from "./prompts.ts";

export interface GenerateOptions {
  language: Language;
  theme: Theme;
  customPrompt?: string;
  model?: string;
  maxTokens?: number;
  apiKey?: string;
}

const DEFAULT_MODEL = process.env.DRAMA_MODEL ?? "claude-sonnet-4-6";

export async function generateScript(opts: GenerateOptions): Promise<Script> {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  const client = new Anthropic({ apiKey });

  const { system, user } = buildUserPrompt({
    language: opts.language,
    theme: opts.theme,
    customPrompt: opts.customPrompt,
  });

  const response = await client.messages.create({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: user }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const json = extractJson(text);
  return validateScript(json);
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Generator did not return JSON. Got:\n${raw.slice(0, 500)}`);
  }
  const slice = body.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from generator: ${(err as Error).message}\n---\n${slice.slice(0, 500)}`,
    );
  }
}
