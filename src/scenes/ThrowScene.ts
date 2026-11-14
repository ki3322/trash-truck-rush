import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG, type DifficultySettings } from '../config/difficultyConfig';
import { MISS_TEXT } from '../config/texts';
import { tuneForSeed } from '../config/tunes';
import { GarbageBag } from '../objects/GarbageBag';
import { GarbageTruck } from '../objects/GarbageTruck';
import { Player } from '../objects/Player';
import { drawSky, drawStreet } from '../objects/Scenery';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { createClock, isExpired, pauseClock, remainingMs, startClock, tickClock, type GameClock } from '../systems/GameClock';
import { gameFlow } from '../systems/GameFlow';
import { distanceBasePoints } from '../systems/ScoreSystem';
import { createChase, stepChase, type ChaseState } from '../systems/ChaseModel';
import type { FailReason, MissKind, RunOutcome, RunSetup, StairResult } from '../types';
import { popText } from '../ui/Overlay';
import { onKey } from '../ui/keys';
import { haptic } from '../systems/Haptics';
import { withTutorialSeen } from '../systems/StorageSystem';
import { getSave, updateSave } from '../state';
import { fillViewExtents } from '../ui/view';
import { COLORS, TEXT } from '../ui/theme';
import type { SlingAim } from '../systems/Slingshot';
import {
  advanceBag, clamp, launchVelocity, powerFromCharge, predictPath, truckRearX, truckShape, truckSpeedAt, willHitSoon,
  type BagState, type FlightState, type Surface,
} from '../utils/physics';
import type { ThrowSceneData } from './StairScene';
import type { ThrowHudData, ThrowHudScene } from './ThrowHudScene';
import { confetti, drawTrajectory } from './throwEffects';

const C = GAME_CONFIG;
/** Where the bag leaves the hand when standing at the start spot. */
const START_RELEASE_X = C.playerX + C.releaseOffsetX;
const RELEASE_Y = C.groundY + C.releaseOffsetY;
const STEP_SOUND_MS = 230;
const PREVIEW_STEPS = 72;
const HUD_KEY = 'ThrowHud';
/** Rear lip to front bumper, so the truck never drives off the end of the street. */
const TRUCK_LENGTH_PX = 420;
const CAMERA_FOLLOW_RATE = 8;
const SLOW_MO_ZOOM = 1.3;
/** How far past the runner a bag may fly before it counts as gone (px). */
const BAG_LOST_AHEAD_PX = 1300;
const BAG_LOST_BEHIND_PX = 400;
type ChargeMode = 'key' | 'sling';

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
  private chargeMode: ChargeMode = 'key';
  /** Sling pulled past the dead zone: releasing throws instead of cancelling. */
  private slingArmed = false;
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
  private hud!: ThrowHudScene;
  private aimLabel!: Phaser.GameObjects.Text;
  private camCx = C.width / 2;
  private camCy = C.height / 2;
  /** World point the slow-motion close-up is centred on. */
  private camFocus: { x: number; y: number } | null = null;

  constructor() {
    super('Throw');
  }

  init(data: ThrowSceneData): void {
    this.setup = data.setup;
    this.stair = data.stair;
    this.chase = createChase(C.playerX);
    this.wantRun = false;
    this.chargeMode = 'key';
    this.slingArmed = false;
    this.camCx = C.width / 2;
    this.camCy = C.height / 2;
    this.camFocus = null;
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
    const street = C.streetLengthPx;
    // Backdrop stays put horizontally; the street scrolls past it.
    fillViewExtents(this, 0x8fd3ff, 0x3a3a3a)?.setScrollFactor(0, 1);
    drawSky(this, W, C.groundY).setScrollFactor(0, 1);
    for (let ox = 0; ox < street; ox += W) drawStreet(this, W, C.groundY, ox);
    this.add.rectangle(W / 2, C.groundY + 150 + (H - C.groundY - 150) / 2, W, H - C.groundY - 150, 0x3a3a3a).setScrollFactor(0, 1);

    this.truck = new GarbageTruck(this, this.truckStartX, C.groundY, this.cfg.openingWidth).setDepth(10);
    this.player = new Player(this, C.playerX, C.groundY, 1).setDepth(12).setFacing(1).setPose('idle').setFace('panic');
    if (this.stair.succeededEvents.includes('momBag')) this.player.setExtraBag(true);
    this.preview = this.add.graphics().setDepth(30);
    this.aimLabel = this.add
      .text(0, 0, '', { ...TEXT.hud, fontSize: '30px', color: '#ffe066' })
      .setOrigin(0.5)
      .setDepth(40)
      .setVisible(false);
    this.cameras.main.centerOn(this.camCx, this.camCy);

    this.launchHud();
    this.bindKeys();
    this.time.delayedCall(150, () => this.hud.banner('瞄準垃圾車投入口！\n打到車頂也可能彈進去！', '#ffe066'));
    audio.startTruckMusic(tuneForSeed(this.setup.seed), 1.4);
  }

  // ── HUD & input ─────────────────────────────────────────
  private launchHud(): void {
    const data: ThrowHudData = {
      showTutorial: !getSave().tutorialSeen,
      handlers: {
        onRun: (on) => this.setRun(on),
        onAim: (aim) => this.onSlingAim(aim),
        onAimEnd: () => this.onSlingEnd(),
      },
    };
    this.scene.launch(HUD_KEY, data);
    this.hud = this.scene.get(HUD_KEY) as ThrowHudScene;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop(HUD_KEY));
  }

  private bindKeys(): void {
    onKey(this, 'keydown-SPACE', () => this.startCharge('key'), 300);
    onKey(this, 'keydown-D', () => this.setRun(true));
    onKey(this, 'keydown-RIGHT', () => this.setRun(true));
    this.input.keyboard?.on('keyup-D', () => this.setRun(false));
    this.input.keyboard?.on('keyup-RIGHT', () => this.setRun(false));
    this.input.keyboard?.on('keyup-SPACE', () => {
      if (this.chargeMode === 'key') this.release();
    });
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
    const maxX = truckRear - C.chaseGapPx;
    this.chase = stepChase(this.chase, this.wantRun && !this.done, delta, maxX);
    this.player.setX(this.chase.x);
    if (this.chase.exhausted && !this.wasExhausted) {
      popText(this, this.chase.x + 20, C.groundY - 190, '喘不過氣…', '#ff6b6b', 30);
    }
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

  private nudgeAngle(d: number): void {
    this.angleDeg = clamp(this.angleDeg + d, C.minAngleDeg, C.maxAngleDeg);
  }

  private canThrow(): boolean {
    return !this.done && this.bag === null && this.attempts < this.cfg.bags && this.now >= this.reloadUntil;
  }

  /** Slingshot pull from the HUD: sets angle and power together. */
  private onSlingAim(aim: SlingAim): void {
    if (!this.charging) this.startCharge('sling');
    if (!this.charging || this.chargeMode !== 'sling') return;
    this.angleDeg = aim.angleDeg;
    this.chargeRatio = aim.ratio;
    this.slingArmed = aim.armed;
    this.player.setCharge(aim.ratio);
  }

  private onSlingEnd(): void {
    if (!this.charging || this.chargeMode !== 'sling') return;
    if (this.slingArmed) {
      this.release();
      return;
    }
    // Lifted inside the dead zone: put the bag back down, no throw spent.
    this.charging = false;
    this.player.setPose('idle').setCharge(0);
  }

  private startCharge(mode: ChargeMode): void {
    if (this.charging || !this.canThrow()) return;
    audio.unlock();
    this.charging = true;
    this.chargeMode = mode;
    this.slingArmed = false;
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
    this.hud.dismissTutorial();
    updateSave(withTutorialSeen);
    track('throw_garbage', { difficulty: this.setup.difficulty, attempt: this.attempts, angle: Math.round(this.angleDeg), power: Math.round(power) });
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
    this.updateCamera(delta);
    if (!this.truckMoving && speed > 0 && !this.done) {
      this.truckMoving = true;
      this.hud.banner('垃圾車開走了！快追！', '#ff6b6b');
    }

    if (this.done) return;

    if (!this.slowMo) this.clock = tickClock(this.clock, delta);
    if (this.charging && this.chargeMode === 'key') {
      this.chargeRatio = Math.min(1, (this.now - this.chargeStart) / C.chargeTimeMs);
      this.player.setCharge(this.chargeRatio);
    }
    if (this.bag && !this.slowMo && willHitSoon(this.bag, this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed, this.cfg.openingWidth)) {
      this.startSlowMo();
    }
    if (this.slowMo && this.now > this.slowMoUntil && !this.done) this.endSlowMo();

    if (!this.bag) {
      const gotAway = rearX - this.chase.x > C.maxChaseGapPx || rearX > C.streetLengthPx - TRUCK_LENGTH_PX;
      if (gotAway) this.fail('truck_left');
      else if (isExpired(this.clock)) this.fail('throw_timeout');
    }
    if (this.bag === null && this.now >= this.reloadUntil && this.attempts < this.cfg.bags) this.player.setBagVisible(true);
    this.drawPreview();
    this.renderHud(rearX);
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
    const offscreen = next.x > this.chase.x + BAG_LOST_AHEAD_PX || next.x < this.chase.x - BAG_LOST_BEHIND_PX;
    if (offscreen || this.flightMs > C.maxFlightSec * 1000) this.onMiss(next, this.strandedMiss(next));
  }

  /** Miss reason when the bag leaves the screen or never settles (e.g. riding off on the roof). */
  private strandedMiss(at: BagState): MissKind {
    if (this.lastSurface === 'box' || this.lastSurface === 'cab') return 'roof';
    return at.x > this.chase.x ? 'overshoot' : 'ground';
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
    this.camFocus = { x: this.bag.x, y: this.bag.y };
    this.hud.setTopVisible(false);
    this.cameras.main.zoomTo(SLOW_MO_ZOOM, 180);
  }

  private endSlowMo(): void {
    if (!this.slowMo) return;
    this.slowMo = false;
    this.camFocus = null;
    this.hud.setTopVisible(true);
    this.cameras.main.zoomTo(1, 250);
  }

  /** Keeps the runner near the left edge; during slow motion closes in on the bag. */
  private updateCamera(delta: number): void {
    if (this.bag && this.camFocus) this.camFocus = { x: this.bag.x, y: this.bag.y };
    const half = C.width / 2;
    const follow = clamp(this.chase.x - C.cameraLeadPx + half, half, C.streetLengthPx - half);
    const tx = this.camFocus ? this.camFocus.x + 40 : follow;
    const ty = this.camFocus ? clamp(this.camFocus.y + 40, 480, C.groundY - 160) : C.height / 2;
    const k = Math.min(1, (delta / 1000) * CAMERA_FOLLOW_RATE);
    this.camCx += (tx - this.camCx) * k;
    this.camCy += (ty - this.camCy) * k;
    this.cameras.main.centerOn(this.camCx, this.camCy);
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
    confetti(this, at.x, at.y);
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
    const camLeft = this.cameras.main.scrollX;
    popText(this, clamp(at.x, camLeft + 120, camLeft + C.width - 120), C.groundY - 200, MISS_TEXT[kind], '#ff6b6b', 38);
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
      out_of_bags: `${this.cfg.bags} 袋都沒進…`,
      stairs_timeout: '時間到！',
    };
    this.hud.banner(msg[reason], '#ff6b6b');
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
  private drawPreview(): void {
    this.preview.clear();
    if (!this.canThrow()) {
      this.aimLabel.setVisible(false);
      return;
    }
    const power = powerFromCharge(this.charging ? this.chargeRatio : 0);
    const v = launchVelocity(this.angleDeg, power);
    const origin = { x: this.releaseX(), y: RELEASE_Y };
    const pts = predictPath({ ...origin, vx: v.vx + this.chase.vx, vy: v.vy }, PREVIEW_STEPS, C.groundY);
    drawTrajectory(this.preview, pts, PREVIEW_STEPS, origin, this.angleDeg, COLORS.ink);
    const rad = (this.angleDeg * Math.PI) / 180;
    this.aimLabel
      .setVisible(this.charging)
      .setText(`${Math.round(this.angleDeg)}°・力道 ${Math.round(this.chargeRatio * 100)}%`)
      .setPosition(origin.x + Math.cos(rad) * 130, RELEASE_Y - Math.sin(rad) * 130 - 20);
  }

  private renderHud(rearX: number): void {
    const centre = rearX + C.truck.lipWidth + this.cfg.openingWidth / 2;
    const m = Math.max(0, (centre - this.releaseX()) / C.pxPerMeter);
    this.hud.render({
      remainingMs: remainingMs(this.clock),
      bagsTotal: this.cfg.bags,
      bagsUsed: this.attempts,
      distanceM: m,
      basePoints: distanceBasePoints(m),
      stamina: this.chase.stamina / C.staminaMax,
      exhausted: this.chase.exhausted,
      truckEscaping: rearX - this.chase.x > C.maxChaseGapPx * 0.8,
    });
  }
}
