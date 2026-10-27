import { GAME_CONFIG } from '../config/gameConfig';
import type { MissKind } from '../types';
import {
  advanceBag, circleIntersectsRect, clamp, stepBag, truckRearX, truckShape, truckSpeedAt,
  type FlightState, type StepResult, type Surface, type TruckShape,
} from './physics';

/**
 * 3D throw = the tested 2D model in the vertical plane along the street
 * (x forward, y down) plus a sideways axis z. The truck drives along z = 0.
 */
export interface Flight3 extends FlightState {
  readonly z: number;
  readonly vz: number;
}

export type Step3Result =
  | { readonly kind: 'flying'; readonly state: Flight3; readonly bounced: Surface | null }
  | { readonly kind: 'hit'; readonly state: Flight3; readonly x: number; readonly perfect: boolean }
  | { readonly kind: 'miss'; readonly state: Flight3; readonly miss: MissKind };

export interface Lane {
  /** Truck centre line (z) and half widths. */
  readonly truckZ: number;
  readonly halfWidth: number;
  readonly openingHalfWidth: number;
}

export const DEFAULT_LANE: Lane = {
  truckZ: 0,
  halfWidth: GAME_CONFIG.truckHalfWidth,
  openingHalfWidth: GAME_CONFIG.openingHalfWidth,
};

/** pitch = up/down angle, yaw = left/right angle (0 = straight down the street). */
export function launchVelocity3(pitchDeg: number, yawDeg: number, power: number): { vx: number; vy: number; vz: number } {
  const p = (pitchDeg * Math.PI) / 180;
  const y = (yawDeg * Math.PI) / 180;
  const horizontal = Math.cos(p) * power;
  return { vx: Math.cos(y) * horizontal, vy: -Math.sin(p) * power, vz: Math.sin(y) * horizontal };
}

/** A truck far away: lets the 2D step handle only gravity and ground bounces. */
function emptyRoad(groundY: number): TruckShape {
  return truckShape(1e9, groundY, 1);
}

function inside(z: number, centre: number, half: number): boolean {
  return Math.abs(z - centre) <= half;
}

const withZ = (s: FlightState, z: number, vz: number): Flight3 => ({ ...s, z, vz });

/**
 * Advance one fixed step. Sideways the bag either flies past the truck
 * (only ground bounces apply) or is within its width (2D truck collisions,
 * incl. bounces). Entering the opening also requires being within the
 * opening's width; landing on the rim strip beside it bounces like the rim.
 */
export function advanceBag3(
  s: Flight3,
  truck: TruckShape,
  truckVx: number,
  groundY: number,
  lane: Lane = DEFAULT_LANE,
  dt: number = GAME_CONFIG.simDt,
): Step3Result {
  const C = GAME_CONFIG;
  const r = C.bagRadius;
  const z = s.z + s.vz * dt;
  const wasBeside = !inside(s.z, lane.truckZ, lane.halfWidth + r);
  const nowBeside = !inside(z, lane.truckZ, lane.halfWidth + r);

  // Crossing into the truck's width while level with its body = hit a side wall.
  if (wasBeside && !nowBeside) {
    const planar = stepBag(s, dt);
    const solid = truck.solids.find((so) => circleIntersectsRect(planar, r, so.rect));
    if (solid) {
      const vz = -s.vz * C.truckRestitution;
      const sideZ = lane.truckZ + Math.sign(s.z - lane.truckZ) * (lane.halfWidth + r);
      const state: Flight3 = { ...planar, z: sideZ, vz, vx: planar.vx * C.truckFriction, bounces: s.bounces + 1 };
      if (state.bounces > C.maxBounces) return { kind: 'miss', state, miss: 'body' };
      return { kind: 'flying', state, bounced: 'body' };
    }
  }

  const shape = nowBeside ? emptyRoad(groundY) : truck;
  const res: StepResult = advanceBag(s, shape, truckVx, groundY, dt);

  if (res.kind === 'hit') {
    if (inside(z, lane.truckZ, lane.openingHalfWidth)) {
      return { kind: 'hit', state: withZ(res.state, z, s.vz), x: res.x, perfect: res.perfect && inside(z, lane.truckZ, lane.openingHalfWidth * 0.5) };
    }
    // Over the rim strip beside the opening: bounce back up like the rim lip.
    const vy = -Math.abs(res.state.vy) * C.truckRestitution;
    const state: Flight3 = { ...res.state, y: truck.rimY - r, vy, z, vz: s.vz * C.truckFriction, bounces: s.bounces + 1 };
    if (state.bounces > C.maxBounces) return { kind: 'miss', state, miss: 'rim' };
    return { kind: 'flying', state, bounced: 'rim' };
  }

  const bounced = res.kind === 'flying' ? res.bounced : null;
  const friction = bounced === 'ground' ? C.groundFriction : bounced ? C.truckFriction : 1;
  const state = withZ(res.state, z, s.vz * friction);
  if (res.kind === 'miss') {
    // Flew past the truck's side: classify by where it ended up.
    const miss: MissKind = nowBeside && res.miss !== 'overshoot' && res.state.x > truck.rearX ? 'body' : res.miss;
    return { kind: 'miss', state, miss: nowBeside && res.state.x > truck.frontX ? 'overshoot' : miss };
  }
  return { kind: 'flying', state, bounced };
}

/** Predicted path (positions only) for the aim preview, ignoring the truck. */
export function predictPath3(start: Flight3, steps: number, groundY: number, dt: number = GAME_CONFIG.simDt) {
  const pts: { x: number; y: number; z: number }[] = [];
  let s = start;
  for (let i = 0; i < steps; i++) {
    s = { ...stepBag(s, dt), z: s.z + s.vz * dt };
    pts.push({ x: s.x, y: s.y, z: s.z });
    if (s.y >= groundY) break;
  }
  return pts;
}

/** Look ahead a short time with the moving truck: will this bag go in? */
export function willHitSoon3(
  bag: Flight3,
  truckTimeMs: number,
  truckStartX: number,
  truckSpeed: number,
  openingWidth: number,
  lane: Lane = DEFAULT_LANE,
  lookaheadSec: number = GAME_CONFIG.slowMoLookaheadSec,
): boolean {
  const dt = GAME_CONFIG.simDt;
  const g = GAME_CONFIG.groundY;
  let s = bag;
  let t = truckTimeMs;
  for (let i = 0; i < Math.ceil(lookaheadSec / dt); i++) {
    t += dt * 1000;
    const res = advanceBag3(s, truckShape(truckRearX(t, truckStartX, truckSpeed), g, openingWidth), truckSpeedAt(t, truckSpeed), g, lane, dt);
    if (res.kind === 'hit') return true;
    if (res.kind === 'miss') return false;
    s = res.state;
  }
  return false;
}

export function clampYaw(yawDeg: number): number {
  return clamp(yawDeg, -GAME_CONFIG.maxYawDeg, GAME_CONFIG.maxYawDeg);
}
