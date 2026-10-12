/**
 * Public product name. The final name is not decided yet — this is the only
 * place it may be hard-coded.
 */
export const APP_NAME = 'Rekindly';

/** APP_NAME for identifiers (MCP server name, file names): lower case, ASCII. */
export const APP_SLUG = APP_NAME.toLowerCase()
  .replace(/ä/g, 'ae')
  .replace(/ö/g, 'oe')
  .replace(/ü/g, 'ue')
  .replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]+/g, '-');

export const API_PREFIX = '/api';
export const API_V1 = '/api/v1';

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const PASSWORD_MIN_LENGTH = 12;
