// v2.2 cloud save: pure decisions (no DOM, no network) so node:test covers every rule.
// Rules (plan r2 / scope "v2.2 — Bulut kayıt" (3)):
//   1. login, cloud empty                       -> the device save is uploaded
//   2. login, device save has no first video yet -> the cloud save is loaded WITHOUT a backup ("Buluttaki kaydın yüklendi.")
//   3. login, both exist and differ             -> choice screen (recommended = more progress: sales, total Şöhret, followers)
//   4. during play the cloud moved on (revision) -> nothing new here: load it silently; new progress here: choice screen
//   6. reset on another device                  -> no choice; unsynced progress here: its save code is offered ONCE first
import { isEmptySave, checksumOf } from './transfer.js';

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0);
const len = (x) => (Array.isArray(x) ? x.length : isObj(x) ? Object.keys(x).length : 0);

// progress order (scope rule 3): channels sold, then total Şöhret (earned, not the spendable balance), then followers
export function progress(o) {
  const m = isObj(o) && isObj(o.meta) ? o.meta : {};
  return [num(m.sales), Math.max(num(m.fameEarned), num(m.fame)), Math.floor(num(isObj(o) ? o.followers : 0))];
}
// -> 'cloud' | 'device' | null (equal: no "Önerilen" label)
export function recommend(cloud, device) {
  const a = progress(cloud), b = progress(device);
  for (let i = 0; i < a.length; i++) { if (a[i] > b[i]) return 'cloud'; if (a[i] < b[i]) return 'device'; }
  return null;
}
// rule 2: the device save has not published its first video and has nothing permanent (sales, Şöhret, tree)
export function isFresh(o) {
  if (isEmptySave(o)) return true;
  const st = isObj(o.stats) ? o.stats : {}, m = isObj(o.meta) ? o.meta : {};
  return !(num(st.videos) > 0) && !(num(m.sales) > 0) && !(num(m.fameEarned) > 0) && !(num(m.fame) > 0) && !len(m.unlocks) && !len(o.history) && !len(o.videos);
}
// player actions only (videos, purchases, rentals, upgrades, staff, investments, Şöhret, sales, tree, achievements,
// character). Passive income and follower growth between two writes are not "progress that did not reach the cloud".
export function progressSig(o) {
  if (!isObj(o)) return '';
  const st = isObj(o.stats) ? o.stats : {}, m = isObj(o.meta) ? o.meta : {}, w = isObj(o.wear) ? o.wear : {};
  const sum = (x) => (isObj(x) ? Object.values(x).reduce((a, b) => a + num(b), 0) : 0);
  return JSON.stringify([!!o.created, o.path || null, isObj(o.char) ? o.char.channel || '' : '', num(st.videos), num(o.resetAt),
    Object.keys(isObj(o.items) ? o.items : {}).sort().map((k) => k + ':' + (o.items[k] && o.items[k].status)), len(w.owned), len(w.rented),
    sum(o.equip), sum(o.staff), sum(o.invest), !!o.fanbox, num(m.fame), num(m.fameEarned), num(m.sales), len(m.unlocks), len(m.achievements)]);
}
// the cloud save was reset on another device after this device's save began (rule 6)
export const cloudWasReset = (cloudData, local) => num(isObj(cloudData) ? cloudData.resetAt : 0) > num(isObj(local) ? local.resetAt : 0);
// change check for the cloud copy: everything except lastSeen (written on every local save, even when nothing happened)
export const saveSum = (o) => { if (!isObj(o)) return ''; const { lastSeen, ...rest } = o; void lastSeen; return checksumOf(rest); };
export const sameSave = (a, b) => isObj(a) && isObj(b) && saveSum(a) === saveSum(b);

// right after the code was accepted. row = cloud row or null.
// -> 'upload' | 'loadCloud' | 'adopt' (identical) | 'conflict'
export function loginDecision(local, row) {
  if (!row || !isObj(row.data)) return 'upload';
  if (!isObj(local) || isFresh(local)) return 'loadCloud';
  if (sameSave(local, row.data)) return 'adopt';
  return 'conflict';
}
// later syncs (boot, a write was refused). known = what this device last wrote/read: { revision, sig }.
// -> 'push' | 'upload' | 'loadCloud' | 'reset' (+ keep: unsynced progress here) | 'conflict'
export function pullDecision(local, row, known) {
  if (!row || !isObj(row.data)) return { action: 'upload' };
  const rev = num(known && known.revision);
  if (row.revision === rev) return { action: 'push' };
  const unsynced = !known || progressSig(local) !== known.sig;
  if (cloudWasReset(row.data, local)) return { action: 'reset', keep: unsynced && !isFresh(local) };
  if (row.revision > rev && !unsynced) return { action: 'loadCloud' };
  if (sameSave(local, row.data)) return { action: 'adopt' };
  return { action: 'conflict' };
}

// ---------- errors -> tr.json keys ----------
const RATE = ['over_email_send_rate_limit', 'over_request_rate_limit', 'over_sms_send_rate_limit'];
const txt = (b) => (isObj(b) ? [b.msg, b.message, b.error_description, b.error].filter((x) => typeof x === 'string').join(' ') : '');
const code = (b) => String(isObj(b) ? b.error_code || (typeof b.code === 'string' ? b.code : '') : '').toLowerCase();
// res: { network: 'offline' | 'unreachable', timeout? } | { status, body }
// Network error while online (not our own timeout) on /auth/v1/otp or /verify = Cloudflare's rate-limit block (its 429
// carries no CORS header, the browser only sees a TypeError) or a real network fault: auth.login.netOrRate + 10 s lock.
export const isNetBlock = (res) => !!res && res.network === 'unreachable' && !res.timeout;
const netKey = (res) => (res && res.network === 'offline' ? 'auth.code.offline' : isNetBlock(res) ? 'auth.login.netOrRate' : 'auth.code.unreachable');
// "Kod gönder": sendFail ONLY for an invalid address; rateLimit (429 / rate codes); quotaFull (SMTP/Resend could not
// send: quota, provider error); sendError for anything else the server answered; offline/unreachable = no answer.
export function sendErrorKey(res) {
  if (!res || res.network) return netKey(res);
  const c = code(res.body), m = txt(res.body);
  if (res.status === 429 || RATE.includes(c)) return 'auth.login.rateLimit';
  if (c === 'email_address_invalid' || (res.status === 400 && (c === 'validation_failed' || !c) && /e-?mail/i.test(m) && /invalid|validate/i.test(m))) return 'auth.login.sendFail';
  if (/error sending|smtp|quota|daily.*limit/i.test(m) || c === 'email_send_failed' || c === 'smtp_error') return 'auth.login.quotaFull';
  if (res.status === 502 || res.status === 503 || res.status === 504) return 'auth.code.unreachable';
  return 'auth.login.sendError';
}
// "Giriş yap" on the code screen. GoTrue answers a wrong AND an expired code with the same otp_expired
// ("Token has expired or is invalid"), so the client cannot tell them apart -> wrongCode (covers both).
export function verifyErrorKey(res) {
  if (!res || res.network) return netKey(res);
  const c = code(res.body);
  if (res.status === 429 || RATE.includes(c)) return 'auth.code.rateLimit';
  if (res.status >= 500) return 'auth.code.unreachable';
  return 'auth.code.wrongCode';
}
// Retry-After of a 429 -> lock in ms: delta seconds ("45") or an HTTP date, kept within [minMs, maxMs] (10-120 s: "0" or
// "3" -> 10 s); missing, unreadable (CORS), invalid or in the past -> defMs (30 s).
export function retryAfterMs(value, nowMs, { defMs = 30000, minMs = 10000, maxMs = 120000 } = {}) {
  if (value == null) return defMs;
  const v = String(value).trim();
  let ms;
  if (/^\d+$/.test(v)) ms = Number(v) * 1000;
  else if (/[a-z]/i.test(v)) { const at = Date.parse(v); ms = isFinite(at) ? at - nowMs : NaN; }
  else ms = NaN;
  if (!isFinite(ms) || ms < 0) return defMs;
  return Math.min(Math.max(ms, minMs), maxMs);
}
// Brake for the two auth buttons (pure, clock injected). kind: 'send' (/auth/v1/otp, "Kod gönder" + "Kodu tekrar gönder")
// | 'verify' (/auth/v1/verify). begin() = true means "send exactly one request now"; false = in flight or still locked.
// send: at least sendGapMs between two code requests that really left the device (an offline attempt, sent: false, does
// not count). Locks after the answer: network error while online or our own timeout -> netLockMs; HTTP 429 -> Retry-After
// (retryAfterMs) or rateLockMs. Nothing is retried here or anywhere: the player presses again.
export function createAuthGate({ now = () => Date.now(), sendGapMs = 5000, netLockMs = 10000, rateLockMs = 30000, rateLockMinMs = 10000, rateLockMaxMs = 120000 } = {}) {
  const mk = () => ({ busy: false, until: 0, last: -Infinity, started: 0 });
  const st = { send: mk(), verify: mk() };
  const wait = (kind) => { const s = st[kind]; const u = Math.max(s.until, kind === 'send' ? s.last + sendGapMs : 0); return Math.max(0, u - now()); };
  const lockFor = (res) => {
    if (!res) return 0;
    if (res.network === 'unreachable') return netLockMs;                 // TypeError while online, or our timeout
    if (res.status === 429) return retryAfterMs(res.retryAfter, now(), { defMs: rateLockMs, minMs: rateLockMinMs, maxMs: rateLockMaxMs });
    return 0;
  };
  return {
    wait,
    busy: (kind) => st[kind].busy,
    begin(kind) { const s = st[kind]; if (s.busy || wait(kind) > 0) return false; s.busy = true; s.started = now(); return true; },
    end(kind, res) {
      const s = st[kind]; s.busy = false;
      if (!(res && res.sent === false)) s.last = s.started;              // the gap starts only after a request that went out
      const ms = lockFor(res); if (ms > 0) s.until = Math.max(s.until, now() + ms);
      return wait(kind);
    },
    // the one way the screens call the server: null = refused (no request); else exactly one call of request()
    async run(kind, request) {
      if (!this.begin(kind)) return null;
      let r = { ok: false, sent: false };   // request() threw (it never should): no gap, no lock
      try { r = await request(); } finally { this.end(kind, r); }
      return r;
    }
  };
}
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim()) && String(s).trim().length <= 254;
export const validCode = (s) => /^\d{6}$/.test(String(s || '').trim());
// "{f} takipçi · {v} ¤ · ..." -> the best place to wrap is right after the currency: [head, tail] (tail '' = no split)
export function splitMeta(s, mark = ' ¤ · ') {
  const i = String(s).indexOf(mark);
  return i < 0 ? [String(s), ''] : [s.slice(0, i + mark.length - 1), s.slice(i + mark.length)];
}
