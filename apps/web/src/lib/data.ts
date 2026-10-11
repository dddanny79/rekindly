import { queryOptions, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { z } from 'zod';
import {
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
  spaceListResponseSchema,
  tagListResponseSchema,
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
const DATA_KEYS: QueryKey[] = [['people'], ['organizations'], ['spaces'], ['tags']];

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
