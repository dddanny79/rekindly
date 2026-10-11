import type { TFunction } from 'i18next';
import { WebAuthnError } from '@simplewebauthn/browser';
import { ApiError } from '@/lib/api';

const KNOWN = [
  'invalid_credentials',
  'too_many_requests',
  'invalid_current_password',
  'invalid_passkey',
  'setup_completed',
] as const;

/** User-facing message for a failed request or WebAuthn ceremony. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'too_many_requests') {
      return t('errors.too_many_requests', {
        minutes: Math.max(1, Math.ceil((error.retryAfter ?? 60) / 60)),
      });
    }
    const code = KNOWN.find((known) => known === error.code);
    return code ? t(`errors.${code}`) : t('errors.unknown');
  }
  if (
    (error instanceof WebAuthnError && error.code === 'ERROR_CEREMONY_ABORTED') ||
    (error instanceof Error && error.name === 'NotAllowedError') ||
    (error instanceof WebAuthnError &&
      error.cause instanceof Error &&
      error.cause.name === 'NotAllowedError')
  ) {
    return t('errors.passkey_cancelled');
  }
  if (error instanceof TypeError) return t('errors.network');
  return t('errors.unknown');
}

/** Field errors from a zod result, keyed by top-level field name. */
export function fieldErrors(issues: { path: PropertyKey[]; code: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '');
    errors[key] ??= issue.code;
  }
  return errors;
}
