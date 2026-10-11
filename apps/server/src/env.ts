import type { ServerConfig } from './config';
import type { Db } from './db/client';
import type { Session } from './auth/sessions';
import type { RateLimiter } from './lib/rate-limit';
import type { ChallengeStore } from './auth/challenges';

/** Everything a request handler may need; created once per app instance. */
export interface Deps {
  db: Db;
  config: Pick<ServerConfig, 'publicUrl' | 'trustProxy' | 'dataDir'>;
  loginLimiter: RateLimiter;
  challenges: ChallengeStore;
}

export interface AppEnv {
  Variables: {
    session: Session | null;
  };
}
