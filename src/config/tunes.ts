/**
 * Garbage-truck tunes, synthesised live (no recordings). Both compositions
 * are in the public domain (Beethoven d. 1827, Bądarzewska d. 1861).
 *
 * Note format: [melody MIDI note (0 = rest), length in units, optional bass MIDI note].
 * `unitSec` is the length of one unit at tempo 1.
 */
export type TuneNote = readonly [melody: number, units: number, bass?: number];

export interface Tune {
  readonly id: TuneId;
  readonly title: string;
  readonly composer: string;
  readonly unitSec: number;
  readonly notes: readonly TuneNote[];
}

export type TuneId = 'furElise' | 'maidensPrayer';

// MIDI note numbers used below
const A2 = 45, E2 = 40, C3 = 48, Bb2 = 46, Ab2 = 44, Eb3 = 51;
const C4 = 60, E4 = 64, Gs4 = 68, A4 = 69, B4 = 71, C5 = 72, D5 = 74, Ds5 = 75, E5 = 76;
const F4 = 65, G4 = 67, Ab4 = 68, Bb4 = 70, Eb5 = 75, F5 = 77, G5 = 79, Ab5 = 80;

/** Beethoven, Für Elise (WoO 59) — opening A section, unit = 16th note. */
const FUR_ELISE: readonly TuneNote[] = [
  [E5, 1], [Ds5, 1],
  [E5, 1], [Ds5, 1], [E5, 1], [B4, 1], [D5, 1], [C5, 1],
  [A4, 2, A2], [0, 1], [C4, 1], [E4, 1], [A4, 1],
  [B4, 2, E2], [0, 1], [E4, 1], [Gs4, 1], [B4, 1],
  [C5, 2, A2], [0, 1], [E4, 1], [E5, 1], [Ds5, 1],
  [E5, 1], [Ds5, 1], [E5, 1], [B4, 1], [D5, 1], [C5, 1],
  [A4, 2, A2], [0, 1], [C4, 1], [E4, 1], [A4, 1],
  [B4, 2, E2], [0, 1], [E4, 1], [C5, 1], [B4, 1],
  [A4, 4, A2], [0, 2],
];

/**
 * Bądarzewska, The Maiden's Prayer (Op. 4) — main theme in E♭, unit = 8th note.
 * Transcribed from memory, not from a score; correct here if it sounds off.
 */
const MAIDENS_PRAYER: readonly TuneNote[] = [
  [Bb4, 2],
  [Eb5, 3, Eb3], [D5, 1], [Eb5, 2], [F5, 2],
  [G5, 4, Eb3], [F5, 2], [Eb5, 2],
  [C5, 3, Ab2], [Bb4, 1], [Ab4, 2], [G4, 2],
  [F4, 6, Bb2], [Bb4, 2],
  [Eb5, 3, Eb3], [D5, 1], [Eb5, 2], [F5, 2],
  [G5, 3, C3], [Ab5, 1], [G5, 2], [F5, 2],
  [Eb5, 2, Bb2], [G4, 2], [F4, 2], [D5, 2],
  [Eb5, 6, Eb3], [0, 2],
];

export const TUNES: Readonly<Record<TuneId, Tune>> = {
  furElise: { id: 'furElise', title: '給愛麗絲', composer: '貝多芬', unitSec: 0.15, notes: FUR_ELISE },
  maidensPrayer: { id: 'maidensPrayer', title: '少女的祈禱', composer: '巴達婕芙絲卡', unitSec: 0.24, notes: MAIDENS_PRAYER },
};

export const TUNE_IDS: readonly TuneId[] = ['furElise', 'maidensPrayer'];

/** Which truck shows up this run. Seeded, so a challenge replays the same tune. */
export function tuneForSeed(seed: number): TuneId {
  return TUNE_IDS[(seed >>> 0) % TUNE_IDS.length];
}

export function tuneLengthSec(tune: Tune): number {
  return tune.notes.reduce((sum, [, units]) => sum + units, 0) * tune.unitSec;
}
