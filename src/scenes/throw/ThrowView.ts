import type { Neighbor } from '../../systems/NeighborAI';

/**
 * What ThrowScene needs from a renderer. The scene owns all rules (clock,
 * physics, neighbours, scoring); a view only draws. Units are physics px:
 * x = along the street, y = down from the top of the design space (ground =
 * groundY), z = sideways (3D only; the 2D view ignores it).
 */
export type SharedPose = 'idle' | 'run' | 'stumble' | 'dodge' | 'charge' | 'throw' | 'cheer' | 'cry' | 'still';
export type SharedFace = 'normal' | 'panic' | 'happy' | 'sad' | 'focus' | 'shock';

export interface PersonLike {
  setPose(p: SharedPose): this;
  getPose(): string;
  setFace(f: SharedFace): this;
  setRunSpeed(r: number): this;
  setCharge(r: number): this;
  setBagVisible(on: boolean): this;
  setExtraBag(on: boolean): this;
}

export interface P3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AimPreview {
  readonly points: readonly P3[];
  readonly pitchDeg: number;
  readonly yawDeg: number;
  readonly showLabel: boolean;
}

export interface ThrowView {
  readonly is3D: boolean;
  readonly player: PersonLike;
  /** Move the player along the street (x) in their lane (z). */
  setPlayerPosition(x: number, z: number): void;
  setTruck(rearX: number, speed: number, dtMs: number): void;
  setTargetVisible(on: boolean): void;
  setNeighbors(neighbors: readonly Neighbor[]): void;
  neighborPose(id: number, pose: SharedPose): void;
  spawnBag(id: number, at: P3, color?: number): void;
  syncBag(id: number, at: P3, dtMs: number): void;
  removeBag(id: number, how: 'hit' | 'miss'): void;
  setPreview(preview: AimPreview | null): void;
  /** Start (focus = bag position) or end (null) the slow-motion close-up. */
  setSlowMo(focus: P3 | null): void;
  /** Phaser world coordinates for pop-up text at a physics position. */
  toScreen(at: P3): { x: number; y: number };
  shake(): void;
  /** Called every frame after the simulation (animation + rendering). */
  tick(dtMs: number, aimYawDeg: number): void;
  destroy(): void;
}
