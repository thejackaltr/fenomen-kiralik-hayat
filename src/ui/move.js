// Old address UI: the redirect page ('redirect' mode) and the "moved" band ('banner' mode).
import { h, clear } from './dom.js';
import { t } from '../logic/i18n.js';
import { MOVE, BASE_URL } from '../config.js';
import { prepareMove, markMigrated, removeServiceWorker, daysLeft } from '../logic/move.js';
import { downloadEnvelope } from './savefile.js';

const pretty = (u) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

export async function renderRedirectPage(root, { storage, tel, win = window, delayMs = MOVE.redirectDelayMs }) {
  const removing = removeServiceWorker(win);
  const mv = await prepareMove(storage, tel ? tel.exportState() : {});
  const go = async () => { await removing; markMigrated(storage); win.location.replace(mv.url || BASE_URL); };
  const page = h('div', { class: 'move-page', 'data-test': 'move-page' },
    h('h1', { class: 'logo', text: t('app.name') }),
    h('h2', { text: t('move.title') }),
    mv.tooBig ? h('p', { class: 'note warn', 'data-test': 'move-toobig', text: t('move.tooBig', { url: pretty(BASE_URL) }) }) : h('p', { text: t('move.body') }),
    h('div', { class: 'col' },
      mv.tooBig ? null : h('button', { class: 'btn primary big', 'data-test': 'move-go', onclick: go }, t('move.go')),
      mv.env ? h('button', { class: 'btn big', 'data-test': 'move-download', onclick: () => downloadEnvelope(mv.env) }, t('move.download')) : null),
    h('p', { class: 'muted small', 'data-test': 'move-homeicon', text: t('move.homeIcon') }));
  clear(root).append(page);
  win.__move = { tooBig: mv.tooBig, url: mv.url, removed: removing };      // test hook
  if (!mv.tooBig) setTimeout(go, delayMs);
  return mv;
}

// banner mode: game stays playable; band on every launch until "Sonra"
export function showMoveBand(ui, { storage, tel, ctrl, win = window, host = document.body }) {
  const band = h('div', { class: 'move-band', role: 'region', 'aria-label': t('move.title'), 'data-test': 'move-band' });
  const render = (tooBig) => {
    clear(band).append(h('p', { class: 'nb-text' }, h('b', { text: t('move.title') }), ' ', tooBig ? t('move.tooBig', { url: pretty(BASE_URL) }) : t('move.bandBody', { n: daysLeft() })),
      h('p', { class: 'muted small', text: t('move.homeIcon') }),
      h('div', { class: 'nb-row' },
        tooBig ? null : h('button', { class: 'btn primary nb-btn', 'data-test': 'move-go', onclick: go }, t('move.go')),
        h('button', { class: 'btn nb-btn', 'data-test': 'move-download', onclick: async () => { ctrl.save(); const mv = await prepareMove(storage, tel.exportState()); if (mv.env) downloadEnvelope(mv.env); } }, t('move.download')),
        h('button', { class: 'link', 'data-test': 'move-later', onclick: () => band.remove() }, t('move.later'))));
  };
  const go = async () => {
    ctrl.save();
    const mv = await prepareMove(storage, tel.exportState());
    if (mv.tooBig) { render(true); return; }
    markMigrated(storage); win.location.assign(mv.url);
  };
  render(false);
  host.appendChild(band);
  return band;
}
