import type { ServerConfig } from './config';
import type { Db } from './db/client';
import type { Session } from './auth/sessions';
import type { ApiTokenRow } from './api-tokens/service';
import type { RateLimiter } from './lib/rate-limit';
import type { ChallengeStore } from './auth/challenges';
import type { TwoFactorCodes } from './auth/two-factor';

/** Everything a request handler may need; created once per app instance. */
export interface Deps {
  db: Db;
  config: Pick<ServerConfig, 'publicUrl' | 'trustProxy' | 'dataDir' | 'appSecret' | 'mail'>;
  /** Key for secrets stored in the database (created on first use). */
  secretKey: () => Buffer;
  loginLimiter: RateLimiter;
  challenges: ChallengeStore;
  /** Emailed sign-in codes waiting to be entered. */
  twoFactorCodes: TwoFactorCodes;
}

export interface AppEnv {
  Variables: {
    session: Session | null;
    /** Set when the request authenticates with an API token instead of a session. */
    apiToken: ApiTokenRow | null;
  };
}
