// Save export / import (Settings), the import-from-move conflict choice and the import error dialog.
import { h } from './dom.js';
import { t } from '../logic/i18n.js';
import { fmt, fmtDate, fmtDay } from '../logic/format.js';
import { copyText } from './share.js';
import { buildEnvelope, encodeEnvelope, readCode, readFileText, readRawSave, parseRaw, applyImport, summary, isEmptySave, backupConflict, readBackup, clearBackup } from '../logic/transfer.js';

export function downloadText(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const day = (ts) => new Date(ts).toISOString().slice(0, 10);
export function envelopeFileName(env) { return t('saveFile.fileName', { d: day(env.exportedAt) }); }
export function downloadEnvelope(env) { downloadText(envelopeFileName(env), JSON.stringify(env, null, 2)); }
const sumText = (key, save) => { const s = summary(save); return t(key, { f: fmt(s.followers), d: fmtDate(s.lastPlayed) }); };
// conflict choice line: "{f} takipçi · Son oynama: {d}" — followers via fmt(), date "28 Eyl 2026" (missing -> import.dateUnknown)
export const conflictMeta = (save) => { const s = summary(save); return t('import.conflictMeta', { f: fmt(s.followers), d: fmtDay(s.lastPlayed) }); };

// glue between the UI and storage/telemetry (built in main.js)
export function saveTools({ ctrl, tel, storage, now = () => Date.now() }) {
  return {
    envelope() { ctrl.save(); const o = parseRaw(readRawSave(storage)); return o ? buildEnvelope(o, tel ? tel.exportState() : {}, now()) : null; },
    current() { return parseRaw(readRawSave(storage)); },
    // keep: 'import' | 'current'. The save not kept is stored as backup (fenomen_save_backup).
    // Callers go through guardBackup() first; overwriteBackup is only set after the player's choice there.
    apply(env, keep = 'import', source = 'file', opts = {}) {
      const replaced = applyImport(storage, env, keep, source, now(), opts);   // throws before any change if the backup slot is taken
      if (tel) { tel.absorb(env); if (!tel.noticeNeeded()) { const b = document.querySelector('[data-test=tel-banner]'); if (b) b.remove(); } }
      if (replaced) { if (tel) tel.seed(env.save); ctrl.reload(); }
      return replaced;
    },
    backupConflict: (env, keep) => backupConflict(storage, env, keep),
    backup: () => readBackup(storage),
    clearBackup: () => clearBackup(storage)
  };
}

export async function exportSave(ui, tools) {
  const env = tools.envelope(); if (!env) return;
  downloadEnvelope(env);
  ui.toast(t('saveFile.exported'), 'ok');
  const code = await encodeEnvelope(env);
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'export-modal');
    box.append(h('h2', { text: t('saveFile.export') }), h('p', { text: t('saveFile.exported') }), h('p', { class: 'muted', text: t('saveFile.codeLabel') }),
      h('textarea', { class: 'input code', readonly: true, rows: 4, 'data-test': 'export-code', onfocus: (e) => e.target.select() }, code),
      h('div', { class: 'row end' },
        h('button', { class: 'btn', 'data-test': 'export-copy', onclick: async () => { const ok = await copyText(code); ui.toast(ok ? t('saveFile.codeCopied') : t('share.fail'), ok ? 'ok' : 'bad'); } }, t('saveFile.copyCode')),
        h('button', { class: 'btn primary', onclick: close }, t('common.close'))));
  });
}

export function openImport(ui, tools) {
  ui.showModal((box, close) => {
    const done = (r) => { if (!r.ok) { ui.toast(t('saveFile.importBad'), 'bad'); return; } close(); confirmImport(ui, tools, r.env); };
    const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden', 'data-test': 'import-file', onchange: async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      let text = ''; try { text = await f.text(); } catch (x) { /* unreadable */ }
      e.target.value = ''; done(readFileText(text));
    } });
    const code = h('textarea', { class: 'input code', rows: 3, 'data-test': 'import-code', placeholder: t('saveFile.codePlaceholder') });
    box.setAttribute('data-test', 'import-modal');
    box.append(h('h2', { text: t('saveFile.import') }),
      h('button', { class: 'btn primary', 'data-test': 'import-pick', onclick: () => file.click() }, t('saveFile.pickFile')), file,
      h('p', { class: 'muted', text: t('saveFile.pasteLabel') }), code,
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: close }, t('settings.no')),
        h('button', { class: 'btn', 'data-test': 'import-code-go', onclick: async () => done(await readCode(code.value)) }, t('saveFile.useCode'))));
  });
}

// The single backup slot is taken and this import would overwrite it: ask first (never overwrite silently).
// "Mevcut yedeği indir" (default, focused) downloads it then continues; "Yedeği sil ve devam et"; "Vazgeç" = nothing changes.
export function backupFile(bak) {
  const o = parseRaw(bak && bak.save);
  const at = bak && typeof bak.at === 'number' ? bak.at : Date.now();
  const name = t('backup.fileName', { d: day(at) });
  if (o) return { name, text: JSON.stringify(buildEnvelope(o, {}, at), null, 2) };
  return { name, text: String(bak && bak.save || '') };            // unreadable backup: hand it over as it is
}
export function guardBackup(ui, tools, env, keep, proceed) {
  if (!tools.backupConflict(env, keep)) { proceed({}); return; }
  const bak = tools.backup(), bs = parseRaw(bak && bak.save);
  ui.showModal((box, close) => {
    const dl = h('button', { class: 'btn primary', 'data-test': 'backup-download', autofocus: true, onclick: () => {
      const f = backupFile(bak); downloadText(f.name, f.text); close(); ui.toast(t('backup.downloaded'), 'ok'); proceed({ overwriteBackup: true });
    } }, t('backup.download'));
    box.setAttribute('data-test', 'backup-step');
    box.append(h('h2', { text: t('backup.title') }), h('p', { text: t('backup.body') }),
      bs ? h('p', { class: 'muted', 'data-test': 'backup-summary', text: sumText('backup.summary', bs) }) : null,
      h('div', { class: 'col' }, dl,
        h('button', { class: 'btn danger', 'data-test': 'backup-discard', onclick: () => { tools.clearBackup(); close(); proceed({ overwriteBackup: true }); } }, t('backup.discard')),
        h('button', { class: 'btn', 'data-test': 'backup-cancel', onclick: () => { close(); ui.toast(t('backup.cancelled')); } }, t('backup.cancel'))));
    setTimeout(() => dl.focus(), 0);
  }, { dismissable: false });
}

// "Bu dosyadaki kayıt şimdiki ilerlemenin yerine geçecek" + both summaries
export function confirmImport(ui, tools, env) {
  const cur = tools.current();
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'import-confirm');
    box.append(h('h2', { text: t('saveFile.import') }), h('p', { text: t('saveFile.importAsk') }),
      h('ul', { class: 'welcome-list' },
        cur && !isEmptySave(cur) ? h('li', { 'data-test': 'import-sum-current', text: sumText('saveFile.sumCurrent', cur) }) : null,
        h('li', { class: 'big', 'data-test': 'import-sum-file', text: sumText('saveFile.sumFile', env.save) })),
      h('p', { class: 'muted small', text: t('saveFile.backupNote') }),
      h('div', { class: 'row end' }, h('button', { class: 'btn', 'data-test': 'import-no', onclick: close }, t('settings.no')),
        h('button', { class: 'btn primary', 'data-test': 'import-yes', onclick: () => { close(); guardBackup(ui, tools, env, 'import', (o) => { tools.apply(env, 'import', 'file', o); ui.toast(t('import.done'), 'ok'); }); } }, t('saveFile.importYes'))));
  }, { dismissable: false });
}

// save arrived from the old address but this device already has a non-empty save: let the player pick
export function showConflict(ui, tools, env, cur) {
  ui.showModal((box, close) => {
    const pick = (keep) => { close(); guardBackup(ui, tools, env, keep, (o) => { tools.apply(env, keep, 'move', o); if (keep === 'import') ui.toast(t('import.done'), 'ok'); }); };
    box.setAttribute('data-test', 'import-conflict');
    box.append(h('h2', { text: t('import.conflictTitle') }), h('p', { text: t('import.conflictBody') }),
      h('div', { class: 'col' },
        h('button', { class: 'btn big choice', 'data-test': 'conflict-old', onclick: () => pick('import') },
          h('span', { text: t('import.optOld') }), h('small', { 'data-test': 'conflict-old-meta', text: conflictMeta(env.save) })),
        h('button', { class: 'btn big choice', 'data-test': 'conflict-new', onclick: () => pick('current') },
          h('span', { text: t('import.optNew') }), h('small', { 'data-test': 'conflict-new-meta', text: conflictMeta(cur) }))));
  }, { dismissable: false });
}

export function showImportFail(ui) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'import-fail');
    box.append(h('p', { text: t('import.fail') }), h('button', { class: 'btn primary', 'data-test': 'import-fail-ok', onclick: close }, t('common.ok')));
  });
}
