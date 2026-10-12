import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common';

export const API_TOKEN_SCOPES = ['read', 'write'] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

/** A token for the API and the MCP server; the token itself is only shown once. */
export const apiTokenSchema = z.object({
  id: idSchema,
  name: z.string(),
  scope: z.enum(API_TOKEN_SCOPES),
  expiresAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  lastUsedAt: isoDateTimeSchema.nullable(),
});
export type ApiToken = z.infer<typeof apiTokenSchema>;

export const apiTokenListResponseSchema = z.object({ apiTokens: z.array(apiTokenSchema) });

export const createApiTokenRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(API_TOKEN_SCOPES),
  /** Valid for this many days; null = until revoked. */
  expiresInDays: z.number().int().min(1).max(3650).nullable(),
});

export const createApiTokenResponseSchema = z.object({
  apiToken: apiTokenSchema,
  /** Shown once: `pgt_…`. */
  token: z.string(),
  /** Address of the MCP server. */
  mcpUrl: z.string(),
});
export type CreateApiTokenResponse = z.infer<typeof createApiTokenResponseSchema>;
