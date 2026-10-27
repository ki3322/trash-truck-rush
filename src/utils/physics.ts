import { GAME_CONFIG } from '../config/gameConfig';
import type { MissKind } from '../types';

/**
 * Deterministic 2D projectile + truck collision model.
 * The aim preview and the real flight both use `stepBag`, so what the
 * dashed line shows is exactly what the bag does.
 */

export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface BagState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type SolidKind = 'rim' | 'box' | 'cab' | 'body';

export interface TruckShape {
  readonly rearX: number;
  readonly frontX: number;
  readonly rimY: number;
  readonly opening: { readonly left: number; readonly right: number };
  readonly solids: readonly { readonly kind: SolidKind; readonly rect: Rect }[];
}

/** A bag in flight; `bounces` counts rebounds off the truck or the ground. */
export interface FlightState extends BagState {
  readonly bounces: number;
}

export type Surface = SolidKind | 'ground';

export type StepResult =
  | { readonly kind: 'flying'; readonly state: FlightState; readonly bounced: Surface | null }
  | { readonly kind: 'hit'; readonly state: FlightState; readonly x: number; readonly perfect: boolean }
  | { readonly kind: 'miss'; readonly state: FlightState; readonly miss: MissKind };

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function launchVelocity(angleDeg: number, power: number): { vx: number; vy: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { vx: Math.cos(rad) * power, vy: -Math.sin(rad) * power };
}

/** Power for a charge ratio in [0, 1]. */
export function powerFromCharge(ratio: number): number {
  const r = clamp(ratio, 0, 1);
  return GAME_CONFIG.minThrowPower + (GAME_CONFIG.maxThrowPower - GAME_CONFIG.minThrowPower) * r;
}

/** Semi-implicit Euler step — stable and identical for preview and flight. */
export function stepBag<T extends BagState>(s: T, dt: number, gravity: number = GAME_CONFIG.gravity): T {
  const vy = s.vy + gravity * dt;
  return { ...s, x: s.x + s.vx * dt, y: s.y + vy * dt, vy };
}

export function predictPath(
  start: BagState,
  steps: number,
  groundY: number,
  dt: number = GAME_CONFIG.simDt,
): Vec[] {
  const points: Vec[] = [];
  let s = start;
  for (let i = 0; i < steps; i++) {
    s = stepBag(s, dt);
    points.push({ x: s.x, y: s.y });
    if (s.y >= groundY) break;
  }
  return points;
}

export function truckShape(rearX: number, groundY: number, openingWidth: number): TruckShape {
  const t = GAME_CONFIG.truck;
  const rimY = groundY - t.rimHeight;
  const openLeft = rearX + t.lipWidth;
  const openRight = openLeft + openingWidth;
  const boxX = openRight + t.lipWidth;
  const cabX = boxX + t.boxWidth;
  const frontX = cabX + t.cabWidth;
  const bodyTop = rimY + t.lipHeight;
  const bodyBottom = groundY - t.chassisClearance;
  return {
    rearX,
    frontX,
    rimY,
    opening: { left: openLeft, right: openRight },
    solids: [
      { kind: 'rim', rect: { x: rearX, y: rimY, w: t.lipWidth, h: t.lipHeight } },
      { kind: 'rim', rect: { x: openRight, y: rimY, w: t.lipWidth, h: t.lipHeight } },
      { kind: 'box', rect: { x: boxX, y: groundY - t.boxHeight, w: t.boxWidth, h: t.boxHeight - t.chassisClearance } },
      { kind: 'cab', rect: { x: cabX, y: groundY - t.cabHeight, w: t.cabWidth, h: t.cabHeight - t.chassisClearance } },
      { kind: 'body', rect: { x: rearX, y: bodyTop, w: frontX - rearX, h: bodyBottom - bodyTop } },
    ],
  };
}

export function circleIntersectsRect(c: Vec, r: number, rect: Rect): boolean {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  const dx = c.x - nx;
  const dy = c.y - ny;
  return dx * dx + dy * dy < r * r;
}

/** Downward crossing of the rim line inside the opening = in the truck. */
function checkEntry(prev: Vec, cur: Vec, truck: TruckShape, radius: number, perfectRatio: number) {
  if (!(prev.y < truck.rimY && cur.y >= truck.rimY)) return null;
  const t = (truck.rimY - prev.y) / (cur.y - prev.y);
  const crossX = prev.x + (cur.x - prev.x) * t;
  const margin = radius * 0.3;
  const { left, right } = truck.opening;
  if (crossX < left + margin || crossX > right - margin) return null;
  const centre = (left + right) / 2;
  return { x: crossX, perfect: Math.abs(crossX - centre) <= ((right - left) * perfectRatio) / 2 };
}

/** Outward surface normal at the contact between a circle and a rect. */
export function contactNormal(prev: Vec, cur: Vec, rect: Rect): Vec {
  const nx = clamp(cur.x, rect.x, rect.x + rect.w);
  const ny = clamp(cur.y, rect.y, rect.y + rect.h);
  const dx = cur.x - nx;
  const dy = cur.y - ny;
  const d = Math.hypot(dx, dy);
  if (d > 1e-6) return { x: dx / d, y: dy / d };
  // Centre already inside: use the side it came from.
  if (prev.y <= rect.y) return { x: 0, y: -1 };
  if (prev.y >= rect.y + rect.h) return { x: 0, y: 1 };
  return prev.x <= rect.x ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

/**
 * Reflect velocity about `n` in a frame moving at `frameVx` (the truck), with
 * restitution on the normal part and friction on the tangential part.
 */
export function reflect(vx: number, vy: number, n: Vec, restitution: number, friction: number, frameVx = 0): { vx: number; vy: number } {
  const rvx = vx - frameVx;
  const vn = rvx * n.x + vy * n.y;
  if (vn >= 0) return { vx, vy }; // already separating
  const tx = -n.y;
  const ty = n.x;
  const vt = rvx * tx + vy * ty;
  const outN = -vn * restitution;
  const outT = vt * friction;
  return { vx: n.x * outN + tx * outT + frameVx, vy: n.y * outN + ty * outT };
}

function pushOut(cur: Vec, rect: Rect, n: Vec, radius: number): Vec {
  if (n.x === 0) return { x: cur.x, y: n.y < 0 ? rect.y - radius : rect.y + rect.h + radius };
  if (n.y === 0) return { x: n.x < 0 ? rect.x - radius : rect.x + rect.w + radius, y: cur.y };
  const nx = clamp(cur.x, rect.x, rect.x + rect.w);
  const ny = clamp(cur.y, rect.y, rect.y + rect.h);
  return { x: nx + n.x * radius, y: ny + n.y * radius };
}

function missFor(surface: Surface, n: Vec, x: number, truck: TruckShape): MissKind {
  if (surface === 'ground') return x > truck.frontX ? 'overshoot' : 'ground';
  if (surface === 'rim') return 'rim';
  if ((surface === 'box' || surface === 'cab') && n.y < -0.5) return 'roof';
  return 'body';
}

/**
 * Advance a flying bag by one fixed step against the (moving) truck.
 * Contacts bounce instead of ending the throw, so a bag can carom off the
 * roof or the rim and still drop in. The throw ends when the bag enters the
 * opening (hit), stops bouncing, or runs out of bounces (miss).
 */
export function advanceBag(
  s: FlightState,
  truck: TruckShape,
  truckVx: number,
  groundY: number,
  dt: number = GAME_CONFIG.simDt,
): StepResult {
  const C = GAME_CONFIG;
  const r = C.bagRadius;
  const next = stepBag(s, dt);

  const entry = checkEntry(s, next, truck, r, C.perfectZoneRatio);
  if (entry) return { kind: 'hit', state: next, x: entry.x, perfect: entry.perfect };

  for (const solid of truck.solids) {
    if (!circleIntersectsRect(next, r, solid.rect)) continue;
    const n = contactNormal(s, next, solid.rect);
    const v = reflect(next.vx, next.vy, n, C.truckRestitution, C.truckFriction, truckVx);
    const pos = pushOut(next, solid.rect, n, r);
    const state: FlightState = { x: pos.x, y: pos.y, vx: v.vx, vy: v.vy, bounces: s.bounces + 1 };
    if (state.bounces > C.maxBounces) return { kind: 'miss', state, miss: missFor(solid.kind, n, pos.x, truck) };
    return { kind: 'flying', state, bounced: solid.kind };
  }

  if (next.y + r >= groundY) {
    const v = reflect(next.vx, next.vy, { x: 0, y: -1 }, C.groundRestitution, C.groundFriction);
    const state: FlightState = { x: next.x, y: groundY - r, vx: v.vx, vy: v.vy, bounces: s.bounces + 1 };
    if (Math.abs(v.vy) < C.settleSpeed || state.bounces > C.maxBounces) {
      return { kind: 'miss', state, miss: missFor('ground', { x: 0, y: -1 }, next.x, truck) };
    }
    return { kind: 'flying', state, bounced: 'ground' };
  }
  return { kind: 'flying', state: next, bounced: null };
}

/** Truck rear x at time t (ms since the throw phase started). */
export function truckRearX(
  tMs: number,
  startX: number,
  speed: number,
  idleMs: number = GAME_CONFIG.truckIdleMs,
  accelMs: number = GAME_CONFIG.truckAccelMs,
): number {
  if (tMs <= idleMs) return startX;
  const moving = tMs - idleMs;
  if (moving <= accelMs) {
    // Constant acceleration from 0 to `speed` over accelMs.
    return startX + (0.5 * speed * moving * moving) / accelMs / 1000;
  }
  const accelDist = (0.5 * speed * accelMs) / 1000;
  return startX + accelDist + (speed * (moving - accelMs)) / 1000;
}

export function truckSpeedAt(
  tMs: number,
  speed: number,
  idleMs: number = GAME_CONFIG.truckIdleMs,
  accelMs: number = GAME_CONFIG.truckAccelMs,
): number {
  if (tMs <= idleMs) return 0;
  return speed * Math.min(1, (tMs - idleMs) / accelMs);
}

export function metersBetween(x1: number, x2: number): number {
  return Math.abs(x2 - x1) / GAME_CONFIG.pxPerMeter;
}

/**
 * Simulate forward a short time to see whether the bag is about to land in
 * the truck (bounces included); used only to start the slow-motion camera.
 */
export function willHitSoon(
  bag: FlightState,
  truckTimeMs: number,
  truckStartX: number,
  truckSpeed: number,
  openingWidth: number,
  lookaheadSec: number = GAME_CONFIG.slowMoLookaheadSec,
): boolean {
  const dt = GAME_CONFIG.simDt;
  const groundY = GAME_CONFIG.groundY;
  let s = bag;
  let t = truckTimeMs;
  for (let i = 0; i < Math.ceil(lookaheadSec / dt); i++) {
    t += dt * 1000;
    const shape = truckShape(truckRearX(t, truckStartX, truckSpeed), groundY, openingWidth);
    const res = advanceBag(s, shape, truckSpeedAt(t, truckSpeed), groundY, dt);
    if (res.kind === 'hit') return true;
    if (res.kind === 'miss') return false;
    s = res.state;
  }
  return false;
}
