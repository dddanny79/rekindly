/**
 * The OpenAPI 3.1 description of the API, built from the shared Zod schemas. Every
 * route of the app must appear here (checked by a test).
 */
import { z, type ZodType } from 'zod';
import * as s from '@app/shared';
import { TOKEN_PATHS } from '../auth/middleware';
import { APP_VERSION } from '../version';

type Body = ZodType | 'multipart' | 'binary' | 'image';
type Response = ZodType | 'empty' | 'binary' | 'json';

export interface Operation {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  /** Hono style, e.g. `/api/v1/people/:id`. */
  path: string;
  tag: string;
  summary: string;
  query?: ZodType;
  body?: Body;
  response?: Response;
  status?: number;
  /** Without a session (setup, login, health). */
  public?: boolean;
}

const op = (
  method: Operation['method'],
  path: string,
  tag: string,
  summary: string,
  extra: Partial<Operation> = {},
): Operation => ({ method, path: `/api/v1${path}`, tag, summary, ...extra });

const imported = z.object({ imported: z.record(z.string(), z.number()) });
const account = z.object({ account: s.accountSchema });
const facts = z.object({ facts: z.array(s.factSchema) });
const spaceQuery = z.object({ spaceId: s.idSchema.optional() });

export const OPERATIONS: Operation[] = [
  {
    method: 'get',
    path: '/api/health',
    tag: 'System',
    summary: 'Health check',
    response: s.healthResponseSchema,
    public: true,
  },

  // Account and sign-in
  op('get', '/auth/status', 'Account', 'Setup and sign-in state', {
    response: s.authStatusResponseSchema,
    public: true,
  }),
  op('post', '/auth/setup', 'Account', 'Create the account (first start only)', {
    body: s.setupRequestSchema,
    response: s.authStatusResponseSchema,
    public: true,
  }),
  op('post', '/auth/login/verify', 'Account', 'Finish signing in with the emailed code', {
    body: s.loginVerifyRequestSchema,
    response: account,
    public: true,
  }),
  op('post', '/auth/login', 'Account', 'Sign in with email and password (may ask for a code)', {
    body: s.loginRequestSchema,
    response: s.loginResponseSchema,
    public: true,
  }),
  op('post', '/auth/logout', 'Account', 'Sign out', {
    response: 'empty',
    status: 204,
    public: true,
  }),
  op('post', '/auth/passkeys/login/options', 'Account', 'Start a passkey sign-in', {
    response: 'json',
    public: true,
  }),
  op('post', '/auth/passkeys/login/verify', 'Account', 'Finish a passkey sign-in', {
    body: s.passkeyLoginVerifyRequestSchema,
    response: account,
    public: true,
  }),
  op('get', '/auth/passkeys', 'Account', 'List passkeys', {
    response: s.passkeyListResponseSchema,
  }),
  op('get', '/auth/two-factor', 'Account', 'Sign-in codes by email: state, trusted devices', {
    response: s.twoFactorStatusSchema,
  }),
  op('post', '/auth/two-factor/start', 'Account', 'Send a code to confirm switching on', {
    response: s.twoFactorStartResponseSchema,
  }),
  op('post', '/auth/two-factor/enable', 'Account', 'Switch on sign-in codes', {
    body: s.twoFactorConfirmRequestSchema,
    response: 'empty',
    status: 204,
  }),
  op('post', '/auth/two-factor/disable', 'Account', 'Switch off sign-in codes (password)', {
    body: s.twoFactorDisableRequestSchema,
    response: 'empty',
    status: 204,
  }),
  op('delete', '/auth/two-factor/devices/:id', 'Account', 'Forget a trusted device', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/auth/passkeys/register/options', 'Account', 'Start registering a passkey', {
    response: 'json',
  }),
  op('post', '/auth/passkeys/register/verify', 'Account', 'Finish registering a passkey', {
    body: s.passkeyRegistrationVerifyRequestSchema,
    response: s.passkeySchema,
    status: 201,
  }),
  op('patch', '/auth/passkeys/:id', 'Account', 'Rename a passkey', {
    body: s.renamePasskeyRequestSchema,
    response: s.passkeySchema,
  }),
  op('delete', '/auth/passkeys/:id', 'Account', 'Delete a passkey', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/account', 'Account', 'The account', { response: s.accountSchema }),
  op('put', '/account/password', 'Account', 'Change the password', {
    body: s.changePasswordRequestSchema,
    response: 'empty',
    status: 204,
  }),
  op('get', '/settings', 'Account', 'Instance settings', { response: s.instanceSettingsSchema }),
  op('patch', '/settings', 'Account', 'Change instance settings', {
    body: s.updateInstanceSettingsRequestSchema,
    response: s.instanceSettingsSchema,
  }),

  // Spaces and catalog
  op('get', '/spaces', 'Spaces', 'List spaces', { response: s.spaceListResponseSchema }),
  op('post', '/spaces', 'Spaces', 'Create a space', {
    body: s.createSpaceRequestSchema,
    response: s.spaceSchema,
    status: 201,
  }),
  op('patch', '/spaces/:id', 'Spaces', 'Change a space (name, colour, order, AI permission)', {
    body: s.updateSpaceRequestSchema,
    response: s.spaceSchema,
  }),
  op('delete', '/spaces/:id', 'Spaces', 'Delete an empty space', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/tags', 'Catalog', 'List tags', { response: s.tagListResponseSchema }),
  op('post', '/tags', 'Catalog', 'Create a tag', {
    body: s.createTagRequestSchema,
    response: s.tagSchema,
    status: 201,
  }),
  op('patch', '/tags/:id', 'Catalog', 'Rename a tag', {
    body: s.updateTagRequestSchema,
    response: s.tagSchema,
  }),
  op('delete', '/tags/:id', 'Catalog', 'Move a tag to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/relationship-types', 'Catalog', 'List relationship types', {
    response: s.relationshipTypeListResponseSchema,
  }),
  op('post', '/relationship-types', 'Catalog', 'Create a relationship type', {
    body: s.createRelationshipTypeRequestSchema,
    response: s.relationshipTypeSchema,
    status: 201,
  }),
  op('patch', '/relationship-types/:id', 'Catalog', 'Change a relationship type', {
    body: s.updateRelationshipTypeRequestSchema,
    response: s.relationshipTypeSchema,
  }),
  op('delete', '/relationship-types/:id', 'Catalog', 'Move a relationship type to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/field-definitions', 'Catalog', 'List custom fields', {
    query: z.object({ target: s.fieldTargetSchema.optional() }),
    response: s.fieldDefinitionListResponseSchema,
  }),
  op('post', '/field-definitions', 'Catalog', 'Create a custom field', {
    body: s.createFieldDefinitionRequestSchema,
    response: s.fieldDefinitionSchema,
    status: 201,
  }),
  op('patch', '/field-definitions/:id', 'Catalog', 'Change a custom field', {
    body: s.updateFieldDefinitionRequestSchema,
    response: s.fieldDefinitionSchema,
  }),
  op('delete', '/field-definitions/:id', 'Catalog', 'Move a custom field to the trash', {
    response: 'empty',
    status: 204,
  }),

  // People
  op('get', '/people', 'People', 'List people', {
    query: s.peopleQuerySchema,
    response: s.personListResponseSchema,
  }),
  op('post', '/people', 'People', 'Create a person (quick entry)', {
    body: s.createPersonRequestSchema,
    response: s.personSchema,
    status: 201,
  }),
  op('get', '/people/:id', 'People', 'A person with everything on the person page', {
    response: s.personSchema,
  }),
  op('patch', '/people/:id', 'People', 'Change a person', {
    body: s.updatePersonRequestSchema,
    response: s.personSchema,
  }),
  op('delete', '/people/:id', 'People', 'Move a person to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/people/:id/viewed', 'People', 'Remember as recently viewed', {
    response: 'empty',
    status: 204,
  }),
  op('put', '/people/:id/photo', 'People', 'Set the profile photo (image upload)', {
    body: 'image',
    response: s.personSchema,
  }),
  op('delete', '/people/:id/photo', 'People', 'Remove the profile photo', {
    response: s.personSchema,
  }),
  op('post', '/people/:id/contact-points', 'People', 'Add a phone number, email, …', {
    body: s.createContactPointRequestSchema,
    response: s.contactPointSchema,
    status: 201,
  }),
  op('patch', '/people/:id/contact-points/:itemId', 'People', 'Change a contact detail', {
    body: s.updateContactPointRequestSchema,
    response: s.contactPointSchema,
  }),
  op(
    'delete',
    '/people/:id/contact-points/:itemId',
    'People',
    'Move a contact detail to the trash',
    { response: 'empty', status: 204 },
  ),
  op('post', '/people/:id/addresses', 'People', 'Add an address', {
    body: s.createAddressRequestSchema,
    response: s.addressSchema,
    status: 201,
  }),
  op('patch', '/people/:id/addresses/:itemId', 'People', 'Change an address', {
    body: s.updateAddressRequestSchema,
    response: s.addressSchema,
  }),
  op('delete', '/people/:id/addresses/:itemId', 'People', 'Move an address to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/people/:id/affiliations', 'People', 'Link to an organization', {
    body: s.createAffiliationRequestSchema,
    response: s.affiliationSchema,
    status: 201,
  }),
  op('patch', '/people/:id/affiliations/:itemId', 'People', 'Change an organization link', {
    body: s.updateAffiliationRequestSchema,
    response: s.affiliationSchema,
  }),
  op(
    'delete',
    '/people/:id/affiliations/:itemId',
    'People',
    'Move an organization link to the trash',
    { response: 'empty', status: 204 },
  ),
  op('post', '/people/:id/relationships', 'People', 'Add a relationship', {
    body: s.createRelationshipRequestSchema,
    response: s.relationshipSchema,
    status: 201,
  }),
  op('patch', '/people/:id/relationships/:itemId', 'People', 'Change a relationship note', {
    body: s.updateRelationshipRequestSchema,
    response: s.relationshipSchema,
  }),
  op('delete', '/people/:id/relationships/:itemId', 'People', 'Move a relationship to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/people/:id/tags', 'People', 'Tag a person (creates the tag if needed)', {
    body: s.addPersonTagRequestSchema,
    response: s.tagRefSchema,
    status: 201,
  }),
  op('delete', '/people/:id/tags/:tagId', 'People', 'Remove a tag from a person', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/people/:id/facts', 'People', 'Add a fact', {
    body: s.createFactRequestSchema,
    response: s.factSchema,
    status: 201,
  }),
  op('put', '/people/:id/facts/order', 'People', 'Reorder facts', {
    body: s.reorderFactsRequestSchema,
    response: facts,
  }),
  op('patch', '/people/:id/facts/:itemId', 'People', 'Change a fact', {
    body: s.updateFactRequestSchema,
    response: s.factSchema,
  }),
  op('delete', '/people/:id/facts/:itemId', 'People', 'Move a fact to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/people/:id/reminders', 'Timeline', 'Add a follow-up', {
    body: s.createReminderRequestSchema,
    response: s.reminderSchema,
    status: 201,
  }),
  op(
    'put',
    '/people/:id/fields/:definitionId',
    'People',
    'Set a custom field (empty value clears it)',
    { body: s.setFieldValueRequestSchema, response: s.fieldValueSchema },
  ),

  // Organizations
  op('get', '/organizations', 'Organizations', 'List organizations', {
    query: s.organizationsQuerySchema,
    response: s.organizationListResponseSchema,
  }),
  op('post', '/organizations', 'Organizations', 'Create an organization', {
    body: s.createOrganizationRequestSchema,
    response: s.organizationSchema,
    status: 201,
  }),
  op('get', '/organizations/:id', 'Organizations', 'An organization with its people', {
    response: s.organizationSchema,
  }),
  op('patch', '/organizations/:id', 'Organizations', 'Change an organization', {
    body: s.updateOrganizationRequestSchema,
    response: s.organizationSchema,
  }),
  op('delete', '/organizations/:id', 'Organizations', 'Move an organization to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/organizations/:id/addresses', 'Organizations', 'Add an address', {
    body: s.createAddressRequestSchema,
    response: s.addressSchema,
    status: 201,
  }),
  op('patch', '/organizations/:id/addresses/:itemId', 'Organizations', 'Change an address', {
    body: s.updateAddressRequestSchema,
    response: s.addressSchema,
  }),
  op(
    'delete',
    '/organizations/:id/addresses/:itemId',
    'Organizations',
    'Move an address to the trash',
    { response: 'empty', status: 204 },
  ),
  op(
    'put',
    '/organizations/:id/fields/:definitionId',
    'Organizations',
    'Set a custom field (empty value clears it)',
    { body: s.setFieldValueRequestSchema, response: s.fieldValueSchema },
  ),

  // Timeline
  op('get', '/entries', 'Timeline', 'Timeline entries (notes, calls, meetings, …)', {
    query: s.entriesQuerySchema,
    response: s.entryListResponseSchema,
  }),
  op('post', '/entries', 'Timeline', 'Log a note, call, meeting, message or event', {
    body: s.createEntryRequestSchema,
    response: s.entrySchema,
    status: 201,
  }),
  op('get', '/entries/:id', 'Timeline', 'One entry', { response: s.entrySchema }),
  op('patch', '/entries/:id', 'Timeline', 'Change an entry', {
    body: s.updateEntryRequestSchema,
    response: s.entrySchema,
  }),
  op('delete', '/entries/:id', 'Timeline', 'Move an entry to the trash', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/reminders', 'Timeline', 'Follow-ups', {
    query: s.remindersQuerySchema,
    response: s.reminderListResponseSchema,
  }),
  op('patch', '/reminders/:id', 'Timeline', 'Change a follow-up or mark it done', {
    body: s.updateReminderRequestSchema,
    response: s.reminderSchema,
  }),
  op('delete', '/reminders/:id', 'Timeline', 'Move a follow-up to the trash', {
    response: 'empty',
    status: 204,
  }),

  // Search, Today, files
  op('get', '/search', 'Search', 'Full-text search over people and organizations', {
    query: s.searchQuerySchema,
    response: s.searchResponseSchema,
  }),
  op('get', '/today', 'Search', 'Due follow-ups, birthdays, overdue contacts', {
    query: s.todayQuerySchema,
    response: s.todayResponseSchema,
  }),
  op('get', '/files/:id', 'Search', 'A stored file (profile photo)', { response: 'binary' }),

  // Duplicates
  op('get', '/duplicates', 'Duplicates', 'Possible duplicate pairs', {
    response: s.duplicateListResponseSchema,
  }),
  op('post', '/duplicates/dismiss', 'Duplicates', 'Mark a pair as different people', {
    body: s.dismissDuplicateRequestSchema,
    response: 'empty',
    status: 204,
  }),
  op('post', '/duplicates/merge', 'Duplicates', 'Merge one person into another', {
    body: s.mergePeopleRequestSchema,
    response: s.personSchema,
  }),

  // Trash
  op('get', '/trash', 'Trash', 'Everything in the trash', { response: s.trashListResponseSchema }),
  op('delete', '/trash', 'Trash', 'Empty the trash', { response: s.emptyTrashResponseSchema }),
  op('post', '/trash/:kind/:id/restore', 'Trash', 'Restore an item', {
    response: 'empty',
    status: 204,
  }),
  op('delete', '/trash/:kind/:id', 'Trash', 'Delete an item for good', {
    response: 'empty',
    status: 204,
  }),

  // Sync, tokens
  op('get', '/app-passwords', 'Sync', 'Device passwords (CardDAV)', {
    response: s.appPasswordListResponseSchema,
  }),
  op('post', '/app-passwords', 'Sync', 'Create a device password', {
    body: s.createAppPasswordRequestSchema,
    response: s.createAppPasswordResponseSchema,
    status: 201,
  }),
  op('delete', '/app-passwords/:id', 'Sync', 'Revoke a device password', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/calendar-feeds', 'Sync', 'Calendar subscriptions (ICS)', {
    response: s.calendarFeedListResponseSchema,
  }),
  op('post', '/calendar-feeds', 'Sync', 'Create a calendar subscription link', {
    body: s.createCalendarFeedRequestSchema,
    response: s.createCalendarFeedResponseSchema,
    status: 201,
  }),
  op('delete', '/calendar-feeds/:id', 'Sync', 'Revoke a calendar subscription link', {
    response: 'empty',
    status: 204,
  }),
  op('get', '/api-tokens', 'Sync', 'API tokens', { response: s.apiTokenListResponseSchema }),
  op('post', '/api-tokens', 'Sync', 'Create an API token (shown once)', {
    body: s.createApiTokenRequestSchema,
    response: s.createApiTokenResponseSchema,
    status: 201,
  }),
  op('delete', '/api-tokens/:id', 'Sync', 'Revoke an API token', {
    response: 'empty',
    status: 204,
  }),

  // AI
  op('get', '/ai', 'AI', 'AI provider settings', { response: s.aiSettingsSchema }),
  op('put', '/ai', 'AI', 'Change the AI provider', {
    body: s.aiSettingsInputSchema,
    response: s.aiSettingsSchema,
  }),
  op('post', '/ai/test', 'AI', 'Test the AI provider (no personal data)', {
    response: s.aiTestResponseSchema,
  }),
  op('post', '/ai/people/:id/summary', 'AI', 'Briefing summary of a person', {
    response: s.aiSummaryResponseSchema,
  }),
  op('post', '/ai/entries/:id/facts', 'AI', 'Suggest facts from a timeline entry', {
    response: s.aiFactSuggestionsResponseSchema,
  }),
  op('post', '/ai/ask', 'AI', 'Answer a question in plain language, with sources', {
    body: s.aiAskRequestSchema,
    response: s.aiAskResponseSchema,
  }),

  // Mail
  op('get', '/mail', 'Mail', 'Mail settings (SMTP) and status', { response: s.mailSettingsSchema }),
  op('put', '/mail', 'Mail', 'Change mail settings and the daily summary', {
    body: s.mailSettingsInputSchema,
    response: s.mailSettingsSchema,
  }),
  op('post', '/mail/test', 'Mail', 'Send a test mail to the account address', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/mail/digest', 'Mail', 'Send today’s summary now', {
    response: z.object({ sent: z.boolean() }),
  }),

  // Appearance
  op('get', '/themes', 'Appearance', 'Themes, layout templates and the instance defaults', {
    response: s.themeListResponseSchema,
  }),
  op('put', '/themes/defaults', 'Appearance', 'Set the default theme and layout of the instance', {
    body: s.themeDefaultsRequestSchema,
    response: s.themeDefaultsRequestSchema.required(),
  }),
  op(
    'post',
    '/themes',
    'Appearance',
    'Create or import a theme (file format, see docs/themes.md)',
    {
      body: s.saveThemeRequestSchema,
      response: s.themeRecordSchema,
      status: 201,
    },
  ),
  op('get', '/themes/:id', 'Appearance', 'One theme (built-in or own)', {
    response: s.themeRecordSchema,
  }),
  op('put', '/themes/:id', 'Appearance', 'Change an own theme', {
    body: s.saveThemeRequestSchema,
    response: s.themeRecordSchema,
  }),
  op('delete', '/themes/:id', 'Appearance', 'Move an own theme to the trash (30 days)', {
    response: 'empty',
    status: 204,
  }),
  op('post', '/themes/:id/restore', 'Appearance', 'Restore a deleted theme', {
    response: s.themeRecordSchema,
  }),

  // Data: export, import, backups
  op('get', '/export/json', 'Data', 'Full export (JSON file)', { response: 'binary' }),
  op('get', '/export/vcf', 'Data', 'Contacts as vCard file', {
    query: spaceQuery,
    response: 'binary',
  }),
  op('get', '/import/status', 'Data', 'Whether a full export can be restored (instance empty)', {
    response: z.object({ empty: z.boolean() }),
  }),
  op(
    'post',
    '/import',
    'Data',
    'Restore a full export or encrypted backup into an empty instance',
    { body: 'binary', response: imported },
  ),
  op('get', '/backup', 'Data', 'Automatic backup settings and status', {
    response: s.backupSettingsSchema,
  }),
  op('put', '/backup', 'Data', 'Change automatic backup settings', {
    body: s.backupConfigInputSchema,
    response: s.backupSettingsSchema,
  }),
  op('post', '/backup/test', 'Data', 'Test the backup target', { response: 'empty', status: 204 }),
  op('post', '/backup/run', 'Data', 'Back up now', { response: s.backupStatusSchema }),
  op('get', '/backup/files', 'Data', 'Backups at the target', {
    response: s.backupFileListResponseSchema,
  }),
  op('post', '/backup/restore', 'Data', 'Restore a backup from the target into an empty instance', {
    body: s.restoreBackupRequestSchema,
    response: imported,
  }),
  op('get', '/contact-imports', 'Data', 'Previous contact imports', {
    response: s.contactImportListSchema,
  }),
  op(
    'post',
    '/contact-imports/preview',
    'Data',
    'Preview a contact import (multipart: file, options)',
    { body: 'multipart', response: s.contactImportPreviewSchema },
  ),
  op('post', '/contact-imports', 'Data', 'Import contacts (multipart: file, options)', {
    body: 'multipart',
    response: s.contactImportSchema,
    status: 201,
  }),
  op('post', '/contact-imports/:id/undo', 'Data', 'Undo a contact import', {
    response: s.contactImportSchema,
  }),
  op('post', '/contact-imports/monica-fetch', 'Data', 'Read a Monica account through its API', {
    body: s.monicaFetchRequestSchema,
    response: 'json',
  }),
];

// Document ----------------------------------------------------------------------------

const toJson = (schema: ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'draft-2020-12' }) as Record<
    string,
    unknown
  >;

export const openApiPath = (path: string) => path.replace(/:(\w+)/g, '{$1}');
export const tokenAllowed = (path: string) => TOKEN_PATHS.test(path);

function operation(o: Operation) {
  const params: Record<string, unknown>[] = [...o.path.matchAll(/:(\w+)/g)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  if (o.query) {
    const json = toJson(o.query, 'input');
    const props = (json.properties ?? {}) as Record<string, unknown>;
    const required = new Set((json.required as string[] | undefined) ?? []);
    for (const [name, schema] of Object.entries(props)) {
      params.push({ name, in: 'query', required: required.has(name), schema });
    }
  }
  const status = String(o.status ?? 200);
  const content = (r: Response | undefined) => {
    if (!r || r === 'empty') return undefined;
    if (r === 'binary')
      return { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } };
    if (r === 'json') return { 'application/json': { schema: {} } };
    return { 'application/json': { schema: toJson(r, 'output') } };
  };
  const body = (b: Body | undefined) => {
    if (!b) return undefined;
    if (b === 'multipart') {
      return {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                file: { type: 'string', format: 'binary' },
                options: { type: 'string', description: 'JSON' },
              },
            },
          },
        },
      };
    }
    if (b === 'binary')
      return {
        required: true,
        content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      };
    if (b === 'image')
      return {
        required: true,
        content: { 'image/*': { schema: { type: 'string', format: 'binary' } } },
      };
    return { required: true, content: { 'application/json': { schema: toJson(b, 'input') } } };
  };
  return {
    tags: [o.tag],
    summary: o.summary,
    ...(params.length ? { parameters: params } : {}),
    ...(o.body ? { requestBody: body(o.body) } : {}),
    responses: {
      [status]: {
        description: o.response === 'empty' ? 'No content' : 'OK',
        ...(content(o.response) ? { content: content(o.response) } : {}),
      },
      default: {
        description: 'Error',
        content: { 'application/json': { schema: toJson(s.errorResponseSchema, 'output') } },
      },
    },
    ...(o.public ? { security: [] } : {}),
    'x-api-token': o.public
      ? 'not needed'
      : tokenAllowed(o.path)
        ? o.method === 'get'
          ? 'read'
          : 'write'
        : 'session only',
  };
}

export function openApiDocument(publicUrl: URL) {
  const paths: Record<string, Record<string, Record<string, unknown>>> = {};
  for (const o of OPERATIONS) {
    const key = openApiPath(o.path);
    paths[key] ??= {};
    paths[key][o.method] = operation(o);
  }
  return {
    openapi: '3.1.0',
    info: {
      title: `${s.APP_NAME} API`,
      version: APP_VERSION,
      description:
        'The API the web app uses. Authenticate with the session cookie, or with an API token: `Authorization: Bearer rkt_…` (Settings → API & MCP). Tokens reach people, organizations, timeline, catalog, search and Today; read tokens only GET. `x-api-token` on each operation says what it needs.',
    },
    servers: [{ url: publicUrl.origin }],
    security: [{ bearer: [] }, { session: [] }],
    components: {
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', description: 'API token (rkt_…)' },
        session: { type: 'apiKey', in: 'cookie', name: 'session' },
      },
    },
    paths,
  };
}
