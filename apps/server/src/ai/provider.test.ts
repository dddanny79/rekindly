import { describe, expect, it } from 'vitest';
import { openAiText, stripThinking } from './provider';

describe('OpenAI-compatible answers', () => {
  it('drops a reasoning model’s thinking, also when cut off', () => {
    expect(stripThinking('<think>hmm, the user wants OK</think>\n\nOK')).toBe('OK');
    expect(stripThinking('<think>still thinking about')).toBe('');
    expect(
      openAiText({ choices: [{ message: { content: [{ type: 'text', text: 'Hallo' }] } }] }),
    ).toBe('Hallo');
  });

  it('explains an empty answer instead of “no answer”', () => {
    expect(() =>
      openAiText({
        choices: [
          { finish_reason: 'length', message: { content: '', reasoning_content: 'Okay, so…' } },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        code: 'ai_failed',
        detail: expect.stringContaining('only thought'),
      }),
    );
    expect(() =>
      openAiText({ choices: [{ message: { content: '<think>lange Überlegung' } }] }),
    ).toThrow(expect.objectContaining({ detail: expect.stringContaining('only thought') }));
    expect(() => openAiText({ error: { message: 'model not loaded' } })).toThrow(
      expect.objectContaining({ detail: 'model not loaded' }),
    );
    expect(() => openAiText({ choices: [] })).toThrow(
      expect.objectContaining({ detail: expect.stringContaining('empty answer') }),
    );
  });
});
