import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import { FAIL_REASON_TEXT, MISS_TEXT, failLine, successLine } from '../config/texts';
import { Player } from '../objects/Player';
import { track } from '../systems/AnalyticsSystem';
import { audio } from '../systems/AudioSystem';
import { buildChallengeUrl } from '../systems/ChallengeSystem';
import { gameFlow } from '../systems/GameFlow';
import { canvasToBlob, renderShareCanvas } from '../systems/ShareImage';
import { buildShareText, copyText, downloadBlob, formatSeconds, shareToThreads, type ShareSummary } from '../systems/ShareSystem';
import { computeScore, starsFor, type ScoreBreakdown } from '../systems/ScoreSystem';
import { applyOutcome } from '../systems/StorageSystem';
import { getTitle } from '../systems/TitleSystem';
import { gameBaseUrl, getSave, updateSave } from '../state';
import type { RunOutcome, RunSetup } from '../types';
import { Button } from '../ui/Button';
import { onKey } from '../ui/keys';
import { bottomY, centerView, fillViewExtents, topY } from '../ui/view';
import { toast } from '../ui/Overlay';
import { COLORS, FONT_FAMILY, TEXT } from '../ui/theme';
import { randomSeed } from '../utils/rng';

const MAX_STARS = 3;
/** Score card geometry (design px). */
const CARD = { top: 452, height: 408, rowHeight: 32, rowHeightTight: 30 } as const;

export class ResultScene extends Phaser.Scene {
  private outcome!: RunOutcome;
  private summary!: ShareSummary;
  private imageBlob: Blob | null = null;
  private player!: Player;
  private leaving = false;

  constructor() {
    super('Result');
  }

  init(outcome: RunOutcome): void {
    this.outcome = outcome;
    this.imageBlob = null;
    this.leaving = false;
  }

  create(): void {
    const o = this.outcome;
    const { width: W, height: H } = GAME_CONFIG;
    const score = computeScore(o);
    const title = getTitle(o);
    const line = o.success ? successLine(Math.random) : failLine(o, Math.random);
    const prevBest = getSave().best[o.setup.difficulty].bestScore;
    updateSave((s) => applyOutcome(s, o, score.total));
    const challengeUrl = buildChallengeUrl(gameBaseUrl(), {
      version: GAME_CONFIG.version,
      difficulty: o.setup.difficulty,
      seed: o.setup.seed,
      targetScore: score.total,
      targetTimeSec: o.stair.reachedGround ? o.stair.stairTimeSec : null,
    });
    this.summary = { outcome: o, score: score.total, title, line, challengeUrl };
    this.trackOutcome(score.total);
    void this.prepareImage();

    // Background
    const bg = this.add.graphics();
    const [c1, c2] = o.success ? [0xffe680, 0xff9f43] : [0xcfd8e8, 0x7d8fb3];
    bg.fillGradientStyle(c1, c1, c2, c2, 1);
    bg.fillRect(0, 0, W, H);
    centerView(this);
    fillViewExtents(this, c1, c2);

    this.add.text(W / 2, topY(78), o.success ? '成功上車！🎉' : '失敗了…😭', { ...TEXT.title, fontSize: '80px' }).setOrigin(0.5);
    const sub = o.success
      ? `${DIFFICULTY_CONFIG[o.setup.difficulty].label}模式・${o.perfect ? '完美命中！' : `第 ${o.attemptsUsed} 袋命中`}`
      : `${FAIL_REASON_TEXT[o.failReason ?? 'throw_timeout']}${o.lastMiss && o.failReason === 'out_of_bags' ? `（${MISS_TEXT[o.lastMiss]}）` : ''}`;
    this.add.text(W / 2, topY(150), sub, { ...TEXT.body, fontSize: '28px', fontStyle: '800' }).setOrigin(0.5);

    this.drawStars(starsFor(o.success, score.total));
    this.player = new Player(this, 112, 430, 1.25).setPose(o.success ? 'cheer' : 'cry');

    const titleColor = o.success ? '#e85d04' : '#3d5a80';
    this.add.text(430, 290, `${title.emoji} ${title.name}`, { ...TEXT.h2, fontSize: '42px', color: titleColor, align: 'center', wordWrap: { width: 480, useAdvancedWrap: true } }).setOrigin(0.5);
    this.add.text(430, 336, title.description, { ...TEXT.small, fontSize: '22px' }).setOrigin(0.5);
    this.add
      .text(430, 392, `「${line}」`, { fontFamily: FONT_FAMILY, fontSize: '26px', fontStyle: '900', color: '#c1121f', align: 'center', wordWrap: { width: 460, useAdvancedWrap: true } })
      .setOrigin(0.5);

    this.drawCard(score, score.total > prevBest);
    this.buildButtons();
    if (o.success) audio.play('success');
  }

  /** Three stars under the headline; earned ones pop in one after another. */
  private drawStars(earned: number): void {
    const { width: W } = GAME_CONFIG;
    for (let i = 0; i < MAX_STARS; i++) {
      const on = i < earned;
      const star = this.add
        .text(W / 2 + (i - 1) * 84, topY(214), '★', { fontFamily: FONT_FAMILY, fontSize: '72px', color: on ? '#ffc400' : '#00000030', stroke: on ? '#2d1b00' : '#00000000', strokeThickness: on ? 8 : 0 })
        .setOrigin(0.5);
      if (!on) continue;
      star.setScale(0);
      this.tweens.add({ targets: star, scale: 1, delay: 300 + i * 260, duration: 320, ease: 'Back.easeOut', onStart: () => audio.play('count') });
    }
  }

  private drawCard(score: ScoreBreakdown, newRecord: boolean): void {
    const o = this.outcome;
    const { width: W } = GAME_CONFIG;
    const top = CARD.top;
    const g = this.add.graphics();
    g.fillStyle(COLORS.ink, 1);
    g.fillRoundedRect(40, top + 8, W - 80, CARD.height, 26);
    g.fillStyle(0xffffff, 0.95);
    g.fillRoundedRect(40, top, W - 80, CARD.height, 26);
    g.lineStyle(5, COLORS.ink, 1);
    g.strokeRoundedRect(40, top, W - 80, CARD.height, 26);

    const start = DIFFICULTY_CONFIG[o.setup.difficulty].startFloor;
    const stats = [
      o.stair.reachedGround ? `${start}F → 1F ✅` : `${start}F → ${o.stair.floorReached}F`,
      o.stair.reachedGround ? `下樓 ${formatSeconds(o.stair.stairTimeSec)}` : '沒下到一樓',
      ...(o.success && o.throwDistanceM !== null ? [`投擲 ${o.throwDistanceM.toFixed(1)} 公尺`] : []),
    ];
    this.add.text(W / 2, top + 22, stats.join('・'), { ...TEXT.small, fontSize: '24px', fontStyle: '800', color: '#6b5a3a' }).setOrigin(0.5, 0);

    const ch = o.setup.challenge;
    if (ch) {
      const beat = score.total > ch.targetScore;
      const target = ch.targetScore.toLocaleString('zh-TW');
      this.add
        .text(W / 2, top + 58, beat ? `🏅 挑戰成功！贏過朋友的 ${target} 分` : `挑戰失敗…朋友 ${target} 分`, {
          fontFamily: FONT_FAMILY, fontSize: '24px', fontStyle: '900', color: beat ? '#2a9d8f' : '#c1121f',
        })
        .setOrigin(0.5, 0);
    }

    // One row per score line, so it is clear where the points came from.
    const rowsTop = top + (ch ? 98 : 70);
    score.lines.forEach((l, i) => {
      const y = rowsTop + i * (ch ? CARD.rowHeightTight : CARD.rowHeight);
      this.add.text(80, y, l.label, { ...TEXT.small, fontSize: '24px', fontStyle: '700' });
      this.add.text(W - 80, y, `+${l.points.toLocaleString('zh-TW')}`, { ...TEXT.small, fontSize: '24px', fontStyle: '900', color: '#e85d04' }).setOrigin(1, 0);
    });
    if (score.lines.length === 0) this.add.text(W / 2, rowsTop + 20, '這次沒有拿到分數…', { ...TEXT.small, fontSize: '24px', color: '#6b5a3a' }).setOrigin(0.5, 0);

    const totalY = top + CARD.height - 92;
    g.lineStyle(3, COLORS.ink, 0.25);
    g.lineBetween(76, totalY - 6, W - 76, totalY - 6);
    this.add.text(80, totalY + 24, '最終得分', { ...TEXT.body, color: '#6b5a3a' });
    const scoreText = this.add
      .text(W - 80, totalY, '0', { ...TEXT.title, fontSize: '68px', color: '#e85d04', strokeThickness: 8 })
      .setOrigin(1, 0);
    this.tweens.addCounter({
      from: 0,
      to: score.total,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => scoreText.setText(Math.round(tw.getValue() ?? 0).toLocaleString('zh-TW')),
    });

    if (newRecord && score.total > 0) {
      const badge = this.add
        .text(W - 110, top - 10, '新紀錄！', { fontFamily: FONT_FAMILY, fontSize: '26px', fontStyle: '900', color: '#ffffff', backgroundColor: '#e63946', padding: { x: 12, y: 6 } })
        .setOrigin(0.5)
        .setAngle(8);
      this.tweens.add({ targets: badge, scale: 1.12, yoyo: true, repeat: -1, duration: 400 });
    }
  }

  private buildButtons(): void {
    const { width: W } = GAME_CONFIG;
    const o = this.outcome;
    new Button(this, W / 2, bottomY(920), { width: 520, height: 100, label: '再倒一次', fontSize: 42, fill: COLORS.orange, onClick: () => this.retry() });
    new Button(this, W / 2, bottomY(1030), {
      width: 520, height: 90, label: o.success ? '分享 Threads' : '分享我的慘況', fontSize: 34, fill: COLORS.ink, textColor: '#ffffff',
      onClick: () => void this.share(),
    });
    new Button(this, W / 2 - 135, bottomY(1135), { width: 250, height: 80, label: '下載成績圖片', fontSize: 26, fill: COLORS.white, onClick: () => void this.download() });
    new Button(this, W / 2 + 135, bottomY(1135), { width: 250, height: 80, label: '複製挑戰連結', fontSize: 26, fill: COLORS.white, onClick: () => void this.copyLink() });
    new Button(this, W / 2, bottomY(1225), { width: 250, height: 70, label: '回首頁', fontSize: 26, fill: 0xd8d0bd, onClick: () => this.home() });
    // Armed late so a Space still held from the throw can't skip the results.
    onKey(this, 'keydown-ENTER', () => this.retry(), 800);
    onKey(this, 'keydown-SPACE', () => this.retry(), 800);
  }

  private trackOutcome(score: number): void {
    const o = this.outcome;
    const params = { difficulty: o.setup.difficulty, score, stair_time: o.stair.stairTimeSec };
    if (o.success) track('game_complete', { ...params, distance: o.throwDistanceM ?? 0, perfect: o.perfect });
    else track('game_fail', { ...params, reason: o.failReason ?? 'unknown' });
    if (o.setup.challenge) track('challenge_complete', { difficulty: o.setup.difficulty, beat: score > o.setup.challenge.targetScore });
  }

  private async prepareImage(): Promise<Blob | null> {
    if (this.imageBlob) return this.imageBlob;
    try {
      this.imageBlob = await canvasToBlob(renderShareCanvas(this.summary));
    } catch {
      this.imageBlob = null;
    }
    return this.imageBlob;
  }

  private async share(): Promise<void> {
    const text = buildShareText(this.summary);
    // Start the clipboard write while we still hold the tap's user activation;
    // opening a tab or share sheet afterwards would make it fail.
    const copied = copyText(text);
    // Use the pre-rendered image so the share call stays inside the tap gesture.
    const result = await shareToThreads(text, this.imageBlob);
    track('share_result', { method: result, success: this.outcome.success });
    if (result === 'opened_threads') {
      toast(this, (await copied) ? '已開啟 Threads，文案也複製好了！\n圖片可用「下載成績圖片」附上' : '已開啟 Threads！圖片可用「下載成績圖片」附上');
    } else if (result === 'failed') {
      toast(this, (await copied) ? '無法開啟 Threads，已複製分享文案' : '分享失敗，請改用下載圖片');
    }
  }

  private async download(): Promise<void> {
    const blob = await this.prepareImage();
    if (!blob) {
      toast(this, '這個瀏覽器無法產生圖片 😢');
      return;
    }
    downloadBlob(blob, `trash-truck-rush-${this.summary.score}.png`);
    track('download_result', { difficulty: this.outcome.setup.difficulty });
    toast(this, '成績圖片已下載！');
  }

  private async copyLink(): Promise<void> {
    const ok = await copyText(this.summary.challengeUrl);
    toast(this, ok ? '挑戰連結已複製！快傳給朋友 👉' : this.summary.challengeUrl);
  }

  private retry(): void {
    if (this.leaving || !gameFlow.go('intro')) return;
    this.leaving = true;
    const o = this.outcome;
    track('retry_game', { difficulty: o.setup.difficulty });
    const setup: RunSetup = {
      difficulty: o.setup.difficulty,
      seed: o.setup.challenge ? o.setup.challenge.seed : randomSeed(),
      challenge: o.setup.challenge,
    };
    this.scene.start('Intro', setup);
  }

  private home(): void {
    if (this.leaving || !gameFlow.go('menu')) return;
    this.leaving = true;
    this.scene.start('Menu');
  }

  update(_t: number, delta: number): void {
    this.player.tick(delta);
  }
}
