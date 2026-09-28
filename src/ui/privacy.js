// Anonymous counter UI: first-launch notice band ("Tamam" / "Kapat" equal size + "Ayrıntılar") and the details sheet.
// The Settings switch lives in ui.js (showSettings) and calls tel.setEnabled().
import { h } from './dom.js';
import { t, list } from '../logic/i18n.js';

export function showDetails(ui) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'tel-details-modal');
    box.append(h('h2', { text: t('telemetry.detailsTitle') }), ...list('telemetry.details').map((p) => h('p', { class: 'muted', text: p })),
      h('button', { class: 'btn primary', 'data-test': 'tel-details-close', onclick: close }, t('common.close')));
  });
}
// band stays outside #ui (the game UI rebuilds its root); resolves when answered
export function showNoticeBand(tel, ui, host = document.body) {
  if (!tel.noticeNeeded()) return null;
  const answer = (ok) => { tel.answerNotice(ok); band.remove(); if (!ok) ui.toast(t('telemetry.offToast')); };
  const band = h('div', { class: 'notice-band', role: 'region', 'aria-label': t('telemetry.title'), 'data-test': 'tel-banner' },
    h('p', { class: 'nb-text' }, h('b', { text: t('telemetry.title') }), ' ', t('telemetry.body')),
    h('div', { class: 'nb-row' },
      h('button', { class: 'btn primary nb-btn', 'data-test': 'tel-ok', onclick: () => answer(true) }, t('telemetry.ok')),
      h('button', { class: 'btn nb-btn', 'data-test': 'tel-off', onclick: () => answer(false) }, t('telemetry.off')),
      h('button', { class: 'link', 'data-test': 'tel-details', onclick: () => showDetails(ui) }, t('telemetry.detailsLink'))));
  host.appendChild(band);
  return band;
}
