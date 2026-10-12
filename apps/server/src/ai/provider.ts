/** One chat completion: OpenAI-compatible (LM Studio, Ollama, OpenAI, OpenRouter) or Anthropic. */
import { DomainError } from '../lib/errors';
import type { AiConfig } from './config';

export interface Prompt {
  system: string;
  user: string;
  maxTokens?: number;
}

export const fail = (detail: string) => new DomainError(502, 'ai_failed', detail.slice(0, 300));

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      // Local models can be slow.
      signal: AbortSignal.timeout(180_000),
    });
  } catch (error) {
    throw fail((error as Error).cause ? String((error as Error).cause) : (error as Error).message);
  }
  const text = await res.text();
  if (!res.ok) throw fail(`HTTP ${res.status} ${text.replace(/\s+/g, ' ')}`);
  try {
    return JSON.parse(text);
  } catch {
    throw fail('no JSON answer');
  }
}

export async function complete(config: AiConfig, prompt: Prompt): Promise<string> {
  const maxTokens = prompt.maxTokens ?? 1000;
  if (config.provider === 'anthropic') {
    const data = (await post(
      `${config.baseUrl}/messages`,
      { 'x-api-key': config.apiKey ?? '', 'anthropic-version': '2023-06-01' },
      {
        model: config.model,
        max_tokens: maxTokens,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      },
    )) as { content?: { type: string; text?: string }[] };
    const text = data.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    if (!text) throw fail('empty answer');
    return text.trim();
  }
  // No max_tokens: reasoning models (Qwen3, DeepSeek-R1 … in LM Studio, Ollama) spend
  // tokens on thinking first; a small limit would leave no answer.
  const data = (await post(
    `${config.baseUrl}/chat/completions`,
    config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {},
    {
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
    },
  )) as OpenAiResponse;
  return openAiText(data);
}

interface OpenAiResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | { type?: string; text?: string }[] | null;
      reasoning_content?: string;
    };
  }[];
  error?: { message?: string } | string;
}

/** The answer of a chat completion, without a model's thinking. */
export function openAiText(data: OpenAiResponse): string {
  const choice = data.choices?.[0];
  const raw = choice?.message?.content;
  const content = Array.isArray(raw) ? raw.map((part) => part.text ?? '').join('') : (raw ?? '');
  const text = stripThinking(content);
  if (text) return text;
  if (data.error) {
    throw fail(typeof data.error === 'string' ? data.error : (data.error.message ?? 'error'));
  }
  if (
    choice?.finish_reason === 'length' ||
    choice?.message?.reasoning_content ||
    content.includes('<think>')
  ) {
    throw fail(
      'the model only thought and gave no answer (token or context limit reached) — raise the context length in LM Studio/Ollama or choose a model without reasoning',
    );
  }
  throw fail(`empty answer: ${JSON.stringify(data).slice(0, 200)}`);
}

/** `<think>…</think>` (also unclosed, when cut off) is not part of the answer. */
export const stripThinking = (text: string) =>
  text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim();
