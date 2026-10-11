import { ChallengeStore } from './auth/challenges';
import type { ServerConfig } from './config';
import type { Db } from './db/client';
import type { Deps } from './env';
import { RateLimiter } from './lib/rate-limit';

export function createDeps(db: Db, config: Pick<ServerConfig, 'publicUrl' | 'trustProxy'>): Deps {
  return {
    db,
    config,
    // 10 sign-in attempts per client per 15 minutes.
    loginLimiter: new RateLimiter(10, 15 * 60 * 1000),
    challenges: new ChallengeStore(),
  };
}
