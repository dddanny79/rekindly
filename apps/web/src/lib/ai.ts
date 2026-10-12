import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  aiAskResponseSchema,
  aiFactSuggestionsResponseSchema,
  aiSettingsSchema,
  aiSummaryResponseSchema,
  aiTestResponseSchema,
  type AiSettingsInput,
  type Entry,
} from '@app/shared';
import { api } from '@/lib/api';
import { spacesQuery } from '@/lib/data';

const AI = '/api/v1/ai';

export const aiSettingsQuery = queryOptions({
  queryKey: ['ai'],
  queryFn: () => api(AI, aiSettingsSchema),
});

export const aiApi = {
  save: (input: AiSettingsInput) => api(AI, aiSettingsSchema, { method: 'PUT', json: input }),
  test: () => api(`${AI}/test`, aiTestResponseSchema, { method: 'POST' }),
  summary: (personId: string) =>
    api(`${AI}/people/${personId}/summary`, aiSummaryResponseSchema, { method: 'POST' }),
  facts: (entryId: string) =>
    api(`${AI}/entries/${entryId}/facts`, aiFactSuggestionsResponseSchema, { method: 'POST' }),
  ask: (question: string) => api(`${AI}/ask`, aiAskResponseSchema, { json: { question } }),
};

/** Whether AI is on, where data goes, and which spaces it may see. */
export function useAi() {
  const { data: settings } = useQuery(aiSettingsQuery);
  const { data: spaces = [] } = useQuery(spacesQuery);
  const enabled = !!settings && settings.provider !== 'off';
  const allowedSpaces = spaces.filter((s) => s.aiAllowed);
  return {
    settings,
    enabled,
    cloud: !!settings?.cloud,
    target: settings?.target ?? null,
    anySpace: allowedSpaces.length > 0,
    allowed: (spaceId: string) => enabled && allowedSpaces.some((s) => s.id === spaceId),
  };
}

/** “Suggest facts” for an entry: AI is on and one of its people may be seen. */
export function useCanSuggestFacts(entry: Entry) {
  const ai = useAi();
  return (
    entry.source === 'user' &&
    entry.kind !== 'event' &&
    entry.people.some((p) => ai.allowed(p.spaceId))
  );
}
