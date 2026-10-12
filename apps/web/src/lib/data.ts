import { queryOptions, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import {
  type EntriesQuery,
  entryListResponseSchema,
  entrySchema,
  factSchema,
  reminderSchema,
  fieldDefinitionListResponseSchema,
  type FieldDefinition,
  organizationListResponseSchema,
  organizationSchema,
  type Organization,
  type PeopleQuery,
  personListResponseSchema,
  personSchema,
  type Person,
  relationshipTypeListResponseSchema,
  type SearchQuery,
  searchResponseSchema,
  spaceListResponseSchema,
  tagListResponseSchema,
  type TodayQuery,
  todayResponseSchema,
  type TrashKind,
  emptyTrashResponseSchema,
  trashListResponseSchema,
  appPasswordListResponseSchema,
  createAppPasswordResponseSchema,
  calendarFeedListResponseSchema,
  createCalendarFeedResponseSchema,
  type BackupConfigInput,
  backupFileListResponseSchema,
  backupSettingsSchema,
  backupStatusSchema,
  contactImportListSchema,
  type ContactImportOptions,
  contactImportPreviewSchema,
  contactImportSchema,
  type CsvMapping,
} from '@app/shared';
import { api, ApiError } from '@/lib/api';

const V1 = '/api/v1';

function queryString(params: Record<string, string | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

// Queries ---------------------------------------------------------------------------

export const spacesQuery = queryOptions({
  queryKey: ['spaces'],
  queryFn: () => api(`${V1}/spaces`, spaceListResponseSchema).then((r) => r.spaces),
});

export const peopleQuery = (params: PeopleQuery) =>
  queryOptions({
    queryKey: ['people', 'list', params],
    queryFn: () =>
      api(
        `${V1}/people${queryString(params as Record<string, string>)}`,
        personListResponseSchema,
      ).then((r) => r.people),
  });

export const personQuery = (id: string) =>
  queryOptions({
    queryKey: ['people', 'detail', id],
    queryFn: () => api(`${V1}/people/${id}`, personSchema),
  });

export const organizationsQuery = (params: { spaceId?: string; q?: string } = {}) =>
  queryOptions({
    queryKey: ['organizations', 'list', params],
    queryFn: () =>
      api(`${V1}/organizations${queryString(params)}`, organizationListResponseSchema).then(
        (r) => r.organizations,
      ),
  });

export const organizationQuery = (id: string) =>
  queryOptions({
    queryKey: ['organizations', 'detail', id],
    queryFn: () => api(`${V1}/organizations/${id}`, organizationSchema),
  });

export const tagsQuery = queryOptions({
  queryKey: ['tags'],
  queryFn: () => api(`${V1}/tags`, tagListResponseSchema).then((r) => r.tags),
});

export const relationshipTypesQuery = queryOptions({
  queryKey: ['relationship-types'],
  queryFn: () =>
    api(`${V1}/relationship-types`, relationshipTypeListResponseSchema).then(
      (r) => r.relationshipTypes,
    ),
});

export const fieldDefinitionsQuery = (target?: FieldDefinition['target']) =>
  queryOptions({
    queryKey: ['field-definitions', target ?? 'all'],
    queryFn: () =>
      api(
        `${V1}/field-definitions${queryString({ target })}`,
        fieldDefinitionListResponseSchema,
      ).then((r) => r.fieldDefinitions),
  });

// Mutations ---------------------------------------------------------------------------

/**
 * Everything is small and local, so after a write we simply refetch the affected
 * lists. Detail responses are put straight into the cache.
 */
const DATA_KEYS: QueryKey[] = [
  ['people'],
  ['organizations'],
  ['spaces'],
  ['tags'],
  ['search'],
  ['today'],
  ['trash'],
];

export function useWrite<TInput, TResult>(
  fn: (input: TInput) => Promise<TResult>,
  options: { invalidate?: QueryKey[]; onSuccess?: (result: TResult) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      if (result && typeof result === 'object' && 'contactPoints' in result) {
        const person = result as unknown as Person;
        queryClient.setQueryData(personQuery(person.id).queryKey, person);
      }
      if (result && typeof result === 'object' && 'currentMembers' in result) {
        const org = result as unknown as Organization;
        queryClient.setQueryData(organizationQuery(org.id).queryKey, org);
      }
      options.onSuccess?.(result);
      await Promise.all(
        (options.invalidate ?? DATA_KEYS).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

const ok = z.unknown();

export const peopleApi = {
  create: (input: {
    spaceId: string;
    firstName: string;
    lastName: string;
    organizationId?: string;
    role?: string | null;
  }) => api(`${V1}/people`, personSchema, { json: input }),
  update: (id: string, patch: Record<string, unknown>) =>
    api(`${V1}/people/${id}`, personSchema, { method: 'PATCH', json: patch }),
  remove: (id: string) => api(`${V1}/people/${id}`, null, { method: 'DELETE' }),
  uploadPhoto: async (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch(`${V1}/people/${id}/photo`, {
      method: 'PUT',
      body,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const error = (await res.json().catch(() => ({}))) as { error?: string };
      throw new ApiError(res.status, error.error ?? 'unknown');
    }
    return personSchema.parse(await res.json());
  },
  removePhoto: (id: string) => api(`${V1}/people/${id}/photo`, personSchema, { method: 'DELETE' }),
  /** Sub-resources: contact-points, addresses, affiliations, relationships. */
  addItem: (id: string, kind: string, input: unknown) =>
    api(`${V1}/people/${id}/${kind}`, ok, { json: input }),
  updateItem: (id: string, kind: string, itemId: string, input: unknown) =>
    api(`${V1}/people/${id}/${kind}/${itemId}`, ok, { method: 'PATCH', json: input }),
  removeItem: (id: string, kind: string, itemId: string) =>
    api(`${V1}/people/${id}/${kind}/${itemId}`, null, { method: 'DELETE' }),
  addTag: (id: string, name: string) => api(`${V1}/people/${id}/tags`, ok, { json: { name } }),
  removeTag: (id: string, tagId: string) =>
    api(`${V1}/people/${id}/tags/${tagId}`, null, { method: 'DELETE' }),
  setField: (id: string, definitionId: string, value: string) =>
    api(`${V1}/people/${id}/fields/${definitionId}`, null, { method: 'PUT', json: { value } }),
};

export const organizationsApi = {
  create: (input: {
    spaceId: string;
    name: string;
    kind?: string | null;
    parentId?: string | null;
  }) => api(`${V1}/organizations`, organizationSchema, { json: input }),
  update: (id: string, patch: Record<string, unknown>) =>
    api(`${V1}/organizations/${id}`, organizationSchema, { method: 'PATCH', json: patch }),
  remove: (id: string) => api(`${V1}/organizations/${id}`, null, { method: 'DELETE' }),
  addAddress: (id: string, input: unknown) =>
    api(`${V1}/organizations/${id}/addresses`, ok, { json: input }),
  updateAddress: (id: string, itemId: string, input: unknown) =>
    api(`${V1}/organizations/${id}/addresses/${itemId}`, ok, { method: 'PATCH', json: input }),
  removeAddress: (id: string, itemId: string) =>
    api(`${V1}/organizations/${id}/addresses/${itemId}`, null, { method: 'DELETE' }),
  setField: (id: string, definitionId: string, value: string) =>
    api(`${V1}/organizations/${id}/fields/${definitionId}`, null, {
      method: 'PUT',
      json: { value },
    }),
};

/** Settings lists: spaces, tags, relationship-types, field-definitions. */
export const catalogApi = {
  create: (resource: string, input: unknown) => api(`${V1}/${resource}`, ok, { json: input }),
  update: (resource: string, id: string, input: unknown) =>
    api(`${V1}/${resource}/${id}`, ok, { method: 'PATCH', json: input }),
  remove: (resource: string, id: string) =>
    api(`${V1}/${resource}/${id}`, null, { method: 'DELETE' }),
};

// Timeline ---------------------------------------------------------------------------

export const entriesQuery = (params: Omit<EntriesQuery, 'kinds'>) =>
  queryOptions({
    queryKey: ['entries', params],
    queryFn: () =>
      api(
        `${V1}/entries${queryString(params as Record<string, string>)}`,
        entryListResponseSchema,
      ).then((r) => r.entries),
  });

/** Writes that affect timelines, briefings and lists. */
export const TIMELINE_KEYS: QueryKey[] = [
  ['entries'],
  ['people'],
  ['organizations'],
  ['reminders'],
  ['search'],
  ['today'],
  ['trash'],
];

export const entriesApi = {
  create: (input: Record<string, unknown>) => api(`${V1}/entries`, entrySchema, { json: input }),
  update: (id: string, patch: Record<string, unknown>) =>
    api(`${V1}/entries/${id}`, entrySchema, { method: 'PATCH', json: patch }),
  remove: (id: string) => api(`${V1}/entries/${id}`, null, { method: 'DELETE' }),
};

export const remindersApi = {
  create: (personId: string, input: { title: string; dueOn: string }) =>
    api(`${V1}/people/${personId}/reminders`, reminderSchema, { json: input }),
  update: (id: string, patch: { title?: string; dueOn?: string; done?: boolean }) =>
    api(`${V1}/reminders/${id}`, reminderSchema, { method: 'PATCH', json: patch }),
  remove: (id: string) => api(`${V1}/reminders/${id}`, null, { method: 'DELETE' }),
};

export const factsApi = {
  create: (personId: string, input: { text: string; pinned?: boolean }) =>
    api(`${V1}/people/${personId}/facts`, factSchema, { json: input }),
  update: (personId: string, id: string, patch: { text?: string; pinned?: boolean }) =>
    api(`${V1}/people/${personId}/facts/${id}`, factSchema, { method: 'PATCH', json: patch }),
  remove: (personId: string, id: string) =>
    api(`${V1}/people/${personId}/facts/${id}`, null, { method: 'DELETE' }),
  reorder: (personId: string, ids: string[]) =>
    api(`${V1}/people/${personId}/facts/order`, z.unknown(), { method: 'PUT', json: { ids } }),
};

// Search, Today, Trash ---------------------------------------------------------------

export const searchQuery = (params: SearchQuery) =>
  queryOptions({
    queryKey: ['search', params],
    queryFn: ({ signal }) =>
      api(`${V1}/search${queryString(params as Record<string, string>)}`, searchResponseSchema, {
        signal,
      }),
  });

export const todayQuery = (params: TodayQuery) =>
  queryOptions({
    queryKey: ['today', params],
    queryFn: () =>
      api(`${V1}/today${queryString(params as Record<string, string>)}`, todayResponseSchema),
  });

export const trashQuery = queryOptions({
  queryKey: ['trash'],
  queryFn: () => api(`${V1}/trash`, trashListResponseSchema).then((r) => r.items),
});

export const trashApi = {
  restore: (kind: TrashKind, id: string) =>
    api(`${V1}/trash/${kind}/${id}/restore`, null, { method: 'POST' }),
  purge: (kind: TrashKind, id: string) =>
    api(`${V1}/trash/${kind}/${id}`, null, { method: 'DELETE' }),
  empty: () => api(`${V1}/trash`, emptyTrashResponseSchema, { method: 'DELETE' }),
};

/** “Recently viewed” on the Today page; failures do not matter. */
export const recordPersonView = (id: string) =>
  api(`${V1}/people/${id}/viewed`, null, { method: 'POST' }).catch(() => undefined);

// Sync (CardDAV app passwords) ------------------------------------------------------

export const appPasswordsQuery = queryOptions({
  queryKey: ['app-passwords'],
  queryFn: () =>
    api(`${V1}/app-passwords`, appPasswordListResponseSchema).then((r) => r.appPasswords),
});

export const appPasswordsApi = {
  create: (input: { name: string; spaceIds: string[] | null }) =>
    api(`${V1}/app-passwords`, createAppPasswordResponseSchema, { json: input }),
  remove: (id: string) => api(`${V1}/app-passwords/${id}`, null, { method: 'DELETE' }),
};

export const calendarFeedsQuery = queryOptions({
  queryKey: ['calendar-feeds'],
  queryFn: () => api(`${V1}/calendar-feeds`, calendarFeedListResponseSchema).then((r) => r.feeds),
});

export const calendarFeedsApi = {
  create: (input: { name: string; spaceIds: string[] | null; includeBirthdays: boolean }) =>
    api(`${V1}/calendar-feeds`, createCalendarFeedResponseSchema, { json: input }),
  remove: (id: string) => api(`${V1}/calendar-feeds/${id}`, null, { method: 'DELETE' }),
};

// Export & import --------------------------------------------------------------------

export const EXPORT_JSON_URL = `${V1}/export/json`;
export const exportVcfUrl = (spaceId?: string) =>
  `${V1}/export/vcf${spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''}`;

export const importStatusQuery = queryOptions({
  queryKey: ['import-status'],
  queryFn: () => api(`${V1}/import/status`, z.object({ empty: z.boolean() })),
});

/** True if the file is an encrypted backup (`PGBACKUP1` header), not a plain export. */
export async function isEncryptedBackup(file: File) {
  const head = new Uint8Array(await file.slice(0, 9).arrayBuffer());
  return new TextDecoder().decode(head) === 'PGBACKUP1';
}

/** Sends an export file as it is; encrypted backups go with their password. */
export async function importExport(file: File, passphrase?: string) {
  const encrypted = await isEncryptedBackup(file);
  const res = await fetch(`${V1}/import`, {
    method: 'POST',
    headers: encrypted
      ? {
          'content-type': 'application/octet-stream',
          'x-backup-passphrase': encodeURIComponent(passphrase ?? ''),
        }
      : { 'content-type': 'application/json' },
    body: file,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, error.error ?? 'unknown');
  }
  return z.object({ imported: z.record(z.string(), z.number()) }).parse(await res.json());
}

// Automatic backups ------------------------------------------------------------------

const importedSchema = z.object({ imported: z.record(z.string(), z.number()) });

export const backupQuery = queryOptions({
  queryKey: ['backup'],
  queryFn: () => api(`${V1}/backup`, backupSettingsSchema),
});

export const backupFilesQuery = queryOptions({
  queryKey: ['backup', 'files'],
  queryFn: () => api(`${V1}/backup/files`, backupFileListResponseSchema).then((r) => r.files),
  enabled: false,
});

export const backupApi = {
  save: (input: BackupConfigInput) =>
    api(`${V1}/backup`, backupSettingsSchema, { method: 'PUT', json: input }),
  test: () => api(`${V1}/backup/test`, null, { method: 'POST' }),
  run: () => api(`${V1}/backup/run`, backupStatusSchema, { method: 'POST' }),
  restore: (name: string, passphrase: string) =>
    api(`${V1}/backup/restore`, importedSchema, { json: { name, passphrase } }),
};

// Contact import ------------------------------------------------------------------------

export const contactImportsQuery = queryOptions({
  queryKey: ['contact-imports'],
  queryFn: () => api(`${V1}/contact-imports`, contactImportListSchema),
});

const importForm = (file: File, options: unknown) => {
  const form = new FormData();
  form.set('file', file);
  form.set('options', JSON.stringify(options));
  return form;
};

export const contactImportApi = {
  preview: (file: File, mapping?: CsvMapping) =>
    api(`${V1}/contact-imports/preview`, contactImportPreviewSchema, {
      form: importForm(file, { mapping }),
    }),
  run: (file: File, options: ContactImportOptions) =>
    api(`${V1}/contact-imports`, contactImportSchema, { form: importForm(file, options) }),
  undo: (id: string) =>
    api(`${V1}/contact-imports/${id}/undo`, contactImportSchema, { method: 'POST' }),
  /** Reads a Monica account through its API; the result is imported like a file. */
  fetchMonica: async (url: string, token: string) => {
    const data = await api(`${V1}/contact-imports/monica-fetch`, z.unknown(), {
      json: { url, token },
    });
    return new File([JSON.stringify(data)], 'monica-api.json', { type: 'application/json' });
  },
};
