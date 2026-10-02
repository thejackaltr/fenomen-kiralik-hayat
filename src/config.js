// Deployment config: the ONLY place where site addresses live (the literal old github.io address must appear
// nowhere else in the code). The same build runs on both addresses; the old address is detected at runtime.
//
// Test/debug override: a script that runs before the app may set `window.__FENOMEN_CFG__ = { oldOrigin, baseUrl,
// moveMode, moveStart, redirectDelayMs, maxHashChars, telemetryUrl, telemetryKey, cloudUrl, cloudKey, loginOrigin,
// cloudSyncSec, cloudResendSec, cloudTimeoutMs, cloudPushDelayMs, cloudPushGapMs }`. The smoke test uses this to make a local
// preview server act as the "old" or "new" address (see tests/smoke/smoke.mjs, runV21). Nothing else sets it.
const O = (typeof globalThis !== 'undefined' && globalThis.__FENOMEN_CFG__) || {};
const ENV = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const pick = (k, d) => (O[k] !== undefined ? O[k] : d);

// Old address (GitHub Pages). Only the origin matters for detection; the path is used for docs/links.
export const OLD_ORIGIN = pick('oldOrigin', 'https://thejackaltr.github.io');
export const OLD_URL = OLD_ORIGIN + '/fenomen-kiralik-hayat/';
// New address. BASE_URL is what the share card, og:image and the migration redirect point to.
export const NEW_ORIGIN = 'https://fenomen.teserix.com';
export const BASE_URL = pick('baseUrl', NEW_ORIGIN + '/');

export const MOVE = {
  // Date (YYYY-MM-DD, TR) the new address went live. null = migration dormant: the old address behaves like a
  // normal game (no band, no redirect). Set this when fenomen.teserix.com is live and tested.
  startDate: pick('moveStart', null),
  // Scope doc: github.io stays playable (with the "moved" band) for this many days, then becomes a redirect page.
  graceDays: 60,
  // 'auto' = decided by startDate/graceDays. Tests may force 'banner' | 'redirect' | 'none'.
  mode: pick('moveMode', 'auto'),
  // redirect page: wait this long before leaving, so the player can read the note / tap "Kaydı indir"
  redirectDelayMs: pick('redirectDelayMs', 4000),
  // Max length (characters) of the encoded save in "#import=<data>". Browsers accept far longer URLs
  // (Chrome ~2 MB, Firefox ~1 MB, Safari ~80 KB), but iOS home-screen web apps, in-app browsers and
  // history/session storage are less predictable. 16 KB is ~5-10x a typical compressed save (1.5-3 KB),
  // so real players never hit it, and it keeps well below every known limit. Above it: download only.
  maxHashChars: pick('maxHashChars', 16 * 1024)
};

// Anonymous progress counter (see src/telemetry.js for the insert contract).
// No URL = MOCK transport (console.debug + in-memory list), nothing leaves the device.
export const TELEMETRY = {
  url: pick('telemetryUrl', ENV.VITE_TELEMETRY_URL || null),    // e.g. https://fenomen-api.teserix.com
  key: pick('telemetryKey', ENV.VITE_TELEMETRY_KEY || null),    // public anon key, sent ONLY as `apikey` (insert-only table via RLS)
  table: ENV.VITE_TELEMETRY_TABLE || 'anon_stats_events',        // backend contract v2.1 (CONTRACT-v2.1-stats.md)
  timeoutMs: 5000,
  sessionGapMin: 30,                                             // session_start at most every 30 min (device clock)
  // follower milestones -> event IDs (B = bin, M = milyon)
  followers: [[1000, 'followers_1B'], [10000, 'followers_10B'], [100000, 'followers_100B'], [1000000, 'followers_1M']],
  playBuckets: [10, 30, 60, 120]                                 // minutes -> 0-10, 10-30, 30-60, 60-120, 120+
};

// v2.2 optional login (e-mail + 6-digit code) + cloud save, on Fenomen's own Supabase (fenomen-api.teserix.com).
// Contract: supabase/migrations/20260929193000_v2_2_fenomen_cloud_save.sql (table fenomen_saves, RPCs
// fenomen_reset_save / fenomen_delete_my_account). No URL/key = no login UI at all (GitHub Pages never gets them).
// Login is offered ONLY on `loginOrigin` (fenomen.teserix.com); the old github.io address shows a "go to the new
// address" note instead (src/ui/account.js). The code's validity (10 min) is a server setting: nothing here.
export const CLOUD = {
  url: pick('cloudUrl', ENV.VITE_SUPABASE_URL || null),          // e.g. https://fenomen-api.teserix.com
  key: pick('cloudKey', ENV.VITE_SUPABASE_ANON_KEY || null),     // public anon key (apikey header); the user's JWT does the rest
  loginOrigin: pick('loginOrigin', NEW_ORIGIN),
  table: 'fenomen_saves',
  syncEverySec: pick('cloudSyncSec', 60),     // scope rule 4: write every 60 s (config) + when the page is hidden
  // a video was published: one write soon (bursts coalesce into one), at most one such write per pushGapMs
  pushDelayMs: pick('cloudPushDelayMs', 2000),
  pushGapMs: pick('cloudPushGapMs', 15000),
  resendWaitSec: pick('cloudResendSec', 60),  // GoTrue sends at most one code per address per 60 s (infra: AUTH rate limits)
  backupDays: 30,                             // "Baştan başla" backup kept 30 days (plan; server fenomen_cfg_backup_retention)
  timeoutMs: pick('cloudTimeoutMs', 10000)
};

// Build-time helpers (vite.config.js uses these for index.html placeholders like %cfg:OG_IMAGE%)
export const HTML_CFG = { BASE_URL, OG_IMAGE: BASE_URL + 'icons/icon-512.png' };
