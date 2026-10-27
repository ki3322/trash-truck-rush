import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import { FONT_FAMILY } from '../ui/theme';
import type { ShareSummary } from './ShareSystem';
import { formatSeconds } from './ShareSystem';

const SIZE = 1080;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTruck(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#f5c400';
  ctx.fillRect(0, -110, 90, 70);
  ctx.fillRect(100, -150, 170, 110);
  ctx.fillStyle = '#ffd93b';
  ctx.fillRect(270, -120, 80, 80);
  ctx.fillStyle = '#7fd0ff';
  ctx.fillRect(295, -110, 45, 32);
  ctx.fillStyle = '#2b2b2b';
  ctx.fillRect(10, -110, 70, 12);
  ctx.fillStyle = '#3a8f3a';
  ctx.fillRect(100, -90, 170, 14);
  ctx.fillStyle = '#222';
  [60, 200, 310].forEach((wx) => {
    ctx.beginPath();
    ctx.arc(wx, -32, 28, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#bbb';
  [60, 200, 310].forEach((wx) => {
    ctx.beginPath();
    ctx.arc(wx, -32, 11, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

/** Render the 1080×1080 result card. */
export function renderShareCanvas(s: ShareSummary): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const o = s.outcome;
  const diff = DIFFICULTY_CONFIG[o.setup.difficulty];

  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, o.success ? '#ffe680' : '#cfd8e8');
  bg.addColorStop(1, o.success ? '#ff9f43' : '#7d8fb3');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Tile pattern
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#ffffff';
  for (let y = 0; y < SIZE; y += 40) {
    for (let x = (y / 40) % 2 === 0 ? 0 : 20; x < SIZE; x += 40) ctx.fillRect(x, y, 18, 18);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#2d1b00';
  ctx.font = `900 96px ${FONT_FAMILY}`;
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText('《垃圾車來了！》', SIZE / 2, 140);
  ctx.fillText('《垃圾車來了！》', SIZE / 2, 140);
  ctx.font = `700 44px ${FONT_FAMILY}`;
  ctx.fillText(`台灣人的極限運動・${diff.label}模式`, SIZE / 2, 205);

  roundRect(ctx, 90, 250, 900, 600, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#2d1b00';
  ctx.stroke();

  ctx.fillStyle = o.success ? '#e85d04' : '#3d5a80';
  ctx.font = `900 76px ${FONT_FAMILY}`;
  ctx.fillText(`${s.title.emoji} ${s.title.name}`, SIZE / 2, 350);

  ctx.fillStyle = '#2d1b00';
  ctx.font = `800 50px ${FONT_FAMILY}`;
  ctx.fillText(
    o.success ? `我從 ${diff.startFloor} 樓衝下來！成功上車！` : `我從 ${diff.startFloor} 樓衝下來…失敗了`,
    SIZE / 2,
    440,
  );

  const rows: [string, string][] = [
    ['下樓時間', o.stair.reachedGround ? formatSeconds(o.stair.stairTimeSec) : '沒下到一樓'],
    ['投擲距離', o.success && o.throwDistanceM !== null ? `${o.throwDistanceM.toFixed(1)} 公尺` : '—'],
    ['最終得分', s.score.toLocaleString('zh-TW')],
  ];
  ctx.font = `700 46px ${FONT_FAMILY}`;
  rows.forEach(([k, v], i) => {
    const y = 530 + i * 80;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b5a3a';
    ctx.fillText(k, 200, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2d1b00';
    ctx.font = `900 52px ${FONT_FAMILY}`;
    ctx.fillText(v, 880, y);
    ctx.font = `700 46px ${FONT_FAMILY}`;
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = '#c1121f';
  ctx.font = `800 42px ${FONT_FAMILY}`;
  const quote = `「${s.line}」`;
  ctx.fillText(quote.length > 22 ? `${quote.slice(0, 21)}…」` : quote, SIZE / 2, 800);

  drawTruck(ctx, 640, 985, 1.0);
  ctx.fillStyle = '#2d1b00';
  ctx.textAlign = 'left';
  ctx.font = `900 46px ${FONT_FAMILY}`;
  ctx.fillText('你追得上垃圾車嗎？', 80, 930);
  ctx.font = `600 28px ${FONT_FAMILY}`;
  const host = (() => {
    try {
      return new URL(s.challengeUrl).host;
    } catch {
      return '';
    }
  })();
  ctx.fillText(host, 80, 985);
  ctx.font = `500 22px ${FONT_FAMILY}`;
  ctx.fillStyle = 'rgba(45,27,0,0.7)';
  ctx.fillText('虛構街機遊戲・現實請勿追車或拋擲垃圾', 80, 1040);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
}
