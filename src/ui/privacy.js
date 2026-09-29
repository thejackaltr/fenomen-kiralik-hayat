// Anonymous counter UI: first-launch notice band ("Tamam" / "Kapat" equal size + "Ayrıntılar") and the details sheet.
// The Settings switch lives in ui.js (showSettings) and calls tel.setEnabled().
import { h } from './dom.js';
import { t, list } from '../logic/i18n.js';
import { analytics } from '../analytics.js';

export const NOTICE_BTN = 'btn nb-btn';
export function showDetails(ui) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'tel-details-modal');
    // empty items (e.g. the legal paragraph before it is written) render nothing
    box.append(h('h2', { text: t('telemetry.detailsTitle') }), ...list('telemetry.details').filter((p) => String(p).trim()).map((p) => h('p', { class: 'muted', text: p })),
      h('button', { class: 'btn primary', 'data-test': 'tel-details-close', onclick: close }, t('common.close')));
  });
}
// Keeps --nb-space (px from the band's top edge to the viewport bottom + 8) on <html> while the band is shown, so the
// layout can keep every action above it (src/style.css). Also keeps --nb-tabs (measured tab bar height, safe-area
// included) so short landscape screens can place the band right above the tab bar. Returns a cleanup function.
export const NB_SPACE = '--nb-space', NB_TABS = '--nb-tabs';
function reserveSpace(band, doc = document, win = window) {
  const root = doc.documentElement;
  let last = '', lastTabs = '', raf = 0;
  const fit = () => {
    if (!band.isConnected) return;
    const tabs = doc.querySelector('.tabs'), th = tabs ? Math.ceil(tabs.getBoundingClientRect().height) + 'px' : '';
    if (th !== lastTabs) { lastTabs = th; if (th) root.style.setProperty(NB_TABS, th); else root.style.removeProperty(NB_TABS); }
    const r = band.getBoundingClientRect(); const v = Math.ceil(Math.max(0, win.innerHeight - r.top) + 8) + 'px'; if (v !== last) { last = v; root.style.setProperty(NB_SPACE, v); }
  };
  const soon = () => { if (!raf) raf = win.requestAnimationFrame(() => { raf = 0; fit(); }); };   // at most once per frame
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  if (ro) ro.observe(band);
  // the band moves when the tab bar appears (character created) or the viewport changes
  const mo = typeof MutationObserver === 'function' ? new MutationObserver(soon) : null;
  if (mo) mo.observe(doc.body, { childList: true, subtree: true });
  win.addEventListener('resize', fit); fit();
  return () => { if (ro) ro.disconnect(); if (mo) mo.disconnect(); if (raf) win.cancelAnimationFrame(raf); win.removeEventListener('resize', fit); root.style.removeProperty(NB_SPACE); root.style.removeProperty(NB_TABS); };
}
// remove the band (answered here, in Settings, or by an imported save that carries the answer)
export function dismissNoticeBand(doc = document) {
  const b = doc.querySelector('[data-test=tel-banner]'); if (!b) return;
  if (b.__release) b.__release(); b.remove();
}
// band stays outside #ui (the game UI rebuilds its root); resolves when answered
export function showNoticeBand(tel, ui, host = document.body) {
  if (!tel.noticeNeeded()) return null;
  // Umami follows the same answer at once: "Tamam" loads it now (sync), "Kapat" keeps it off (src/analytics.js)
  const answer = (ok) => { tel.answerNotice(ok); analytics().sync(); dismissNoticeBand(); if (!ok) ui.toast(t('telemetry.offToast')); };
  const band = h('div', { class: 'notice-band', role: 'region', 'aria-label': t('telemetry.title'), 'data-test': 'tel-banner' },
    h('p', { class: 'nb-text' }, h('b', { text: t('telemetry.title') }), ' ', t('telemetry.body')),
    h('div', { class: 'nb-row' },
      // KVKK: "Tamam" and "Kapat" carry exactly the same class = the same visual weight (no primary/secondary)
      h('button', { class: NOTICE_BTN, 'data-test': 'tel-ok', onclick: () => answer(true) }, t('telemetry.ok')),
      h('button', { class: NOTICE_BTN, 'data-test': 'tel-off', onclick: () => answer(false) }, t('telemetry.off')),
      h('button', { class: 'link', 'data-test': 'tel-details', onclick: () => showDetails(ui) }, t('telemetry.detailsLink'))));
  host.appendChild(band);
  band.__release = reserveSpace(band);
  return band;
}
