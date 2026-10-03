// FAKE Supabase (GoTrue + PostgREST) for the v2.2 smoke tests. Never talks to a real server: it answers Playwright
// routes (ctx.route(FAKE_URL + '/**', fake.handle)) from memory. Semantics follow supabase/CONTRACT-v2.2.md and the
// migration: RLS own row, upsert (on_conflict=user_id, merge-duplicates) with revision = old + 1 else
// 409 PT409 stale_revision; plain INSERT on an existing row 409 23505; 23503 after account deletion, rpc fenomen_reset_save (expected revision, 30-day backup), fenomen_delete_my_account
// (no parameters), 60 s between two codes to one address (429 over_email_send_rate_limit), wrong code 403 otp_expired.
export const FAKE_URL = 'https://fake-supabase.test';
export const FAKE_KEY = 'fake-anon-key';

export function createFakeSupabase({ resendSec = 60, now = () => Date.now() } = {}) {
  let n = 0;
  const id = (p) => p + '-' + (++n).toString(16).padStart(8, '0');
  const users = new Map();      // email -> { id, email }
  const codes = new Map();      // email -> { code, at }
  const tokens = new Map();     // access token -> uid
  const refresh = new Map();    // refresh token -> uid
  const saves = new Map();      // uid -> row
  const backups = [];           // { id, uid, data, revision, created_at }
  const log = [];               // { method, path, auth, apikey, body }
  const inject = [];            // one-shot answers: { match: (method, path) => bool, status, body } | { match, abort: true }
  const codeOf = (email) => (codes.get(email) || {}).code || null;
  const newCode = () => String(100000 + Math.floor(Math.random() * 900000));
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer, accept, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Max-Age': '600' };
  const reply = (route, status, body) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors), body: body === undefined ? '' : JSON.stringify(body) });
  const iso = () => new Date(now()).toISOString();
  const session = (u) => {
    const at = id('at'), rt = id('rt'); tokens.set(at, u.id); refresh.set(rt, u.id);
    return { access_token: at, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(now() / 1000) + 3600, refresh_token: rt, user: { id: u.id, email: u.email, aud: 'authenticated' } };
  };
  const rowOut = (r) => ({ data: r.data, save_version: r.save_version, revision: r.revision, device: r.device, updated_at: r.updated_at });
  const params = (url) => Object.fromEntries([...url.searchParams.entries()]);
  const eq = (v) => (typeof v === 'string' && v.startsWith('eq.') ? v.slice(3) : null);

  async function handle(route) {
    const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname;
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    let body = null; try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { body = req.postData(); }
    const headers = req.headers(), auth = headers.authorization || null;
    log.push({ method, path, search: url.search, auth, apikey: headers.apikey || null, body, at: now() });
    const inj = inject.findIndex((x) => x.match(method, path, body));
    if (inj >= 0) {
      const x = inject.splice(inj, 1)[0];
      if (x.abort) return route.abort('connectionrefused');
      if (x.raw) return route.fulfill({ status: x.status, headers: Object.assign({ 'Content-Type': x.raw.type }, cors), body: x.raw.text });
      return reply(route, x.status, x.body);
    }
    if (headers.apikey !== FAKE_KEY) return reply(route, 401, { message: 'Invalid API key' });
    const uid = auth && auth.startsWith('Bearer ') ? tokens.get(auth.slice(7)) || null : null;

    // ---------- GoTrue
    if (path === '/auth/v1/otp' && method === 'POST') {
      const email = String(body && body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(route, 400, { code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
      const c = codes.get(email);
      if (c && now() - c.at < resendSec * 1000) return reply(route, 429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after ' + Math.ceil((resendSec * 1000 - (now() - c.at)) / 1000) + ' seconds.' });
      if (body.create_user !== true && !users.has(email)) return reply(route, 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
      codes.set(email, { code: newCode(), at: now() });
      return reply(route, 200, {});
    }
    if (path === '/auth/v1/verify' && method === 'POST') {
      const email = String(body && body.email || '').trim().toLowerCase(), c = codes.get(email);
      if (!c || body.type !== 'email' || String(body.token) !== c.code) return reply(route, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
      codes.set(email, { code: null, at: c.at });                     // single use (the 60 s send window stays)
      let u = users.get(email); if (!u) { u = { id: id('user'), email }; users.set(email, u); }
      return reply(route, 200, session(u));
    }
    if (path === '/auth/v1/token' && method === 'POST' && url.searchParams.get('grant_type') === 'refresh_token') {
      const who = refresh.get(body && body.refresh_token); const u = [...users.values()].find((x) => x.id === who);
      if (!u) return reply(route, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
      refresh.delete(body.refresh_token); return reply(route, 200, session(u));
    }
    if (path === '/auth/v1/logout' && method === 'POST') { if (auth) tokens.delete(auth.slice(7)); return reply(route, 204); }

    // ---------- PostgREST (anon: nothing)
    if (path.startsWith('/rest/v1/') && !uid) return reply(route, 401, { code: '42501', message: 'permission denied' });
    const alive = [...users.values()].some((u) => u.id === uid);
    if (path === '/rest/v1/fenomen_saves') {
      const q = params(url);
      if (method === 'GET') { const want = eq(q.user_id); const r = saves.get(uid); return reply(route, 200, r && (!want || want === uid) ? [rowOut(r)] : []); }   // RLS: own row only
      if (method === 'POST') {
        const upsert = q.on_conflict === 'user_id' && /merge-duplicates/.test(headers.prefer || '');
        if (!body || body.user_id !== uid) return reply(route, 403, { code: '42501', message: 'new row violates row-level security policy' });
        if (!alive) return reply(route, 409, { code: '23503', message: 'insert or update violates foreign key constraint' });
        if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return reply(route, 400, { code: '23514', message: 'check constraint' });
        const r = saves.get(uid);
        if (r && !upsert) return reply(route, 409, { code: '23505', message: 'duplicate key value violates unique constraint "fenomen_saves_pkey"' });
        if (r) {                                                   // ON CONFLICT DO UPDATE -> the revision trigger
          if (body.revision !== r.revision + 1) return reply(route, 409, { code: 'PT409', message: 'stale_revision', details: 'expected revision ' + (r.revision + 1) });
          Object.assign(r, { data: body.data, save_version: body.save_version || r.save_version, revision: body.revision, device: body.device || null, updated_at: iso() });
          return reply(route, 200, [rowOut(r)]);
        }
        const n = { user_id: uid, data: body.data, save_version: body.save_version || 1, revision: body.revision || 1, device: body.device || null, created_at: iso(), updated_at: iso() };
        saves.set(uid, n); return reply(route, 201, [rowOut(n)]);
      }
      if (method === 'PATCH') {
        const r = saves.get(uid), wantU = eq(q.user_id), wantR = eq(q.revision);
        if (!r || (wantU && wantU !== uid) || (wantR != null && String(r.revision) !== wantR)) return reply(route, 200, []);   // no row matched the filter
        if (!alive) return reply(route, 409, { code: '23503', message: 'foreign key' });
        if (body.revision !== r.revision + 1) return reply(route, 409, { code: 'PT409', message: 'stale_revision', details: 'expected revision ' + (r.revision + 1) });
        Object.assign(r, { data: body.data, save_version: body.save_version || r.save_version, revision: body.revision, device: body.device || null, updated_at: iso() });
        return reply(route, 200, [rowOut(r)]);
      }
      return reply(route, 405, { message: 'method not allowed' });
    }
    if (path === '/rest/v1/rpc/fenomen_reset_save' && method === 'POST') {
      if (!body || !body.p_data || typeof body.p_data !== 'object') return reply(route, 400, { code: '22023', message: 'invalid_data' });
      const r = saves.get(uid), exp = body.p_expected_revision;
      if (r ? exp != null && exp !== r.revision : exp != null && exp !== 0) return reply(route, 409, { code: 'PT409', message: 'stale_revision' });
      let backupId = null;
      if (r) { backupId = id('bak'); backups.push({ id: backupId, uid, data: r.data, revision: r.revision, created_at: iso() }); }
      const rev = r ? r.revision + 1 : 1;
      saves.set(uid, { user_id: uid, data: body.p_data, save_version: body.p_save_version || 1, revision: rev, device: body.p_device || null, created_at: r ? r.created_at : iso(), updated_at: iso() });
      return reply(route, 200, { revision: rev, backup_id: backupId, updated_at: iso() });
    }
    if (path === '/rest/v1/rpc/fenomen_delete_my_account' && method === 'POST') {
      if (body && Object.keys(body).length) return reply(route, 404, { code: 'PGRST202', message: 'Could not find the function' });
      const s = saves.delete(uid) ? 1 : 0; let b = 0;
      for (let i = backups.length - 1; i >= 0; i--) if (backups[i].uid === uid) { backups.splice(i, 1); b++; }
      for (const [e, u] of users) if (u.id === uid) users.delete(e);
      for (const [k, v] of refresh) if (v === uid) refresh.delete(k);
      return reply(route, 200, { deleted: true, saves: s, backups: b });
    }
    if (path.startsWith('/rest/v1/rpc/')) return reply(route, 200, []);          // e.g. list/restore: logged, must never be called
    return reply(route, 404, { message: 'not found' });
  }
  return {
    handle, log, users, saves, backups, codes, codeOf,
    // one-shot failure for the next matching request: fail('POST', '/auth/v1/otp', 429, {...}) or fail(..., 'abort')
    fail(method, path, status, body) { inject.push(status === 'abort' ? { match: (m, p) => m === method && p === path, abort: true } : { match: (m, p) => m === method && p === path, status, body }); },
    // one-shot raw (non-JSON) answer with CORS headers, e.g. an HTML 429: failRaw('POST', '/auth/v1/otp', 429, '<html>…')
    failRaw(method, path, status, text, { type = 'text/html; charset=UTF-8' } = {}) { inject.push({ match: (m, p) => m === method && p === path, status, raw: { text, type } }); },
    clearFails() { inject.length = 0; },
    // the server ends every session of this user (signed out on another device / revoked): access and refresh tokens die
    revokeSessions: (email) => { const u = users.get(email); if (!u) return 0; let n = 0; for (const [k, v] of tokens) if (v === u.id) { tokens.delete(k); n++; } for (const [k, v] of refresh) if (v === u.id) refresh.delete(k); return n; },
    // play "another device": write the row directly like a second client would
    rowFor: (email) => { const u = users.get(email); return u ? saves.get(u.id) || null : null; },
    userId: (email) => (users.get(email) || {}).id || null,
    forgetCodeWindow: (email) => { const c = codes.get(email); if (c) c.at = 0; },
    calls: (re) => log.filter((x) => re.test(x.method + ' ' + x.path))
  };
}
