import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import { DISCLAIMER, HOW_TO_PLAY } from '../config/texts';
import { GarbageTruck } from '../objects/GarbageTruck';
import { Player } from '../objects/Player';
import { drawApartmentFacade, drawSky, drawStreet } from '../objects/Scenery';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { challengeHeadline } from '../systems/ChallengeSystem';
import { gameFlow } from '../systems/GameFlow';
import { withSound, withVibration } from '../systems/StorageSystem';
import { haptic, hapticsSupported, setHapticsEnabled } from '../systems/Haptics';
import { getDifficulty, getPendingChallenge, getSave, setDifficulty, setPendingChallenge, updateSave } from '../state';
import { DIFFICULTIES, type Difficulty, type RunSetup } from '../types';
import { Button } from '../ui/Button';
import { onKey } from '../ui/keys';
import { bottomY, centerView, fillViewExtents, topY } from '../ui/view';
import { showOverlay } from '../ui/Overlay';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';
import { randomSeed } from '../utils/rng';

export class MenuScene extends Phaser.Scene {
  private player!: Player;
  private truck!: GarbageTruck;
  private diffButtons: Partial<Record<Difficulty, Button>> = {};
  private challengePanel: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    const { width: W, height: H } = GAME_CONFIG;
    const groundY = 860;
    this.diffButtons = {};
    this.challengePanel = null;
    audio.stopMusic();
    centerView(this);
    fillViewExtents(this, 0x8fd3ff, 0xfff1c1);

    drawSky(this, W, H);
    drawStreet(this, W, groundY);
    drawApartmentFacade(this, 20, groundY, 260, 5, 120);

    this.truck = new GarbageTruck(this, 380, groundY, 90, false);
    this.player = new Player(this, 170, groundY, 1.15).setPose('run').setFace('panic').setRunSpeed(0.8);

    // Title
    const title = this.add.text(W / 2, topY(120), '垃圾車來了！', { ...TEXT.title, fontSize: '96px' }).setOrigin(0.5);
    this.add
      .text(W / 2, topY(205), '台灣人的極限運動', { ...TEXT.h2, fontSize: '40px', color: '#e85d04' })
      .setOrigin(0.5);
    this.add
      .text(W / 2, topY(252), 'Trash Truck Rush Taiwan', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '800', color: '#2d1b00', stroke: '#ffffff', strokeThickness: 5 })
      .setOrigin(0.5);
    this.tweens.add({ targets: title, y: topY(110), scale: 1.04, yoyo: true, repeat: -1, duration: 520, ease: 'Sine.easeInOut' });

    this.buildButtons();
    this.buildSoundToggle();
    this.buildVibrationToggle();

    const disclaimer = this.add
      .text(W / 2, bottomY(H - 34), DISCLAIMER, {
        fontFamily: FONT_FAMILY, fontSize: '18px', fontStyle: '600', color: '#ffffff', align: 'center',
        wordWrap: { width: W - 60, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 1);
    disclaimer.setBackgroundColor('rgba(0,0,0,0.45)').setPadding(10, 6, 10, 6);

    const challenge = getPendingChallenge();
    if (challenge) this.showChallenge();

    onKey(this, 'keydown-ENTER', () => this.startGame(), 400);
  }

  private buildButtons(): void {
    const { width: W } = GAME_CONFIG;
    new Button(this, W / 2, bottomY(920), { width: 440, height: 110, label: '開始倒垃圾', fontSize: 46, fill: COLORS.orange, onClick: () => this.startGame() });

    this.add.text(W / 2, bottomY(1000), '難度', { ...TEXT.small, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5).setStroke('#2d1b00', 5);
    DIFFICULTIES.forEach((d, i) => {
      const b = new Button(this, W / 2 + (i - 1) * 200, bottomY(1050), {
        width: 180, height: 70, label: DIFFICULTY_CONFIG[d].label, fontSize: 30,
        onClick: () => this.selectDifficulty(d),
      });
      this.diffButtons[d] = b;
    });
    this.refreshDifficulty();

    new Button(this, W / 2 - 150, bottomY(1150), { width: 270, height: 80, label: '遊戲玩法', fontSize: 30, fill: COLORS.white, onClick: () => showOverlay(this, '遊戲玩法', HOW_TO_PLAY) });
    new Button(this, W / 2 + 150, bottomY(1150), { width: 270, height: 80, label: '最佳紀錄', fontSize: 30, fill: COLORS.white, onClick: () => this.showRecords() });
  }

  private buildVibrationToggle(): void {
    if (!hapticsSupported()) return; // iOS Safari can't vibrate: don't show a dead toggle
    const label = (on: boolean) => (on ? '📳 震動開' : '📴 震動關');
    const b = new Button(this, GAME_CONFIG.width - 90, topY(380), {
      width: 150, height: 64, label: label(getSave().vibration), fontSize: 24, fill: COLORS.white,
      onClick: () => {
        const on = !getSave().vibration;
        updateSave((s) => withVibration(s, on));
        setHapticsEnabled(on);
        if (on) haptic('go');
        b.setLabel(label(on));
      },
    });
  }

  private buildSoundToggle(): void {
    const b = new Button(this, GAME_CONFIG.width - 90, topY(300), {
      width: 150, height: 64, label: getSave().sound ? '🔊 音效開' : '🔇 音效關', fontSize: 24, fill: COLORS.white,
      onClick: () => {
        audio.unlock();
        const on = !getSave().sound;
        updateSave((s) => withSound(s, on));
        audio.setEnabled(on);
        b.setLabel(on ? '🔊 音效開' : '🔇 音效關');
      },
    });
  }

  private selectDifficulty(d: Difficulty): void {
    if (getPendingChallenge()) return; // challenge locks the difficulty
    setDifficulty(d);
    this.refreshDifficulty();
    track('select_difficulty', { difficulty: d });
  }

  private refreshDifficulty(): void {
    const current = getDifficulty();
    DIFFICULTIES.forEach((d) => this.diffButtons[d]?.setFill(d === current ? COLORS.yellow : 0xd8d0bd));
  }

  private showRecords(): void {
    const save = getSave();
    const lines = DIFFICULTIES.flatMap((d) => {
      const b = save.best[d];
      return [
        `【${DIFFICULTY_CONFIG[d].label}】最高分 ${b.bestScore.toLocaleString('zh-TW')}`,
        `　最快下樓 ${b.bestTimeSec !== null ? `${b.bestTimeSec.toFixed(1)} 秒` : '—'}・最遠命中 ${b.bestDistanceM !== null ? `${b.bestDistanceM.toFixed(1)} 公尺` : '—'}`,
      ];
    });
    lines.push(`總遊玩 ${save.stats.plays} 次・成功 ${save.stats.wins}・失敗 ${save.stats.fails}`);
    showOverlay(this, '最佳紀錄', lines);
  }

  private showChallenge(): void {
    const c = getPendingChallenge();
    if (!c) return;
    const { width: W } = GAME_CONFIG;
    const panel = this.add.container(0, 0).setDepth(500);
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(36, 330, W - 72, 290, 24);
    g.fillStyle(0xfff3b0, 1);
    g.fillRoundedRect(36, 322, W - 72, 290, 24);
    g.lineStyle(5, COLORS.ink, 1);
    g.strokeRoundedRect(36, 322, W - 72, 290, 24);
    const head = this.add
      .text(W / 2, 352, '📣 好友挑戰！', { fontFamily: FONT_FAMILY, fontSize: '34px', fontStyle: '900', color: '#c1121f' })
      .setOrigin(0.5, 0);
    const body = this.add
      .text(W / 2, 404, `${challengeHeadline(c)}\n總分 ${c.targetScore.toLocaleString('zh-TW')}・${DIFFICULTY_CONFIG[c.difficulty].label}模式\n你有辦法打敗他嗎？`, {
        fontFamily: FONT_FAMILY, fontSize: '26px', fontStyle: '800', color: '#2d1b00', align: 'center', lineSpacing: 8,
        wordWrap: { width: W - 120, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);
    const accept = new Button(this, W / 2 - 120, 560, { width: 260, height: 74, label: '接受挑戰', fontSize: 32, fill: COLORS.orange, onClick: () => this.startGame() });
    const decline = new Button(this, W / 2 + 160, 560, {
      width: 180, height: 74, label: '自己玩', fontSize: 28, fill: COLORS.white,
      onClick: () => {
        setPendingChallenge(null);
        panel.destroy();
        this.challengePanel = null;
        this.refreshDifficulty();
      },
    });
    panel.add([g, head, body, accept, decline]);
    this.challengePanel = panel;
  }

  private startGame(): void {
    if (gameFlow.state !== 'menu') return;
    audio.unlock();
    const challenge = getPendingChallenge();
    const setup: RunSetup = {
      difficulty: challenge ? challenge.difficulty : getDifficulty(),
      seed: challenge ? challenge.seed : randomSeed(),
      challenge,
    };
    track('game_start', { difficulty: setup.difficulty, challenge: challenge !== null });
    gameFlow.go('intro');
    this.scene.start('Intro', setup);
  }

  update(_time: number, delta: number): void {
    this.player.tick(delta);
    // Menu truck idles in, drives off, loops.
    this.truck.x += (delta / 1000) * 40;
    if (this.truck.x > GAME_CONFIG.width + 40) this.truck.x = 300;
    this.truck.tick(delta, 40);
    if (this.challengePanel) this.challengePanel.setVisible(true);
  }
}
