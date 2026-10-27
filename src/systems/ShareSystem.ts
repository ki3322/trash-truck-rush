import { DIFFICULTY_CONFIG } from '../config/difficultyConfig';
import type { RunOutcome } from '../types';
import type { Title } from './TitleSystem';

export interface ShareSummary {
  readonly outcome: RunOutcome;
  readonly score: number;
  readonly title: Title;
  readonly line: string;
  readonly challengeUrl: string;
}

export const THREADS_INTENT = 'https://www.threads.net/intent/post';
export const MAX_SHARE_TEXT = 480;

export function formatSeconds(s: number): string {
  return `${s.toFixed(1)} 秒`;
}

export function buildShareText(s: ShareSummary): string {
  const o = s.outcome;
  const floor = DIFFICULTY_CONFIG[o.setup.difficulty].startFloor;
  const lines = [
    `《垃圾車來了！》台灣人的極限運動`,
    `${s.title.emoji} ${s.title.name}（${DIFFICULTY_CONFIG[o.setup.difficulty].label}）`,
    o.success ? `我從 ${floor} 樓衝下來，成功把垃圾丟上車！` : `我從 ${floor} 樓衝下來…然後失敗了 😭`,
    o.stair.reachedGround ? `下樓時間：${formatSeconds(o.stair.stairTimeSec)}` : null,
    o.success && o.throwDistanceM !== null ? `投擲距離：${o.throwDistanceM.toFixed(1)} 公尺` : null,
    `最終得分：${s.score.toLocaleString('zh-TW')}`,
    `「${s.line}」`,
    `你追得上垃圾車嗎？👉 ${s.challengeUrl}`,
  ].filter((l): l is string => l !== null);
  return lines.join('\n').slice(0, MAX_SHARE_TEXT);
}

export function threadsIntentUrl(text: string): string {
  return `${THREADS_INTENT}?text=${encodeURIComponent(text)}`;
}

export type ShareResult = 'shared' | 'opened_threads' | 'cancelled' | 'failed';

/**
 * Prefer the native share sheet with the image attached (works on most
 * mobile browsers → user picks Threads). Otherwise open the Threads web
 * intent with the text; the image can be downloaded separately.
 */
export async function shareToThreads(text: string, image: Blob | null): Promise<ShareResult> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (image && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    const file = new File([image], 'trash-truck-rush.png', { type: 'image/png' });
    const data: ShareData = { files: [file], text };
    if (nav.canShare(data)) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
        // Fall through to the Threads intent.
      }
    }
  }
  // Passing 'noopener' makes window.open always return null, so detach the opener manually.
  const win = window.open(threadsIntentUrl(text), '_blank');
  if (!win) return 'failed';
  try {
    win.opener = null;
  } catch {
    // cross-origin: ignore
  }
  return 'opened_threads';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall back below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
