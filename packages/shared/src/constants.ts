/**
 * Public product name. The final name is not decided yet — this is the only
 * place it may be hard-coded.
 */
export const APP_NAME = 'Personengedächtnis';

export const API_PREFIX = '/api';
export const API_V1 = '/api/v1';

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const PASSWORD_MIN_LENGTH = 12;
