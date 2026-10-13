import type { TFunction } from 'i18next';
import { WebAuthnError } from '@simplewebauthn/browser';
import { ApiError } from '@/lib/api';

const KNOWN = [
  'invalid_credentials',
  'too_many_requests',
  'invalid_current_password',
  'invalid_passkey',
  'setup_completed',
  'unknown_space',
  'space_mismatch',
  'organization_cycle',
  'space_not_empty',
  'last_space',
  'tag_exists',
  'invalid_field_value',
  'invalid_image',
  'file_too_large',
  'name_required',
  'unknown_organization',
  'unknown_person',
  'passkeys_disabled',
  'owner_in_trash',
  'relationship_type_in_use',
  'invalid_export',
  'export_too_new',
  'not_empty',
  'wrong_passphrase',
  'backup_passphrase_required',
  'backup_target_required',
  'backup_target_failed',
  'backup_not_configured',
  'backup_secrets_unreadable',
  'unsupported_import_format',
  'import_nothing',
  'import_already_undone',
  'file_required',
  'monica_unauthorized',
  'monica_unreachable',
  'monica_invalid_url',
  'token_not_allowed',
  'token_read_only',
  'ai_not_configured',
  'ai_not_allowed',
  'ai_failed',
  'ai_invalid_url',
  'ai_model_required',
  'ai_key_required',
  'ai_key_unreadable',
  'invalid_code',
  'mail_not_configured',
  'mail_failed',
  'mail_unreachable',
  'mail_auth_failed',
  'mail_tls_mismatch',
  'mail_rejected',
  'mail_invalid_from',
  'mail_password_unreadable',
  'theme_built_in',
  'theme_unknown',
  'layout_unknown',
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
    const message = code ? t(`errors.${code}`) : t('errors.unknown');
    return error.detail ? `${message} (${error.detail})` : message;
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
