import { eq } from 'drizzle-orm';
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { APP_NAME, type Passkey } from '@app/shared';
import type { Db } from '../db/client';
import { passkeys } from '../db/schema';
import type { ChallengeStore } from './challenges';
import { getAccountRow } from './account';

type PasskeyRow = typeof passkeys.$inferSelect;

export interface RelyingParty {
  /** Host name of PUBLIC_URL. */
  id: string;
  /** Origin of PUBLIC_URL. */
  origin: string;
}

export const relyingParty = (publicUrl: URL): RelyingParty => ({
  id: publicUrl.hostname,
  origin: publicUrl.origin,
});

// EdDSA, ES256, RS256. Explicit so SimpleWebAuthn does not probe experimental
// post-quantum algorithms in Node (which logs ExperimentalWarnings).
const ALGORITHMS = [-8, -7, -257];

// One account per instance, so the WebAuthn user handle is a constant.
const USER_ID = new TextEncoder().encode('account');

export function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    name: row.name,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

export function listPasskeys(db: Db): Passkey[] {
  return db.select().from(passkeys).orderBy(passkeys.createdAt).all().map(toPasskey);
}

export function renamePasskey(db: Db, id: string, name: string): Passkey | null {
  const row = db.update(passkeys).set({ name }).where(eq(passkeys.id, id)).returning().get();
  return row ? toPasskey(row) : null;
}

/** Removing a credential is an auth setting, not user data, so it is a real delete. */
export function deletePasskey(db: Db, id: string): boolean {
  return db.delete(passkeys).where(eq(passkeys.id, id)).run().changes > 0;
}

export async function startRegistration(db: Db, rp: RelyingParty, challenges: ChallengeStore) {
  const owner = getAccountRow(db)!;
  const options = await generateRegistrationOptions({
    rpName: APP_NAME,
    rpID: rp.id,
    userID: USER_ID,
    userName: owner.email,
    userDisplayName: owner.name,
    excludeCredentials: db
      .select({ id: passkeys.id, transports: passkeys.transports })
      .from(passkeys)
      .all()
      .map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    supportedAlgorithmIDs: ALGORITHMS,
  });
  challenges.add(options.challenge);
  return options;
}

export async function finishRegistration(
  db: Db,
  rp: RelyingParty,
  challenges: ChallengeStore,
  response: RegistrationResponseJSON,
  name: string,
): Promise<Passkey | null> {
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) => challenges.consume(challenge),
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: false,
      supportedAlgorithmIDs: ALGORITHMS,
    });
  } catch {
    return null;
  }
  if (!verification.verified) return null;
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const row = db
    .insert(passkeys)
    .values({
      id: credential.id,
      name,
      publicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    })
    .onConflictDoNothing()
    .returning()
    .get();
  return row ? toPasskey(row) : null;
}

export async function startLogin(rp: RelyingParty, challenges: ChallengeStore) {
  // No allowCredentials: passkeys are discoverable, the browser offers them.
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'preferred',
  });
  challenges.add(options.challenge);
  return options;
}

/** Returns true if the assertion belongs to a stored passkey and verifies. */
export async function finishLogin(
  db: Db,
  rp: RelyingParty,
  challenges: ChallengeStore,
  response: AuthenticationResponseJSON,
): Promise<boolean> {
  const row = db.select().from(passkeys).where(eq(passkeys.id, response.id)).get();
  if (!row) return false;
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => challenges.consume(challenge),
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: row.id,
        publicKey: new Uint8Array(row.publicKey),
        counter: row.counter,
        transports: row.transports ?? undefined,
      },
      requireUserVerification: false,
    });
  } catch {
    return false;
  }
  if (!verification.verified) return false;
  db.update(passkeys)
    .set({
      counter: verification.authenticationInfo.newCounter,
      backedUp: verification.authenticationInfo.credentialBackedUp,
      lastUsedAt: new Date().toISOString(),
    })
    .where(eq(passkeys.id, row.id))
    .run();
  return true;
}
