import { GAME_CONFIG } from '../config/gameConfig';
import { clamp } from '../utils/physics';

export interface SlingAim {
  readonly angleDeg: number;
  /** Throw power in [0, 1]. */
  readonly ratio: number;
  /** False inside the dead zone: lifting the finger cancels instead of throwing. */
  readonly armed: boolean;
}

/**
 * Pull-back slingshot: drag away from where you want the bag to go.
 * Pulling left throws right, pulling down throws up; the pull length is the power.
 */
export function aimFromPull(startX: number, startY: number, curX: number, curY: number): SlingAim {
  const c = GAME_CONFIG;
  const pullX = Math.max(0, startX - curX);
  const pullY = Math.max(0, curY - startY);
  const len = Math.hypot(pullX, pullY);
  const armed = len >= c.slingDeadZonePx;
  const rawDeg = (Math.atan2(pullY, pullX) * 180) / Math.PI;
  return {
    angleDeg: clamp(len > 0 ? rawDeg : c.defaultAngleDeg, c.minAngleDeg, c.maxAngleDeg),
    ratio: armed ? clamp((len - c.slingDeadZonePx) / (c.slingMaxPullPx - c.slingDeadZonePx), 0, 1) : 0,
    armed,
  };
}
