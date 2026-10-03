// v2.2 network client for Fenomen's own Supabase: GoTrue (e-mail + 6-digit code) and PostgREST (fenomen_saves + RPCs).
// Plain fetch, no SDK. Every call resolves (never rejects): { ok, status, body } or { ok: false, network: 'offline'|'unreachable' }
// (+ timeout: true when our own timeout aborted it; sent: false when nothing left the device because navigator.onLine was
// false; retryAfter: the raw Retry-After header when the page may read it). One request per call: no retry here.
// Contract: supabase/migrations/20260929193000_v2_2_fenomen_cloud_save.sql
//   GET + upsert POST /rest/v1/fenomen_saves?on_conflict=user_id (RLS: own row; revision = server revision + 1, else 409 PT409)
//   POST /rest/v1/rpc/fenomen_reset_save { p_data, p_save_version, p_expected_revision, p_device } -> { revision, backup_id, updated_at }
//   POST /rest/v1/rpc/fenomen_delete_my_account {} -> { deleted, saves, backups }
// The counter (src/telemetry.js) and Umami (src/analytics.js) never see this session: separate code, no shared headers.
import { CLOUD } from '../config.js';

export const SESSION_KEY = 'fenomen_auth';          // { access_token, refresh_token, expires_at (s), user: { id, email } }
const SELECT = 'data,save_version,revision,device,updated_at';

export function createCloudApi({ cfg = CLOUD, storage, fetchFn = (...a) => fetch(...a), now = () => Date.now(), online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false) } = {}) {
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const readSession = () => { try { const s = JSON.parse(storage.getItem(SESSION_KEY)); return s && s.access_token && s.user && s.user.id ? s : null; } catch (e) { return null; } };
  const writeSession = (s) => { try { if (s) storage.setItem(SESSION_KEY, JSON.stringify(s)); else storage.removeItem(SESSION_KEY); } catch (e) { /* private mode */ } };
  const toSession = (b) => (b && b.access_token && b.user && b.user.id ? { access_token: b.access_token, refresh_token: b.refresh_token || null,
    expires_at: typeof b.expires_at === 'number' ? b.expires_at : Math.floor(now() / 1000) + (+b.expires_in || 3600), user: { id: b.user.id, email: b.user.email || '' } } : null);

  async function req(path, { method = 'GET', body, token, prefer, keepalive = false } = {}) {
    if (!online()) return { ok: false, network: 'offline', sent: false };
    const headers = { apikey: cfg.key, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    if (prefer) headers.Prefer = prefer;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort(); }, cfg.timeoutMs || 10000) : null;
    let r;
    try {
      r = await fetchFn(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined, keepalive, credentials: 'omit', cache: 'no-store' });
    } catch (e) {
      if (timer) clearTimeout(timer);
      const out = { ok: false, network: online() ? 'unreachable' : 'offline' };
      if (timedOut) out.timeout = true;
      return out;
    }
    // the status decides; the body may be HTML / plain text (Cloudflare) or unreadable: never breaks the answer
    let text = ''; try { text = await r.text(); } catch (e) { text = ''; } finally { if (timer) clearTimeout(timer); }
    let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = text; }
    const out = { ok: r.ok, status: r.status, body: parsed };
    // Retry-After is not a CORS-safelisted header: null unless the server exposes it (then the 429 lock uses its default)
    let ra = null; try { ra = r.headers && typeof r.headers.get === 'function' ? r.headers.get('retry-after') : null; } catch (e) { ra = null; }
    if (ra != null && ra !== '') out.retryAfter = ra;
    return out;
  }
  let refreshing = null;
  async function refresh() {
    const s = readSession(); if (!s || !s.refresh_token) return false;
    if (!refreshing) refreshing = req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } }).finally(() => { refreshing = null; });
    const r = await refreshing;
    if (r.ok) { const n = toSession(r.body); if (n) { writeSession(n); return true; } }
    if (!r.network && r.status >= 400 && r.status < 500) writeSession(null);   // refresh token revoked / account deleted: signed out
    return false;
  }
  // PostgREST call as the signed-in player; refreshes the token first when it is about to expire, and once on a 401
  async function authed(path, opts = {}) {
    let s = readSession(); if (!s) return { ok: false, status: 401, signedOut: true };
    if (s.expires_at * 1000 - 60000 < now()) { await refresh(); s = readSession(); if (!s) return { ok: false, status: 401, signedOut: true }; }
    let r = await req(path, Object.assign({}, opts, { token: s.access_token }));
    if (r.status === 401 && await refresh()) r = await req(path, Object.assign({}, opts, { token: readSession().access_token }));
    if (r.status === 401) { const again = readSession(); if (!again || again.access_token === s.access_token) { writeSession(null); r.signedOut = true; } }
    return r;
  }
  const uid = () => { const s = readSession(); return s ? s.user.id : null; };
  // 409 PT409 stale_revision (another device wrote first) / 23505 (two first writes at once) = pull again.
  // 409 23503 = the account no longer exists (deleted elsewhere): signed out, never retried.
  const code = (r) => (r.body && typeof r.body === 'object' ? String(r.body.code || '') : '');
  const stale = (r) => r.status === 409 && code(r) !== '23503';
  const gone = (r) => r.status === 409 && code(r) === '23503';
  const rowOf = (r) => (Array.isArray(r.body) ? r.body[0] || null : r.body);

  return {
    enabled: !!(base && cfg.key),
    session: readSession,
    signedIn: () => !!readSession(),
    email: () => { const s = readSession(); return s ? s.user.email : ''; },
    uid,
    sendCode: (email) => req('/auth/v1/otp', { method: 'POST', body: { email: String(email).trim(), create_user: true } }),
    async verify(email, token) {
      const r = await req('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: String(email).trim(), token: String(token).trim() } });
      const s = r.ok ? toSession(r.body) : null;
      if (s) writeSession(s);
      return s ? { ok: true, session: s } : Object.assign({}, r, { ok: false });
    },
    // local sign-out always happens; the server call only revokes the refresh token (best effort)
    async signOut() { const s = readSession(); writeSession(null); if (s) await req('/auth/v1/logout', { method: 'POST', token: s.access_token }); return true; },
    forget: () => writeSession(null),
    // -> { ok, row: {data, save_version, revision, device, updated_at} | null } | failure
    async pull() {
      const id = uid(); if (!id) return { ok: false, status: 401, signedOut: true };
      const r = await authed('/rest/v1/' + cfg.table + '?select=' + SELECT + '&user_id=eq.' + encodeURIComponent(id), {});
      return r.ok ? { ok: true, row: rowOf(r) } : r;
    },
    // upsert as in supabase/CONTRACT-v2.2.md §2: revision = the server revision this device knows + 1 (first write: 1).
    // 409 PT409 stale_revision (another device wrote first) or 23505 (two first writes at once) -> stale: pull again,
    // never overwrite. 409 23503 = the account is gone -> signed out.
    async save(data, knownRevision, device, { keepalive = false } = {}) {
      const id = uid(); if (!id) return { ok: false, status: 401, signedOut: true };
      const r = await authed('/rest/v1/' + cfg.table + '?on_conflict=user_id&select=' + SELECT,
        { method: 'POST', prefer: 'resolution=merge-duplicates,return=representation', keepalive, body: { user_id: id, data, save_version: data.v || 1, revision: (knownRevision || 0) + 1, device } });
      if (r.ok && rowOf(r)) return { ok: true, row: rowOf(r) };
      if (gone(r)) { writeSession(null); return { ok: false, status: 401, signedOut: true }; }
      if (r.ok || stale(r)) return { ok: false, stale: true, status: r.status };
      return r;
    },
    insert(data, device) { return this.save(data, 0, device); },
    update(data, revision, device, opts) { return this.save(data, revision, device, opts); },
    // "Baştan başla" signed in: the server backs the old save up (30 days, not restorable by the player in v2.2)
    async reset(data, expectedRevision, device) {
      const r = await authed('/rest/v1/rpc/fenomen_reset_save', { method: 'POST', body: { p_data: data, p_save_version: data.v || 1, p_expected_revision: expectedRevision, p_device: device } });
      if (r.ok && r.body && typeof r.body.revision === 'number') return { ok: true, revision: r.body.revision };
      return stale(r) ? { ok: false, stale: true, status: r.status } : Object.assign({}, r, { ok: false });
    },
    // "Hesabımı sil": account + cloud save + backups (server). The device save is not touched.
    async deleteAccount() {
      const r = await authed('/rest/v1/rpc/fenomen_delete_my_account', { method: 'POST', body: {} });
      if (r.ok) { writeSession(null); return { ok: true, body: r.body }; }
      return Object.assign({}, r, { ok: false });
    }
  };
}
