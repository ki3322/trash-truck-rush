/**
 * All tunable gameplay numbers live here. Scenes and systems read from this
 * file only, so balancing never requires touching game logic.
 */
export const GAME_CONFIG = {
  version: 1,
  width: 720,
  height: 1280,
  countdownSec: 3,

  // ── Sorting (before the stairs) ──────────────────────────
  sortMistakePenaltyMs: 1500,
  perfectSortBonus: 200,
  sortSwipeMinPx: 70,

  // ── Stairs ───────────────────────────────────────────────
  stepsPerFlight: 8,
  landingUnits: 3,
  stepWidth: 48,
  stepHeight: 26,
  landingWidth: 120,
  stairLeftX: 160,
  stairTopY: 300,
  baseStride: 1,
  comboStrideBonus: 0.1,
  maxRunSpeed: 1.8,
  comboResetMs: 700,
  stumbleStunMs: 400,
  slipperSlowFactor: 0.55,
  slipperSlowMs: 3000,
  bagTearStillMs: 1000,
  eventMarginUnits: 8,

  // ── Throw ────────────────────────────────────────────────
  gravity: 900,
  minThrowPower: 320,
  maxThrowPower: 900,
  chargeTimeMs: 1100,
  minAngleDeg: 15,
  maxAngleDeg: 75,
  defaultAngleDeg: 45,
  bagRadius: 16,
  pxPerMeter: 50,
  simDt: 1 / 120,
  playerX: 90,
  groundY: 1010,
  releaseOffsetX: 26,
  releaseOffsetY: -92,
  truckIdleMs: 1200,
  truckAccelMs: 1500,
  truckLeaveX: 712,
  reloadMs: 650,
  slowMoMs: 500,
  slowMoScale: 0.25,
  slowMoLookaheadSec: 0.3,
  predictionSteps: 150,

  // Chasing the truck (hold 追！). Stamina stops players parking behind it.
  chaseSpeed: 170,
  chaseAccel: 900,
  staminaMax: 100,
  staminaDrainPerSec: 40,
  staminaRegenPerSec: 25,
  staminaMinToRun: 20,
  chaseMaxX: 600,
  /** Closest the runner may get to the truck's rear (px). */
  chaseGapPx: 70,
  /** Slingshot aiming: degrees per pixel of vertical thumb drag on the throw button. */
  slingshotDegPerPx: 0.3,

  // Bounces: the bag rebounds off the truck and the ground and can still drop in.
  truckRestitution: 0.55,
  truckFriction: 0.85,
  groundRestitution: 0.45,
  groundFriction: 0.7,
  /** Below this rebound speed (px/s) the bag stops bouncing and the throw is over. */
  settleSpeed: 140,
  maxBounces: 5,
  maxFlightSec: 6,

  // Truck body (pixels, relative to the truck's rear x / ground)
  truck: {
    lipWidth: 10,
    lipHeight: 44,
    rimHeight: 150,
    boxWidth: 170,
    boxHeight: 210,
    cabWidth: 80,
    cabHeight: 165,
    chassisClearance: 34,
    wheelRadius: 26,
  },

  // ── Scoring ──────────────────────────────────────────────
  perfectZoneRatio: 0.36,
  perfectHitBonus: 500,
  firstTryBonus: 300,
  timeBonusPerSec: 20,
  noMistakeBonus: 300,
  momBagBonus: 200,
  bankShotBonus: 200,
  failFloorPoints: 100,
  failGroundBonus: 200,
  distanceTiers: [
    { minM: 10, points: 1500 },
    { minM: 7, points: 1000 },
    { minM: 5, points: 600 },
    { minM: 3, points: 300 },
    { minM: 0, points: 100 },
  ],

  // ── Titles ───────────────────────────────────────────────
  longShotM: 7,
  clutchRemainingSec: 3,
} as const;

export type GameConfig = typeof GAME_CONFIG;
