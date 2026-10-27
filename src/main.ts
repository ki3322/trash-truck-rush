import Phaser from 'phaser';
import './style.css';
import { GAME_CONFIG } from './config/gameConfig';
import { VIEW } from './ui/view';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { IntroScene } from './scenes/IntroScene';
import { SortScene } from './scenes/SortScene';
import { StairScene } from './scenes/StairScene';
import { ThrowScene } from './scenes/ThrowScene';
import { ResultScene } from './scenes/ResultScene';
import { initAnalytics, track } from './systems/AnalyticsSystem';
import { audio } from './systems/AudioSystem';
import { challengeFromLocation } from './systems/ChallengeSystem';
import { setDifficulty, setPendingChallenge } from './state';

initAnalytics(import.meta.env.VITE_GA_ID as string | undefined);

const challenge = challengeFromLocation(window.location.search);
if (challenge) {
  setPendingChallenge(challenge);
  setDifficulty(challenge.difficulty);
  track('challenge_open', { difficulty: challenge.difficulty });
}

// Block pinch/double-tap zoom and scroll bounce inside the game.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
// Long-press on phones would open the image/context menu over the game.
document.addEventListener('contextmenu', (e) => e.preventDefault());
// iOS only allows audio after a touch: unlock on the very first one, anywhere.
document.addEventListener('pointerdown', () => audio.unlock(), { passive: true });

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Transparent so the Three.js layer underneath shows through in 3D scenes.
  transparent: true,
  width: GAME_CONFIG.width,
  height: VIEW.height,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 3 },
  render: { antialias: true, roundPixels: false },
  scene: [BootScene, MenuScene, IntroScene, SortScene, StairScene, ThrowScene, ResultScene],
});

// Expose for automated playtesting in development only.
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, unknown>;
  w.__game = game;
  void import('./utils/physics').then((m) => (w.__physics = m));
  void import('./utils/physics3d').then((m) => (w.__physics3d = m));
  void import('./systems/NeighborAI').then((m) => (w.__ai = m));
}
