import { describe, expect, it } from 'vitest';
import { GAME_CONFIG as C } from '../src/config/gameConfig';
import { DIFFICULTY_CONFIG } from '../src/config/difficultyConfig';
import { DIFFICULTIES } from '../src/types';
import { advanceBag, launchVelocity, powerFromCharge, truckRearX, truckShape, truckSpeedAt } from '../src/utils/physics';
import { DEFAULT_LANE, advanceBag3, clampYaw, launchVelocity3, predictPath3, willHitSoon3, type Flight3 } from '../src/utils/physics3d';

const G = C.groundY;
const truck = truckShape(400, G, 100);
const f3 = (x: number, y: number, vx: number, vy: number, z = 0, vz = 0, bounces = 0): Flight3 => ({ x, y, vx, vy, z, vz, bounces });

function play(start: Flight3, t = truck) {
  let s = start;
  const surfaces: string[] = [];
  for (let i = 0; i < 4000; i++) {
    const r = advanceBag3(s, t, 0, G);
    if (r.kind !== 'flying') return { ...r, surfaces };
    if (r.bounced) surfaces.push(r.bounced);
    s = r.state;
  }
  throw new Error('never resolved');
}

describe('3D launch', () => {
  it('yaw 0 matches the 2D launch', () => {
    const v3 = launchVelocity3(40, 0, 600);
    const v2 = launchVelocity(40, 600);
    expect(v3.vx).toBeCloseTo(v2.vx);
    expect(v3.vy).toBeCloseTo(v2.vy);
    expect(v3.vz).toBeCloseTo(0);
  });
  it('yaw splits horizontal speed sideways', () => {
    const v = launchVelocity3(0, 30, 100);
    expect(v.vz).toBeCloseTo(50);
    expect(Math.hypot(v.vx, v.vz)).toBeCloseTo(100);
  });
  it('clamps yaw', () => {
    expect(clampYaw(99)).toBe(C.maxYawDeg);
    expect(clampYaw(-99)).toBe(-C.maxYawDeg);
  });
});

describe('3D collisions', () => {
  const { left, right } = truck.opening;
  const centre = (left + right) / 2;

  it('down the centre line it behaves exactly like the 2D model', () => {
    let s3 = f3(116, 918, 300, -560);
    let s2 = { x: 116, y: 918, vx: 300, vy: -560, bounces: 0 };
    for (let i = 0; i < 400; i++) {
      const a = advanceBag3(s3, truck, 0, G);
      const b = advanceBag(s2, truck, 0, G);
      expect(a.kind).toBe(b.kind);
      expect(a.state.x).toBeCloseTo(b.state.x, 6);
      expect(a.state.y).toBeCloseTo(b.state.y, 6);
      if (a.kind !== 'flying') break;
      s3 = a.state;
      s2 = b.state;
    }
  });
  it('a drop inside the opening width is a hit', () => {
    expect(advanceBag3(f3(centre, truck.rimY - 3, 0, 600, 10), truck, 0, G)).toMatchObject({ kind: 'hit' });
  });
  it('a drop over the rim strip beside the opening bounces up instead', () => {
    const z = (C.openingHalfWidth + C.truckHalfWidth) / 2;
    const r = advanceBag3(f3(centre, truck.rimY - 3, 0, 600, z), truck, 0, G);
    expect(r).toMatchObject({ kind: 'flying', bounced: 'rim' });
    expect(r.state.vy).toBeLessThan(0);
  });
  it('a bag passing beside the truck never touches it', () => {
    const r = play(f3(centre, truck.rimY - 40, 0, 0, 200));
    expect(r.kind).toBe('miss');
    expect(r.surfaces.every((s) => s === 'ground')).toBe(true);
  });
  it('flying sideways into the truck body bounces off its side wall', () => {
    const box = truck.solids.find((s) => s.kind === 'box')!.rect;
    const z = C.truckHalfWidth + C.bagRadius + 2;
    const r = advanceBag3(f3(box.x + 40, box.y + 60, 0, 0, z, -400), truck, 0, G);
    expect(r).toMatchObject({ kind: 'flying', bounced: 'body' });
    expect(r.state.vz).toBeGreaterThan(0);
    expect(Math.abs(r.state.z)).toBeGreaterThanOrEqual(C.truckHalfWidth + C.bagRadius - 0.01);
  });
  it('predicts a 3D path that drifts sideways and ends at the ground', () => {
    const pts = predictPath3(f3(0, G - 100, 100, -200, 0, 50), 500, G);
    expect(pts[pts.length - 1].y).toBeGreaterThanOrEqual(G);
    expect(pts[pts.length - 1].z).toBeGreaterThan(0);
  });
  it('lookahead spots an imminent hit', () => {
    expect(willHitSoon3(f3(centre, truck.rimY - 30, 0, 200), 0, 400, 60, 100)).toBe(true);
    expect(willHitSoon3(f3(centre, truck.rimY - 30, 0, 200, 300), 0, 400, 60, 100)).toBe(false);
  });
});

describe('3D throw balance (from the side lane)', () => {
  for (const d of DIFFICULTIES) {
    it(`${d}: hits exist only with the right sideways aim`, () => {
      const cfg = DIFFICULTY_CONFIG[d];
      const releaseX = C.playerX + C.releaseOffsetX;
      const startX = releaseX + cfg.truckStartM * C.pxPerMeter - C.truck.lipWidth - cfg.openingWidth / 2;
      let hits = 0;
      let straightHits = 0;
      for (let pitch = 20; pitch <= 75; pitch += 5) {
        for (let yaw = -C.maxYawDeg; yaw <= C.maxYawDeg; yaw += 2) {
          for (let c = 0; c <= 1; c += 0.05) {
            const v = launchVelocity3(pitch, yaw, powerFromCharge(c));
            let s: Flight3 = { x: releaseX, y: C.groundY + C.releaseOffsetY, z: C.playerLaneZ, ...v, bounces: 0 };
            let t = 0;
            for (let i = 0; i < 1500; i++) {
              t += C.simDt * 1000;
              const r = advanceBag3(s, truckShape(truckRearX(t, startX, cfg.truckSpeed), G, cfg.openingWidth), truckSpeedAt(t, cfg.truckSpeed), G, DEFAULT_LANE);
              if (r.kind === 'hit') { hits++; if (yaw === 0) straightHits++; break; }
              if (r.kind === 'miss') break;
              s = r.state;
            }
          }
        }
      }
      expect(hits).toBeGreaterThan(3);
      // Standing off-centre, throwing dead straight should rarely work: aiming sideways matters.
      expect(straightHits).toBeLessThan(hits / 4);
    });
  }
});
