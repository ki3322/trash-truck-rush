import { TUNES, type Tune, type TuneId } from '../config/tunes';

/**
 * All sound is synthesised with Web Audio — no recordings, no external files.
 * Truck music plays the public-domain melodies defined in config/tunes.ts.
 */
export type Sfx =
  | 'step'
  | 'stumble'
  | 'slipper'
  | 'rustle'
  | 'throw'
  | 'hit'
  | 'miss'
  | 'success'
  | 'fail'
  | 'count'
  | 'go'
  | 'click'
  | 'event'
  | 'catch'
  | 'bounce'
  | 'thud';

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioSystemImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private musicTimer: number | null = null;
  private musicIndex = 0;
  private tune: Tune = TUNES.furElise;
  private nextNoteTime = 0;
  private tempo = 1;
  private visibilityBound = false;

  /** Must be called from a user gesture (mobile autoplay policy). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.5 : 0;
        this.master.connect(this.ctx.destination);
      }
      // iOS reports 'interrupted' after backgrounding; resume from any non-running state.
      if (this.ctx.state !== 'running' && !document.hidden) void this.ctx.resume();
      this.bindVisibility();
    } catch {
      this.ctx = null;
    }
  }

  /** Silence everything while the tab is hidden (Phaser pauses, intervals don't). */
  private bindVisibility(): void {
    if (this.visibilityBound) return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend();
      } else {
        void this.ctx.resume();
        this.nextNoteTime = this.ctx.currentTime + 0.05;
      }
    });
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(this.master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(start: number, dur: number, vol: number, filterHz: number): void {
    if (!this.ctx || !this.master) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter).connect(g).connect(this.master);
    src.start(start);
  }

  play(name: Sfx): void {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'step':
        this.noise(t, 0.05, 0.5, 900 + Math.random() * 400);
        this.tone(140 + Math.random() * 30, t, 0.06, 'square', 0.06);
        break;
      case 'stumble':
        this.tone(300, t, 0.25, 'sawtooth', 0.12, 90);
        break;
      case 'slipper':
        this.tone(600, t, 0.3, 'triangle', 0.15, 1400);
        this.noise(t, 0.2, 0.3, 3000);
        break;
      case 'rustle':
        this.noise(t, 0.18, 0.35, 2500);
        break;
      case 'throw':
        this.noise(t, 0.25, 0.4, 1200);
        this.tone(250, t, 0.25, 'triangle', 0.1, 700);
        break;
      case 'hit':
        this.noise(t, 0.2, 0.7, 300);
        this.tone(110, t, 0.2, 'square', 0.15, 60);
        break;
      case 'miss':
        this.tone(220, t, 0.3, 'square', 0.1, 110);
        break;
      case 'success':
        [72, 76, 79, 84].forEach((n, i) => this.tone(midiToHz(n), t + i * 0.1, 0.3, 'square', 0.12));
        this.noise(t + 0.4, 0.9, 0.25, 4000);
        break;
      case 'fail':
        [67, 63, 60, 55].forEach((n, i) => this.tone(midiToHz(n), t + i * 0.18, 0.35, 'triangle', 0.16));
        break;
      case 'count':
        this.tone(660, t, 0.12, 'square', 0.12);
        break;
      case 'go':
        this.tone(990, t, 0.35, 'square', 0.14);
        break;
      case 'click':
        this.tone(880, t, 0.05, 'square', 0.06);
        break;
      case 'event':
        this.tone(1200, t, 0.08, 'square', 0.1);
        this.tone(1200, t + 0.12, 0.08, 'square', 0.1);
        break;
      case 'bounce':
        this.tone(320, t, 0.18, 'triangle', 0.16, 640);
        this.noise(t, 0.06, 0.4, 2200);
        break;
      case 'thud':
        this.noise(t, 0.08, 0.45, 260);
        break;
      case 'catch':
        this.tone(523, t, 0.1, 'square', 0.1);
        this.tone(784, t + 0.08, 0.15, 'square', 0.1);
        break;
    }
  }

  /** Start (or restart) the looping truck tune. */
  startTruckMusic(tuneId: TuneId, tempo = 1): void {
    this.stopMusic();
    if (!this.ctx) return;
    this.tune = TUNES[tuneId];
    this.tempo = tempo;
    this.musicIndex = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 50);
  }

  setTempo(tempo: number): void {
    this.tempo = Math.max(0.5, Math.min(2.5, tempo));
  }

  stopMusic(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    if (!this.ctx) return;
    if (document.hidden || this.ctx.state !== 'running') return;
    const unit = this.tune.unitSec / this.tempo;
    const notes = this.tune.notes;
    // If we fell behind (throttled timer), skip ahead instead of firing a burst of notes.
    if (this.nextNoteTime < this.ctx.currentTime - 0.1) this.nextNoteTime = this.ctx.currentTime + 0.05;
    while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
      const [note, units, bass] = notes[this.musicIndex];
      const dur = units * unit;
      if (this.enabled) {
        // Music-box-like lead (truck speaker) plus an optional soft bass note.
        if (note > 0) this.tone(midiToHz(note), this.nextNoteTime, Math.max(0.08, dur * 0.9), 'triangle', 0.12);
        if (note > 0) this.tone(midiToHz(note + 12), this.nextNoteTime, Math.max(0.05, dur * 0.4), 'square', 0.025);
        if (bass) this.tone(midiToHz(bass), this.nextNoteTime, Math.max(0.2, dur * 1.5), 'triangle', 0.07);
      }
      this.nextNoteTime += dur;
      this.musicIndex = (this.musicIndex + 1) % notes.length;
    }
  }
}

export const audio = new AudioSystemImpl();
