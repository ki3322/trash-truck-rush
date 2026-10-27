/**
 * Thin GA4 wrapper. If gtag isn't loaded (no VITE_GA_ID, blocked, offline)
 * every call is a no-op. Never send personal data — only gameplay numbers.
 */
export type AnalyticsEvent =
  | 'game_start'
  | 'game_complete'
  | 'game_fail'
  | 'retry_game'
  | 'select_difficulty'
  | 'reach_ground_floor'
  | 'throw_garbage'
  | 'perfect_throw'
  | 'share_result'
  | 'download_result'
  | 'challenge_open'
  | 'challenge_complete';

export type AnalyticsParams = Record<string, string | number | boolean>;

type Gtag = (command: 'event', name: string, params?: AnalyticsParams) => void;

export function track(name: AnalyticsEvent, params: AnalyticsParams = {}): void {
  try {
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    if (typeof gtag === 'function') gtag('event', name, params);
  } catch {
    // Analytics must never break the game.
  }
}

/** Inject GA4 only when a measurement ID is configured at build time. */
export function initAnalytics(measurementId: string | undefined): void {
  if (!measurementId || !/^G-[A-Z0-9]{4,12}$/.test(measurementId)) return;
  try {
    const w = window as unknown as { dataLayer: unknown[]; gtag: (...args: unknown[]) => void };
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer.push(arguments);
    };
    w.gtag('js', new Date());
    w.gtag('config', measurementId, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(s);
  } catch {
    // ignore
  }
}
