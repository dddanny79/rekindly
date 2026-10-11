/** One-time WebAuthn challenges with a short lifetime, kept in memory. */
export class ChallengeStore {
  private readonly challenges = new Map<string, number>();

  constructor(
    private readonly ttlMs = 5 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  add(challenge: string) {
    this.prune();
    this.challenges.set(challenge, this.now() + this.ttlMs);
  }

  /** True once per issued, unexpired challenge. */
  consume(challenge: string): boolean {
    const expiresAt = this.challenges.get(challenge);
    this.challenges.delete(challenge);
    return expiresAt !== undefined && expiresAt > this.now();
  }

  private prune() {
    const now = this.now();
    for (const [challenge, expiresAt] of this.challenges) {
      if (expiresAt <= now) this.challenges.delete(challenge);
    }
  }
}
