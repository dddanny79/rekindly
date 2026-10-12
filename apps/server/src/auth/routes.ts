import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Hono, type Context } from 'hono';
import {
  type AuthStatusResponse,
  changePasswordRequestSchema,
  loginRequestSchema,
  loginVerifyRequestSchema,
  passkeyLoginVerifyRequestSchema,
  twoFactorConfirmRequestSchema,
  twoFactorDisableRequestSchema,
  passkeyRegistrationVerifyRequestSchema,
  renamePasskeyRequestSchema,
  setupRequestSchema,
} from '@app/shared';
import type { AppEnv, Deps } from '../env';
import { clientIp } from '../lib/client-ip';
import { validate } from '../lib/validate';
import {
  AccountExistsError,
  createAccount,
  getAccountRow,
  setPassword,
  toAccount,
  verifyCredentials,
} from './account';
import { clearSessionCookie, setSessionCookie } from './cookies';
import {
  deletePasskey,
  finishLogin,
  finishRegistration,
  listPasskeys,
  relyingParty,
  renamePasskey,
  startLogin,
  startRegistration,
} from './passkeys';
import { passkeysEnabled } from '../settings/service';
import { verifyPassword } from './password';
import { createSession, deleteAllSessions, deleteSession } from './sessions';
import {
  codeMail,
  currentTrustedId,
  forgetAllTrustedDevices,
  forgetTrustedDevice,
  listTrustedDevices,
  maskEmail,
  setTwoFactor,
  trustDevice,
  trustedDeviceOf,
  twoFactorEnabled,
} from './two-factor';
import { mailReady } from '../mail/config';
import { deliver, type MailContext } from '../mail/digest';

const mailContext = (deps: Deps): MailContext => ({
  db: deps.db,
  key: deps.secretKey(),
  env: deps.config.mail,
  publicUrl: deps.config.publicUrl,
});

function signIn(c: Context<AppEnv>, deps: Deps) {
  const { token } = createSession(deps.db, c.req.header('user-agent'));
  setSessionCookie(c, token, deps.config.publicUrl);
}

/** Counts an attempt for this client; returns a 429 response when over the limit. */
function limited(c: Context<AppEnv>, deps: Deps) {
  const retryAfter = deps.loginLimiter.hit(`auth:${clientIp(c, deps.config.trustProxy)}`);
  if (!retryAfter) return null;
  c.header('Retry-After', String(retryAfter));
  return c.json({ error: 'too_many_requests' }, 429);
}

/** 403 while passkeys are switched off in the settings. */
function passkeysOff(c: Context<AppEnv>, deps: Deps) {
  return passkeysEnabled(deps.db) ? null : c.json({ error: 'passkeys_disabled' }, 403);
}

const resetLimit = (c: Context<AppEnv>, deps: Deps) =>
  deps.loginLimiter.reset(`auth:${clientIp(c, deps.config.trustProxy)}`);

/** Routes reachable without a session. */
export function publicAuthRoutes(deps: Deps) {
  const rp = relyingParty(deps.config.publicUrl);

  return new Hono<AppEnv>()
    .get('/status', (c) => {
      const row = getAccountRow(deps.db);
      const body: AuthStatusResponse = {
        setupRequired: row === null,
        authenticated: row !== null && c.var.session !== null,
        account: row && c.var.session ? toAccount(row) : null,
        passkeysEnabled: passkeysEnabled(deps.db),
      };
      return c.json(body);
    })
    .post('/setup', validate('json', setupRequestSchema), async (c) => {
      try {
        const created = await createAccount(deps.db, c.req.valid('json'));
        signIn(c, deps);
        return c.json(
          {
            setupRequired: false,
            authenticated: true,
            account: created,
            passkeysEnabled: passkeysEnabled(deps.db),
          },
          201,
        );
      } catch (error) {
        if (error instanceof AccountExistsError) return c.json({ error: 'setup_completed' }, 403);
        throw error;
      }
    })
    .post('/login', validate('json', loginRequestSchema), async (c) => {
      const tooMany = limited(c, deps);
      if (tooMany) return tooMany;
      const { email, password } = c.req.valid('json');
      if (!(await verifyCredentials(deps.db, email, password))) {
        return c.json({ error: 'invalid_credentials' }, 401);
      }
      // Second step: a code by mail, unless this browser is trusted.
      if (twoFactorEnabled(deps.db) && !trustedDeviceOf(c, deps.db)) {
        const account = getAccountRow(deps.db)!;
        const { id, code } = deps.twoFactorCodes.create('login');
        await deliver(mailContext(deps), codeMail(deps.db, code, 'login'));
        return c.json({ twoFactor: { challengeId: id, sentTo: maskEmail(account.email) } });
      }
      resetLimit(c, deps);
      signIn(c, deps);
      return c.json({ account: toAccount(getAccountRow(deps.db)!) });
    })
    .post('/login/verify', validate('json', loginVerifyRequestSchema), (c) => {
      const tooMany = limited(c, deps);
      if (tooMany) return tooMany;
      const { challengeId, code, trustDevice: trust } = c.req.valid('json');
      if (!deps.twoFactorCodes.verify(challengeId, code, 'login')) {
        return c.json({ error: 'invalid_code' }, 401);
      }
      resetLimit(c, deps);
      signIn(c, deps);
      if (trust) trustDevice(c, deps.db, deps.config.publicUrl);
      return c.json({ account: toAccount(getAccountRow(deps.db)!) });
    })
    .post('/logout', (c) => {
      if (c.var.session) deleteSession(deps.db, c.var.session.id);
      clearSessionCookie(c);
      return c.body(null, 204);
    })
    .post('/passkeys/login/options', async (c) => {
      if (!getAccountRow(deps.db)) return c.json({ error: 'setup_required' }, 409);
      const off = passkeysOff(c, deps);
      if (off) return off;
      return c.json(await startLogin(rp, deps.challenges));
    })
    .post(
      '/passkeys/login/verify',
      validate('json', passkeyLoginVerifyRequestSchema),
      async (c) => {
        const off = passkeysOff(c, deps);
        if (off) return off;
        const tooMany = limited(c, deps);
        if (tooMany) return tooMany;
        const { response } = c.req.valid('json');
        const ok = await finishLogin(
          deps.db,
          rp,
          deps.challenges,
          response as unknown as AuthenticationResponseJSON,
        );
        if (!ok) return c.json({ error: 'invalid_passkey' }, 401);
        resetLimit(c, deps);
        signIn(c, deps);
        return c.json({ account: toAccount(getAccountRow(deps.db)!) });
      },
    );
}

/** Routes that need a session (mounted behind requireSession). */
export function protectedAuthRoutes(deps: Deps) {
  const rp = relyingParty(deps.config.publicUrl);

  return (
    new Hono<AppEnv>()
      .get('/passkeys', (c) => c.json({ passkeys: listPasskeys(deps.db) }))
      .post(
        '/passkeys/register/options',
        async (c) =>
          passkeysOff(c, deps) ?? c.json(await startRegistration(deps.db, rp, deps.challenges)),
      )
      .post(
        '/passkeys/register/verify',
        validate('json', passkeyRegistrationVerifyRequestSchema),
        async (c) => {
          const off = passkeysOff(c, deps);
          if (off) return off;
          const { response, name } = c.req.valid('json');
          const passkey = await finishRegistration(
            deps.db,
            rp,
            deps.challenges,
            response as unknown as RegistrationResponseJSON,
            name ?? 'Passkey',
          );
          if (!passkey) return c.json({ error: 'invalid_passkey' }, 400);
          return c.json(passkey, 201);
        },
      )
      .patch('/passkeys/:id', validate('json', renamePasskeyRequestSchema), (c) => {
        const passkey = renamePasskey(deps.db, c.req.param('id'), c.req.valid('json').name);
        return passkey ? c.json(passkey) : c.json({ error: 'not_found' }, 404);
      })
      .delete('/passkeys/:id', (c) =>
        deletePasskey(deps.db, c.req.param('id'))
          ? c.body(null, 204)
          : c.json({ error: 'not_found' }, 404),
      )
      // Sign-in codes by email -----------------------------------------------------------
      .get('/two-factor', (c) =>
        c.json({
          enabled: twoFactorEnabled(deps.db),
          mailReady: mailReady(deps.db, deps.config.mail),
          trustedDevices: listTrustedDevices(deps.db, currentTrustedId(c, deps.db)),
        }),
      )
      // Switching on needs a code that arrived: the mail really works.
      .post('/two-factor/start', async (c) => {
        const account = getAccountRow(deps.db)!;
        const { id, code } = deps.twoFactorCodes.create('enable');
        await deliver(mailContext(deps), codeMail(deps.db, code, 'enable'));
        return c.json({ challengeId: id, sentTo: maskEmail(account.email) });
      })
      .post('/two-factor/enable', validate('json', twoFactorConfirmRequestSchema), (c) => {
        const tooMany = limited(c, deps);
        if (tooMany) return tooMany;
        const { challengeId, code } = c.req.valid('json');
        if (!deps.twoFactorCodes.verify(challengeId, code, 'enable')) {
          return c.json({ error: 'invalid_code' }, 400);
        }
        resetLimit(c, deps);
        setTwoFactor(deps.db, true);
        return c.body(null, 204);
      })
      .post('/two-factor/disable', validate('json', twoFactorDisableRequestSchema), async (c) => {
        const tooMany = limited(c, deps);
        if (tooMany) return tooMany;
        const row = getAccountRow(deps.db)!;
        if (!(await verifyPassword(row.passwordHash, c.req.valid('json').password))) {
          return c.json({ error: 'invalid_current_password' }, 400);
        }
        resetLimit(c, deps);
        setTwoFactor(deps.db, false);
        return c.body(null, 204);
      })
      .delete('/two-factor/devices/:id', (c) =>
        forgetTrustedDevice(deps.db, c.req.param('id'))
          ? c.body(null, 204)
          : c.json({ error: 'not_found' }, 404),
      )
  );
}

export function accountRoutes(deps: Deps) {
  return new Hono<AppEnv>()
    .get('/', (c) => c.json(toAccount(getAccountRow(deps.db)!)))
    .put('/password', validate('json', changePasswordRequestSchema), async (c) => {
      const tooMany = limited(c, deps);
      if (tooMany) return tooMany;
      const { currentPassword, newPassword } = c.req.valid('json');
      const row = getAccountRow(deps.db)!;
      if (!(await verifyPassword(row.passwordHash, currentPassword))) {
        return c.json({ error: 'invalid_current_password' }, 400);
      }
      resetLimit(c, deps);
      await setPassword(deps.db, newPassword);
      deleteAllSessions(deps.db, c.var.session!.id);
      forgetAllTrustedDevices(deps.db);
      return c.body(null, 204);
    });
}
