import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG, type DifficultySettings } from '../config/difficultyConfig';
import { tuneForSeed } from '../config/tunes';
import { Player } from '../objects/Player';
import { drawStairwell, stairwellHeight } from '../objects/Stairwell';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { EVENT_DEFS, pickEvents } from '../systems/EventSystem';
import { createClock, isExpired, pauseClock, penalize, remainingMs, startClock, tickClock, type GameClock } from '../systems/GameClock';
import { gameFlow } from '../systems/GameFlow';
import { INITIAL_RUNNER, applySlow, applyStun, speedRatio, tap, type Foot, type RunnerState } from '../systems/RunnerModel';
import type { EventType, RunOutcome, RunSetup, ScheduledEvent, SortResult, StairResult } from '../types';
import type { StairSceneData } from './SortScene';
import { Button } from '../ui/Button';
import { popText } from '../ui/Overlay';
import { onKey } from '../ui/keys';
import { haptic } from '../systems/Haptics';
import { VIEW } from '../ui/view';
import { COLORS, TEXT } from '../ui/theme';
import { buildSegments, floorAt, positionAt, totalUnits, type Segment } from '../utils/stairPath';
import { StairEventPresenter } from './StairEventPresenter';

export interface ThrowSceneData {
  readonly setup: RunSetup;
  readonly sort: SortResult;
  readonly stair: StairResult;
}

const ACTION_SPAM_LOCK_MS = 400;

interface ActiveEvent {
  readonly sched: ScheduledEvent;
  readonly startedAt: number;
  readonly windowMs: number;
  stillMs: number;
}

export class StairScene extends Phaser.Scene {
  private setup!: RunSetup;
  private sort!: SortResult;
  private cfg!: DifficultySettings;
  private segments: Segment[] = [];
  private total = 0;
  private schedule: ScheduledEvent[] = [];
  private nextEvent = 0;
  private active: ActiveEvent | null = null;
  private runner: RunnerState = INITIAL_RUNNER;
  private clock: GameClock = createClock(0);
  private now = 0;
  private displayP = 0;
  private controlling = false;
  private finished = false;
  private stairElapsedMs = 0;
  private failedEvents: EventType[] = [];
  private succeededEvents: EventType[] = [];
  private lastFloor = 0;
  private dodgeUntil = 0;
  private actionLockUntil = 0;

  private player!: Player;
  private presenter!: StairEventPresenter;
  private timeText!: Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private truckText!: Phaser.GameObjects.Text;
  private truckBar!: Phaser.GameObjects.Graphics;
  private leftBtn!: Button;
  private rightBtn!: Button;

  constructor() {
    super('Stair');
  }

  init(data: StairSceneData): void {
    const { setup } = data;
    this.setup = setup;
    this.sort = data.sort;
    this.cfg = DIFFICULTY_CONFIG[setup.difficulty];
    this.segments = buildSegments(this.cfg.startFloor);
    this.total = totalUnits(this.cfg.startFloor);
    this.schedule = pickEvents(setup.seed, this.cfg.eventCount, this.total);
    this.nextEvent = 0;
    this.active = null;
    this.runner = INITIAL_RUNNER;
    // The clock started in the sorting phase and keeps running (the truck doesn't wait).
    this.clock = startClock(data.clock);
    this.now = 0;
    this.displayP = 0;
    this.controlling = false;
    this.finished = false;
    this.stairElapsedMs = 0;
    this.failedEvents = [];
    this.succeededEvents = [];
    this.lastFloor = this.cfg.startFloor;
    this.dodgeUntil = 0;
    this.actionLockUntil = 0;
  }

  create(): void {
    const { width: W } = GAME_CONFIG;
    const worldH = stairwellHeight(this.cfg.startFloor);
    drawStairwell(this, this.cfg.startFloor, this.segments);

    const start = positionAt(this.segments, 0);
    this.player = new Player(this, start.x, start.y, 0.9).setDepth(20).setPose('idle').setFace('panic');
    this.presenter = new StairEventPresenter(this, this.player, this.segments, this.schedule, this.cfg.eventWindowMs);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, W, worldH);
    cam.startFollow(this.player, true, 0.12, 0.12, 0, -140);

    this.buildHud();
    this.bindKeys();
    this.startRunning();
    audio.startTruckMusic(tuneForSeed(this.setup.seed), 1);
  }

  // ── HUD & input ─────────────────────────────────────────
  private buildHud(): void {
    const { width: W, height: H } = VIEW;
    const g = this.add.graphics().setScrollFactor(0).setDepth(100);
    g.fillStyle(COLORS.ink, 0.88);
    g.fillRoundedRect(12, 12, W - 24, 132, 22);
    this.timeText = this.add.text(36, 30, '', { ...TEXT.hud, fontSize: '40px' }).setScrollFactor(0).setDepth(101);
    this.floorText = this.add.text(W / 2, 30, '', { ...TEXT.hud, fontSize: '40px', color: '#ffe066' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(101);
    this.scoreText = this.add.text(W - 36, 30, '', { ...TEXT.hud, fontSize: '32px' }).setOrigin(1, 0).setScrollFactor(0).setDepth(101);
    this.truckText = this.add.text(36, 90, '', { ...TEXT.hud, fontSize: '24px' }).setScrollFactor(0).setDepth(101);
    this.truckBar = this.add.graphics().setScrollFactor(0).setDepth(101);

    const panel = this.add.graphics().setScrollFactor(0).setDepth(100);
    panel.fillStyle(COLORS.ink, 0.55);
    panel.fillRect(0, H - 200, W, 200);
    this.leftBtn = new Button(this, W / 4 + 4, H - 104, {
      width: W / 2 - 36, height: 160, label: '左腳\n(A)', fontSize: 40, fill: COLORS.yellow, silent: true,
      onDown: () => this.onFoot('L'),
    });
    this.rightBtn = new Button(this, (W * 3) / 4 - 4, H - 104, {
      width: W / 2 - 36, height: 160, label: '右腳\n(D)', fontSize: 40, fill: COLORS.yellow, silent: true,
      onDown: () => this.onFoot('R'),
    });
    [this.leftBtn, this.rightBtn].forEach((b) => b.setScrollFactor(0).setDepth(110));
    this.updateHud();
  }

  private bindKeys(): void {
    this.presenter.onAction(() => this.onAction());
    onKey(this, 'keydown-A', () => this.onFoot('L'));
    onKey(this, 'keydown-LEFT', () => this.onFoot('L'));
    onKey(this, 'keydown-D', () => this.onFoot('R'));
    onKey(this, 'keydown-RIGHT', () => this.onFoot('R'));
    onKey(this, 'keydown-SPACE', () => this.onAction());
    onKey(this, 'keydown-W', () => this.onAction());
    onKey(this, 'keydown-UP', () => this.onAction());
  }

  /** Control starts at once — the countdown already happened before sorting. */
  private startRunning(): void {
    const { width: W, height: H } = VIEW;
    const label = this.add
      .text(W / 2, H / 2 - 80, '衝下樓！', { ...TEXT.title, fontSize: '120px', color: '#e85d04' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300)
      .setScale(1.5);
    const hint = this.add
      .text(W / 2, H / 2 + 50, '左右交替點擊！\n同一腳連按會踉蹌', { ...TEXT.h2, fontSize: '34px', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);
    this.tweens.add({ targets: label, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [label, hint], alpha: 0, delay: 1100, duration: 300 });
    this.controlling = true;
    this.player.setPose('run');
  }

  private onFoot(foot: Foot): void {
    audio.unlock();
    (foot === 'L' ? this.leftBtn : this.rightBtn).flash();
    if (!this.controlling || this.finished) return;
    const { state, outcome } = tap(this.runner, foot, this.now, this.total);
    this.runner = state;
    if (this.active?.sched.type === 'bagTear') {
      this.active.stillMs = 0;
      audio.play('rustle');
      this.presenter.shakeBag();
    }
    if (outcome === 'advance') audio.play('step');
    if (outcome === 'stumble') {
      audio.play('stumble');
      haptic('stumble');
      popText(this, this.player.x, this.player.y - 150, '踉蹌！左右要交替！', '#ff6b6b', 30);
    }
  }

  private onAction(): void {
    if (this.finished || this.now < this.actionLockUntil) return;
    const a = this.active;
    if (!a || EVENT_DEFS[a.sched.type].action === null) {
      // Mashing the action key before an event appears briefly locks it out.
      this.actionLockUntil = this.now + ACTION_SPAM_LOCK_MS;
      return;
    }
    this.resolveEvent(true);
  }

  // ── Events ──────────────────────────────────────────────
  private activateEvent(sched: ScheduledEvent): void {
    const def = EVENT_DEFS[sched.type];
    const windowMs = def.action === null ? this.cfg.eventWindowMs + GAME_CONFIG.bagTearStillMs + 800 : this.cfg.eventWindowMs;
    this.active = { sched, startedAt: this.now, windowMs, stillMs: 0 };
    audio.play(sched.type === 'slipper' ? 'slipper' : 'event');
    haptic('wrong');
    this.presenter.show(sched.type);
  }

  private resolveEvent(success: boolean): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.nextEvent += 1;
    const def = EVENT_DEFS[a.sched.type];
    const msg = success ? def.successText : def.failText;
    popText(this, this.player.x, this.player.y - 160, msg, success ? '#7CFC00' : '#ff6b6b', 32);
    if (success) {
      this.succeededEvents = [...this.succeededEvents, a.sched.type];
      audio.play('catch');
      haptic('success');
      if (a.sched.type === 'shoeCabinet' || a.sched.type === 'grandma') this.dodgeUntil = this.now + 380;
    } else {
      this.failedEvents = [...this.failedEvents, a.sched.type];
      audio.play('stumble');
      haptic('fail');
      if (def.timePenaltyMs > 0) {
        this.clock = penalize(this.clock, def.timePenaltyMs);
        popText(this, 120, 140, `-${def.timePenaltyMs / 1000} 秒`, '#ff6b6b', 40);
      }
      if (def.stunMs > 0) this.runner = applyStun(this.runner, this.now, def.stunMs);
      if (def.slowMs > 0) this.runner = applySlow(this.runner, this.now, def.slowMs);
      this.cameras.main.shake(200, 0.008);
    }
    this.presenter.resolve(a.sched.type, success, def.slowMs);
  }

  private updateEvents(delta: number): void {
    const next = this.schedule[this.nextEvent];
    if (!this.active && next && this.displayP >= next.atUnit) this.activateEvent(next);
    const a = this.active;
    if (!a) return;
    const elapsed = this.now - a.startedAt;
    if (a.sched.type === 'bagTear') {
      a.stillMs += delta;
      this.presenter.updateMeter(Math.min(1, a.stillMs / GAME_CONFIG.bagTearStillMs), 1 - elapsed / a.windowMs);
      if (a.stillMs >= GAME_CONFIG.bagTearStillMs) {
        this.resolveEvent(true);
        return;
      }
    } else {
      this.presenter.updateMeter(null, 1 - elapsed / a.windowMs);
    }
    if (elapsed >= a.windowMs) this.resolveEvent(false);
  }

  // ── Main loop ───────────────────────────────────────────
  update(_time: number, delta: number): void {
    this.now += delta;
    this.player.tick(delta);
    this.presenter.tick(delta);
    if (!this.controlling || this.finished) return;

    this.clock = tickClock(this.clock, delta);
    this.stairElapsedMs += delta;

    this.displayP += (this.runner.progress - this.displayP) * Math.min(1, (delta / 1000) * 14);
    if (this.runner.progress >= this.total && !this.active) {
      // Decide on the real position; the walk-out animation catches up after.
      this.finishStairs();
      return;
    }
    const pos = positionAt(this.segments, this.displayP);
    this.player.setPosition(pos.x, pos.y).setFacing(pos.dir);
    this.updatePose();
    this.updateEvents(delta);

    const floor = floorAt(this.cfg.startFloor, this.displayP);
    if (floor !== this.lastFloor) {
      this.lastFloor = floor;
      this.stampFloor(floor);
    }
    this.updateHud();

    if (isExpired(this.clock)) this.failStairs();
  }

  private updatePose(): void {
    const stunned = this.now < this.runner.stunnedUntil;
    const ratio = speedRatio(this.runner, this.now);
    if (this.now < this.dodgeUntil) this.player.setPose('dodge').setFace('focus');
    else if (stunned) this.player.setPose('stumble');
    else if (this.active?.sched.type === 'bagTear' && ratio === 0) this.player.setPose('still');
    else if (ratio > 0) this.player.setPose('run').setFace('panic').setRunSpeed(ratio);
    else this.player.setPose('idle').setFace('panic');
  }

  private stampFloor(floor: number): void {
    const { width: W } = GAME_CONFIG;
    const t = this.add
      .text(W / 2, 330, floor === 1 ? '1F！衝啊！' : `${floor}F`, { ...TEXT.title, fontSize: '110px', color: '#e85d04' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(150)
      .setScale(1.6);
    this.tweens.add({ targets: t, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 500, duration: 300, onComplete: () => t.destroy() });
  }

  private updateHud(): void {
    const rem = remainingMs(this.clock);
    const ratio = rem / this.clock.totalMs;
    this.timeText.setText(`⏱ ${(rem / 1000).toFixed(1)}`).setColor(rem < 10000 ? '#ff6b6b' : '#ffffff');
    this.floorText.setText(`${floorAt(this.cfg.startFloor, this.displayP)}F → 1F`);
    const floorsDown = this.cfg.startFloor - floorAt(this.cfg.startFloor, this.displayP);
    const bonus = this.succeededEvents.includes('momBag') ? GAME_CONFIG.momBagBonus : 0;
    this.scoreText.setText(`分數 ${floorsDown * GAME_CONFIG.failFloorPoints + bonus}`);
    const status = ratio > 0.6 ? '🚛 垃圾車：停在巷口' : ratio > 0.3 ? '🚛 垃圾車：準備開走！' : '🚛 垃圾車：快走了！！';
    this.truckText.setText(status);
    const bx = 380;
    const bw = GAME_CONFIG.width - 36 - bx;
    this.truckBar.clear();
    this.truckBar.fillStyle(0x555555, 1);
    this.truckBar.fillRoundedRect(bx, 98, bw, 20, 10);
    this.truckBar.fillStyle(ratio > 0.6 ? 0x7ed957 : ratio > 0.3 ? 0xffd166 : 0xff6b6b, 1);
    this.truckBar.fillRoundedRect(bx, 98, Math.max(10, bw * ratio), 20, 10);
    audio.setTempo(1 + (1 - ratio) * 0.8);
  }

  // ── Endings ─────────────────────────────────────────────
  private stairResult(reachedGround: boolean): StairResult {
    return {
      reachedGround,
      stairTimeSec: Math.round(this.stairElapsedMs / 100) / 10,
      floorReached: reachedGround ? 1 : floorAt(this.cfg.startFloor, this.displayP),
      stumbles: this.runner.stumbles,
      failedEvents: this.failedEvents,
      succeededEvents: this.succeededEvents,
      remainingMs: remainingMs(this.clock),
    };
  }

  private finishStairs(): void {
    this.finished = true;
    this.controlling = false;
    this.clock = pauseClock(this.clock);
    const stair = this.stairResult(true);
    track('reach_ground_floor', { difficulty: this.setup.difficulty, stair_time: stair.stairTimeSec });
    popText(this, this.player.x + 80, this.player.y - 170, '衝出鐵門！', '#ffe066', 44);
    this.player.setPose('run').setRunSpeed(1);
    this.tweens.add({ targets: this.player, x: -60, duration: 450 });
    this.time.delayedCall(550, () => {
      if (!gameFlow.go('throw')) return;
      const data: ThrowSceneData = { setup: this.setup, sort: this.sort, stair };
      this.scene.start('Throw', data);
    });
  }

  private failStairs(): void {
    this.finished = true;
    this.controlling = false;
    this.presenter.clear();
    audio.stopMusic();
    audio.play('fail');
    this.player.setPose('cry');
    const outcome: RunOutcome = {
      setup: this.setup,
      success: false,
      failReason: 'stairs_timeout',
      lastMiss: null,
      sort: this.sort,
      stair: this.stairResult(false),
      throwDistanceM: null,
      perfect: false,
      attemptsUsed: 0,
      remainingSec: 0,
      bounces: 0,
    };
    const { width: W, height: H } = VIEW;
    this.add
      .text(W / 2, H / 2 - 100, '時間到！\n垃圾車開走了…', { ...TEXT.title, fontSize: '72px', align: 'center', color: '#c1121f' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(300);
    this.time.delayedCall(1400, () => {
      if (!gameFlow.go('result')) return;
      this.scene.start('Result', outcome);
    });
  }
}
