import { z } from 'zod';
import { personRefSchema } from './refs';
import { idSchema } from './common';

export const AI_PROVIDERS = ['off', 'openai', 'anthropic'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** AI settings as shown in the app (the API key is never returned). */
export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  /** OpenAI-compatible: e.g. http://192.168.1.20:1234/v1 (LM Studio), http://localhost:11434/v1 (Ollama). */
  baseUrl: z.string().nullable(),
  model: z.string().nullable(),
  hasApiKey: z.boolean(),
  /** Data leaves the own network (Anthropic, or a non-local address). */
  cloud: z.boolean(),
  /** Where requests go, e.g. "Anthropic" or "192.168.1.20". */
  target: z.string().nullable(),
});
export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const aiSettingsInputSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z.string().trim().max(500).optional(),
  model: z.string().trim().max(200).optional(),
  /** Empty keeps the stored key. */
  apiKey: z.string().trim().max(500).optional(),
  clearApiKey: z.boolean().optional(),
});
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>;

export const aiTestResponseSchema = z.object({ reply: z.string() });

export const aiSummaryResponseSchema = z.object({ text: z.string() });

export const aiFactSuggestionsResponseSchema = z.object({
  suggestions: z.array(z.object({ person: personRefSchema, text: z.string() })),
});
export type AiFactSuggestion = z.infer<
  typeof aiFactSuggestionsResponseSchema
>['suggestions'][number];

export const aiAskRequestSchema = z.object({ question: z.string().trim().min(3).max(500) });

export const aiAskResponseSchema = z.object({
  answer: z.string(),
  /** Numbered sources the answer can cite as [1], [2], …. */
  sources: z.array(z.object({ n: z.number().int(), person: personRefSchema })),
});
export type AiAskResponse = z.infer<typeof aiAskResponseSchema>;

export const aiEntryParamsSchema = z.object({ id: idSchema });
