/** Guards scene transitions so a stray callback can't jump the game into a bad state. */
export type FlowState = 'boot' | 'menu' | 'intro' | 'stairs' | 'throw' | 'result';

const ALLOWED: Readonly<Record<FlowState, readonly FlowState[]>> = {
  boot: ['menu'],
  menu: ['intro'],
  intro: ['stairs', 'menu'],
  stairs: ['throw', 'result', 'menu'],
  throw: ['result', 'menu'],
  result: ['intro', 'menu'],
};

export function canTransition(from: FlowState, to: FlowState): boolean {
  return ALLOWED[from].includes(to);
}

export function nextState(from: FlowState, to: FlowState): FlowState {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid game state transition: ${from} → ${to}`);
  }
  return to;
}

/** Tiny holder; the only mutable flow state in the app. */
export class GameFlow {
  private current: FlowState = 'boot';

  get state(): FlowState {
    return this.current;
  }

  /** Returns false (and stays put) on an invalid transition instead of crashing the game. */
  go(to: FlowState): boolean {
    if (!canTransition(this.current, to)) return false;
    this.current = nextState(this.current, to);
    return true;
  }
}

export const gameFlow = new GameFlow();
