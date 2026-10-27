import { GAME_CONFIG } from '../config/gameConfig';

/** Runner state in the throw phase (immutable). */
export interface ChaseState {
  readonly x: number;
  readonly vx: number;
  readonly stamina: number;
  /** Set when stamina hits zero; cleared once it recovers to staminaMinToRun. */
  readonly exhausted: boolean;
}

export function createChase(x: number): ChaseState {
  return { x, vx: 0, stamina: GAME_CONFIG.staminaMax, exhausted: false };
}

export function canRun(s: ChaseState): boolean {
  return !s.exhausted && s.stamina > 0;
}

/**
 * Advance the runner. Holding run accelerates toward chaseSpeed and drains
 * stamina; letting go (or running dry) decelerates and regenerates it.
 * `maxX` keeps the runner behind the truck and on screen.
 */
export function stepChase(s: ChaseState, wantRun: boolean, dtMs: number, maxX: number): ChaseState {
  const c = GAME_CONFIG;
  const dt = dtMs / 1000;
  const running = wantRun && canRun(s) && s.x < maxX;
  const target = running ? c.chaseSpeed : 0;
  const dv = c.chaseAccel * dt;
  const vx = s.vx < target ? Math.min(target, s.vx + dv) : Math.max(target, s.vx - dv);
  // Never moves backwards, even if maxX drops below the runner.
  const x = Math.max(s.x, Math.min(maxX, s.x + vx * dt));
  const blocked = x >= maxX;
  const stamina = running
    ? Math.max(0, s.stamina - c.staminaDrainPerSec * dt)
    : Math.min(c.staminaMax, s.stamina + c.staminaRegenPerSec * dt);
  const exhausted = stamina <= 0 ? true : s.exhausted && stamina < c.staminaMinToRun;
  return { x, vx: blocked ? 0 : vx, stamina, exhausted };
}
