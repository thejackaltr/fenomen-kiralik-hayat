// Fenomen: Kiralık Hayat — entry point (DOM + Canvas 2D, no backend: local save only).
const LOCALES = import.meta.glob('./locales/*.json', { eager: true, import: 'default' });
import { registerLocales, detect, setLocale, setPseudo, setMissingHandler, locale, t } from './logic/i18n.js';
import { Controller } from './controller.js';
import { UI } from './ui/ui.js';
import { loadAll } from './render/assets.js';
import * as G from './logic/game.js';
import './style.css';
import { analytics, track } from './analytics.js';

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
function changeLocale(code) { try { localStorage.setItem(LOCALE_KEY, code); } catch (e) { /* ignore */ } ctrl.save(); location.reload(); }

const storage = (() => { try { return window.localStorage; } catch (e) { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; } })();
const ctrl = new Controller(storage);

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
const install = {
  available: () => !!deferredPrompt,
  prompt: async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); try { await deferredPrompt.userChoice; } catch (e) { /* ignore */ } deferredPrompt = null; },
  ios: () => isIos
};

let ui = null;
loadAll().then(() => {
  ui = new UI(document.getElementById('ui'), ctrl, { install, changeLocale, version: __APP_VERSION__ });
  window.__fenomen.ui = ui;
  document.getElementById('boot').remove();
  document.body.classList.add('ready');
  ctrl.start();
  // Umami: KVKK-gated (src/analytics.js). Nothing loads before the stats notice is answered; off = nothing is sent.
  analytics().sync();
  track('game_start');
  if (ctrl.pendingWelcome) ui.showWelcome(ctrl.pendingWelcome);
  if (ctrl.state.ifsa.pending) ui.queueIfsa();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { ctrl.save(); ctrl.stop(); }
  else { ctrl.resume(Date.now()); ctrl.start(); }
});
window.addEventListener('pagehide', () => ctrl.save());
// reset_or_prestige = selling the channel (Şöhret prestige) or the full reset in Settings
ctrl.on('sold', () => track('reset_or_prestige'));
ctrl.on('reset', () => track('reset_or_prestige'));

// Test/debug handle (no secrets)
window.__fenomen = { ctrl, ui: null, G, version: __APP_VERSION__ };

// Service worker (production only): versioned cache-first; "new version" bar reloads only after the tap.
let updateRequested = false;
if ('serviceWorker' in navigator && import.meta.env.PROD) {
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
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateRequested && !reloaded) { reloaded = true; ctrl.save(); location.reload(); } });
  });
}
