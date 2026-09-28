// Anonymous progress counter ("kimliksiz ilerleme sayacı", scope doc v2.1 §1-2).
//
// ============== INSERT CONTRACT (final, backend v2.1: fenomen-v2.1-backend/supabase/CONTRACT-v2.1-stats.md) ==============
//   POST {TELEMETRY.url}/rest/v1/anon_stats_events              (table overridable with VITE_TELEMETRY_TABLE)
//   Headers: apikey: <anon key>, Content-Type: application/json, Prefer: return=minimal
//            (no Authorization header: the publishable key is not a JWT; never ask for the row back / no select)
//   Body (ONE row per request, exactly these four fields, nothing else):
//     { "event": "first_video",        // one of the 22 EVENT_IDS below (server allow list, exact case)
//       "version": "2.1.0",            // plain semver (__APP_SEMVER__), never __APP_VERSION__ (sha/time -> rejected)
//       "device_class": "mobil",       // "mobil" | "masaustu"
//       "play_bucket": "10-30" }       // "0-10" | "10-30" | "30-60" | "60-120" | "120+" ([0,10) [10,30) … >=120 min)
//   Success: 201 with empty body. id / created_at are written by the server and must NOT be sent (401);
//   unknown fields -> 400 PGRST204. No UTM, no ids, no timestamps, no exact minutes.
//   fetch keepalive, credentials 'omit', referrerPolicy 'no-referrer', 5 s timeout. Never awaited by gameplay.
// ==========================================================================================================================
//
// Once-per-device flags (local only, never sent): `fenomen_sent_<key>` = 'true' (key = event id; every path_chosen_*
// shares the key `path_chosen`, so only the FIRST career choice is counted).
//  - first_* events: the flag is written only after a 2xx answer. Before sending, `fenomen_retry_<key>` = 'pending' is
//    written; if the request fails (or the page closes first) the event is retried ONCE on the next app launch
//    (retryPending(), state 'retried'), never again in the same session and never in a loop. After a failed retry
//    it is given up (no flag, stays 'retried').
//  - other once-events (game_open_new, character_created, path_chosen_*, followers_*, kiraliksiz_hayat): flag written
//    when sent, fire-and-forget, no retry (contract recommendation).
//  - session_start: rate-limited instead (TELEMETRY.sessionGapMin, device clock).
// Notice: nothing is sent before the first-launch notice is answered, and nothing is marked as sent either.
// Milestones reached meanwhile wait in `fenomen_tel_pending` (local only, never sent as such): a JSON array of event
// ids from EVENT_IDS and nothing else (no time, no counts, no ids), e.g. ["game_open_new","character_created",
// "path_chosen_vlog","first_video"]. It survives reloads; seed() never marks a pending milestone as done.
//  - "Tamam": every pending milestone is sent exactly once (normal once/retry rules), then the key is removed.
//  - "Kapat" / counter switched off: the key is removed, nothing is ever sent for those milestones.
//  - notice answered some other way (imported save carrying the answer): handled on the next launch (retryPending).
// session_start waits in memory only (it is re-triggered on every launch anyway). The Settings switch stops sending
// at once; milestones reached while the switch is off are not recorded (unchanged v2.1 behaviour).
import { TELEMETRY } from './config.js';

// fixed server allow list (22). Changing thresholds/paths needs a backend migration first.
export const EVENT_IDS = ['game_open_new', 'character_created', 'path_chosen_vlog', 'path_chosen_oyun', 'path_chosen_luks',
  'first_video', 'first_edit_game', 'first_shop_buy', 'first_rent', 'first_ifsa', 'first_ifsa_ozur', 'first_ifsa_gormezden',
  'first_staff', 'first_manager', 'followers_1B', 'followers_10B', 'followers_100B', 'followers_1M', 'first_sell', 'first_fame_node',
  'kiraliksiz_hayat', 'session_start'];
export const PAYLOAD_FIELDS = ['event', 'version', 'device_class', 'play_bucket'];
export const DEVICE_CLASSES = ['mobil', 'masaustu'];
export const PLAY_BUCKETS = ['0-10', '10-30', '30-60', '60-120', '120+'];
export const SEMVER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
export const KEYS = { pref: 'fenomen_tel', notice: 'fenomen_tel_notice', session: 'fenomen_tel_session', utm: 'fenomen_utm', sent: 'fenomen_sent_', retry: 'fenomen_retry_', pending: 'fenomen_tel_pending' };
const ALLOWED = new Set(EVENT_IDS);
export const dedupeKey = (id) => (id.startsWith('path_chosen_') ? 'path_chosen' : id);
export const confirmed = (id) => id.startsWith('first_');      // flag only after 2xx, one retry next launch
export const semver = (v) => { const s = String(v || '').split('-')[0]; return SEMVER.test(s) ? s : '0.0.0'; };

export function playBucket(minutes, edges = TELEMETRY.playBuckets) {
  let lo = 0;
  for (const e of edges) { if (minutes < e) return lo + '-' + e; lo = e; }
  return lo + '+';
}
export function deviceClass(win) {
  try { if (win.matchMedia && win.matchMedia('(pointer: coarse)').matches) return 'mobil'; } catch (e) { /* ignore */ }
  return 'masaustu';
}

// Transports: send(payload) -> Promise<{ ok, status }> (never rejects, never throws).
// MOCK (default while no URL/key is configured): console.debug + in-memory list; `fail` simulates errors in tests.
export function mockTransport(log = true) {
  const sent = [];
  const T = { kind: 'mock', sent, fail: false, send(p) {
    sent.push(p); if (log && typeof console !== 'undefined') console.debug('[telemetry:mock]', JSON.stringify(p));
    return Promise.resolve(T.fail ? { ok: false, status: 0 } : { ok: true, status: 201 });
  } };
  return T;
}
export function httpRequest({ url, key, table, timeoutMs = 5000 }, payload) {
  const headers = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  if (key) headers.apikey = key;
  const init = { method: 'POST', headers, body: JSON.stringify(payload), keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' };
  try { if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) init.signal = AbortSignal.timeout(timeoutMs); } catch (e) { /* old browser */ }
  return { url: String(url).replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(table), init };
}
export function httpTransport(cfg, fetchFn = (typeof fetch === 'function' ? fetch.bind(globalThis) : null)) {
  return { kind: 'http', endpoint: httpRequest(cfg, {}).url, send(p) {
    if (!fetchFn) return Promise.resolve({ ok: false, status: 0 });
    try {
      const r = httpRequest(cfg, p);
      return Promise.resolve(fetchFn(r.url, r.init)).then((res) => ({ ok: !!res && res.status >= 200 && res.status < 300, status: res ? res.status : 0 }), () => ({ ok: false, status: 0 }));
    } catch (e) { return Promise.resolve({ ok: false, status: 0 }); }
  } };
}
export function defaultTransport(cfg = TELEMETRY) { return cfg.url && cfg.key ? httpTransport(cfg) : mockTransport(); }

// UTM tags of the landing URL, stored once (first visit), local only. NEVER attached to events (the contract allows
// exactly four fields; UTM stays only in share links).
export function captureUtm(storage, search) {
  try {
    if (storage.getItem(KEYS.utm)) return JSON.parse(storage.getItem(KEYS.utm));
    const q = new URLSearchParams(search || ''); const o = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (q.get(k)) o[k] = q.get(k).slice(0, 80);
    if (!Object.keys(o).length) return null;
    storage.setItem(KEYS.utm, JSON.stringify(o)); return o;
  } catch (e) { return null; }
}

export function createTelemetry({ storage, transport = mockTransport(), version = '0', device = 'masaustu', playMinutes = () => 0, now = () => Date.now(), cfg = TELEMETRY } = {}) {
  const get = (k) => { try { return storage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { storage.setItem(k, v); } catch (e) { /* ignore */ } };
  const del = (k) => { try { storage.removeItem(k); } catch (e) { /* ignore */ } };
  const held = [], fdone = new Set(), attempted = new Set();   // attempted: first_* tried in this session (no resend)
  const T = {
    transport,
    noticeNeeded: () => !get(KEYS.notice),
    enabled: () => get(KEYS.pref) !== 'off',
    wasSent: (id) => get(KEYS.sent + dedupeKey(id)) === 'true',
    setEnabled(on) { set(KEYS.pref, on ? 'on' : 'off'); if (!on) { held.length = 0; T.clearPending(); } },
    // milestones reached before the notice was answered (stage ids only; see the header)
    pending() {
      let a; try { a = JSON.parse(get(KEYS.pending) || '[]'); } catch (e) { a = []; }
      return Array.isArray(a) ? a.filter((id, i) => typeof id === 'string' && ALLOWED.has(id) && id !== 'session_start' && a.indexOf(id) === i) : [];
    },
    addPending(id) { const a = T.pending(); if (!a.some((x) => dedupeKey(x) === dedupeKey(id))) { a.push(id); set(KEYS.pending, JSON.stringify(a)); } },
    clearPending() { del(KEYS.pending); },
    // notice answered + counter on: send what waited (each once, normal rules); counter off: forget it
    flushPending() {
      if (T.noticeNeeded()) return;
      const a = T.pending(); T.clearPending();
      if (T.enabled()) for (const id of a) T.track(id);
    },
    // first-launch notice: ok = "Tamam" (keep counting), false = "Kapat" (counter off, nothing is ever sent)
    answerNotice(ok) {
      set(KEYS.notice, '1'); T.setEnabled(!!ok);            // "Kapat" clears the pending list (setEnabled)
      const q = held.splice(0);
      if (!ok) return;
      for (const id of q) (id === 'session_start' ? T.sessionStart() : T.track(id));
      T.flushPending();                                     // milestones from earlier sessions (before a reload)
    },
    // exactly the four contract fields
    payload(id) {
      return { event: id, version: semver(version), device_class: DEVICE_CLASSES.includes(device) ? device : 'masaustu', play_bucket: playBucket(Math.max(0, +playMinutes() || 0), cfg.playBuckets) };
    },
    // fire-and-forget; resolves { ok, status }, never throws/rejects
    send(id) {
      try { return Promise.resolve(transport.send(T.payload(id))).then((r) => r || { ok: false, status: 0 }, () => ({ ok: false, status: 0 })); }
      catch (e) { return Promise.resolve({ ok: false, status: 0 }); }
    },
    retryState: (id) => get(KEYS.retry + dedupeKey(id)),
    // first_*: pending marker -> send -> flag only on 2xx. Returns the send promise (tests await it; the game never does).
    sendConfirmed(id, retrying) {
      const k = dedupeKey(id); attempted.add(k);
      set(KEYS.retry + k, retrying ? 'retried' : 'pending');
      return T.send(id).then((r) => { if (r.ok) { set(KEYS.sent + k, 'true'); del(KEYS.retry + k); } return r; });
    },
    // -> 'sent' | 'held' | 'dup' | 'off' | 'invalid' | 'retry-later'
    track(id) {
      if (!ALLOWED.has(id) || id === 'session_start') return id === 'session_start' ? T.sessionStart() : 'invalid';
      if (!T.enabled()) return 'off';
      if (T.wasSent(id)) return 'dup';
      if (confirmed(id) && (attempted.has(dedupeKey(id)) || T.retryState(id))) return 'retry-later';
      if (T.noticeNeeded()) { if (!held.includes(id)) held.push(id); T.addPending(id); return 'held'; }
      if (confirmed(id)) { T.last = T.sendConfirmed(id, false); return 'sent'; }
      set(KEYS.sent + dedupeKey(id), 'true');
      T.last = T.send(id); return 'sent';
    },
    // app launch: resend each first_* that failed (or was cut off) last time — once. -> promise of results
    retryPending() {
      const out = [];
      if (T.noticeNeeded()) return Promise.resolve(out);
      if (!T.enabled()) { T.clearPending(); return Promise.resolve(out); }
      const keys = [];
      try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEYS.retry)) keys.push(k.slice(KEYS.retry.length)); } } catch (e) { /* ignore */ }
      for (const k of keys) {
        if (get(KEYS.retry + k) !== 'pending' || !ALLOWED.has(k) || !confirmed(k) || attempted.has(k)) continue;
        if (T.wasSent(k)) { del(KEYS.retry + k); continue; }
        out.push(T.sendConfirmed(k, true).then((r) => [k, r.ok]));
      }
      T.flushPending();              // notice answered without this session's band (e.g. imported save): send what waited
      return Promise.all(out);
    },
    sessionStart() {
      if (!T.enabled()) return 'off';
      const last = +get(KEYS.session) || 0, t = now();
      if (last && t - last < cfg.sessionGapMin * 60000 && t >= last) return 'rate';
      if (T.noticeNeeded()) { if (!held.includes('session_start')) held.push('session_start'); return 'held'; }
      set(KEYS.session, String(t)); T.last = T.send('session_start'); return 'sent';
    },
    // called every tick: remembers handled milestones so storage is not read 4x per frame
    followers(n) { for (const [th, id] of cfg.followers) if (n >= th && !fdone.has(id)) { if (T.track(id) !== 'invalid') fdone.add(id); } },
    // mark milestones the save already reached as done WITHOUT sending (players who started before v2.1,
    // or saves brought from another address) so the funnel never counts them late or twice
    seed(s) {
      if (!s || typeof s !== 'object') return;
      const st = s.stats || {}, m = s.meta || {}, staff = s.staff || {};
      const done = [];
      if (s.created || m.sales > 0) done.push('game_open_new', 'character_created', 'path_chosen');
      if (st.videos > 0 || m.sales > 0) done.push('first_video', 'first_edit_game');
      const bought = Object.values(s.items || {}).some((it) => it && it.status === 'owned') || Object.values(s.equip || {}).some((l) => l > 0) || Object.values(s.invest || {}).some((n) => n > 0) || staff.editor > 0;
      if (bought || m.sales > 0) done.push('first_shop_buy');
      if (st.rentPaid > 0) done.push('first_rent');
      if (st.ifsa > 0) done.push('first_ifsa'); if (st.apologies > 0) done.push('first_ifsa_ozur'); if (st.ignored > 0) done.push('first_ifsa_gormezden');
      if (staff.editor > 0) done.push('first_staff'); if (staff.manager > 0) done.push('first_manager');
      const best = Math.max(+st.peakFollowers || 0, +m.bestFollowers || 0, +s.followers || 0);
      for (const [th, id] of cfg.followers) if (best >= th) done.push(id);
      if (m.sales > 0) done.push('first_sell');
      if (Array.isArray(m.unlocks) && m.unlocks.length) done.push('first_fame_node');
      if (Array.isArray(m.achievements) && m.achievements.includes('rent_free')) done.push('kiraliksiz_hayat');
      // a pending retry keeps its chance; a milestone waiting for the notice answer is not "done" (it was never sent)
      const waiting = new Set(T.pending().map(dedupeKey));
      for (const k of done) if (!get(KEYS.retry + k) && !waiting.has(k)) set(KEYS.sent + k, 'true');
    },
    // device-level counter state that travels with an exported save / the move to the new address
    exportState() {
      const sent = [];
      try { for (let i = 0; i < storage.length; i++) { const k = storage.key(i); if (k && k.startsWith(KEYS.sent) && get(k) === 'true') sent.push(k.slice(KEYS.sent.length)); } } catch (e) { /* ignore */ }
      return { sent: sent.sort(), tel: get(KEYS.pref) === 'off' ? 'off' : get(KEYS.pref) === 'on' ? 'on' : null, notice: !T.noticeNeeded() };
    },
    // merge: flags are united (never re-count), "off" wins over "on", an answered notice stays answered
    absorb({ sent, tel, notice } = {}) {
      for (const k of sent || []) if (/^[A-Za-z0-9_]{1,40}$/.test(k)) set(KEYS.sent + k, 'true');
      if (tel === 'off') T.setEnabled(false); else if (tel === 'on' && get(KEYS.pref) !== 'off') set(KEYS.pref, 'on');
      if (notice) set(KEYS.notice, '1');
    },
    held: () => held.slice()
  };
  return T;
}

// Controller events -> counter events
export function wireTelemetry(ctrl, tel) {
  const on = (ev, fn) => ctrl.on(ev, (e) => { try { fn(e || {}); } catch (x) { /* never break the game */ } });
  on('created', (e) => { tel.track('character_created'); if (e.path) tel.track('path_chosen_' + e.path); });
  on('published', () => tel.track('first_video'));
  on('editGame', () => tel.track('first_edit_game'));
  on('bought', () => tel.track('first_shop_buy'));
  on('invested', () => tel.track('first_shop_buy'));
  on('upgraded', () => tel.track('first_shop_buy'));
  on('hired', (e) => { tel.track('first_shop_buy'); if (e.id === 'editor') tel.track('first_staff'); if (e.id === 'manager') tel.track('first_manager'); });
  on('rented', () => tel.track('first_rent'));
  on('ifsa', () => tel.track('first_ifsa'));
  on('ifsaResolved', (e) => tel.track(e.choice === 'apology' ? 'first_ifsa_ozur' : 'first_ifsa_gormezden'));
  on('sold', () => tel.track('first_sell'));
  on('fameNode', () => tel.track('first_fame_node'));
  on('achievement', (e) => { if (e.id === 'rent_free') tel.track('kiraliksiz_hayat'); });
  on('change', () => tel.followers(ctrl.state.followers));
  on('tick', () => tel.followers(ctrl.state.followers));
}
