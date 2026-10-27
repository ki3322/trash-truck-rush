import { GAME_CONFIG } from '../config/gameConfig';
import type { Segment } from './stairPath';

/**
 * 3D layout of the same zig-zag path (metres). Flights alternate between two
 * side-by-side lanes (z = 0 and z = -LANE_GAP) joined by U-turn landings, so
 * the stairwell reads like a real Taiwanese walk-up. Progress units are the
 * same as the 2D path, so all game rules are unchanged.
 */
export const STEP_RISE = 0.22;
export const STEP_RUN = 0.34;
export const LANE_GAP = 1.5;
export const TURN_OUT = 0.9;
export const FLIGHT_RUN = GAME_CONFIG.stepsPerFlight * STEP_RUN;
export const FLIGHT_DROP = GAME_CONFIG.stepsPerFlight * STEP_RISE;
export const FLOOR_HEIGHT = FLIGHT_DROP * 2;

export interface Pose3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Walking direction (radians around +y; 0 = +x). */
  readonly heading: number;
}

/** Height (y) of the landing where `floor` starts, with 1F at y = 0. */
export function floorY3(floor: number): number {
  return (floor - 1) * FLOOR_HEIGHT;
}

export function pose3At(segments: readonly Segment[], startFloor: number, progress: number): Pose3 {
  const last = segments[segments.length - 1];
  const end = last.startUnit + last.units;
  const p = Math.min(Math.max(progress, 0), end);
  const idx = segments.findIndex((s) => p >= s.startUnit && p < s.startUnit + s.units);
  const i = idx === -1 ? segments.length - 1 : idx;
  const seg = segments[i];
  const t = Math.min(1, (p - seg.startUnit) / seg.units);
  // Flights before this segment determine height and lane.
  const flightsBefore = segments.slice(0, i).filter((s) => s.kind === 'flight').length;
  const topY = floorY3(startFloor) - flightsBefore * FLIGHT_DROP;
  const laneOf = (n: number) => (n % 2 === 0 ? 0 : -LANE_GAP);

  if (seg.kind === 'flight') {
    const goingRight = seg.dir > 0;
    const stepT = Math.floor(t * seg.units) / seg.units;
    const frac = t * seg.units - Math.floor(t * seg.units);
    const hop = Math.sin(frac * Math.PI) * 0.12;
    return {
      x: goingRight ? t * FLIGHT_RUN : FLIGHT_RUN - t * FLIGHT_RUN,
      y: topY - stepT * FLIGHT_DROP + hop,
      z: laneOf(flightsBefore),
      heading: goingRight ? 0 : Math.PI,
    };
  }
  if (seg.turn) {
    // U-turn at the end of the previous flight, swinging over to the other lane.
    const atRight = flightsBefore % 2 === 1;
    const edge = atRight ? FLIGHT_RUN : 0;
    const outDir = atRight ? 1 : -1;
    const zFrom = laneOf(flightsBefore - 1);
    const zTo = laneOf(flightsBefore);
    const a = t * Math.PI;
    return {
      x: edge + outDir * Math.sin(a) * TURN_OUT,
      y: topY,
      z: zFrom + (zTo - zFrom) * (1 - Math.cos(a)) / 2,
      heading: Math.atan2((zTo - zFrom) * Math.sin(a), outDir * Math.cos(a)),
    };
  }
  if (i === 0) {
    // From the apartment door toward the first flight.
    return { x: -TURN_OUT * (1 - t), y: topY, z: 0, heading: 0 };
  }
  // Ground floor: from the last flight's foot out to the iron door.
  const zLast = laneOf(flightsBefore - 1);
  return { x: -t * TURN_OUT * 1.6, y: topY, z: zLast, heading: Math.PI };
}
