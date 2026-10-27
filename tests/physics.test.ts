import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../src/config/gameConfig';
import {
  advanceBag, circleIntersectsRect, contactNormal, launchVelocity, powerFromCharge, predictPath, reflect,
  stepBag, truckRearX, truckShape, truckSpeedAt, metersBetween, willHitSoon, type FlightState,
} from '../src/utils/physics';

const G = GAME_CONFIG.groundY;
const truck = truckShape(400, G, 100);

describe('launch', () => {
  it('45° splits power evenly and points upward', () => {
    const v = launchVelocity(45, 100);
    expect(v.vx).toBeCloseTo(70.71, 1);
    expect(v.vy).toBeCloseTo(-70.71, 1);
  });
  it('maps charge ratio to power range and clamps', () => {
    expect(powerFromCharge(0)).toBe(GAME_CONFIG.minThrowPower);
    expect(powerFromCharge(1)).toBe(GAME_CONFIG.maxThrowPower);
    expect(powerFromCharge(5)).toBe(GAME_CONFIG.maxThrowPower);
  });
});

describe('trajectory', () => {
  it('is deterministic and identical between preview and stepping', () => {
    const start = { x: 0, y: 0, vx: 300, vy: -500 };
    const preview = predictPath(start, 50, 10_000);
    let s = start;
    for (let i = 0; i < 50; i++) s = stepBag(s, GAME_CONFIG.simDt);
    expect(preview[49].x).toBeCloseTo(s.x, 9);
    expect(preview[49].y).toBeCloseTo(s.y, 9);
  });
  it('stops at the ground', () => {
    const path = predictPath({ x: 0, y: G - 10, vx: 100, vy: 0 }, 1000, G);
    expect(path[path.length - 1].y).toBeGreaterThanOrEqual(G);
    expect(path.length).toBeLessThan(1000);
  });
});

const bag = (x: number, y: number, vx: number, vy: number, bounces = 0): FlightState => ({ x, y, vx, vy, bounces });

/** Run a bag against a parked truck until it resolves. */
function play(start: FlightState, truckVx = 0) {
  let s = start;
  const surfaces: string[] = [];
  for (let i = 0; i < 3000; i++) {
    const r = advanceBag(s, truck, truckVx, G);
    if (r.kind !== 'flying') return { ...r, surfaces };
    if (r.bounced) surfaces.push(r.bounced);
    s = r.state;
  }
  throw new Error('never resolved');
}

describe('truck collision and bounces', () => {
  const { left, right } = truck.opening;
  const centre = (left + right) / 2;
  const box = truck.solids.find((s) => s.kind === 'box')!.rect;

  it('a clean drop into the opening is a perfect hit', () => {
    const r = advanceBag(bag(centre, truck.rimY - 3, 0, 600), truck, 0, G);
    expect(r).toMatchObject({ kind: 'hit', perfect: true });
  });
  it('edge-of-opening entries are not perfect', () => {
    const r = advanceBag(bag(left + 12, truck.rimY - 2, 0, 400), truck, 0, G);
    expect(r).toMatchObject({ kind: 'hit', perfect: false });
  });
  it('rising through the rim line is not a hit', () => {
    const r = advanceBag(bag(centre, truck.rimY + 2, 0, -400), truck, 0, G);
    expect(r.kind).not.toBe('hit');
  });
  it('landing on the roof bounces up instead of ending the throw', () => {
    const r = advanceBag(bag(box.x + box.w / 2, box.y - 18, 0, 500), truck, 0, G);
    expect(r).toMatchObject({ kind: 'flying', bounced: 'box' });
    expect(r.state.vy).toBeLessThan(0);
    expect(r.state.y).toBeLessThanOrEqual(box.y - GAME_CONFIG.bagRadius);
    expect(r.state.bounces).toBe(1);
  });
  it('a bag that bounces off the roof backwards can still fall into the truck', () => {
    // Drops onto the rear of the roof while drifting back toward the opening.
    const r = play(bag(box.x + 40, box.y - 100, -60, 0));
    expect(r.kind).toBe('hit');
    expect(r.surfaces).toContain('box');
    expect(r.state.bounces).toBeGreaterThan(0);
  });
  it('a bag can carom off the rim lip and drop in', () => {
    const rim = truck.solids[0].rect;
    // Clips the top of the rear lip and caroms in.
    const r = play(bag(rim.x - 18, rim.y - 60, 100, 0));
    expect(r.kind).toBe('hit');
    expect(r.surfaces).toContain('rim');
  });
  it('hitting the rear side rebounds away from the truck and settles on the ground', () => {
    const r = play(bag(truck.rearX - 40, G - 70, 500, 0));
    expect(r).toMatchObject({ kind: 'miss', miss: 'ground' });
    expect(r.surfaces[0]).toBe('body');
    expect(r.state.x).toBeLessThan(truck.rearX);
  });
  it('short throws bounce on the ground then settle as a ground miss', () => {
    const r = play(bag(100, G - 200, 120, 0));
    expect(r).toMatchObject({ kind: 'miss', miss: 'ground' });
    expect(r.state.y).toBeCloseTo(G - GAME_CONFIG.bagRadius);
  });
  it('landing beyond the truck front settles as overshoot', () => {
    const r = play(bag(truck.frontX + 60, G - 100, 50, 0));
    expect(r).toMatchObject({ kind: 'miss', miss: 'overshoot' });
  });
  it('a bag that runs out of bounces ends the throw', () => {
    const r = advanceBag(bag(box.x + box.w / 2, box.y - 18, 0, 500, GAME_CONFIG.maxBounces), truck, 0, G);
    expect(r).toMatchObject({ kind: 'miss', miss: 'roof' });
  });
  it('bounces happen in the moving truck frame', () => {
    // A truck moving right that meets a bag at rest with its front face pushes it right.
    const v = reflect(0, 0, { x: 1, y: 0 }, 0.5, 1, 100);
    expect(v.vx).toBeCloseTo(150);
    // The rear face moving away from a resting bag never touches it.
    expect(reflect(0, 0, { x: -1, y: 0 }, 0.5, 1, 100)).toEqual({ vx: 0, vy: 0 });
    // Already separating: unchanged.
    expect(reflect(10, -5, { x: 0, y: -1 }, 0.5, 1)).toEqual({ vx: 10, vy: -5 });
  });
  it('contact normals point out of the face that was hit', () => {
    const rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(contactNormal({ x: 5, y: -10 }, { x: 5, y: -2 }, rect)).toEqual({ x: 0, y: -1 });
    expect(contactNormal({ x: -10, y: 5 }, { x: -2, y: 5 }, rect)).toEqual({ x: -1, y: 0 });
    expect(contactNormal({ x: 5, y: -1 }, { x: 5, y: 3 }, rect)).toEqual({ x: 0, y: -1 });
    expect(contactNormal({ x: 5, y: 20 }, { x: 5, y: 8 }, rect)).toEqual({ x: 0, y: 1 });
  });
  it('circle-rect intersection works at edges', () => {
    expect(circleIntersectsRect({ x: -5, y: 5 }, 6, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
    expect(circleIntersectsRect({ x: -7, y: 5 }, 6, { x: 0, y: 0, w: 10, h: 10 })).toBe(false);
  });
});

describe('truck motion', () => {
  it('idles, accelerates, then cruises continuously', () => {
    expect(truckRearX(0, 100, 60)).toBe(100);
    expect(truckRearX(GAME_CONFIG.truckIdleMs, 100, 60)).toBe(100);
    const endAccel = GAME_CONFIG.truckIdleMs + GAME_CONFIG.truckAccelMs;
    const a = truckRearX(endAccel - 1, 100, 60);
    const b = truckRearX(endAccel + 1, 100, 60);
    expect(b - a).toBeCloseTo(0.12, 2);
    expect(truckSpeedAt(endAccel + 100, 60)).toBe(60);
    expect(truckSpeedAt(0, 60)).toBe(0);
  });
  it('converts pixels to metres', () => {
    expect(metersBetween(0, GAME_CONFIG.pxPerMeter * 4)).toBe(4);
  });
});

describe('willHitSoon', () => {
  it('predicts an imminent hit against a parked truck', () => {
    const { left, right } = truck.opening;
    expect(willHitSoon(bag((left + right) / 2, truck.rimY - 30, 0, 200), 0, 400, 60, 100)).toBe(true);
  });
  it('returns false for a bag heading to the ground', () => {
    expect(willHitSoon(bag(50, G - 40, 0, 300), 0, 400, 60, 100)).toBe(false);
  });
});
