// v2.2 optional account (e-mail + 6-digit code) and cloud save screens. Guests see nothing new except the
// "Bulut kayıt" section in Settings. Texts: tr.json account.*, auth.*, sync.*, reset.* (Yazı r2).
// Login only on the new address (fenomen.teserix.com); the old address shows auth.moveDomain.* instead.
import { h } from './dom.js';
import { t, list } from '../logic/i18n.js';
import { fmt, fmtStamp, fmtClock } from '../logic/format.js';
import { copyText } from './share.js';
import { CLOUD, OLD_ORIGIN, BASE_URL } from '../config.js';
import { buildEnvelope, encodeEnvelope } from '../logic/transfer.js';
import { sendErrorKey, verifyErrorKey, validEmail, validCode, splitMeta, createAuthGate } from '../logic/cloud.js';

// one brake per page (survives closing / reopening the screens): see createAuthGate and CLOUD.sendGapMs / netLockMs
const gateOf = (acc) => acc.gate || (acc.gate = createAuthGate({ sendGapMs: acc.cfg.sendGapMs, netLockMs: acc.cfg.netLockMs, rateLockMs: acc.cfg.rateLockMs, rateLockMaxMs: acc.cfg.rateLockMaxMs }));
// a locked button shows "<label> (n sn)" and unlocks itself; waitMs() = how long it stays locked (0 = free)
function lockedButton(btn, waitMs, idleKey, countKey) {
  let tm = null;
  const paint = () => {
    clearTimeout(tm); tm = null;
    const w = waitMs();
    btn.disabled = w > 0; btn.textContent = w > 0 ? t(countKey, { s: Math.ceil(w / 1000) }) : t(idleKey);
    if (w > 0) tm = setTimeout(paint, (w % 1000) || 1000);
  };
  return { paint, stop: () => { clearTimeout(tm); tm = null; } };
}

const originOf = (u) => { try { return new URL(u).origin; } catch (e) { return ''; } };
// where login can appear: cloud configured (build env / test config), this is the login origin, not the old address
export function loginAvailable(loc = location, cfg = CLOUD, mode = 'none') {
  return !!(cfg.url && cfg.key) && mode === 'none' && loc.origin !== OLD_ORIGIN && loc.origin === originOf(cfg.loginOrigin);
}
export const onOldAddress = (loc = location) => loc.origin === OLD_ORIGIN;

// ---------- Settings: "Bulut kayıt" ----------
export function accountSection(ui, acc, close) {
  if (acc.old) {
    return [h('h3', { text: t('account.menu') }),
      h('div', { class: 'col', 'data-test': 'account-move-note' },
        h('p', { class: 'muted', text: t('auth.moveDomain.text') }),
        h('p', { class: 'muted small', text: t('auth.moveDomain.saveHint') }),
        h('a', { class: 'btn', href: BASE_URL, rel: 'noopener', 'data-test': 'account-move-link' }, t('auth.moveDomain.linkLabel')))];
  }
  if (!acc.available) return [];
  const { sync } = acc;
  if (!sync.signedIn()) {
    return [h('h3', { text: t('account.menu') }), h('p', { class: 'muted', 'data-test': 'account-guest', text: t('account.guestNote') }),
      h('button', { class: 'btn', 'data-test': 'account-signin', onclick: () => { close(); openLogin(ui, acc); } }, t('account.signIn'))];
  }
  const line = h('p', { class: 'muted small', 'data-test': 'account-status', 'aria-live': 'polite' });
  const paint = (st) => { line.textContent = statusText(st); };
  paint(sync.status()); sync.onStatus((st) => { if (line.isConnected) paint(st); });
  return [h('h3', { text: t('account.menu') }), h('p', { 'data-test': 'account-signed-in', text: t('account.signedIn', { email: sync.email() }) }), line,
    h('div', { class: 'row' },
      h('button', { class: 'btn', 'data-test': 'account-signout', onclick: async () => { close(); await sync.signOut(); ui.toast(t('account.signedOut'), 'ok'); } }, t('account.signOut')),
      h('button', { class: 'btn danger', 'data-test': 'account-delete', onclick: () => { close(); confirmDelete(ui, acc); } }, t('account.delete.button')))];
}
export function statusText(st) {
  if (!st) return '';
  if (st.kind === 'saved' && st.at) return t('sync.saved', { t: fmtClock(st.at) });
  if (st.kind === 'saving') return t('sync.saving');
  if (st.kind === 'offline') return t('sync.offline');
  if (st.kind === 'unreachable') return t('sync.unreachable');
  return '';
}
// Settings > Gizlilik: the full account text stays reachable signed in or not
export function privacyLink(ui, acc, close) {
  if (!acc.available) return null;
  return h('p', { class: 'muted small' }, t('account.privacy.title'), ' ',
    h('button', { class: 'link', 'data-test': 'settings-account-details', onclick: () => { close(); showAccountPrivacy(ui); } }, t('account.privacy.detailsLink')));
}
export function showAccountPrivacy(ui, after = null) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'account-privacy-modal');
    box.append(h('h2', { text: t('account.privacy.title') }), ...list('account.privacy.details').filter((p) => String(p).trim()).map((p) => h('p', { class: 'muted', text: p })),
      h('button', { class: 'btn primary', 'data-test': 'account-privacy-close', onclick: close }, t('common.close')));
  }, Object.assign({ cls: 'acct' }, after ? { onClose: after } : {}));
}

// ---------- login: e-mail -> code ----------
export function openLogin(ui, acc, email = '') {
  let lock = null;
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'login-modal');
    const input = h('input', { class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', maxlength: 254,
      placeholder: t('auth.login.emailPlaceholder'), 'data-test': 'login-email', value: email });
    const err = h('p', { class: 'form-err hidden', role: 'alert', 'data-test': 'login-error' });
    const say = (key) => { err.textContent = key ? t(key) : ''; err.classList.toggle('hidden', !key); };
    const send = h('button', { class: 'btn primary', type: 'submit', 'data-test': 'login-send' }, t('auth.login.send'));
    const gate = gateOf(acc);
    lock = lockedButton(send, () => gate.wait('send'), 'auth.login.send', 'auth.login.sendIn');
    const form = h('form', { class: 'col', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); if (send.disabled || gate.busy('send')) return;
      const v = input.value.trim();
      if (!validEmail(v)) { say('auth.login.badEmail'); input.focus(); return; }
      const r = await gate.run('send', () => { say(null); send.disabled = true; send.textContent = t('auth.login.sending'); return acc.api.sendCode(v); });
      if (r === null) { lock.paint(); return; }   // in flight or still braked: no request
      if (!r.ok) { say(sendErrorKey(r)); lock.paint(); return; }
      lock.paint(); close(); openCode(ui, acc, v);
    } },
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: t('auth.login.emailLabel') }), input),
      // shown BEFORE any code is sent (r2 §1): two-line summary + "Ayrıntılar" (full text, also in Settings > Gizlilik)
      h('p', { class: 'muted small', 'data-test': 'login-privacy' }, t('auth.login.privacySummary'), ' ',
        h('button', { class: 'link', type: 'button', 'data-test': 'login-details', onclick: () => { const cur = input.value; close(); showAccountPrivacy(ui, () => openLogin(ui, acc, cur)); } }, t('account.privacy.detailsLink'))),
      err,
      h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'button', 'data-test': 'login-later', onclick: close }, t('auth.login.later')), send));
    box.append(h('h2', { text: t('auth.login.title') }), h('p', { text: t('auth.login.body') }),
      h('p', { class: 'muted small', 'data-test': 'login-optional', text: t('auth.login.optional') }),
      h('p', { class: 'muted small', 'data-test': 'login-age', text: t('auth.login.age') }), form);
    lock.paint();
    setTimeout(() => input.focus(), 0);
  }, { cls: 'acct', onClose: () => { if (lock) lock.stop(); } });
}
export function openCode(ui, acc, email) {
  let rlock = null, vlock = null;
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'code-modal');
    const input = h('input', { class: 'input code-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]*', maxlength: 6, 'data-test': 'code-input', 'aria-label': t('auth.code.label') });
    const err = h('p', { class: 'form-err hidden', role: 'alert', 'data-test': 'code-error' });
    const note = h('p', { class: 'muted small hidden', 'data-test': 'code-note', 'aria-live': 'polite' });
    const say = (key) => { err.textContent = key ? t(key) : ''; err.classList.toggle('hidden', !key); };
    const verify = h('button', { class: 'btn primary', type: 'submit', 'data-test': 'code-verify' }, t('auth.code.verify'));
    const gate = gateOf(acc);
    // "Kodu tekrar gönder" waits as long as the server does between two codes to one address (CLOUD.resendWaitSec),
    // and never less than the brake (gap between code requests / 10 s after a network error)
    let resendAt = Date.now() + Math.max(0, Math.round(acc.cfg.resendWaitSec)) * 1000;
    const resend = h('button', { class: 'link', type: 'button', 'data-test': 'code-resend', onclick: async () => {
      if (resend.disabled || gate.busy('send')) return;
      const r = await gate.run('send', () => { say(null); resend.disabled = true; return acc.api.sendCode(email); });
      if (r === null) { rlock.paint(); return; }
      if (!r.ok) { say(sendErrorKey(r)); rlock.paint(); return; }
      note.textContent = t('auth.code.resent'); note.classList.remove('hidden');
      resendAt = Date.now() + Math.max(0, Math.round(acc.cfg.resendWaitSec)) * 1000;
      rlock.paint();
    } }, t('auth.code.resend'));
    rlock = lockedButton(resend, () => Math.max(resendAt - Date.now(), gate.wait('send')), 'auth.code.resend', 'auth.code.resendIn');
    vlock = lockedButton(verify, () => gate.wait('verify'), 'auth.code.verify', 'auth.code.verifyIn');
    const form = h('form', { class: 'col', novalidate: true, onsubmit: async (e) => {
      e.preventDefault(); if (verify.disabled || gate.busy('verify')) return;
      const v = input.value.replace(/\s+/g, '');
      if (!validCode(v)) { say('auth.code.badCode'); input.focus(); return; }
      const r = await gate.run('verify', () => { say(null); verify.disabled = true; verify.textContent = t('auth.code.verifying'); return acc.api.verify(email, v); });
      vlock.paint();
      if (r === null) return;
      if (!r.ok) { say(verifyErrorKey(r)); input.select(); return; }
      close();
      await acc.sync.afterLogin();
      acc.sync.start();
    } },
      h('label', { class: 'field' }, h('span', { class: 'lbl', text: t('auth.code.label') }), input), err, note,
      h('div', { class: 'row' }, resend, h('button', { class: 'link', type: 'button', 'data-test': 'code-change-email', onclick: () => { close(); openLogin(ui, acc, email); } }, t('auth.code.changeEmail'))),
      h('div', { class: 'row end' }, verify));
    box.append(h('h2', { text: t('auth.code.title') }), h('p', { 'data-test': 'code-sent', text: t('auth.code.sent', { email }) }), h('p', { class: 'muted small', text: t('auth.code.spam') }), form);
    rlock.paint(); vlock.paint();
    setTimeout(() => input.focus(), 0);
  }, { cls: 'acct', onClose: () => { if (rlock) rlock.stop(); if (vlock) vlock.stop(); } });
}

// ---------- delete account ----------
export function confirmDelete(ui, acc) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'delete-modal');
    const err = h('p', { class: 'form-err hidden', role: 'alert', 'data-test': 'delete-error' });
    const no = h('button', { class: 'btn', 'data-test': 'delete-no', onclick: close }, t('account.delete.no'));
    const yes = h('button', { class: 'btn danger', 'data-test': 'delete-yes', onclick: async () => {
      yes.disabled = no.disabled = true; yes.textContent = t('account.delete.deleting'); err.classList.add('hidden');
      const ok = await acc.sync.deleteAccount();
      if (ok === true) { close(); ui.toast(t('account.delete.done'), 'ok'); return; }
      no.disabled = false; err.classList.remove('hidden');
      // signed out meanwhile: nothing was deleted and a retry cannot work -> say so, offer no "Evet, sil"
      if (ok === 'signedOut') { yes.remove(); err.textContent = t('account.delete.signedOut'); return; }
      yes.disabled = false; yes.textContent = t('account.delete.yes');
      err.textContent = t('account.delete.failed');
    } }, t('account.delete.yes'));
    box.append(h('h2', { text: t('account.delete.title') }), h('p', { text: t('account.delete.body') }), err, h('div', { class: 'row end' }, no, yes));
  }, { dismissable: false, cls: 'acct' });
}

// ---------- "Kaydı sil ve baştan başla" signed in ----------
export function confirmResetSignedIn(ui, acc) {
  ui.showModal((box, close) => {
    box.setAttribute('data-test', 'reset-signed-in');
    const err = h('p', { class: 'form-err hidden', role: 'alert', 'data-test': 'reset-error' });
    const no = h('button', { class: 'btn', onclick: close, 'data-test': 'reset-no' }, t('settings.no'));
    const yes = h('button', { class: 'btn danger', 'data-test': 'reset-yes', onclick: async () => {
      yes.disabled = no.disabled = true; err.classList.add('hidden');
      const ok = await acc.sync.resetSignedIn();
      if (ok === true) { close(); return; }
      if (ok === 'stale') { close(); acc.sync.reconcile(); return; }   // CONTRACT §3: 409 -> pull again + conflict screen
      yes.disabled = no.disabled = false;
      err.textContent = t('reset.failed'); err.classList.remove('hidden');
    } }, t('settings.yes'));
    box.append(h('p', { text: t('reset.confirmSignedIn') }), h('p', { class: 'muted small', 'data-test': 'reset-backup-note', text: t('reset.backupNote', { n: acc.cfg.backupDays }) }), err,
      h('div', { class: 'row end' }, no, yes));
  }, { dismissable: false, cls: 'acct' });
}

// ---------- cloud choice (v2.1 import conflict screen, two columns) ----------
// meta line: its best wrap point is right after "¤" -> two halves that do not wrap inside (wide enough columns);
// in narrow columns the halves may wrap, but only between the " · " parts ("356 B ¤" never splits). Same textContent.
const parts = (s) => { const out = []; const bits = String(s).split(' · '); bits.forEach((b, i) => { if (i) out.push(' '); out.push(h('span', { class: 'nowrap', text: b + (i < bits.length - 1 ? ' ·' : '') })); }); return out; };
export function metaNode(text, test) {
  const [a, b] = splitMeta(text);
  return h('small', { class: 'meta', 'data-test': test }, h('span', { class: 'half' }, ...parts(a)), b ? ' ' : null, b ? h('span', { class: 'half' }, ...parts(b)) : null);
}
const deviceName = (d) => (d === 'mobil' ? t('sync.conflict.deviceMobile') : d === 'masaustu' ? t('sync.conflict.deviceDesktop') : t('sync.conflict.dateUnknown'));
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
export function metaText(o) {
  const m = (o && o.meta) || {};
  return t('sync.conflict.meta', { f: fmt(Math.floor(num(o && o.followers))), v: fmt(num(o && o.money)), n: fmt(num(m.fame)), k: fmt(num(m.sales)) });
}
export function metaLastText(o, device, fallbackTs = null) {
  const ts = o && num(o.lastSeen) > 0 ? o.lastSeen : fallbackTs;
  return t('sync.conflict.metaLast', { c: deviceName(device), d: fmtStamp(ts) });
}
// -> Promise<'cloud' | 'device'>; kind 'login' uses body (rule 3), 'newer' bodyNewer (rule 4). Not dismissable.
export function showCloudChoice(ui, { kind, cloud, device, recommended, thisDevice }) {
  return new Promise((resolve) => {
    ui.showModal((box, close) => {
      const pick = (v) => { close(); resolve(v); };
      const card = (id, head, save, dev, ts, btnKey) => h('div', { class: 'choice-card' + (recommended === id ? ' is-rec' : ''), 'data-test': 'conflict-' + id },
        h('b', { class: 'choice-head', text: t(head) }),
        recommended === id ? h('span', { class: 'chip ok sm', 'data-test': 'conflict-recommended', text: t('sync.conflict.recommended') }) : null,
        metaNode(metaText(save), 'conflict-' + id + '-meta'),
        h('small', { class: 'meta', 'data-test': 'conflict-' + id + '-last', text: metaLastText(save, dev, ts) }),
        h('button', { class: 'btn' + (recommended === id ? ' primary' : ''), 'data-test': 'use-' + id, onclick: () => pick(id) }, t(btnKey)));
      box.setAttribute('data-test', 'cloud-conflict');
      box.append(h('h2', { text: t('sync.conflict.title') }), h('p', { 'data-test': 'cloud-conflict-body', text: t(kind === 'newer' ? 'sync.conflict.bodyNewer' : 'sync.conflict.body') }),
        h('div', { class: 'choice-grid' },
          card('cloud', 'sync.conflict.optCloud', cloud.data, cloud.device, cloud.updated_at ? Date.parse(cloud.updated_at) : null, 'sync.conflict.useCloud'),
          card('device', 'sync.conflict.optDevice', device, thisDevice, null, 'sync.conflict.useDevice')));
    }, { dismissable: false, cls: 'wide' });
  });
}
// the save that was not picked (or the device save before a reset from elsewhere): its code, once. -> Promise
export function showKeep(ui, { kind, save, telState }) {
  return new Promise((resolve) => {
    ui.showModal(async (box, close) => {
      box.setAttribute('data-test', kind === 'reset' ? 'keep-reset' : 'keep-modal');
      const area = h('textarea', { class: 'input code', readonly: true, rows: 3, 'data-test': 'keep-code', onfocus: (e) => e.target.select() });
      const copy = h('button', { class: 'btn', 'data-test': 'keep-copy', onclick: async () => {
        const ok = await copyText(area.value);
        if (ok) { copy.textContent = t('sync.conflict.keepCopied'); copy.classList.add('done'); } else ui.toast(t('share.fail'), 'bad');
      } }, t('sync.conflict.keepCopy'));
      box.append(h('h2', { text: t(kind === 'reset' ? 'sync.conflict.keepTitleReset' : 'sync.conflict.keepTitle') }),
        h('p', { text: t(kind === 'reset' ? 'sync.conflict.keepBodyReset' : 'sync.conflict.keepBody') }), area,
        h('div', { class: 'row end' }, copy, h('button', { class: 'btn primary', 'data-test': 'keep-continue', onclick: () => { close(); resolve(); } }, t('sync.conflict.keepContinue'))));
      try { area.value = await encodeEnvelope(buildEnvelope(save, telState || {})); } catch (e) { area.value = ''; }
    }, { dismissable: false, cls: 'acct' });
  });
}
