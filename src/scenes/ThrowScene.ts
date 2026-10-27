import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG, type DifficultySettings } from '../config/difficultyConfig';
import { MISS_TEXT } from '../config/texts';
import { tuneForSeed } from '../config/tunes';
import { drawBag } from '../objects/Player';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { createChase, stepChase, type ChaseState } from '../systems/ChaseModel';
import { createClock, isExpired, pauseClock, remainingMs, startClock, tickClock, type GameClock } from '../systems/GameClock';
import { gameFlow } from '../systems/GameFlow';
import { haptic } from '../systems/Haptics';
import { blockingLimit, createNeighbors, recordNeighborHit, stepNeighbors, type Neighbor } from '../systems/NeighborAI';
import { distanceBasePoints } from '../systems/ScoreSystem';
import { withTutorialSeen } from '../systems/StorageSystem';
import { getRenderMode, getSave, setRenderMode, updateSave } from '../state';
import { getWorld3D } from '../three/World3D';
import { StreetWorld3D } from '../three/StreetWorld3D';
import type { FailReason, MissKind, RunOutcome, RunSetup, SortResult, StairResult } from '../types';
import { Button } from '../ui/Button';
import { onKey } from '../ui/keys';
import { popText } from '../ui/Overlay';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';
import { bottomY, centerView, fillViewExtents, topY } from '../ui/view';
import { clamp, powerFromCharge, truckRearX, truckShape, truckSpeedAt, type Surface } from '../utils/physics';
import { DEFAULT_LANE, advanceBag3, clampYaw, launchVelocity3, predictPath3, willHitSoon3, type Flight3 } from '../utils/physics3d';
import { createRng, type Rng } from '../utils/rng';
import type { ThrowSceneData } from './StairScene';
import type { P3, ThrowView } from './throw/ThrowView';
import { ThrowView2D } from './throw/ThrowView2D';

const C = GAME_CONFIG;
/** Where the bag leaves the hand when standing at the start spot. */
const START_RELEASE_X = C.playerX + C.releaseOffsetX;
const RELEASE_Y = C.groundY + C.releaseOffsetY;
const STEP_SOUND_MS = 230;
/** Bottom control panel top (design coords; anchored to the bottom edge). */
const PANEL_TOP_DESIGN = 1100;
const PREVIEW_STEPS = 72;
const PLAYER_BAG_ID = 0;
const BLOCKED_MSG_MS = 1500;

interface NeighborBag {
  owner: number;
  state: Flight3;
}

/**
 * Throw phase rules: clock, chase, slingshot aim (pitch + sideways yaw in
 * 3D), bounces, neighbours, scoring. Rendering is delegated to a ThrowView
 * (3D third-person street, or the classic 2D side view as a fallback).
 */
export class ThrowScene extends Phaser.Scene {
  private setup!: RunSetup;
  private sort!: SortResult;
  private stair!: StairResult;
  private cfg!: DifficultySettings;
  private view!: ThrowView;
  private laneZ = 0;
  private chase: ChaseState = createChase(C.playerX);
  private wantRun = false;
  private stepSoundIn = 0;
  private wasExhausted = false;
  private throwOriginX = START_RELEASE_X;
  private clock: GameClock = createClock(0);
  private now = 0;
  private simAccum = 0;
  private truckTimeMs = 0;
  private truckStartX = 0;
  private bag: Flight3 | null = null;
  private flightMs = 0;
  private lastSurface: Surface | null = null;
  private hitBounces = 0;
  private attempts = 0;
  private done = false;
  private charging = false;
  private chargeStart = 0;
  private chargeRatio = 0;
  private angleDeg: number = C.defaultAngleDeg;
  private yawDeg = 0;
  private reloadUntil = 0;
  private slowMo = false;
  private slowMoUntil = 0;
  private lastMiss: MissKind | null = null;
  private truckMoving = false;
  private neighbors: Neighbor[] = [];
  private neighborBags = new Map<number, NeighborBag>();
  private nextBagId = 1;
  private crowdRng: Rng = createRng(1);
  private blockedMsgAt = -Infinity;

  private hud!: Phaser.GameObjects.Container;
  private timeText!: Phaser.GameObjects.Text;
  private distText!: Phaser.GameObjects.Text;
  private angleText!: Phaser.GameObjects.Text;
  private crowdText!: Phaser.GameObjects.Text;
  private bagIcons!: Phaser.GameObjects.Graphics;
  private powerBar!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private throwBtn!: Button;
  private runBtn!: Button;
  /** Finger currently aiming via the throw button (slingshot drag). */
  private aimDrag: { id: number; startX: number; startY: number; startAngle: number; startYaw: number } | null = null;
  private tutorial: Phaser.GameObjects.Container | null = null;
  private readonly panelTop = bottomY(PANEL_TOP_DESIGN);

  constructor() {
    super('Throw');
  }

  init(data: ThrowSceneData): void {
    this.setup = data.setup;
    this.sort = data.sort;
    this.stair = data.stair;
    this.cfg = DIFFICULTY_CONFIG[data.setup.difficulty];
    this.chase = createChase(C.playerX);
    this.wantRun = false;
    this.aimDrag = null;
    this.tutorial = null;
    this.stepSoundIn = 0;
    this.wasExhausted = false;
    this.throwOriginX = START_RELEASE_X;
    this.clock = startClock(createClock(data.stair.remainingMs));
    this.now = 0;
    this.simAccum = 0;
    this.truckTimeMs = 0;
    this.bag = null;
    this.flightMs = 0;
    this.lastSurface = null;
    this.hitBounces = 0;
    this.attempts = 0;
    this.done = false;
    this.charging = false;
    this.chargeRatio = 0;
    this.angleDeg = C.defaultAngleDeg;
    this.yawDeg = 0;
    this.reloadUntil = 0;
    this.slowMo = false;
    this.lastMiss = null;
    this.truckMoving = false;
    this.neighborBags = new Map();
    this.nextBagId = 1;
    this.crowdRng = createRng((data.setup.seed ^ 0x7f4a7c15) >>> 0);
    this.blockedMsgAt = -Infinity;
    // Arriving late means the truck has already pulled a bit further away.
    const late = Math.max(0, this.stair.stairTimeSec - this.cfg.fastStairSec) * this.cfg.latenessMPerSec;
    const startM = Math.min(7, this.cfg.truckStartM + late);
    this.truckStartX = START_RELEASE_X + startM * C.pxPerMeter - C.truck.lipWidth - this.cfg.openingWidth / 2;
  }

  create(): void {
    centerView(this);
    this.view = this.createView();
    // In 3D you stand in a lane beside the truck's line and must aim sideways.
    this.laneZ = this.view.is3D ? C.playerLaneZ : 0;
    this.neighbors = this.view.is3D ? this.neighbors : [];
    if (this.stair.succeededEvents.includes('momBag')) this.view.player.setExtraBag(true);
    this.view.setPlayerPosition(this.chase.x, this.laneZ);
    this.events.once('shutdown', () => this.view.destroy());

    this.buildHud();
    this.bindInput();
    if (!getSave().tutorialSeen) this.showTutorial();
    this.banner(this.view.is3D ? '鄰居也來搶了！\n瞄準垃圾車投入口！' : '瞄準垃圾車投入口！\n打到車頂也可能彈進去！', '#ffe066');
    audio.startTruckMusic(tuneForSeed(this.setup.seed), 1.4);
  }

  private createView(): ThrowView {
    if (getRenderMode() === '3d') {
      const world = getWorld3D();
      if (world) {
        this.neighbors = createNeighbors(this.setup.seed, C.crowdSize);
        return new StreetWorld3D(world, this.game.canvas, this.cfg.openingWidth, this.neighbors);
      }
      setRenderMode('2d'); // WebGL unavailable: remember and fall back.
    }
    fillViewExtents(this, 0x8fd3ff, 0x3a3a3a);
    return new ThrowView2D(this, this.truckStartX, this.cfg.openingWidth);
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
    this.crowdText = this.add.text(W / 2 + 40, 92, '', { ...TEXT.hud, fontSize: '22px', color: '#ffe066' });
    this.bagIcons = this.add.graphics();
    this.hud = this.add
      .container(0, topY(0), [top, this.timeText, this.distText, this.angleText, this.crowdText, this.bagIcons])
      .setDepth(100);

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
    // Slingshot: hold to charge, slide the same thumb to aim (↕ height, ↔ sideways in 3D), lift to throw.
    this.throwBtn = new Button(this, W * 0.74, H - 82, {
      width: 330, height: 124, label: this.view.is3D ? '丟垃圾！\n按住滑動瞄準' : '丟垃圾！\n按住 ↕ 瞄準', fontSize: 34, fill: COLORS.orange,
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
      if (this.view.is3D) {
        // 3D: drag anywhere above the panel works like the slingshot (mouse or a third finger).
        this.aimDrag = { id: p.id, startX: p.worldX, startY: p.worldY, startAngle: this.angleDeg, startYaw: this.yawDeg };
      } else {
        this.aimAt2D(p);
      }
      if (!p.wasTouch && p.leftButtonDown()) this.startCharge();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.aimDrag && p.id === this.aimDrag.id) {
        this.dragAim(p);
        return;
      }
      if (p.worldY >= this.panelTop || over.length > 0 || !p.isDown || this.view.is3D) return;
      this.aimAt2D(p);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.aimDrag && p.id === this.aimDrag.id && this.aimDrag.id !== this.throwBtn.activePointerId) this.aimDrag = null;
      if (!p.wasTouch) this.release();
    });
    onKey(this, 'keydown-SPACE', () => this.startCharge(), 300);
    onKey(this, 'keydown-D', () => this.setRun(true));
    onKey(this, 'keydown-SHIFT', () => this.setRun(true));
    this.input.keyboard?.on('keyup-D', () => this.setRun(false));
    this.input.keyboard?.on('keyup-SHIFT', () => this.setRun(false));
    this.input.keyboard?.on('keyup-SPACE', () => this.release());
    // Aim nudges intentionally allow auto-repeat for smooth holding.
    this.input.keyboard?.on('keydown-UP', () => this.nudge(2, 0));
    this.input.keyboard?.on('keydown-W', () => this.nudge(2, 0));
    this.input.keyboard?.on('keydown-DOWN', () => this.nudge(-2, 0));
    this.input.keyboard?.on('keydown-S', () => this.nudge(-2, 0));
    this.input.keyboard?.on('keydown-LEFT', () => this.nudge(0, -2));
    this.input.keyboard?.on('keydown-RIGHT', () => this.nudge(0, 2));
  }

  private dragAim(p: Phaser.Input.Pointer): void {
    const d = this.aimDrag;
    if (!d) return;
    this.angleDeg = clamp(d.startAngle + (d.startY - p.worldY) * C.slingshotDegPerPx, C.minAngleDeg, C.maxAngleDeg);
    if (this.view.is3D) this.yawDeg = clampYaw(d.startYaw + (p.worldX - d.startX) * C.slingshotYawDegPerPx);
  }

  private releaseX(): number {
    return this.chase.x + C.releaseOffsetX;
  }

  /** Current truck rear x (px); exposed for tests and the HUD. */
  get truckRear(): number {
    return truckRearX(this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed);
  }

  private setRun(on: boolean): void {
    if (on) audio.unlock();
    this.wantRun = on && !this.done;
  }

  /** Advance the runner and keep them behind the truck and any neighbour in their lane. */
  private updateChase(delta: number, truckRear: number): void {
    const crowdLimit = blockingLimit(this.neighbors, this.chase.x, this.laneZ);
    const maxX = Math.min(C.chaseMaxX, truckRear - C.chaseGapPx, crowdLimit);
    this.chase = stepChase(this.chase, this.wantRun && !this.done, delta, maxX);
    this.view.setPlayerPosition(this.chase.x, this.laneZ);
    if (this.wantRun && crowdLimit < Infinity && this.chase.x >= crowdLimit - 1 && this.now - this.blockedMsgAt > BLOCKED_MSG_MS) {
      this.blockedMsgAt = this.now;
      this.pop({ x: this.chase.x + 60, y: C.groundY - 200, z: this.laneZ }, '借過！借過！', '#ffffff', 30);
    }
    if (this.chase.exhausted && !this.wasExhausted) {
      this.pop({ x: this.chase.x + 20, y: C.groundY - 190, z: this.laneZ }, '喘不過氣…', '#ff6b6b', 30);
    }
    if (this.chase.exhausted !== this.wasExhausted) this.runBtn.setFill(this.chase.exhausted ? 0xb0a99f : COLORS.yellow);
    this.wasExhausted = this.chase.exhausted;
    const player = this.view.player;
    if (this.done || this.charging || player.getPose() === 'throw') return;
    if (this.chase.vx > 10) {
      player.setPose('run').setFace('panic').setRunSpeed(this.chase.vx / C.chaseSpeed);
      this.stepSoundIn -= delta;
      if (this.stepSoundIn <= 0) {
        audio.play('step');
        this.stepSoundIn = STEP_SOUND_MS;
      }
    } else if (player.getPose() === 'run') {
      player.setPose('idle');
    }
  }

  private aimAt2D(p: Phaser.Input.Pointer): void {
    if (this.done) return;
    const dx = Math.max(1, p.worldX - this.releaseX());
    const dy = RELEASE_Y - p.worldY;
    this.angleDeg = clamp((Math.atan2(dy, dx) * 180) / Math.PI, C.minAngleDeg, C.maxAngleDeg);
  }

  private nudge(pitch: number, yaw: number): void {
    this.angleDeg = clamp(this.angleDeg + pitch, C.minAngleDeg, C.maxAngleDeg);
    if (this.view.is3D) this.yawDeg = clampYaw(this.yawDeg + yaw);
  }

  private canThrow(): boolean {
    return !this.done && this.bag === null && this.attempts < this.cfg.bags && this.now >= this.reloadUntil;
  }

  private startSlingshot(p: Phaser.Input.Pointer): void {
    this.aimDrag = { id: p.id, startX: p.worldX, startY: p.worldY, startAngle: this.angleDeg, startYaw: this.yawDeg };
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
    this.view.player.setPose('charge');
    audio.play('rustle');
  }

  private release(): void {
    if (!this.charging) return;
    this.charging = false;
    if (!this.canThrow()) return;
    this.throwBag(powerFromCharge(this.chargeRatio));
  }

  private launchState(power: number): Flight3 {
    const v = launchVelocity3(this.angleDeg, this.yawDeg, power);
    // Throwing on the run: the bag keeps the runner's speed.
    return { x: this.releaseX(), y: RELEASE_Y, z: this.laneZ, vx: v.vx + this.chase.vx, vy: v.vy, vz: v.vz, bounces: 0 };
  }

  private throwBag(power: number): void {
    this.attempts += 1;
    this.throwOriginX = this.releaseX();
    this.bag = this.launchState(power);
    this.flightMs = 0;
    this.lastSurface = null;
    this.view.spawnBag(PLAYER_BAG_ID, this.bag);
    this.view.player.setPose('throw').setBagVisible(false).setCharge(0);
    this.time.delayedCall(350, () => {
      if (!this.done) this.view.player.setPose('idle').setFace('focus');
    });
    audio.play('throw');
    haptic('tap');
    this.dismissTutorial();
    track('throw_garbage', {
      difficulty: this.setup.difficulty, attempt: this.attempts, angle: Math.round(this.angleDeg), yaw: Math.round(this.yawDeg), power: Math.round(power),
    });
    this.updateHud();
  }

  // ── Simulation ──────────────────────────────────────────
  update(_t: number, delta: number): void {
    this.now += delta;
    const scale = this.slowMo ? C.slowMoScale : 1;
    this.simAccum += (delta * scale) / 1000;
    let steps = 0;
    while (this.simAccum >= C.simDt && steps < 40) {
      this.simAccum -= C.simDt;
      steps += 1;
      this.stepSim();
    }
    const rearX = this.truckRear;
    const speed = truckSpeedAt(this.truckTimeMs, this.cfg.truckSpeed);
    this.view.setTruck(rearX, speed, delta * scale);
    this.updateCrowd(delta * scale, rearX, speed);
    this.updateChase(delta * scale, rearX);
    if (!this.truckMoving && speed > 0 && !this.done) {
      this.truckMoving = true;
      this.banner('垃圾車開走了！快丟！', '#ff6b6b');
    }

    if (!this.done) {
      if (!this.slowMo) this.clock = tickClock(this.clock, delta);
      if (this.charging) {
        this.chargeRatio = Math.min(1, (this.now - this.chargeStart) / C.chargeTimeMs);
        this.view.player.setCharge(this.chargeRatio);
      }
      if (this.bag && !this.slowMo && willHitSoon3(this.bag, this.truckTimeMs, this.truckStartX, this.cfg.truckSpeed, this.cfg.openingWidth, this.lane())) {
        this.startSlowMo();
      }
      if (this.slowMo && this.now > this.slowMoUntil) this.endSlowMo();
      if (!this.bag) {
        if (rearX > C.truckLeaveX) this.fail('truck_left');
        else if (isExpired(this.clock)) this.fail('throw_timeout');
      }
      if (this.bag === null && this.now >= this.reloadUntil && this.attempts < this.cfg.bags) this.view.player.setBagVisible(true);
      this.updatePreview();
      this.updateHud();
    }
    this.view.tick(delta * scale, this.yawDeg);
  }

  private lane() {
    return DEFAULT_LANE;
  }

  private stepSim(): void {
    this.truckTimeMs += C.simDt * 1000;
    const shape = truckShape(this.truckRear, C.groundY, this.cfg.openingWidth);
    const tv = truckSpeedAt(this.truckTimeMs, this.cfg.truckSpeed);
    this.stepNeighborBags(shape, tv);
    if (!this.bag) return;
    this.flightMs += C.simDt * 1000;
    const res = advanceBag3(this.bag, shape, tv, C.groundY, this.lane());
    const next = res.state;
    this.view.syncBag(PLAYER_BAG_ID, next, C.simDt * 1000);
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
    const offscreen = next.x > C.width + 400 || next.x < -200 || Math.abs(next.z) > 600;
    if (offscreen || this.flightMs > C.maxFlightSec * 1000) this.onMiss(next, this.strandedMiss(next));
  }

  // ── Neighbours ──────────────────────────────────────────
  private updateCrowd(delta: number, rearX: number, speed: number): void {
    if (this.neighbors.length === 0) return;
    const res = stepNeighbors(this.neighbors, this.now, delta, { rearX, speed, openingWidth: this.cfg.openingWidth }, this.crowdRng);
    this.neighbors = res.neighbors;
    res.throws.forEach((cmd) => {
      const id = this.nextBagId++;
      const state: Flight3 = { x: cmd.x, y: cmd.y, z: cmd.z, vx: cmd.vx, vy: cmd.vy, vz: cmd.vz, bounces: 0 };
      this.neighborBags.set(id, { owner: cmd.neighborId, state });
      this.view.spawnBag(id, state, [0xffd166, 0x7ed957, 0x6ec6ff, 0xb388ff, 0xff9ec7][cmd.neighborId % 5]);
      this.view.neighborPose(cmd.neighborId, 'throw');
    });
    this.view.setNeighbors(this.neighbors);
  }

  private stepNeighborBags(shape: ReturnType<typeof truckShape>, truckVx: number): void {
    this.neighborBags.forEach((b, id) => {
      const res = advanceBag3(b.state, shape, truckVx, C.groundY, this.lane());
      b.state = res.state;
      this.view.syncBag(id, res.state, C.simDt * 1000);
      if (res.kind === 'flying') return;
      this.neighborBags.delete(id);
      this.view.removeBag(id, res.kind === 'hit' ? 'hit' : 'miss');
      const n = this.neighbors.find((x) => x.id === b.owner);
      const name = n?.name ?? '鄰居';
      if (res.kind === 'hit') {
        this.neighbors = recordNeighborHit(this.neighbors, b.owner);
        this.view.neighborPose(b.owner, 'cheer');
        if (!this.done) this.pop(res.state, `${name}丟進了！`, '#7ed957', 30);
      } else {
        this.view.neighborPose(b.owner, 'cry');
        if (!this.done) this.pop(res.state, `${name}：唉唷！`, '#ffffff', 26);
      }
    });
  }

  // ── Outcomes ────────────────────────────────────────────
  /** Miss reason when the bag leaves the area or never settles (e.g. riding off on the roof). */
  private strandedMiss(at: Flight3): MissKind {
    if (this.lastSurface === 'box' || this.lastSurface === 'cab') return 'roof';
    return at.x > 0 ? 'overshoot' : 'ground';
  }

  private onBounce(at: Flight3, surface: Surface): void {
    this.lastSurface = surface;
    if (surface === 'ground') {
      audio.play('thud');
      return;
    }
    audio.play('bounce');
    haptic('bounce');
    this.view.shake();
    this.pop({ ...at, y: at.y - 40 }, Phaser.Math.RND.pick(['彈！', '咚！', '鏘！']), '#ffffff', 30);
  }

  private startSlowMo(): void {
    if (!this.bag) return;
    this.slowMo = true;
    this.slowMoUntil = this.now + C.slowMoMs / C.slowMoScale;
    this.hud.setVisible(false);
    this.view.setSlowMo(this.bag);
  }

  private endSlowMo(): void {
    if (!this.slowMo) return;
    this.slowMo = false;
    this.hud.setVisible(true);
    this.view.setSlowMo(null);
  }

  private onHit(at: Flight3, crossX: number, perfect: boolean): void {
    this.done = true;
    this.bag = null;
    this.clock = pauseClock(this.clock);
    const distanceM = Math.round(((crossX - this.throwOriginX) / C.pxPerMeter) * 10) / 10;
    const beaten = this.neighbors.filter((n) => n.hits === 0).length;
    this.view.removeBag(PLAYER_BAG_ID, 'hit');
    this.view.setTargetVisible(false);
    this.view.setPreview(null);
    audio.play('hit');
    haptic('hit');
    this.time.delayedCall(150, () => audio.play('success'));
    this.view.player.setPose('cheer');
    const s = this.view.toScreen(at);
    this.confetti(s.x, s.y);
    this.pop(at, perfect ? '完美命中！' : '命中！', '#ffe066', 60, -60);
    this.pop(at, `${distanceM.toFixed(1)} 公尺`, '#ffffff', 40, 10);
    if (this.hitBounces > 0) this.pop(at, `反彈 ${this.hitBounces} 次進車！`, '#7CFC00', 40, -130);
    if (beaten > 0) this.pop(at, `搶先 ${beaten} 位鄰居！`, '#6ec6ff', 36, -190);
    if (perfect) track('perfect_throw', { difficulty: this.setup.difficulty, distance: distanceM });
    this.time.delayedCall(700, () => this.endSlowMo());
    this.time.delayedCall(2000, () => this.toResult({ success: true, failReason: null, throwDistanceM: distanceM, perfect }, beaten));
  }

  private onMiss(at: Flight3, kind: MissKind): void {
    this.bag = null;
    this.lastMiss = kind;
    this.endSlowMo();
    this.view.removeBag(PLAYER_BAG_ID, 'miss');
    audio.play('miss');
    this.pop({ ...at, x: clamp(at.x, 120, C.width - 120), y: C.groundY - 200 }, MISS_TEXT[kind], '#ff6b6b', 38);
    this.view.player.setFace('shock');
    this.reloadUntil = this.now + C.reloadMs;
    if (this.done) return;
    if (this.attempts >= this.cfg.bags) {
      // Decide immediately so "truck left" can't pre-empt the real reason.
      this.fail(isExpired(this.clock) ? 'throw_timeout' : 'out_of_bags');
    } else if (!isExpired(this.clock)) {
      this.pop({ x: this.chase.x + 40, y: C.groundY - 180, z: this.laneZ }, `再拿一袋！剩 ${this.cfg.bags - this.attempts} 袋`, '#ffffff', 28);
    }
  }

  private fail(reason: FailReason): void {
    if (this.done) return;
    this.done = true;
    this.charging = false;
    this.clock = pauseClock(this.clock);
    this.view.setPreview(null);
    audio.stopMusic();
    audio.play('fail');
    haptic('fail');
    this.view.player.setPose('cry');
    const msg: Record<FailReason, string> = {
      truck_left: '垃圾車開走了…',
      throw_timeout: '時間到！',
      out_of_bags: '三袋都沒進…',
      stairs_timeout: '時間到！',
    };
    this.banner(msg[reason], '#ff6b6b');
    this.time.delayedCall(1500, () => this.toResult({ success: false, failReason: reason, throwDistanceM: null, perfect: false }, 0));
  }

  private toResult(r: Pick<RunOutcome, 'success' | 'failReason' | 'throwDistanceM' | 'perfect'>, neighborsBeaten: number): void {
    if (!gameFlow.go('result')) return;
    audio.stopMusic();
    const outcome: RunOutcome = {
      setup: this.setup,
      sort: this.sort,
      stair: this.stair,
      lastMiss: this.lastMiss,
      attemptsUsed: this.attempts,
      remainingSec: Math.round(remainingMs(this.clock) / 100) / 10,
      bounces: r.success ? this.hitBounces : 0,
      neighborsBeaten,
      ...r,
    };
    this.scene.start('Result', outcome);
  }

  // ── Visual helpers ──────────────────────────────────────
  private pop(at: P3, message: string, color: string, size: number, dy = 0): void {
    const s = this.view.toScreen(at);
    popText(this, clamp(s.x, 110, C.width - 110), clamp(s.y + dy, topY(200), this.panelTop - 60), message, color, size);
  }

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
      .text(W * 0.74, y, this.view.is3D ? '右手按住蓄力\n上下左右滑瞄準，放開丟 👉' : '右手按住蓄力\n上下滑瞄準，放開丟 👉', {
        ...TEXT.hud, fontSize: '24px', align: 'center', color: '#ffe066',
      })
      .setOrigin(0.5);
    const arrows = this.add
      .text(W * 0.74, this.panelTop + 30, this.view.is3D ? '▲\n◀ ▼ ▶' : '▲\n▼', { ...TEXT.hud, fontSize: '30px', align: 'center', color: '#ffe066' })
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

  private updatePreview(): void {
    if (!this.canThrow()) {
      this.view.setPreview(null);
      return;
    }
    const start = this.launchState(powerFromCharge(this.charging ? this.chargeRatio : 0));
    const points = [start, ...predictPath3(start, PREVIEW_STEPS, C.groundY)];
    this.view.setPreview({ points, pitchDeg: this.angleDeg, yawDeg: this.yawDeg, showLabel: this.aimDrag !== null });
  }

  private updateHud(): void {
    const rem = remainingMs(this.clock);
    this.timeText.setText(`⏱ ${(rem / 1000).toFixed(1)}`).setColor(rem < 5000 ? '#ff6b6b' : '#ffffff');
    const centre = this.truckRear + C.truck.lipWidth + this.cfg.openingWidth / 2;
    const m = Math.max(0, (centre - this.releaseX()) / C.pxPerMeter);
    this.distText.setText(`距離 ${m.toFixed(1)} 公尺\n基礎 ${distanceBasePoints(m)} 分`);
    const yaw = Math.round(this.yawDeg);
    this.angleText.setText(this.view.is3D ? `角度 ${Math.round(this.angleDeg)}° ${yaw === 0 ? '↑' : yaw > 0 ? `→${yaw}°` : `←${-yaw}°`}` : `角度 ${Math.round(this.angleDeg)}°`);
    if (this.neighbors.length > 0) {
      const scored = this.neighbors.filter((n) => n.hits > 0).length;
      this.crowdText.setText(`鄰居進球 ${scored}/${this.neighbors.length}`);
    }

    this.bagIcons.clear();
    for (let i = 0; i < this.cfg.bags; i++) {
      if (i >= this.attempts) drawBag(this.bagIcons, 250 + i * 44, 106, 0.8);
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
