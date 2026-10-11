import {
  type AuthenticationResponseJSON,
  browserSupportsWebAuthn,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  accountSchema,
  authStatusResponseSchema,
  type AuthStatusResponse,
  type ChangePasswordRequest,
  instanceSettingsSchema,
  type UpdateInstanceSettingsRequest,
  type LoginRequest,
  passkeyListResponseSchema,
  passkeySchema,
  type Account,
  type SetupRequest,
} from '@app/shared';
import i18n from '@/i18n';
import { api } from '@/lib/api';

const AUTH = '/api/v1/auth';
const loginResponseSchema = z.object({ account: accountSchema });

export const authStatusQuery = queryOptions({
  queryKey: ['auth', 'status'],
  queryFn: () => api(`${AUTH}/status`, authStatusResponseSchema),
  staleTime: Infinity,
});

export const passkeysQuery = queryOptions({
  queryKey: ['auth', 'passkeys'],
  queryFn: () => api(`${AUTH}/passkeys`, passkeyListResponseSchema).then((r) => r.passkeys),
});

export const useAuthStatus = () => useQuery(authStatusQuery);

/** Passkeys need WebAuthn, which browsers only offer on HTTPS or localhost. */
export const passkeysAvailable = () => window.isSecureContext && browserSupportsWebAuthn();

const SIGNED_OUT: AuthStatusResponse = {
  setupRequired: false,
  authenticated: false,
  account: null,
  passkeysEnabled: false,
};

function useSignedIn() {
  const queryClient = useQueryClient();
  return (account: Account) => {
    queryClient.setQueryData(authStatusQuery.queryKey, (old) => ({
      ...(old ?? SIGNED_OUT),
      setupRequired: false,
      authenticated: true,
      account,
    }));
    void i18n.changeLanguage(account.locale);
  };
}

export function useSetup() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: SetupRequest) =>
      api(`${AUTH}/setup`, authStatusResponseSchema, { json: input }),
    onSuccess: (status) => status.account && signedIn(status.account),
  });
}

export function useLogin() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: (input: LoginRequest) => api(`${AUTH}/login`, loginResponseSchema, { json: input }),
    onSuccess: ({ account }) => signedIn(account),
  });
}

export function usePasskeyLogin() {
  const signedIn = useSignedIn();
  return useMutation({
    mutationFn: async () => {
      const optionsJSON = await api<PublicKeyCredentialRequestOptionsJSON>(
        `${AUTH}/passkeys/login/options`,
        z.custom<PublicKeyCredentialRequestOptionsJSON>(),
        { method: 'POST' },
      );
      const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON });
      return api(`${AUTH}/passkeys/login/verify`, loginResponseSchema, { json: { response } });
    },
    onSuccess: ({ account }) => signedIn(account),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api(`${AUTH}/logout`, null, { method: 'POST' }),
    onSettled: () => {
      const passkeysEnabled = queryClient.getQueryData(authStatusQuery.queryKey)?.passkeysEnabled;
      queryClient.clear();
      queryClient.setQueryData(authStatusQuery.queryKey, {
        ...SIGNED_OUT,
        passkeysEnabled: passkeysEnabled ?? false,
      });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: ChangePasswordRequest) =>
      api('/api/v1/account/password', null, { method: 'PUT', json: input }),
  });
}

export function useAddPasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const optionsJSON = await api<PublicKeyCredentialCreationOptionsJSON>(
        `${AUTH}/passkeys/register/options`,
        z.custom<PublicKeyCredentialCreationOptionsJSON>(),
        { method: 'POST' },
      );
      const response: RegistrationResponseJSON = await startRegistration({ optionsJSON });
      return api(`${AUTH}/passkeys/register/verify`, passkeySchema, { json: { name, response } });
    },
    onSuccess: () => queryClient.invalidateQueries(passkeysQuery),
  });
}

export function useRenamePasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api(`${AUTH}/passkeys/${encodeURIComponent(id)}`, passkeySchema, {
        method: 'PATCH',
        json: { name },
      }),
    onSuccess: () => queryClient.invalidateQueries(passkeysQuery),
  });
}

export function useDeletePasskey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api(`${AUTH}/passkeys/${encodeURIComponent(id)}`, null, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries(passkeysQuery),
  });
}

export const instanceSettingsQuery = queryOptions({
  queryKey: ['settings'],
  queryFn: () => api('/api/v1/settings', instanceSettingsSchema),
});

export function useUpdateInstanceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateInstanceSettingsRequest) =>
      api('/api/v1/settings', instanceSettingsSchema, { method: 'PATCH', json: patch }),
    onSuccess: (settings) => {
      queryClient.setQueryData(instanceSettingsQuery.queryKey, settings);
      queryClient.setQueryData(authStatusQuery.queryKey, (old) =>
        old ? { ...old, passkeysEnabled: settings.passkeysEnabled } : old,
      );
    },
  });
}
