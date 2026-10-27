import { GAME_CONFIG } from '../config/gameConfig';
import { createRng, type Rng } from '../utils/rng';

/**
 * Computer-controlled neighbours who also chase the truck and throw their
 * bags. Pure + seeded: the same challenge seed gives the same crowd.
 */
export interface Neighbor {
  readonly id: number;
  readonly name: string;
  readonly look: number;
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly bags: number;
  readonly hits: number;
  readonly nextThrowAt: number;
  readonly throwingUntil: number;
  readonly maxSpeed: number;
  /** Preferred distance (px) between the release point and the truck opening. */
  readonly preferredRange: number;
  /** Aim error (0 = perfect). */
  readonly sloppiness: number;
}

export interface ThrowCommand {
  readonly neighborId: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
}

export interface TruckState {
  readonly rearX: number;
  readonly speed: number;
  readonly openingWidth: number;
}

const NAMES = ['阿伯', '阿姨', '學生', '上班族', '老闆'] as const;
/** Sideways lanes (px); one shares the player's lane to get in the way. */
const LANES = [-150, -70, GAME_CONFIG.playerLaneZ, 150, -20];

function gauss(rng: Rng): number {
  // Box–Muller, clamped so a single unlucky throw isn't absurd.
  const u = Math.max(1e-6, rng());
  const v = rng();
  return Math.max(-2.5, Math.min(2.5, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)));
}

export function createNeighbors(seed: number, count: number): Neighbor[] {
  const rng = createRng((seed ^ 0x2545f491) >>> 0);
  return Array.from({ length: Math.max(0, Math.min(count, NAMES.length)) }, (_, i) => ({
    id: i,
    name: NAMES[i],
    look: i,
    // Start a little ahead of the player so the over-the-shoulder camera sees the crowd, not their backs up close.
    x: GAME_CONFIG.playerX + 25 + rng() * 90,
    z: LANES[i],
    vx: 0,
    bags: i === 1 ? 2 : 1,
    hits: 0,
    nextThrowAt: 1600 + rng() * 2600,
    throwingUntil: 0,
    maxSpeed: 120 + rng() * 60,
    preferredRange: 150 + rng() * 170,
    sloppiness: 0.04 + rng() * 0.1,
  }));
}

/** Opening centre x at a time offset, assuming the truck keeps its current speed. */
function openingCentreAt(truck: TruckState, dtSec: number): number {
  return truck.rearX + truck.speed * dtSec + GAME_CONFIG.truck.lipWidth + truck.openingWidth / 2;
}

/**
 * Ballistic aim at the moving opening: pick a pitch, solve the launch speed
 * for the horizontal distance and height gain, iterate for the truck's motion.
 */
export function aimAt(fromX: number, fromZ: number, truck: TruckState, pitchDeg: number): { vx: number; vy: number; vz: number } | null {
  const g = GAME_CONFIG.gravity;
  const releaseY = GAME_CONFIG.groundY + GAME_CONFIG.releaseOffsetY;
  const rimY = GAME_CONFIG.groundY - GAME_CONFIG.truck.rimHeight;
  // Aim slightly above the rim so the bag drops in rather than clipping it.
  const h = releaseY - rimY + 6;
  const th = (pitchDeg * Math.PI) / 180;
  let flight = 0.9;
  let v = 0;
  let dx = 0;
  const dz = 0 - fromZ;
  for (let i = 0; i < 4; i++) {
    dx = openingCentreAt(truck, flight) - fromX;
    const d = Math.hypot(dx, dz);
    const denom = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - h);
    if (denom <= 0 || d <= 0) return null;
    v = Math.sqrt((g * d * d) / denom);
    flight = d / (v * Math.cos(th));
  }
  const horizontal = v * Math.cos(th);
  const yaw = Math.atan2(dz, dx);
  return { vx: Math.cos(yaw) * horizontal, vy: -v * Math.sin(th), vz: Math.sin(yaw) * horizontal };
}

/** Closest x the player may reach without running into a neighbour in their lane. */
export function blockingLimit(neighbors: readonly Neighbor[], playerX: number, playerZ: number, gapPx = 45): number {
  return neighbors
    .filter((n) => Math.abs(n.z - playerZ) < 45 && n.x > playerX)
    .reduce((limit, n) => Math.min(limit, n.x - gapPx), Infinity);
}

/** Advance every neighbour; returns the new crowd and any throws to spawn this step. */
export function stepNeighbors(
  neighbors: readonly Neighbor[],
  tMs: number,
  dtMs: number,
  truck: TruckState,
  rng: Rng,
): { neighbors: Neighbor[]; throws: ThrowCommand[] } {
  const throws: ThrowCommand[] = [];
  const dt = dtMs / 1000;
  const C = GAME_CONFIG;
  const next = neighbors.map((n) => {
    const releaseX = n.x + C.releaseOffsetX;
    const range = openingCentreAt(truck, 0) - releaseX;
    const tooFar = range > n.preferredRange;
    const busy = tMs < n.throwingUntil;
    const target = tooFar && !busy && n.bags > 0 ? n.maxSpeed : 0;
    const vx = n.vx < target ? Math.min(target, n.vx + 700 * dt) : Math.max(target, n.vx - 900 * dt);
    const maxX = Math.min(C.chaseMaxX, truck.rearX - C.chaseGapPx);
    const x = Math.max(n.x, Math.min(maxX, n.x + vx * dt));
    let updated: Neighbor = { ...n, x, vx: x >= maxX ? 0 : vx };

    const inRange = range < n.preferredRange + 60 && range > 60;
    if (n.bags > 0 && !busy && tMs >= n.nextThrowAt && inRange) {
      const pitch = 42 + rng() * 14 + gauss(rng) * n.sloppiness * 20;
      const aim = aimAt(releaseX, n.z, truck, pitch);
      if (aim) {
        const powerErr = 1 + gauss(rng) * n.sloppiness;
        const yawErr = gauss(rng) * n.sloppiness * 0.35;
        const horizontal = Math.hypot(aim.vx, aim.vz) * powerErr;
        const yaw = Math.atan2(aim.vz, aim.vx) + yawErr;
        throws.push({
          neighborId: n.id,
          x: releaseX,
          y: C.groundY + C.releaseOffsetY,
          z: n.z,
          vx: Math.cos(yaw) * horizontal + updated.vx,
          vy: aim.vy * powerErr,
          vz: Math.sin(yaw) * horizontal,
        });
        updated = { ...updated, bags: n.bags - 1, throwingUntil: tMs + 450, nextThrowAt: tMs + 1800 + rng() * 1800 };
      }
    }
    return updated;
  });
  return { neighbors: next, throws };
}

export function recordNeighborHit(neighbors: readonly Neighbor[], id: number): Neighbor[] {
  return neighbors.map((n) => (n.id === id ? { ...n, hits: n.hits + 1 } : n));
}
