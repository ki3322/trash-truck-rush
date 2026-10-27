import { GAME_CONFIG } from '../config/gameConfig';

/**
 * The stairwell is a zig-zag: landing → flight → landing → flight … Each
 * floor consists of two flights and two landings. Progress is measured in
 * "units": one stair step or one landing stride.
 */

export interface PathPoint {
  readonly x: number;
  readonly y: number;
  /** +1 when walking right, -1 when walking left. */
  readonly dir: 1 | -1;
  readonly onStairs: boolean;
}

export interface Segment {
  readonly kind: 'landing' | 'flight';
  readonly startUnit: number;
  readonly units: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly dir: 1 | -1;
  /** Landing where the runner walks out to the wall and turns back (U-turn). */
  readonly turn: boolean;
}

const C = GAME_CONFIG;

export function unitsPerFloor(): number {
  return 2 * (C.stepsPerFlight + C.landingUnits);
}

export function totalUnits(startFloor: number): number {
  return Math.max(0, startFloor - 1) * unitsPerFloor() + C.landingUnits;
}

export function flightDrop(): number {
  return C.stepsPerFlight * C.stepHeight;
}

export function floorHeight(): number {
  return 2 * flightDrop();
}

export function buildSegments(startFloor: number): Segment[] {
  const segments: Segment[] = [];
  const leftX = C.stairLeftX;
  const flightW = C.stepsPerFlight * C.stepWidth;
  const rightX = leftX + flightW;
  let unit = 0;
  let y = C.stairTopY;
  const flights = Math.max(0, startFloor - 1) * 2;

  for (let i = 0; i < flights; i++) {
    const goingRight = i % 2 === 0;
    const dir: 1 | -1 = goingRight ? 1 : -1;
    // Landing before this flight. The first one is a straight walk from the
    // apartment door; later ones are U-turns at the stair corner.
    const landEdge = goingRight ? leftX : rightX;
    const landFar = goingRight ? leftX - C.landingWidth : rightX + C.landingWidth;
    const turn = i > 0;
    segments.push({
      kind: 'landing', startUnit: unit, units: C.landingUnits,
      x0: turn ? landEdge : landFar, y0: y, x1: turn ? landFar : landEdge, y1: y,
      dir: turn ? ((-dir) as 1 | -1) : dir, turn,
    });
    unit += C.landingUnits;
    const xEnd = goingRight ? rightX : leftX;
    segments.push({
      kind: 'flight', startUnit: unit, units: C.stepsPerFlight,
      x0: landEdge, y0: y, x1: xEnd, y1: y + flightDrop(), dir, turn: false,
    });
    unit += C.stepsPerFlight;
    y += flightDrop();
  }
  // Final ground-floor landing toward the iron door (always on the left side).
  segments.push({
    kind: 'landing', startUnit: unit, units: C.landingUnits,
    x0: leftX, y0: y, x1: leftX - C.landingWidth, y1: y, dir: -1, turn: false,
  });
  return segments;
}

export function positionAt(segments: readonly Segment[], progress: number): PathPoint {
  const last = segments[segments.length - 1];
  const end = last.startUnit + last.units;
  const p = Math.min(Math.max(progress, 0), end);
  const seg =
    segments.find((s) => p >= s.startUnit && p < s.startUnit + s.units) ?? last;
  const t = Math.min(1, (p - seg.startUnit) / seg.units);
  if (seg.kind === 'flight') {
    // Snap vertically to discrete steps so the runner "hops" step by step.
    const stepT = Math.floor(t * seg.units) / seg.units;
    const frac = t * seg.units - Math.floor(t * seg.units);
    const hop = Math.sin(frac * Math.PI) * 6;
    return {
      x: seg.x0 + (seg.x1 - seg.x0) * t,
      y: seg.y0 + (seg.y1 - seg.y0) * stepT - hop,
      dir: seg.dir,
      onStairs: true,
    };
  }
  if (seg.turn) {
    const out = t < 0.5;
    const k = out ? t * 2 : (1 - t) * 2;
    const dir = (out ? seg.dir : -seg.dir) as 1 | -1;
    return { x: seg.x0 + (seg.x1 - seg.x0) * k, y: seg.y0, dir, onStairs: false };
  }
  return { x: seg.x0 + (seg.x1 - seg.x0) * t, y: seg.y0, dir: seg.dir, onStairs: false };
}

/** Floor label (5 → 1) for a given progress. */
export function floorAt(startFloor: number, progress: number): number {
  const descended = Math.floor(Math.max(0, progress) / unitsPerFloor());
  return Math.max(1, startFloor - descended);
}

/** World y of the landing where floor `n` starts. */
export function floorLandingY(startFloor: number, floor: number): number {
  return C.stairTopY + (startFloor - floor) * floorHeight();
}
