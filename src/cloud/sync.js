// v2.2 cloud sync: rules in src/logic/cloud.js, network in src/cloud/api.js, screens in src/ui/account.js (hooks).
// The device save (fenomen_save_v1) stays the game's source of truth; the cloud gets a copy every CLOUD.syncEverySec,
// right away when the page is hidden / closed (flush) and shortly after a video is published (soon, coalesced). A refused write (revision) never overwrites anything: pull, then decide.
import { CLOUD } from '../config.js';
import * as G from '../logic/game.js';
import { SAVE_KEY, serialize } from '../logic/save.js';
import { readRawSave, parseRaw } from '../logic/transfer.js';
import { loginDecision, pullDecision, progressSig, recommend, saveSum } from '../logic/cloud.js';

export const KNOWN_KEY = 'fenomen_cloud_sync';      // { uid, revision, sig, sum, at } = what this device last wrote/read

export function createSync({ api, ctrl, storage, tel = null, device = 'masaustu', hooks, cfg = CLOUD, now = () => Date.now(), win = typeof window === 'undefined' ? null : window }) {
  let busy = false, timer = null, status = { kind: 'idle', at: null }, lastNet = null;
  let lastWriteAt = 0, soonTimer = null, flushPending = false;
  const listeners = [];
  const setStatus = (kind, at = status.at) => { status = { kind, at }; for (const fn of listeners) try { fn(status); } catch (e) { /* ignore */ } };
  const readKnown = () => { try { const k = JSON.parse(storage.getItem(KNOWN_KEY)); return k && k.uid === api.uid() ? k : null; } catch (e) { return null; } };
  const writeKnown = (row, data) => { try { storage.setItem(KNOWN_KEY, JSON.stringify({ uid: api.uid(), revision: row.revision, sig: progressSig(data), sum: saveSum(data), at: now() })); } catch (e) { /* ignore */ } };
  const clearKnown = () => { try { storage.removeItem(KNOWN_KEY); } catch (e) { /* ignore */ } };
  const local = () => { ctrl.save(); return parseRaw(readRawSave(storage)); };
  // network trouble: status line + ONE toast per episode (not every minute)
  const netFail = (r) => {
    const kind = r.network === 'offline' ? 'offline' : 'unreachable';
    if (lastNet !== kind) { lastNet = kind; hooks.toast('sync.' + kind); }
    setStatus(kind); return false;
  };
  // the server ended the session (signed out elsewhere, token revoked, account gone): say so once; the device save stays
  const signedOutByServer = ({ quiet = false } = {}) => { clearKnown(); setStatus('idle', null); if (!quiet) hooks.toast('account.signedOutByServer'); return false; };
  const fail = (r) => (r.signedOut ? signedOutByServer() : netFail(r));
  const done = (row, data) => { writeKnown(row, data); lastNet = null; setStatus('saved', now()); return true; };

  // cloud save -> this device (no backup: rule 2, or the player chose it, or nothing new was here)
  function loadCloud(row) {
    try { storage.setItem(SAVE_KEY, JSON.stringify(row.data)); } catch (e) { return false; }
    if (tel) try { tel.seed(row.data); } catch (e) { /* counter is independent */ }
    ctrl.reload();
    writeKnown(row, parseRaw(readRawSave(storage)) || row.data);
    lastNet = null; setStatus('saved', now());
    return true;
  }
  async function write(data, known, opts = {}) {
    setStatus('saving'); lastWriteAt = now();
    const r = known ? await api.update(data, known.revision, device, opts) : await api.insert(data, device);
    if (r.ok) return { ok: done(r.row, data) };
    if (r.stale) return { stale: true };
    return { ok: fail(r) };
  }
  // choice screen (rule 3 at login, rule 4 later) -> the kept save is applied, the other one's code is offered once
  async function choose(kind, row, data, depth = 0) {
    const pick = await hooks.conflict({ kind, cloud: row, device: data, recommended: recommend(row.data, data) });
    if (pick === 'cloud') { await hooks.keep({ kind: 'conflict', save: local(), telState: tel ? tel.exportState() : {} }); loadCloud(row); return true; }
    await hooks.keep({ kind: 'conflict', save: row.data, telState: {} });
    const again = await write(local(), { revision: row.revision });
    return again.stale ? reconcile(depth + 1) : again.ok;
  }
  // rule 6: reset elsewhere. The old device never overwrites it; unsynced progress here -> its code once, then load.
  async function otherDeviceReset(row, keep) {
    if (keep) await hooks.keep({ kind: 'reset', save: local(), telState: tel ? tel.exportState() : {} });
    loadCloud(row);
    hooks.toast('reset.otherDevice');
    return true;
  }
  async function run(fn) {
    if (busy) return false; busy = true;
    try { return await fn(); } finally { busy = false; if (flushPending) { flushPending = false; api2.flush(); } }
  }
  function fireSoon() {
    soonTimer = null;
    if (!api.signedIn()) return;
    // another write (60 s / flush / manual) went out after this was scheduled: keep the gap from that one
    const wait = lastWriteAt + cfg.pushGapMs - now();
    if (wait > 0) { soonTimer = win.setTimeout(fireSoon, wait); return; }
    if (busy) { soonTimer = win.setTimeout(fireSoon, 1000); return; }   // a sync is running: try again right after it
    api2.push();
  }

  // depth: a refused write pulls again; a second refusal in a row waits for the next sync instead of looping
  async function reconcile(depth = 0) {
    if (depth > 2) { setStatus('unreachable'); return false; }
    const again = (w) => (w.stale ? reconcile(depth + 1) : w.ok);
    const p = await api.pull(); if (!p.ok) return fail(p);
    const data = local(), known = readKnown();
    // no record of an earlier sync on this device (e.g. its storage was cleared): the login rules apply
    const d = known ? pullDecision(data, p.row, known) : { action: loginDecision(data, p.row) };
    switch (d.action) {
      case 'upload': return again(await write(data, null));
      case 'push': { if (known.sum === saveSum(data)) { setStatus('saved', status.at || known.at); return true; } return again(await write(data, known)); }
      case 'loadCloud': loadCloud(p.row); hooks.toast('sync.cloudLoaded'); return true;
      case 'adopt': return done(p.row, data);
      case 'reset': return otherDeviceReset(p.row, d.keep);
      default: return choose(known ? 'newer' : 'login', p.row, data, depth);
    }
  }
  const api2 = {
    status: () => status,
    onStatus: (fn) => listeners.push(fn),
    signedIn: () => api.signedIn(),
    email: () => api.email(),
    busy: () => busy,
    soonPending: () => !!soonTimer,          // a write after a publish is scheduled (status / tests)
    lastWrite: () => lastWriteAt,            // when the last write started (ms; status / tests)
    // right after the 6-digit code was accepted (rules 1-3)
    afterLogin: () => run(async () => {
      clearKnown();
      const p = await api.pull(); if (!p.ok) return fail(p);
      const data = local();
      switch (loginDecision(data, p.row)) {
        case 'upload': { const w = await write(data, null); if (w.stale) return reconcile(); if (w.ok) hooks.toast('sync.uploaded', 'ok'); return w.ok; }
        case 'loadCloud': loadCloud(p.row); hooks.toast('sync.cloudLoaded', 'ok'); return true;
        case 'adopt': done(p.row, data); hooks.toast('sync.uploaded', 'ok'); return true;
        default: return choose('login', p.row, data);
      }
    }),
    // boot with a session, a refused write, the 'online' event
    reconcile: () => run(() => (api.signedIn() ? reconcile() : false)),
    // video published: one write after pushDelayMs, and not sooner than pushGapMs after the last write. While one
    // is scheduled, further calls ride along (a burst of publishes = one request).
    soon: () => {
      if (!win || soonTimer || !api.signedIn()) return false;
      soonTimer = win.setTimeout(fireSoon, Math.max(cfg.pushDelayMs, lastWriteAt + cfg.pushGapMs - now()));
      return true;
    },
    // page hidden / closed: write now (keepalive), replacing a scheduled write. During a running sync: once more
    // right after it (hidden + pagehide back to back = the second finds nothing new = no request).
    flush: () => {
      if (!api.signedIn()) return false;
      if (soonTimer) { win.clearTimeout(soonTimer); soonTimer = null; }
      if (busy) { flushPending = true; return false; }
      return api2.push({ keepalive: true });
    },
    // periodic / flush / soon. Nothing changed since the last write = no request.
    push: ({ keepalive = false } = {}) => run(async () => {
      if (!api.signedIn()) return false;
      const known = readKnown(); if (!known) return reconcile();
      const data = local(); if (known.sum === saveSum(data)) return true;
      const w = await write(data, known, { keepalive: keepalive && JSON.stringify(data).length < 60000 });
      return w.stale ? reconcile() : w.ok;
    }),
    // "Baştan başla" while signed in: server backup + new game in one RPC; locally only after the server said yes
    resetSignedIn: () => run(async () => {
      const known = readKnown();
      const t = now(), next = G.newGame(t); next.resetAt = t;
      const data = JSON.parse(serialize(next));
      const r = await api.reset(data, known ? known.revision : 0, device);
      // 409 stale (another device moved on): nothing reset; the caller closes its dialog and runs reconcile (conflict screen)
      if (!r.ok) { if (r.signedOut) signedOutByServer(); return r.stale ? 'stale' : false; }
      ctrl.reset(next);
      writeKnown({ revision: r.revision }, data); setStatus('saved', now());
      return true;
    }),
    // the device save stays (both)
    signOut: async () => { if (timer) stop(); clearKnown(); await api.signOut(); setStatus('idle', null); start(); return true; },
    // -> true | false (try again) | 'signedOut' (session gone meanwhile: nothing deleted, the dialog says so, no retry)
    deleteAccount: () => run(async () => {
      const r = await api.deleteAccount();
      if (!r.ok) return r.signedOut ? (signedOutByServer({ quiet: true }), 'signedOut') : false;
      clearKnown(); setStatus('idle', null); return true;
    }),
    start, stop
  };
  function start() {
    if (timer || !win) return;
    timer = setInterval(() => { if (api.signedIn()) api2.push(); }, Math.max(1, cfg.syncEverySec) * 1000);
  }
  function stop() { clearInterval(timer); timer = null; if (soonTimer) { win.clearTimeout(soonTimer); soonTimer = null; } }
  if (win && win.addEventListener) {
    win.addEventListener('online', () => { if (api.signedIn()) api2.reconcile(); });
    win.addEventListener('pagehide', () => { api2.flush(); });
  }
  return api2;
}
