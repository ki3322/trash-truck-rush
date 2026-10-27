import type { EventType } from '../../types';
import type { PersonLike } from '../throw/ThrowView';

/**
 * What StairScene needs from a renderer. Rules (runner, clock, events) stay
 * in the scene; the 2D side view and the 3D stairwell only draw.
 */
export interface StairRunner extends PersonLike {
  setBarefoot(on: boolean): this;
}

export interface StairView {
  readonly is3D: boolean;
  readonly runner: StairRunner;
  /** Put the runner at a path progress (units) and face the walking direction. */
  place(progress: number): void;
  /** Phaser world coordinates just above the runner's head (for pop-up text). */
  runnerScreen(): { x: number; y: number };
  eventStart(type: EventType): void;
  eventEnd(type: EventType, success: boolean, slowMs: number): void;
  /** Run out of the ground-floor iron door. */
  exitDoor(): void;
  tick(dtMs: number): void;
  destroy(): void;
}
