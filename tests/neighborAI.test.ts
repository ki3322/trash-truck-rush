import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { aimAt, blockingLimit, createNeighbors, recordNeighborHit, stepNeighbors, type ThrowCommand } from '../src/systems/NeighborAI';
import { truckRearX, truckShape, truckSpeedAt } from '../src/utils/physics';
import { advanceBag3, type Flight3 } from '../src/utils/physics3d';
import { createRng } from '../src/utils/rng';

const OPEN = 92;

function fly(cmd: ThrowCommand, tMs: number, startX: number, speed: number): 'hit' | 'miss' {
  let s: Flight3 = { x: cmd.x, y: cmd.y, z: cmd.z, vx: cmd.vx, vy: cmd.vy, vz: cmd.vz, bounces: 0 };
  let t = tMs;
  for (let i = 0; i < 2000; i++) {
    t += C.simDt * 1000;
    const r = advanceBag3(s, truckShape(truckRearX(t, startX, speed), C.groundY, OPEN), truckSpeedAt(t, speed), C.groundY);
    if (r.kind === 'hit') return 'hit';
    if (r.kind === 'miss') return 'miss';
    s = r.state;
  }
  return 'miss';
}

describe('neighbour AI', () => {
  it('creates a seeded crowd with distinct lanes and names', () => {
    const a = createNeighbors(7, 4);
    expect(a).toEqual(createNeighbors(7, 4));
    expect(new Set(a.map((n) => n.z)).size).toBe(4);
    expect(createNeighbors(7, 99)).toHaveLength(5);
    expect(createNeighbors(7, 0)).toEqual([]);
  });

  it('perfect ballistic aim lands in a parked truck from every lane', () => {
    const rearX = 420;
    for (const z of [-150, -70, 0, 70, 150]) {
      const aim = aimAt(150, z, { rearX, speed: 0, openingWidth: OPEN }, 50)!;
      expect(aim).not.toBeNull();
      const res = fly({ neighborId: 0, x: 150, y: C.groundY + C.releaseOffsetY, z, ...aim }, 0, rearX, 0);
      expect(res).toBe('hit');
    }
  });

  it('perfect aim also leads a moving truck', () => {
    const startX = 360;
    const tMs = C.truckIdleMs + C.truckAccelMs + 500; // cruising
    const speed = 65;
    const rearX = truckRearX(tMs, startX, speed);
    const aim = aimAt(150, 70, { rearX, speed, openingWidth: OPEN }, 48)!;
    expect(fly({ neighborId: 0, x: 150, y: C.groundY + C.releaseOffsetY, z: 70, ...aim }, tMs, startX, speed)).toBe('hit');
  });

  it('a simulated crowd chases, throws its bags, and lands some but not all', () => {
    let hits = 0;
    let total = 0;
    for (let seed = 0; seed < 40; seed++) {
      let crowd = createNeighbors(seed, 4);
      const rng = createRng(seed);
      const startX = 330;
      const speed = 65;
      for (let t = 0; t < 9000; t += 16) {
        const rearX = truckRearX(t, startX, speed);
        const res = stepNeighbors(crowd, t, 16, { rearX, speed: truckSpeedAt(t, speed), openingWidth: OPEN }, rng);
        crowd = res.neighbors;
        for (const cmd of res.throws) {
          total++;
          if (fly(cmd, t, startX, speed) === 'hit') {
            hits++;
            crowd = recordNeighborHit(crowd, cmd.neighborId);
          }
        }
      }
      expect(crowd.every((n) => n.x <= C.chaseMaxX)).toBe(true);
    }
    expect(total).toBeGreaterThan(40 * 3); // most neighbours get their throws off
    const rate = hits / total;
    expect(rate).toBeGreaterThan(0.2); // they're a real threat…
    expect(rate).toBeLessThan(0.85); // …but miss often enough to be funny
  });

  it('a neighbour in your lane blocks you', () => {
    const crowd = createNeighbors(1, 4).map((n) => ({ ...n, x: 300 }));
    const sameLane = crowd.find((n) => n.z === C.playerLaneZ)!;
    expect(blockingLimit(crowd, 200, C.playerLaneZ)).toBe(sameLane.x - 45);
    expect(blockingLimit(crowd, 200, 999)).toBe(Infinity);
    expect(blockingLimit(crowd, 400, C.playerLaneZ)).toBe(Infinity);
  });
});
