// Moving from the old address (OLD_ORIGIN) to the new one. The same build runs on both; the mode is decided at runtime.
//   'none'     — not the old address, or the move is dormant (MOVE.startDate not set yet)
//   'banner'   — old address, first MOVE.graceDays days: game stays playable, a "moved" band offers the one-click move
//   'redirect' — old address afterwards: redirect page only (auto-redirect with the save in #import=, SW removed)
import { OLD_ORIGIN, BASE_URL, MOVE } from '../config.js';
import { buildEnvelope, moveFragment, readRawSave, parseRaw, MIGRATED_KEY } from './transfer.js';

const DAY = 864e5;
const startOf = (cfg) => (cfg.startDate ? Date.parse(cfg.startDate + 'T00:00:00+03:00') : NaN);
export function moveMode(loc, now = Date.now(), cfg = MOVE, oldOrigin = OLD_ORIGIN) {
  if (!loc || loc.origin !== oldOrigin) return 'none';
  if (cfg.mode && cfg.mode !== 'auto') return cfg.mode;
  const start = startOf(cfg);
  if (!isFinite(start)) return 'none';
  return now < start + cfg.graceDays * DAY ? 'banner' : 'redirect';
}
export function daysLeft(now = Date.now(), cfg = MOVE) {
  const start = startOf(cfg); if (!isFinite(start)) return cfg.graceDays;
  return Math.max(0, Math.ceil((start + cfg.graceDays * DAY - now) / DAY));
}
// -> { raw, env, fragment, url, tooBig }. fragment null + tooBig when the encoded save exceeds MOVE.maxHashChars.
export async function prepareMove(storage, telState, { now = Date.now(), maxChars = MOVE.maxHashChars, baseUrl = BASE_URL } = {}) {
  const raw = readRawSave(storage), o = parseRaw(raw);
  if (!o) return { raw: null, env: null, fragment: null, url: baseUrl, tooBig: false };
  const env = buildEnvelope(o, telState || {}, now);
  let fragment = null; try { fragment = await moveFragment(env, maxChars); } catch (e) { fragment = null; }
  return { raw, env, fragment, url: fragment ? baseUrl + fragment : null, tooBig: !fragment };
}
// the old save is NOT deleted, only marked
export function markMigrated(storage, now = Date.now()) { try { storage.setItem(MIGRATED_KEY, String(now)); } catch (e) { /* ignore */ } }
// self-removing service worker: unregister ours (scope = this app's folder) and drop our caches only
// (GitHub Pages user sites share one origin with the owner's other projects — never touch their SWs/caches)
// Order matters: the worker still controls this page and caches every miss with a fire-and-forget cache.put(). So it
// is first told to stop caching and to finish its in-flight writes ('stopCaching' -> 'stopped', sw.template.js), and
// only then are its caches deleted; otherwise a late put re-creates the deleted cache. An older worker without that
// handler does not answer: we go on after stopWaitMs.
export async function removeServiceWorker(win, { stopWaitMs = 1500 } = {}) {
  try {
    const sw = win.navigator && win.navigator.serviceWorker;
    const base = new URL('./', win.location.href).href;
    const ctl = sw && sw.controller;
    if (ctl && String(ctl.scriptURL || '').startsWith(base) && typeof win.MessageChannel === 'function') {
      await new Promise((done) => {
        const ch = new win.MessageChannel();
        const finish = () => { clearTimeout(timer); try { ch.port1.close(); } catch (e) { /* ignore */ } done(); };
        const timer = setTimeout(finish, stopWaitMs);
        ch.port1.onmessage = finish;
        try { ctl.postMessage('stopCaching', [ch.port2]); } catch (e) { finish(); }
      });
    }
    if (sw && sw.getRegistrations) { for (const r of await sw.getRegistrations()) if (r.scope.startsWith(base)) await r.unregister(); }
  } catch (e) { /* ignore */ }
  try { if (win.caches) for (const k of await win.caches.keys()) if (k.startsWith('fenomen-')) await win.caches.delete(k); } catch (e) { /* ignore */ }
}
