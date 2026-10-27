import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import { Player } from '../objects/Player';
import { drawIronWindow, drawTiledWall } from '../objects/Scenery';
import { drawBag } from '../objects/Player';
import { TUNES, tuneForSeed, type TuneId } from '../config/tunes';
import { audio } from '../systems/AudioSystem';
import { gameFlow } from '../systems/GameFlow';
import type { RunSetup } from '../types';
import { Button } from '../ui/Button';
import { onKey } from '../ui/keys';
import { centerView, fillViewExtents, topY } from '../ui/view';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';

const KEY_ARM_MS = 400;

/** Skippable story beat. The game clock does not run here. */
export class IntroScene extends Phaser.Scene {
  private setup!: RunSetup;
  private player!: Player;
  private leaving = false;
  private tuneId: TuneId = 'furElise';

  constructor() {
    super('Intro');
  }

  init(setup: RunSetup): void {
    this.setup = setup;
    this.leaving = false;
    this.tuneId = tuneForSeed(setup.seed);
  }

  create(): void {
    const { width: W, height: H } = GAME_CONFIG;
    const floor = DIFFICULTY_CONFIG[this.setup.difficulty].startFloor;
    centerView(this);
    fillViewExtents(this, 0xf3e7c9, 0xb08968);
    const g = this.add.graphics();
    drawTiledWall(g, 0, 0, W, H, 0xf3e7c9, 0xe6d6ae, 30);
    g.fillStyle(0xb08968, 1);
    g.fillRect(0, 900, W, H - 900);
    g.fillStyle(0x9c7a5a, 1);
    for (let x = 0; x < W; x += 90) g.fillRect(x, 900, 4, H - 900);
    drawIronWindow(g, 400, 260, 250, 210);
    // Sofa
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(70, 700, 360, 210, 30);
    g.fillStyle(0x6a994e, 1);
    g.fillRoundedRect(76, 706, 348, 120, 26);
    g.fillStyle(0x86b25f, 1);
    g.fillRoundedRect(76, 800, 348, 100, 20);
    // TV stand + calendar
    g.fillStyle(COLORS.ink, 1);
    g.fillRect(470, 760, 210, 140);
    g.fillStyle(0x8d6e63, 1);
    g.fillRect(474, 764, 202, 132);
    g.fillStyle(0xffffff, 1);
    g.fillRect(120, 240, 150, 180);
    g.fillStyle(0xe63946, 1);
    g.fillRect(120, 240, 150, 40);
    this.add.text(195, 350, '週二\n倒垃圾', { fontFamily: FONT_FAMILY, fontSize: '30px', fontStyle: '900', color: '#2d1b00', align: 'center' }).setOrigin(0.5);
    // The forgotten bag next to the door
    const bagG = this.add.graphics();
    drawBag(bagG, 560, 1010, 1.6);

    this.add.text(W / 2, topY(90), `${floor} 樓・晚上 7:58`, { ...TEXT.h2, fontSize: '40px' }).setOrigin(0.5);

    this.player = new Player(this, 250, 860, 1.3).setPose('phone').setBagVisible(false);
    const phone = this.add.rectangle(290, 735, 22, 36, 0x222222).setStrokeStyle(3, 0x7fd0ff);

    const bubble = this.add
      .text(W / 2, 560, '', { ...TEXT.title, fontSize: '68px', align: 'center' })
      .setOrigin(0.5)
      .setDepth(10);

    const say = (text: string, size = 68) => {
      bubble.setText(text).setFontSize(size).setScale(0.6).setAlpha(1);
      this.tweens.add({ targets: bubble, scale: 1, duration: 220, ease: 'Back.easeOut' });
    };

    this.time.delayedCall(700, () => say('（滑手機中…）', 44));
    this.time.delayedCall(1600, () => {
      audio.startTruckMusic(this.tuneId, 0.9);
      this.spawnNotes();
      say('等等……');
    });
    this.time.delayedCall(2800, () => {
      this.player.setFace('shock');
      say(`這聲音是……\n〈${TUNES[this.tuneId].title}〉`, 56);
    });
    this.time.delayedCall(4000, () => {
      say('垃圾車來了！！！', 76);
      this.cameras.main.shake(500, 0.02);
      phone.setVisible(false);
      bagG.setVisible(false);
      this.player.setPose('run').setFace('panic').setBagVisible(true).setRunSpeed(1);
      this.tweens.add({ targets: this.player, x: 560, y: 1000, duration: 700, delay: 200 });
    });
    this.time.delayedCall(5400, () => this.proceed());

    new Button(this, W - 110, topY(180), { width: 180, height: 70, label: '跳過 ▶▶', fontSize: 28, fill: COLORS.white, onClick: () => this.proceed() });
    onKey(this, 'keydown-SPACE', () => this.proceed(), KEY_ARM_MS);
    onKey(this, 'keydown-ENTER', () => this.proceed(), KEY_ARM_MS);
  }

  private spawnNotes(): void {
    this.time.addEvent({
      delay: 260,
      repeat: 14,
      callback: () => {
        const n = this.add
          .text(Phaser.Math.Between(420, 640), 470, Phaser.Math.RND.pick(['♪', '♫', '♬']), {
            fontFamily: FONT_FAMILY, fontSize: '44px', fontStyle: '900', color: '#e85d04', stroke: '#ffffff', strokeThickness: 6,
          })
          .setOrigin(0.5);
        this.tweens.add({ targets: n, y: 300, x: n.x - 120, alpha: 0, duration: 1600, onComplete: () => n.destroy() });
      },
    });
  }

  private proceed(): void {
    if (this.leaving) return;
    this.leaving = true;
    audio.unlock();
    if (!gameFlow.go('sort')) return;
    this.scene.start('Sort', this.setup);
  }

  update(_t: number, delta: number): void {
    this.player.tick(delta);
  }
}
