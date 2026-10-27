export type Difficulty = 'normal' | 'hard' | 'hell';

export const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard', 'hell'];

export type EventType = 'shoeCabinet' | 'grandma' | 'slipper' | 'momBag' | 'bagTear';

export interface ScheduledEvent {
  readonly type: EventType;
  /** Path unit (progress) at which the event triggers. */
  readonly atUnit: number;
}

export interface Challenge {
  readonly version: number;
  readonly difficulty: Difficulty;
  readonly seed: number;
  readonly targetScore: number;
  /** Friend's stair time in seconds, or null if the friend never reached 1F. */
  readonly targetTimeSec: number | null;
}

export interface RunSetup {
  readonly difficulty: Difficulty;
  readonly seed: number;
  readonly challenge: Challenge | null;
}

export interface StairResult {
  readonly reachedGround: boolean;
  readonly stairTimeSec: number;
  /** Lowest floor the player got to (1 = ground). */
  readonly floorReached: number;
  readonly stumbles: number;
  readonly failedEvents: readonly EventType[];
  readonly succeededEvents: readonly EventType[];
  readonly remainingMs: number;
}

export type TrashCategory = 'general' | 'recycle';

export interface SortResult {
  readonly items: number;
  readonly mistakes: number;
  readonly timeSec: number;
}

export type FailReason = 'stairs_timeout' | 'throw_timeout' | 'truck_left' | 'out_of_bags';

export type MissKind = 'ground' | 'roof' | 'body' | 'rim' | 'overshoot';

export interface RunOutcome {
  readonly setup: RunSetup;
  readonly success: boolean;
  readonly failReason: FailReason | null;
  readonly lastMiss: MissKind | null;
  readonly sort: SortResult;
  readonly stair: StairResult;
  readonly throwDistanceM: number | null;
  readonly perfect: boolean;
  readonly attemptsUsed: number;
  readonly remainingSec: number;
  /** Rebounds before a successful throw went in (0 = clean shot). */
  readonly bounces: number;
  /** Neighbours who hadn't landed a bag yet when yours went in (3D crowd). */
  readonly neighborsBeaten: number;
}
