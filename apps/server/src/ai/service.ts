/**
 * The AI features. Data reaches the provider only through `ai/context`, i.e. only
 * from spaces with “AI allowed”; anything else is refused before a request is made.
 */
import { foldText, type AiAskResponse, type AiFactSuggestion, type PersonRef } from '@app/shared';
import { getAccountRow } from '../auth/account';
import type { Db } from '../db/client';
import { getEntry } from '../entries/service';
import { DomainError } from '../lib/errors';
import { search } from '../search/service';
import { aiConfig } from './config';
import {
  aiSpaces,
  allowedPerson,
  NotAllowedError,
  personBriefing,
  type ContextOptions,
} from './context';
import { complete } from './provider';

export interface AiContext extends ContextOptions {
  key: Buffer;
}

const language = (db: Db): 'German' | 'English' =>
  getAccountRow(db)?.locale === 'de' ? 'German' : 'English';

/** The person if the AI may see it; else 403 without contacting the provider. */
function person(ctx: AiContext, id: string) {
  const allowed = aiSpaces(ctx.db);
  try {
    const p = allowedPerson(ctx.db, id, allowed);
    return { person: p, spaceName: allowed.get(p.spaceId) ?? '' };
  } catch (error) {
    if (error instanceof NotAllowedError) throw new DomainError(403, 'ai_not_allowed');
    throw error;
  }
}

/** A short briefing before a conversation, from facts and the recent timeline. */
export async function summarizePerson(ctx: AiContext, personId: string): Promise<string> {
  const { person: p, spaceName } = person(ctx, personId);
  const config = aiConfig(ctx.db, ctx.key);
  return complete(config, {
    system: `You prepare the user for a conversation with a person they know. From the notes below, write 3 to 6 short bullet points: who this is, what is going on in their life and work, open topics and follow-ups, and personal details worth remembering. Use only the notes; do not invent anything. No introduction. Write in ${language(ctx.db)}.`,
    user: personBriefing(ctx, p, spaceName),
    maxTokens: 600,
  });
}

/** Lasting facts about the people of a note; the user confirms each one. */
export async function suggestFacts(ctx: AiContext, entryId: string): Promise<AiFactSuggestion[]> {
  const entry = getEntry(ctx.db, entryId);
  const allowed = aiSpaces(ctx.db);
  const people = entry.people
    .filter((ref) => allowed.has(ref.spaceId))
    .map((ref) => allowedPerson(ctx.db, ref.id, allowed));
  if (!people.length) throw new DomainError(403, 'ai_not_allowed');
  const config = aiConfig(ctx.db, ctx.key);
  const known = people
    .map((p) => `${p.displayName}: ${p.facts.map((f) => f.text).join('; ') || '–'}`)
    .join('\n');
  const reply = await complete(config, {
    system: `You extract lasting facts about people from a note: family, partner, children, preferences, dislikes, health, job and career, places, important dates. Not one-off events or the topic of the conversation. Skip facts that are already known. Answer only with lines of the form "- Name: fact", short, in ${language(ctx.db)}. If there is nothing, answer "- none".`,
    user: `People: ${people.map((p) => p.displayName).join(', ')}\n\nAlready known:\n${known}\n\nNote (${entry.kind}, ${entry.occurredAt.slice(0, 10)}):\n${[entry.title, entry.bodyMd].filter(Boolean).join('\n')}`,
    maxTokens: 500,
  });
  // "Jana Berger", "Jana" or "Berger"; an unknown name is dropped.
  const byName = (name: string) => {
    const folded = foldText(name.trim());
    const words = new Set(folded.split(/\s+/));
    return (
      people.find((p) => foldText(p.displayName) === folded) ??
      people.find(
        (p) =>
          (p.firstName && words.has(foldText(p.firstName))) ||
          (p.lastName && words.has(foldText(p.lastName))),
      )
    );
  };
  const suggestions: AiFactSuggestion[] = [];
  for (const line of reply.split('\n')) {
    const match = /^\s*[-*•]\s*(?:([^:]{1,80}):\s*)?(.+)$/.exec(line);
    if (!match) continue;
    const text = match[2]!.trim().replace(/\.$/, '');
    if (!text || /^(none|keine?)$/i.test(text)) continue;
    const target = match[1] ? byName(match[1]) : people.length === 1 ? people[0] : undefined;
    if (!target) continue;
    if (target.facts.some((f) => foldText(f.text) === foldText(text))) continue;
    const ref: PersonRef = {
      id: target.id,
      displayName: target.displayName,
      initials: target.initials,
      spaceId: target.spaceId,
      photoUrl: target.photoUrl,
    };
    suggestions.push({ person: ref, text: text.slice(0, 500) });
  }
  return suggestions.slice(0, 10);
}

const STOPWORDS = new Set(
  'der die das den dem des ein eine einer einem einen und oder aber mit von bei für fur auf aus nach über uber unter wie was wer wen wem wo wann warum welche welcher welches ist sind war waren hat haben hatte ich du er sie es wir ihr mein meine mir mich weiß weiss kenne kennt gibt etwas alles noch schon nicht kein keine zum zur im am an in zu the a an and or but with from for on at of to in is are was were has have had who whom what which when where why how do does did know i my me you he she it we they any some about anyone someone people person'.split(
    ' ',
  ),
);

const NOTHING = {
  German: 'Dazu habe ich in deinen Notizen nichts gefunden.',
  English: 'I found nothing about that in your notes.',
};

const keywords = (text: string) =>
  text.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOPWORDS.has(w.toLowerCase()));

/**
 * A question in plain language: the AI first turns it into search words (only the
 * question is sent), the search index finds the people, and their notes go — as
 * numbered sources — into the answer.
 */
export async function ask(ctx: AiContext, question: string): Promise<AiAskResponse> {
  const allowed = aiSpaces(ctx.db);
  if (!allowed.size) throw new DomainError(403, 'ai_not_allowed');
  const config = aiConfig(ctx.db, ctx.key);
  const lang = language(ctx.db);
  const expanded = await complete(config, {
    system:
      'You help to search personal notes about people. For the question, list up to 10 search words: names, important nouns and their synonyms and word forms (singular, plural, related words), in the language of the question. One word per line, nothing else.',
    user: question,
    maxTokens: 120,
  });
  const words = [
    ...new Set([...keywords(question), ...keywords(expanded)].map((w) => w.toLowerCase())),
  ];
  const score = new Map<string, number>();
  for (const word of words.slice(0, 16)) {
    const { results } = search(ctx.db, { q: word, type: 'person', limit: 20 });
    results.forEach((r, i) => {
      if (r.type === 'person' && allowed.has(r.spaceId))
        score.set(r.id, (score.get(r.id) ?? 0) + 20 - i);
    });
  }
  const top = [...score]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
  if (!top.length) return { answer: NOTHING[lang], sources: [] };
  const sources = top.map((id, i) => {
    const p = allowedPerson(ctx.db, id, allowed);
    return {
      n: i + 1,
      person: p,
      text: personBriefing(ctx, p, allowed.get(p.spaceId) ?? '').slice(0, 3000),
    };
  });
  const answer = await complete(config, {
    system: `You answer questions about the people the user knows, using only the numbered notes below. Cite the notes you use as [1], [2]. If the notes do not answer the question, say so briefly. Be concise. Write in ${lang}.`,
    user: `${sources.map((s) => `[${s.n}]\n${s.text}`).join('\n\n')}\n\nQuestion: ${question}`,
    maxTokens: 700,
  });
  return {
    answer,
    sources: sources.map((s) => ({
      n: s.n,
      person: {
        id: s.person.id,
        displayName: s.person.displayName,
        initials: s.person.initials,
        spaceId: s.person.spaceId,
        photoUrl: s.person.photoUrl,
      },
    })),
  };
}
