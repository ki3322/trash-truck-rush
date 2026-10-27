import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG, type DifficultySettings } from '../config/difficultyConfig';
import { MISS_TEXT } from '../config/texts';
import { tuneForSeed } from '../config/tunes';
import { GarbageBag } from '../objects/GarbageBag';
import { GarbageTruck } from '../objects/GarbageTruck';
import { Player, drawBag } from '../objects/Player';
import { drawSky, drawStreet } from '../objects/Scenery';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { createClock, isExpired, pauseClock, remainingMs, startClock, tickClock, type GameClock } from '../systems/GameClock';
import { gameFlow } from '../systems/GameFlow';
import { distanceBasePoints } from '../systems/ScoreSystem';
import { createChase, stepChase, type ChaseState } from '../systems/ChaseModel';
import type { FailReason, MissKind, RunOutcome, RunSetup, StairResult } from '../types';
import { Button } from '../ui/Button';
import { popText } from '../ui/Overlay';
import { onKey } from '../ui/keys';
import { haptic } from '../systems/Haptics';
import { withTutorialSeen } from '../systems/StorageSystem';
import { getSave, updateSave } from '../state';
import { bottomY, centerView, fillViewExtents, topY } from '../ui/view';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';
import {
  advanceBag, clamp, launchVelocity, powerFromCharge, predictPath, truckRearX, truckShape, truckSpeedAt, willHitSoon,
  type BagState, type FlightState, type Surface,
} from '../utils/physics';
import type { ThrowSceneData } from './StairScene';

const C = GAME_CONFIG;
/** Where the bag leaves the hand when standing at the start spot. */
const START_RELEASE_X = C.playerX + C.releaseOffsetX;
const RELEASE_Y = C.groundY + C.releaseOffsetY;
const STEP_SOUND_MS = 230;
/** Bottom control panel top (design coords; anchored to the bottom edge). */
const PANEL_TOP_DESIGN = 1100;
const PREVIEW_STEPS = 72;

export class ThrowScene extends Phaser.Scene {
  private setup!: RunSetup;
  private stair!: StairResult;
  private chase: ChaseState = createChase(C.playerX);
  private wantRun = false;
  private stepSoundIn = 0;
  private wasExhausted = false;
  private throwOriginX = START_RELEASE_X;
  private cfg!: DifficultySettings;
  private clock: GameClock = createClock(0);
  private now = 0;
  private simAccum = 0;
  private truckTimeMs = 0;
  private truckStartX = 0;
  private bag: FlightState | null = null;
  private flightMs = 0;
  private lastSurface: Surface | null = null;
  private hitBounces = 0;
  private bagObj: GarbageBag | null = null;
  private attempts = 0;
  private done = false;
  private charging = false;
  private chargeStart = 0;
  private chargeRatio = 0;
  private angleDeg: number = C.defaultAngleDeg;
  private reloadUntil = 0;
  private slowMo = false;
  private slowMoUntil = 0;
  private lastMiss: MissKind | null = null;
  private truckMoving = false;

  private player!: Player;
  private truck!: GarbageTruck;
  private preview!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Container;
  private timeText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private angleText!: Phaser.GameObjects.Text;
  private bagIcons!: Phaser.GameObjects.Graphics;
  private powerBar!: Phaser.GameObjects.Graphics;
  private throwBtn!: Button;
  /** Finger currently aiming via the throw button (slingshot drag). */
  private aimDrag: { id: number; startY: number; startAngle: number } | null = null;
  private tutorial: Phaser.GameObjects.Container | null = null;
  private aimLabel!: Phaser.GameObjects.Text;
  private readonly panelTop = bottomY(PANEL_TOP_DESIGN);
  private runBtn!: Button;
  private staminaBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Throw');
  }

  init(data: ThrowSceneData): void {
    this.setup = data.setup;
    this.stair = data.stair;
    this.chase = createChase(C.playerX);
    this.wantRun = false;
    this.aimDrag = null;
    this.tutorial = null;
    this.stepSoundIn = 0;
    this.wasExhausted = false;
    this.throwOriginX = START_RELEASE_X;
    this.cfg = DIFFICULTY_CONFIG[data.setup.difficulty];
    this.clock = startClock(createClock(data.stair.remainingMs));
    this.now = 0;
    this.simAccum = 0;
    this.truckTimeMs = 0;
    this.bag = null;
    this.bagObj = null;
    this.flightMs = 0;
    this.lastSurface = null;
    this.hitBounces = 0;
    this.attempts = 0;
    this.done = false;
    this.charging = false;
    this.chargeRatio = 0;
    this.angleDeg = C.defaultAngleDeg;
    this.reloadUntil = 0;
    this.slowMo = false;
    this.lastMiss = null;
    this.truckMoving = false;
    // Arriving late means the truck has already pulled a bit further away.
    const late = Math.max(0, this.stair.stairTimeSec - this.cfg.fastStairSec) * this.cfg.latenessMPerSec;
    const startM = Math.min(7, this.cfg.truckStartM + late);
    this.truckStartX = START_RELEASE_X + startM * C.pxPerMeter - C.truck.lipWidth - this.cfg.openingWidth / 2;
  }

  create(): void {
    const { width: W, height: H } = C;
    centerView(this);
    fillViewExtents(this, 0x8fd3ff, 0x3a3a3a);
    drawSky(this, W, C.groundY);
    drawStreet(this, W, C.groundY);
    this.add.rectangle(W / 2, C.groundY + 150 + (H - C.groundY - 150) / 2, W, H - C.groundY - 150, 0x3a3a3a);

    this.truck = new GarbageTruck(this, this.truckStartX, C.groundY, this.cfg.openingWidth).setDepth(10);
    this.player = new Player(this, C.playerX, C.groundY, 1).setDepth(12).setFacing(1).setPose('idle').setFace('panic');
    if (this.stair.succeededEvents.includes('momBag')) this.player.setExtraBag(true);
    this.preview = this.add.graphics().setDepth(30);

    this.buildHud();
    this.bindInput();
    this.aimLabel = this.add
      .text(0, 0, '', { ...TEXT.hud, fontSize: '30px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
    if (!getSave().tutorialSeen) this.showTutorial();
    this.banner('瞄準垃圾車投入口！\n打到車頂也可能彈進去！', '#ffe066');
    audio.startTruckMusic(tuneForSeed(this.setup.seed), 1.4);
  }

  // ── HUD ─────────────────────────────────────────────────
  private buildHud(): void {
    const { width: W } = C;
    const H = bottomY(C.height);
    const top = this.add.graphics();
    top.fillStyle(COLORS.ink, 0.88);
    top.fillRoundedRect(12, 12, W - 24, 132, 22);
    this.timeText = this.add.text(36, 28, '', { ...TEXT.hud, fontSize: '40px' });
    this.distText = this.add.text(W - 36, 30, '', { ...TEXT.hud, fontSize: '28px', align: 'right' }).setOrigin(1, 0);
    this.angleText = this.add.text(36, 92, '', { ...TEXT.hud, fontSize: '24px' });
    this.bagIcons = this.add.graphics();
    this.hud = this.add.container(0, topY(0), [top, this.timeText, this.distText, this.angleText, this.bagIcons]).setDepth(100);

    const panel = this.add.graphics().setDepth(100);
    panel.fillStyle(COLORS.ink, 0.92);
    panel.fillRect(0, this.panelTop, W, H - this.panelTop);
    this.powerBar = this.add.graphics().setDepth(101);
    this.staminaBar = this.add.graphics().setDepth(101);
    this.add.text(24, this.panelTop + 14, '體力', { ...TEXT.hud, fontSize: '22px' }).setDepth(101);
    this.add.text(W / 2 + 12, this.panelTop + 14, '力道', { ...TEXT.hud, fontSize: '22px' }).setDepth(101);
    // Two thumbs: left holds 追！, right holds 丟垃圾 (multi-touch safe).
    this.runBtn = new Button(this, W * 0.26, H - 82, {
      width: 330, height: 124, label: '追垃圾車！\n（按住）', fontSize: 34, fill: COLORS.yellow, silent: true,
      onDown: () => this.setRun(true),
      onUp: () => this.setRun(false),
    });
    this.runBtn.setDepth(110);
    // Slingshot: hold to charge, slide the same thumb up/down to aim, lift to throw.
    this.throwBtn = new Button(this, W * 0.74, H - 82, {
      width: 330, height: 124, label: '丟垃圾！\n按住 ↕ 瞄準', fontSize: 34, fill: COLORS.orange,
      releaseOutside: true,
      onDown: (p) => this.startSlingshot(p),
      onUp: () => this.endSlingshot(),
    });
    this.throwBtn.setDepth(110);
    this.updateHud();
  }

  private bindInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || p.worldY >= this.panelTop) return;
      this.aimAt(p);
      if (!p.wasTouch && p.leftButtonDown()) this.startCharge();
    });
    // Aim only while pressed: hover-aiming would be overwritten on the way down to the throw button.
    this.input.on('pointermove', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.aimDrag && p.id === this.aimDrag.id) {
        const dy = this.aimDrag.startY - p.worldY;
        this.angleDeg = clamp(this.aimDrag.startAngle + dy * C.slingshotDegPerPx, C.minAngleDeg, C.maxAngleDeg);
        return;
      }
      if (p.worldY >= this.panelTop || over.length > 0 || !p.isDown) return;
      this.aimAt(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) this.release();
    });
    onKey(this, 'keydown-SPACE', () => this.startCharge(), 300);
    onKey(this, 'keydown-D', () => this.setRun(true));
    onKey(this, 'keydown-RIGHT', () => this.setRun(true));
    this.input.keyboard?.on('keyup-D', () => this.setRun(false));
    this.input.keyboard?.on('keyup-RIGHT', () => this.setRun(false));
    this.input.keyboard?.on('keyup-SPACE', () => this.release());
    // Angle nudges intentionally allow auto-repeat for smooth holding.
    this.input.keyboard?.on('keydown-UP', () => this.nudgeAngle(2));
    this.input.keyboard?.on('keydown-W', () => this.nudgeAngle(2));
    this.input.keyboard?.on('keydown-DOWN', () => this.nudgeAngle(-2));
    this.input.keyboard?.on('keydown-S', () => this.nudgeAngle(-2));
  }

  private releaseX(): number {
    return this.chase.x + C.releaseOffsetX;
  }

  private setRun(on: boolean): void {
    if (on) audio.unlock();
    this.wantRun = on && !this.done;
  }

  /** Advance the runner and keep them behind the truck. */
  private updateChase(delta: number, truckRear: number): void {
    const maxX = Math.min(C.chaseMaxX, truckRear - C.chaseGapPx);
    this.chase = stepChase(this.chase, this.wantRun && !this.done, delta, maxX);
    this.player.setX(this.chase.x);
    if (this.chase.exhausted && !this.wasExhausted) {
      popText(this, this.chase.x + 20, C.groundY - 190, '喘不過氣…', '#ff6b6b', 30);
    }
    if (this.chase.exhausted !== this.wasExhausted) this.runBtn.setFill(this.chase.exhausted ? 0xb0a99f : COLORS.yellow);
    this.wasExhausted = this.chase.exhausted;
    if (this.done || this.charging || this.player.getPose() === 'throw') return;
    const moving = this.chase.vx > 10;
    if (moving) {
      this.player.setPose('run').setFace('panic').setRunSpeed(this.chase.vx / C.chaseSpeed);
      this.stepSoundIn -= delta;
      if (this.stepSoundIn <= 0) {
        audio.play('step');
        this.stepSoundIn = STEP_SOUND_MS;
      }
    } else if (this.player.getPose() === 'run') {
      this.player.setPose('idle');
    }
  }

  private aimAt(p: Phaser.Input.Pointer): void {
    if (this.done) return;
    const dx = Math.max(1, p.worldX - this.releaseX());
    const dy = RELEASE_Y - p.worldY;
    const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    this.angleDeg = clamp(deg, C.minAngleDeg, C.maxAngleDeg);
  }

  private nudgeAngle(d: number): void {
    this.angleDeg = clamp(this.angleDeg + d, C.minAngleDeg, C.maxAngleDeg);
  }

  private canThrow(): boolean {
    return !this.done && this.bag === null && this.attempts < this.cfg.bags && this.now >= this.reloadUntil;
  }

  private startSlingshot(p: Phaser.Input.Pointer): void {
    this.aimDrag = { id: p.id, startY: p.worldY, startAngle: this.angleDeg };
    this.startCharge();
  }

  private endSlingshot(): void {
    this.aimDrag = null;
    this.release();
  }

  private startCharge(): void {
    if (this.charging || !this.canThrow()) return;
    audio.unlock();
    this.charging = true;
    this.chargeStart = this.now;
    this.chargeRatio = 0;
    this.player.setPose('charge');
    audio.play('rustle');
  }

  private release(): void {
    if (!this.charging) return;
    this.charging = false;
    if (!this.canThrow()) return;
    this.throwBag(powerFromCharge(this.chargeRatio));
  }

  private throwBag(power: number): void {
    this.attempts += 1;
    const v = launchVelocity(this.angleDeg, power);
    // Throwing on the run: the bag keeps the runner's speed.
    this.throwOriginX = this.releaseX();
    this.bag = { x: this.throwOriginX, y: RELEASE_Y, vx: v.vx + this.chase.vx, vy: v.vy, bounces: 0 };
    this.flightMs = 0;
    this.lastSurface = null;
    this.bagObj = new GarbageBag(this, this.throwOriginX, RELEASE_Y).setDepth(25);
    this.player.setPose('throw').setBagVisible(false).setCharge(0);
    this.time.delayedCall(350, () => {
      if (!this.done) this.player.setPose('idle').setFace('focus');
    });
    audio.play('throw');
    haptic('tap');
    this.dismissTutorial();
    track('throw_garbage', { difficulty: this.setup.difficulty, attempt: this.attempts, angle: Math.round(this.angleDeg), power: Math.round(power) });
    this.updateHud();
  }

  // ── Simulation ──────────────────────────────────────────
  update(_t: number, delta: number): void {
    this.now += delta;
    this.player.tick(delta);

    const scale = this.slowMo ? C.slowMoScale : 1;
    this.simAccum += (delta * scale) / 1000;
    let steps = 0;
    while (this.simAccum >= C.simDt && steps < 40) {
      this.simAccum -= C.simDt;
      steps += 1;
      this.stepSim();
    }
    const rearX = truckRearX(this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed);
    const speed = truckSpeedAt(this.truckTimeMs, this.cfg.truckSpeed);
    this.truck.setX(rearX);
    this.truck.tick(delta * scale, speed);
    this.updateChase(delta * scale, rearX);
    if (!this.truckMoving && speed > 0 && !this.done) {
      this.truckMoving = true;
      this.banner('垃圾車開走了！快丟！', '#ff6b6b');
    }

    if (this.done) return;

    if (!this.slowMo) this.clock = tickClock(this.clock, delta);
    if (this.charging) {
      this.chargeRatio = Math.min(1, (this.now - this.chargeStart) / C.chargeTimeMs);
      this.player.setCharge(this.chargeRatio);
    }
    if (this.bag && !this.slowMo && willHitSoon(this.bag, this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed, this.cfg.openingWidth)) {
      this.startSlowMo();
    }
    if (this.slowMo && this.now > this.slowMoUntil && !this.done) this.endSlowMo();

    if (!this.bag) {
      if (rearX > C.truckLeaveX) this.fail('truck_left');
      else if (isExpired(this.clock)) this.fail('throw_timeout');
    }
    if (this.bag === null && this.now >= this.reloadUntil && this.attempts < this.cfg.bags) this.player.setBagVisible(true);
    this.drawPreview();
    this.updateHud();
  }

  private stepSim(): void {
    this.truckTimeMs += C.simDt * 1000;
    if (!this.bag) return;
    this.flightMs += C.simDt * 1000;
    const shape = truckShape(truckRearX(this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed), C.groundY, this.cfg.openingWidth);
    const res = advanceBag(this.bag, shape, truckSpeedAt(this.truckTimeMs, this.cfg.truckSpeed), C.groundY);
    const next = res.state;
    this.bagObj?.sync(next, C.simDt * 1000);
    if (res.kind === 'hit') {
      this.hitBounces = next.bounces;
      this.onHit(next, res.x, res.perfect);
      return;
    }
    if (res.kind === 'miss') {
      this.onMiss(next, res.miss);
      return;
    }
    this.bag = next;
    if (res.bounced) this.onBounce(next, res.bounced);
    const offscreen = next.x > C.width + 200 || next.x < -200;
    if (offscreen || this.flightMs > C.maxFlightSec * 1000) this.onMiss(next, this.strandedMiss(next));
  }

  /** Miss reason when the bag leaves the screen or never settles (e.g. riding off on the roof). */
  private strandedMiss(at: BagState): MissKind {
    if (this.lastSurface === 'box' || this.lastSurface === 'cab') return 'roof';
    return at.x > 0 ? 'overshoot' : 'ground';
  }

  private onBounce(at: BagState, surface: Surface): void {
    this.lastSurface = surface;
    if (surface === 'ground') {
      audio.play('thud');
      return;
    }
    audio.play('bounce');
    haptic('bounce');
    this.cameras.main.shake(80, 0.004);
    popText(this, at.x, at.y - 40, Phaser.Math.RND.pick(['彈！', '咚！', '鏘！']), '#ffffff', 30);
  }

  private startSlowMo(): void {
    if (!this.bag) return;
    this.slowMo = true;
    this.slowMoUntil = this.now + C.slowMoMs / C.slowMoScale;
    this.hud.setVisible(false);
    const cam = this.cameras.main;
    cam.zoomTo(1.35, 180);
    cam.pan(clamp(this.bag.x + 60, 270, C.width - 270), clamp(this.bag.y + 40, 480, C.groundY - 160), 180);
  }

  private endSlowMo(): void {
    if (!this.slowMo) return;
    this.slowMo = false;
    this.hud.setVisible(true);
    const cam = this.cameras.main;
    cam.zoomTo(1, 250);
    cam.pan(C.width / 2, C.height / 2, 250);
  }

  private onHit(at: BagState, crossX: number, perfect: boolean): void {
    this.done = true;
    this.bag = null;
    this.clock = pauseClock(this.clock);
    const distanceM = Math.round(((crossX - this.throwOriginX) / C.pxPerMeter) * 10) / 10;
    const bagObj = this.bagObj;
    this.bagObj = null;
    if (bagObj) {
      this.tweens.add({ targets: bagObj, y: at.y + 40, scale: 0.4, alpha: 0, duration: 260, onComplete: () => bagObj.destroy() });
    }
    this.truck.setTargetVisible(false);
    audio.play('hit');
    haptic('hit');
    this.time.delayedCall(150, () => audio.play('success'));
    this.player.setPose('cheer');
    this.confetti(at.x, at.y);
    popText(this, at.x, at.y - 60, perfect ? '完美命中！' : '命中！', '#ffe066', 60);
    popText(this, at.x, at.y + 10, `${distanceM.toFixed(1)} 公尺`, '#ffffff', 40);
    if (this.hitBounces > 0) popText(this, at.x, at.y - 130, `反彈 ${this.hitBounces} 次進車！`, '#7CFC00', 40);
    if (perfect) track('perfect_throw', { difficulty: this.setup.difficulty, distance: distanceM });
    this.time.delayedCall(700, () => this.endSlowMo());
    this.time.delayedCall(2000, () =>
      this.toResult({
        success: true, failReason: null, throwDistanceM: distanceM, perfect,
      }),
    );
  }

  private onMiss(at: BagState, kind: MissKind): void {
    this.bag = null;
    this.lastMiss = kind;
    this.endSlowMo();
    const bagObj = this.bagObj;
    this.bagObj = null;
    if (bagObj) {
      // The physics already played out the bounces; just let it slump and fade.
      this.tweens.add({ targets: bagObj, scaleY: 0.7, alpha: 0, delay: 450, duration: 350, onComplete: () => bagObj.destroy() });
    }
    audio.play('miss');
    popText(this, clamp(at.x, 120, C.width - 120), C.groundY - 200, MISS_TEXT[kind], '#ff6b6b', 38);
    this.player.setFace('shock');
    this.reloadUntil = this.now + C.reloadMs;
    if (this.done) return;
    if (this.attempts >= this.cfg.bags) {
      // Decide immediately so "truck left" can't pre-empt the real reason.
      this.fail(isExpired(this.clock) ? 'throw_timeout' : 'out_of_bags');
    } else if (!isExpired(this.clock)) {
      popText(this, this.chase.x + 40, C.groundY - 180, `再拿一袋！剩 ${this.cfg.bags - this.attempts} 袋`, '#ffffff', 28);
    }
  }

  private fail(reason: FailReason): void {
    if (this.done) return;
    this.done = true;
    this.charging = false;
    this.clock = pauseClock(this.clock);
    this.preview.clear();
    audio.stopMusic();
    audio.play('fail');
    haptic('fail');
    this.player.setPose('cry');
    const msg: Record<FailReason, string> = {
      truck_left: '垃圾車開走了…',
      throw_timeout: '時間到！',
      out_of_bags: '三袋都沒進…',
      stairs_timeout: '時間到！',
    };
    this.banner(msg[reason], '#ff6b6b');
    this.time.delayedCall(1500, () => this.toResult({ success: false, failReason: reason, throwDistanceM: null, perfect: false }));
  }

  private toResult(r: Pick<RunOutcome, 'success' | 'failReason' | 'throwDistanceM' | 'perfect'>): void {
    if (!gameFlow.go('result')) return;
    audio.stopMusic();
    const outcome: RunOutcome = {
      setup: this.setup,
      stair: this.stair,
      lastMiss: this.lastMiss,
      attemptsUsed: this.attempts,
      remainingSec: Math.round(remainingMs(this.clock) / 100) / 10,
      bounces: r.success ? this.hitBounces : 0,
      ...r,
    };
    this.scene.start('Result', outcome);
  }

  // ── Visual helpers ──────────────────────────────────────
  /** First-time hint pointing at both thumbs' jobs; gone after the first throw. */
  private showTutorial(): void {
    const { width: W } = C;
    const y = this.panelTop - 120;
    const box = this.add.graphics();
    box.fillStyle(COLORS.ink, 0.85);
    box.fillRoundedRect(20, y - 70, W - 40, 140, 20);
    const left = this.add
      .text(W * 0.26, y, '👈 左手按住\n往前追垃圾車', { ...TEXT.hud, fontSize: '26px', align: 'center' })
      .setOrigin(0.5);
    const right = this.add
      .text(W * 0.74, y, '右手按住蓄力\n上下滑瞄準，放開丟 👉', { ...TEXT.hud, fontSize: '26px', align: 'center', color: '#ffe066' })
      .setOrigin(0.5);
    const arrows = this.add
      .text(W * 0.74, this.panelTop + 30, '▲\n▼', { ...TEXT.hud, fontSize: '30px', align: 'center', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(120);
    this.tutorial = this.add.container(0, 0, [box, left, right]).setDepth(150);
    this.tweens.add({ targets: arrows, y: arrows.y - 14, yoyo: true, repeat: -1, duration: 420 });
    this.tutorial.once('destroy', () => arrows.destroy());
  }

  private dismissTutorial(): void {
    if (!this.tutorial) return;
    const t = this.tutorial;
    this.tutorial = null;
    updateSave(withTutorialSeen);
    this.tweens.add({ targets: t, alpha: 0, duration: 250, onComplete: () => t.destroy() });
  }


  private drawPreview(): void {
    this.preview.clear();
    if (!this.canThrow()) {
      this.aimLabel.setVisible(false);
      return;
    }
    const power = powerFromCharge(this.charging ? this.chargeRatio : 0);
    const v = launchVelocity(this.angleDeg, power);
    const rx = this.releaseX();
    const pts = predictPath({ x: rx, y: RELEASE_Y, vx: v.vx + this.chase.vx, vy: v.vy }, PREVIEW_STEPS, C.groundY);
    pts.forEach((p, i) => {
      if (i % 4 !== 0) return;
      const a = 1 - i / PREVIEW_STEPS;
      this.preview.fillStyle(COLORS.ink, a * 0.7);
      this.preview.fillCircle(p.x, p.y, 7);
      this.preview.fillStyle(0xffffff, a);
      this.preview.fillCircle(p.x, p.y, 4.5);
    });
    // Arrow at release showing the angle
    const rad = (this.angleDeg * Math.PI) / 180;
    this.aimLabel
      .setVisible(this.aimDrag !== null)
      .setText(`${Math.round(this.angleDeg)}°`)
      .setPosition(rx + Math.cos(rad) * 110, RELEASE_Y - Math.sin(rad) * 110);
    this.preview.lineStyle(6, 0xffe066, 1);
    this.preview.lineBetween(rx, RELEASE_Y, rx + Math.cos(rad) * 70, RELEASE_Y - Math.sin(rad) * 70);
  }

  private updateHud(): void {
    const rem = remainingMs(this.clock);
    this.timeText.setText(`⏱ ${(rem / 1000).toFixed(1)}`).setColor(rem < 5000 ? '#ff6b6b' : '#ffffff');
    const rearX = truckRearX(this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed);
    const centre = rearX + C.truck.lipWidth + this.cfg.openingWidth / 2;
    const m = Math.max(0, (centre - this.releaseX()) / C.pxPerMeter);
    this.distText.setText(`距離 ${m.toFixed(1)} 公尺\n基礎 ${distanceBasePoints(m)} 分`);
    this.angleText.setText(`角度 ${Math.round(this.angleDeg)}°`);

    this.bagIcons.clear();
    for (let i = 0; i < this.cfg.bags; i++) {
      this.bagIcons.setAlpha(1);
      const used = i < this.attempts;
      if (!used) drawBag(this.bagIcons, 250 + i * 44, 106, 0.8);
      else {
        this.bagIcons.fillStyle(0x666666, 1);
        this.bagIcons.fillCircle(250 + i * 44, 106, 10);
      }
    }

    const { width: W } = C;
    const bw = W / 2 - 104;
    const r = this.charging ? this.chargeRatio : 0;
    this.drawBar(this.powerBar, W / 2 + 76, bw, r, r < 0.5 ? 0x7ed957 : r < 0.85 ? 0xffd166 : 0xff6b6b);
    const st = this.chase.stamina / C.staminaMax;
    this.drawBar(this.staminaBar, 88, bw, st, this.chase.exhausted ? 0xff6b6b : 0x6ec6ff);
    this.throwBtn.setEnabled(this.canThrow() || this.charging);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, w: number, ratio: number, color: number): void {
    g.clear();
    g.fillStyle(0x555555, 1);
    g.fillRoundedRect(x, this.panelTop + 16, w, 26, 13);
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, this.panelTop + 16, Math.max(14, w * Phaser.Math.Clamp(ratio, 0, 1)), 26, 13);
  }

  private banner(text: string, color: string): void {
    const t = this.add
      .text(C.width / 2, 330, text, { ...TEXT.title, fontSize: '56px', color, align: 'center' })
      .setOrigin(0.5)
      .setDepth(200)
      .setScale(0.5);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, alpha: 0, delay: 1100, duration: 300, onComplete: () => t.destroy() });
  }

  private confetti(x: number, y: number): void {
    const colors = [0xffe066, 0xff6b6b, 0x7ed957, 0x6ec6ff, 0xffffff, 0xff9ec7];
    for (let i = 0; i < 40; i++) {
      const r = this.add.rectangle(x, y, 10, 16, Phaser.Math.RND.pick(colors)).setDepth(60);
      this.tweens.add({
        targets: r,
        x: x + Phaser.Math.Between(-260, 260),
        y: y + Phaser.Math.Between(-320, 120),
        angle: Phaser.Math.Between(-360, 360),
        alpha: 0,
        duration: Phaser.Math.Between(900, 1500),
        ease: 'Cubic.easeOut',
        onComplete: () => r.destroy(),
      });
    }
    const flash = this.add.text(x, y - 140, '🎉', { fontFamily: FONT_FAMILY, fontSize: '90px' }).setOrigin(0.5).setDepth(61);
    this.tweens.add({ targets: flash, y: y - 220, alpha: 0, duration: 1400, onComplete: () => flash.destroy() });
  }
}
