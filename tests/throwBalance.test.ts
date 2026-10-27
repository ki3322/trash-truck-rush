import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { DIFFICULTY_CONFIG } from '../src/config/difficultyConfig';
import { DIFFICULTIES } from '../src/types';
import { advanceBag, launchVelocity, powerFromCharge, truckRearX, truckShape, truckSpeedAt, type FlightState } from '../src/utils/physics';

const RELEASE_X = C.playerX + C.releaseOffsetX;
const RELEASE_Y = C.groundY + C.releaseOffsetY;

/** Simulate a full throw released at `releaseMs` into the throw phase. */
function simulate(d: (typeof DIFFICULTIES)[number], angle: number, charge: number, releaseMs: number) {
  const cfg = DIFFICULTY_CONFIG[d];
  const startX = RELEASE_X + cfg.truckStartM * C.pxPerMeter - C.truck.lipWidth - cfg.openingWidth / 2;
  const v = launchVelocity(angle, powerFromCharge(charge));
  let s: FlightState = { x: RELEASE_X, y: RELEASE_Y, vx: v.vx, vy: v.vy, bounces: 0 };
  let t = releaseMs;
  for (let i = 0; i < 2000; i++) {
    t += C.simDt * 1000;
    const shape = truckShape(truckRearX(t, startX, cfg.truckSpeed), C.groundY, cfg.openingWidth);
    const res = advanceBag(s, shape, truckSpeedAt(t, cfg.truckSpeed), C.groundY);
    if (res.kind !== 'flying') return res;
    s = res.state;
  }
  return { kind: 'miss' as const, miss: 'ground' as const };
}

describe('throw balance', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}: a range of skilled throws can hit, and timing matters`, () => {
      const hitsAtStart: string[] = [];
      const bankShots: string[] = [];
      const hitsLater: string[] = [];
      for (let angle = C.minAngleDeg; angle <= C.maxAngleDeg; angle += 5) {
        for (let c = 0; c <= 1; c += 0.05) {
          const r = simulate(d, angle, c, 0);
          if (r.kind === 'hit') hitsAtStart.push(`${angle}/${c.toFixed(2)}`);
          if (r.kind === 'hit' && r.state.bounces > 0) bankShots.push(`${angle}/${c.toFixed(2)}`);
          if (simulate(d, angle, c, 4000).kind === 'hit') hitsLater.push(`${angle}/${c.toFixed(2)}`);
        }
      }
      // Achievable but not trivial: some combos hit, most don't.
      expect(hitsAtStart.length).toBeGreaterThan(2);
      expect(hitsLater.length).toBeGreaterThan(2);
      expect(hitsAtStart.length).toBeLessThan(13 * 21 * 0.4);
      // Bounces open up extra (bank-shot) solutions.
      expect(bankShots.length).toBeGreaterThan(0);
      // Waiting changes which throws work (the truck moves).
      expect(hitsLater).not.toEqual(hitsAtStart);
    });
  }
});
