/** Immutable countdown clock driven by scene update deltas (no lingering timers). */
export interface GameClock {
  readonly totalMs: number;
  readonly elapsedMs: number;
  readonly penaltyMs: number;
  readonly running: boolean;
}

export function createClock(totalMs: number, elapsedMs = 0, penaltyMs = 0): GameClock {
  return { totalMs, elapsedMs, penaltyMs, running: false };
}

export function startClock(c: GameClock): GameClock {
  return { ...c, running: true };
}

export function pauseClock(c: GameClock): GameClock {
  return { ...c, running: false };
}

export function tickClock(c: GameClock, deltaMs: number): GameClock {
  if (!c.running || deltaMs <= 0) return c;
  return { ...c, elapsedMs: c.elapsedMs + deltaMs };
}

export function penalize(c: GameClock, ms: number): GameClock {
  return { ...c, penaltyMs: c.penaltyMs + Math.max(0, ms) };
}

export function remainingMs(c: GameClock): number {
  return Math.max(0, c.totalMs - c.elapsedMs - c.penaltyMs);
}

export function isExpired(c: GameClock): boolean {
  return remainingMs(c) <= 0;
}
