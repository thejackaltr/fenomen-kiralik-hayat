// Fenomen: Kiralık Hayat — entry point (DOM + Canvas 2D). Local save; optional anonymous progress counter (v2.1).
const LOCALES = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });
import { registerLocales, detect, setLocale, setPseudo, setMissingHandler, locale, t } from './logic/i18n.js';
import { Controller } from './controller.js';
import { UI } from './ui/ui.js';
import { loadAll } from './render/assets.js';
import * as G from './logic/game.js';
import { createTelemetry, defaultTransport, deviceClass, wireTelemetry, captureUtm } from './telemetry.js';
import { fragmentData, clearFragment, readCode, readRawSave, parseRaw, isEmptySave, applyImport, buildEnvelope, encodeEnvelope, checksumOf, BACKUP_KEY } from './logic/transfer.js';
import { moveMode } from './logic/move.js';
import { renderRedirectPage, showMoveBand } from './ui/move.js';
import { showNoticeBand } from './ui/privacy.js';
import { saveTools, showConflict, showImportFail } from './ui/savefile.js';
import './style.css';

// Locales: every src/locales/<code>.json is picked up automatically (tr = source + fallback).
const LOCALE_KEY = 'fenomen_locale';
registerLocales(Object.fromEntries(Object.entries(LOCALES).map(([p, d]) => [p.match(/([\w-]+)\.json$/)[1], d])));
if (import.meta.env.DEV) setMissingHandler((key, loc, fellBack) => console.warn('[i18n] missing key "' + key + '" in ' + loc + (fellBack ? ' (fell back to tr)' : '')));
let storedLocale = null; try { storedLocale = localStorage.getItem(LOCALE_KEY); } catch (e) { /* private mode */ }
setLocale(detect(navigator.languages || [navigator.language], storedLocale));
const pseudo = new URLSearchParams(location.search).get('pseudo'); if (pseudo) setPseudo(pseudo); // layout test aid
document.documentElement.lang = locale();
document.title = t('meta.title');
{ const md = document.querySelector('meta[name=description]'); if (md) md.setAttribute('content', t('meta.description')); const bt = document.getElementById('boot'); if (bt) bt.textContent = t('meta.loading'); }

const storage = (() => { try { return window.localStorage; } catch (e) { return { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null, length: 0 }; } })();
const MODE = moveMode(location);          // 'none' | 'banner' | 'redirect' (old address only)
const test = { transfer: { buildEnvelope, encodeEnvelope, checksumOf, BACKUP_KEY } };   // test/debug handle (no secrets)
let ctrl = null, ui = null;

if (MODE === 'redirect') {
  // old address after the grace period: redirect page only (no game loop, no service worker, no counter events)
  const tel = createTelemetry({ storage, transport: { kind: 'none', send() {} } });
  window.__fenomen = Object.assign({ mode: MODE, version: __APP_VERSION__ }, test);
  const bt = document.getElementById('boot'); if (bt) bt.remove();
  document.body.classList.add('ready');
  renderRedirectPage(document.getElementById('ui'), { storage, tel });
} else boot();

async function boot() {
  captureUtm(storage, location.search);
  // save brought from the old address in "#import=<data>" (the fragment never reaches a server)
  let imported = null;
  const data = fragmentData(location.hash);
  if (data !== null) { if (MODE === 'none') imported = await readCode(data); clearFragment(window); }
  const tel = createTelemetry({ storage, transport: defaultTransport(), version: __APP_SEMVER__, device: deviceClass(window), playMinutes: () => (ctrl ? (ctrl.state.meta.playSec || 0) / 60 : 0) });
  let conflict = null, importDone = false;
  if (imported && imported.ok) {
    const raw = readRawSave(storage), cur = parseRaw(raw);
    // empty/identical local save: import directly (nothing goes to the backup slot). Otherwise the player picks;
    // counter flags travel only when an import is actually applied (Cancel leaves everything unchanged).
    if (isEmptySave(cur) || raw === JSON.stringify(imported.env.save)) { tel.absorb(imported.env); applyImport(storage, imported.env, 'import', 'move'); importDone = true; }
    else conflict = { env: imported.env, cur };
  }
  const bootNew = isEmptySave(parseRaw(readRawSave(storage)));
  ctrl = new Controller(storage);
  tel.seed(ctrl.state);
  wireTelemetry(ctrl, tel);
  tel.retryPending();                      // first_* that failed last launch: one more try (fire-and-forget)
  if (bootNew) tel.track('game_open_new');
  tel.sessionStart();
  const tools = saveTools({ ctrl, tel, storage });
  window.__fenomen = Object.assign({ ctrl, ui: null, G, tel, mode: MODE, version: __APP_VERSION__ }, test);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ctrl.save(); ctrl.stop(); }
    else { ctrl.resume(Date.now()); ctrl.start(); tel.sessionStart(); }
  });
  window.addEventListener('pagehide', () => ctrl.save());

  await loadAll();
  ui = new UI(document.getElementById('ui'), ctrl, { install, changeLocale, version: __APP_VERSION__, tel, tools });
  window.__fenomen.ui = ui;
  document.getElementById('boot').remove();
  document.body.classList.add('ready');
  ctrl.start();
  if (ctrl.pendingWelcome) ui.showWelcome(ctrl.pendingWelcome);
  if (ctrl.state.ifsa.pending) ui.queueIfsa();
  showNoticeBand(tel, ui);
  if (MODE === 'banner') showMoveBand(ui, { storage, tel, ctrl });
  if (importDone) ui.toast(t('import.done'), 'ok');
  if (imported && !imported.ok) showImportFail(ui);
  if (conflict) showConflict(ui, tools, conflict.env, conflict.cur);
}
function changeLocale(code) { try { localStorage.setItem(LOCALE_KEY, code); } catch (e) { /* ignore */ } if (ctrl) ctrl.save(); location.reload(); }

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
const install = {
  available: () => !!deferredPrompt,
  prompt: async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ } deferredPrompt = null; },
  ios: () => isIos
};

// Service worker (production only): versioned cache-first; "new version" bar reloads only after the tap.
// Not on the redirect page: there the old worker removes itself (src/logic/move.js removeServiceWorker).
let updateRequested = false;
if ('serviceWorker' in navigator && import.meta.env.PROD && MODE !== 'redirect') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      const offer = (w) => {
        const bar = document.createElement('div'); bar.className = 'update';
        const btn = document.createElement('button'); btn.className = 'btn primary'; btn.textContent = t('update.reload');
        btn.onclick = () => { updateRequested = true; w.postMessage('skipWaiting'); };
        bar.append(document.createTextNode(t('update.ready') + ' '), btn); document.body.appendChild(bar);
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
    }).catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested && !reloaded) { reloaded = true; if (ctrl) ctrl.save(); location.reload(); } });
  });
}
