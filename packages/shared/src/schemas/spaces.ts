import { z } from 'zod';
import { idSchema } from './common';

/** Palette keys; the web app maps them to colour tokens (light/dark). */
export const SPACE_COLORS = ['olive', 'navy', 'plum', 'teal', 'ochre', 'slate'] as const;
export const spaceColorSchema = z.enum(SPACE_COLORS);
export type SpaceColor = z.infer<typeof spaceColorSchema>;

export const spaceSchema = z.object({
  id: idSchema,
  name: z.string().nullable(),
  nameKey: z.string().nullable(),
  color: spaceColorSchema.nullable(),
  sort: z.number().int(),
  /** Data of this space may go to an AI (MCP clients, AI features). */
  aiAllowed: z.boolean(),
  peopleCount: z.number().int(),
});
export type Space = z.infer<typeof spaceSchema>;

export const spaceListResponseSchema = z.object({ spaces: z.array(spaceSchema) });

export const createSpaceRequestSchema = z.object({
  name: z.string().trim().min(1).max(100),
  color: spaceColorSchema.optional(),
});

export const updateSpaceRequestSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  color: spaceColorSchema.optional(),
  sort: z.number().int().min(0).max(10_000).optional(),
  aiAllowed: z.boolean().optional(),
});
