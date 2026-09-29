// LOCAL TEST ONLY — real GoTrue + PostgREST + supabase-js against the throwaway stack started by run-stack.sh.
// env: API (proxy URL), ANON_KEY, SERVICE_KEY (throwaway, this run only, never printed), MAILDIR, SUPABASE_JS_DIR, PG* (local db) via run-stack.sh
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const require = createRequire(process.env.SUPABASE_JS_DIR + '/package.json');
const { createClient } = require('@supabase/supabase-js');
// Node 20 has no global WebSocket; realtime is not used here (stub keeps supabase-js from throwing)
if (!globalThis.WebSocket) globalThis.WebSocket = class { constructor() { throw new Error('realtime not used in this test'); } };
const API = process.env.API, ANON = process.env.ANON_KEY, SERVICE = process.env.SERVICE_KEY, MAILDIR = process.env.MAILDIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(API)) { console.log('refusing non-local API'); process.exit(2); }
let pass = 0, fail = 0; const MAP = [];
const ok = (name, cond, info = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sql = (q) => { const r = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atc', q], { encoding: 'utf8' }); return (r.stdout || '').trim() + (r.status ? ' ERR ' + r.stderr.trim() : ''); };
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const anon = createClient(API, ANON, opts), admin = createClient(API, SERVICE, opts);
const raw = async (method, path, token, body, headers = {}) => {
  const r = await fetch(API + path, { method, headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) { /* empty */ }
  return { status: r.status, body: j, text: t };
};
const seen = (what, r) => MAP.push(`${what} -> HTTP ${r.status}${r.body && r.body.code ? ' code ' + r.body.code : ''}${r.body && r.body.message ? ' "' + String(r.body.message).slice(0, 60) + '"' : ''}`);
const mails = () => readdirSync(MAILDIR).filter((f) => f.endsWith('.eml')).sort();
const lastMailFor = (email) => { for (const f of mails().reverse()) { const m = readFileSync(MAILDIR + '/' + f, 'utf8'); if (m.toLowerCase().includes('to: ' + email) || m.includes('<' + email + '>')) return m; } return null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const qp = (s) => Buffer.from(s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8');
const subj = (m) => { const h = ((m.match(/^Subject: (.*(?:\r?\n[ \t].*)*)/m) || [])[1] || '').replace(/\r?\n[ \t]+/g, ' ').trim();
  return h.replace(/=\?UTF-8\?([QqBb])\?([^?]*)\?=\s*/g, (_, enc, t) => enc.toUpperCase() === 'B' ? Buffer.from(t, 'base64').toString('utf8') : qp(t.replace(/_/g, ' '))).trim(); };
const SUBJ_NEW = process.env.SUBJ_NEW, SUBJ_RET = process.env.SUBJ_RET;
const hdr = (m, name) => { const h = ((m.match(new RegExp('^' + name + ': (.*(?:\\r?\\n[ \\t].*)*)', 'm')) || [])[1] || '').replace(/\r?\n[ \t]+/g, ' ').trim();
  return h.replace(/=\?UTF-8\?([QqBb])\?([^?]*)\?=\s*/g, (_, enc, t) => enc.toUpperCase() === 'B' ? Buffer.from(t, 'base64').toString('utf8') : qp(t.replace(/_/g, ' '))).trim(); };
const noLink = (m) => !/href=|\/verify\?|ConfirmationURL/.test(m);
const noDefault = (m) => !/Confirm Your Email|Your Magic Link|hesabını onayla|Alternatively, enter the code/i.test(m);

// ------------------------------------------------------------------ OTP flow (signInWithOtp + verifyOtp type 'email')
async function login(email) {
  const c = createClient(API, ANON, opts);
  const before = mails().length;
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new Error('signInWithOtp ' + email + ': ' + error.message);
  for (let i = 0; i < 50 && mails().length === before; i++) await sleep(100);
  const raw = lastMailFor(email) || ''; const m = qp(raw);
  const code = (m.match(/<strong>(\d{6})<\/strong>/) || [])[1];   // kod kutusu (templates/*.html); renk kodları (#261838) 6 hane olabilir
  const { data, error: e2 } = await c.auth.verifyOtp({ email, token: code, type: 'email' });
  if (e2) throw new Error('verifyOtp ' + email + ': ' + e2.message);
  return { c, code, mail: m, raw, session: data.session, user: data.user };
}
const A = await login('a@v22-stack.invalid');
ok('H01 signInWithOtp sends a mail with a 6-digit code (GOTRUE_MAILER_OTP_LENGTH=6), template {{ .Token }}', /^\d{6}$/.test(A.code), `subject: ${subj(A.raw)}`);
ok('H02 verifyOtp({type:"email"}) returns a session; JWT role authenticated, sub = user id',
  !!A.session && JSON.parse(Buffer.from(A.session.access_token.split('.')[1], 'base64url')).role === 'authenticated' && JSON.parse(Buffer.from(A.session.access_token.split('.')[1], 'base64url')).sub === A.user.id);
ok('H01c From = "Fenomen: Kiralık Hayat" <fenomen@teserix.com> (GOTRUE_SMTP_SENDER_NAME / GOTRUE_SMTP_ADMIN_EMAIL)',
  hdr(A.raw, 'From').includes(process.env.SENDER_NAME) && hdr(A.raw, 'From').includes('<' + process.env.SENDER_EMAIL + '>'), `From: ${hdr(A.raw, 'From')}`);
ok('H03 last_sign_in_at set by the OTP login', sql(`select last_sign_in_at is not null from auth.users where id = '${A.user.id}'`) === 't');
ok('H01b new user -> "confirmation" template (Yazı r2 email.codeNew): subject, welcome line, 10 min, no link, no default text',
  subj(A.raw) === SUBJ_NEW && A.mail.includes('hoş geldin! İlk giriş kodun:') && A.mail.includes('Kod 10 dakika içinde geçerli.') && noLink(A.mail) && noDefault(A.mail), `subject: ${subj(A.raw)}`);
{
  const c = createClient(API, ANON, opts);
  const r1 = await c.auth.signInWithOtp({ email: 'a@v22-stack.invalid', options: { shouldCreateUser: true } });
  const r2 = await c.auth.signInWithOtp({ email: 'a@v22-stack.invalid', options: { shouldCreateUser: true } });
  ok('H04 existing user: new code ok, 2nd code within GOTRUE_SMTP_MAX_FREQUENCY (60s here) -> 429', !r1.error && r2.error && r2.error.status === 429, r2.error ? `${r2.error.status} ${r2.error.code || ''} ${r2.error.message}` : 'no error');
  { let m = null; for (let i = 0; i < 50; i++) { m = lastMailFor('a@v22-stack.invalid'); if (m && m !== A.raw) break; await sleep(100); } const mraw = m || ''; m = qp(mraw);
    ok('H04c confirmed user -> "magic_link" template (Yazı r2 email.codeReturning): subject, 6-digit code, no welcome line, no link, no default text',
      mraw !== A.raw && subj(mraw) === SUBJ_RET && /<strong>\d{6}<\/strong>/.test(m) && m.includes('Fenomen: Kiralık Hayat giriş kodun:') && !m.includes('hoş geldin') && noLink(m) && noDefault(m), `subject: ${subj(mraw)}`); }
  const d1 = await c.auth.signInWithOtp({ email: 'd@v22-stack.invalid', options: { shouldCreateUser: true } });
  const d2 = await c.auth.signInWithOtp({ email: 'd@v22-stack.invalid', options: { shouldCreateUser: true } });
  ok('H04b new address: 1st code ok, immediate 2nd -> 429', !d1.error && d2.error && d2.error.status === 429, d2.error ? `${d2.error.status} ${d2.error.code || ''}` : 'no error');
  const w = await c.auth.verifyOtp({ email: 'a@v22-stack.invalid', token: A.code === '000000' ? '111111' : '000000', type: 'email' });
  ok('H05 wrong code -> error, no session', !!w.error && !w.data.session, w.error ? `${w.error.status} ${w.error.code || ''}` : '');
  const reuse = await c.auth.verifyOtp({ email: 'a@v22-stack.invalid', token: A.code, type: 'email' });
  ok('H06 a used code cannot be used again', !!reuse.error, reuse.error ? `${reuse.error.status} ${reuse.error.code || ''}` : '');
  const nu = await c.auth.signInWithOtp({ email: 'nobody@v22-stack.invalid', options: { shouldCreateUser: false } });
  ok('H07 shouldCreateUser:false for an unknown address -> error, no user created', !!nu.error && sql("select count(*) from auth.users where email = 'nobody@v22-stack.invalid'") === '0', nu.error ? `${nu.error.status} ${nu.error.code || ''} ${nu.error.message}` : '');
}
const B = await login('b@v22-stack.invalid');
const C = await login('c@v22-stack.invalid');
const TA = A.session.access_token, TB = B.session.access_token;

// ------------------------------------------------------------------ saves over REST (supabase-js + raw)
{
  const r = await A.c.from('fenomen_saves').upsert({ user_id: A.user.id, data: { v: 2, followers: 10, meta: { fame: 1, sales: 0 } }, save_version: 2, revision: 1, device: 'mobil' }, { onConflict: 'user_id' }).select('revision, updated_at').single();
  ok('H10 A upsert own save (revision 1)', !r.error && r.data.revision === 1, r.error ? r.error.message : '');
  const b = await B.c.from('fenomen_saves').upsert({ user_id: B.user.id, data: { v: 2, followers: 999 }, save_version: 2, revision: 1 }, { onConflict: 'user_id' }).select('revision').single();
  ok('H11 B upsert own save', !b.error && b.data.revision === 1);
  const sel = await B.c.from('fenomen_saves').select('user_id');
  ok('H12 B select sees only its own row', !sel.error && sel.data.length === 1 && sel.data[0].user_id === B.user.id);
  const one = await raw('GET', `/rest/v1/fenomen_saves?user_id=eq.${A.user.id}`, TB);
  ok('H13 B GET A\'s row by id -> 200 []', one.status === 200 && Array.isArray(one.body) && one.body.length === 0);
  const up = await raw('PATCH', `/rest/v1/fenomen_saves?user_id=eq.${A.user.id}`, TB, { data: { hacked: true }, revision: 2 }, { Prefer: 'return=representation' });
  ok('H14 B PATCH A\'s row -> no row changed', up.status === 200 && up.body.length === 0 && sql(`select data->>'hacked' is null from public.fenomen_saves where user_id = '${A.user.id}'`) === 't', `HTTP ${up.status}`);
  const ins = await raw('POST', '/rest/v1/fenomen_saves', TB, { user_id: C.user.id, data: {}, revision: 1 }); seen('B insert row for C', ins);
  ok('H15 B insert a row for C -> 403 (42501 RLS)', ins.status === 403 && ins.body.code === '42501');
  const ups = await raw('POST', '/rest/v1/fenomen_saves?on_conflict=user_id', TB, { user_id: A.user.id, data: { hacked: 1 }, revision: 2 }, { Prefer: 'resolution=merge-duplicates' }); seen('B upsert onto A', ups);
  ok('H16 B upsert onto A\'s existing row -> 403', ups.status === 403);
  const del = await raw('DELETE', `/rest/v1/fenomen_saves?user_id=eq.${A.user.id}`, TA); seen('A DELETE own row', del);
  ok('H17 A DELETE its own row -> 403 (no DELETE grant), row still there', del.status === 403 && sql(`select count(*) from public.fenomen_saves where user_id = '${A.user.id}'`) === '1');
  const stale = await raw('POST', '/rest/v1/fenomen_saves?on_conflict=user_id', TA, { user_id: A.user.id, data: { v: 2, followers: 1 }, revision: 1 }, { Prefer: 'resolution=merge-duplicates' }); seen('stale upsert (revision = server)', stale);
  ok('H18 stale revision -> HTTP 409, code PT409, message stale_revision', stale.status === 409 && stale.body.code === 'PT409' && stale.body.message === 'stale_revision', stale.text.slice(0, 160));
  const good = await raw('POST', '/rest/v1/fenomen_saves?on_conflict=user_id', TA, { user_id: A.user.id, data: { v: 2, followers: 40, money: 7, meta: { fame: 3, sales: 1 } }, revision: 2 }, { Prefer: 'resolution=merge-duplicates,return=representation' });
  ok('H19 revision = server + 1 -> 200 (upsert updated), revision 2', [200, 201].includes(good.status) && good.body[0].revision === 2, `HTTP ${good.status}`);
  const big = await raw('POST', '/rest/v1/fenomen_saves?on_conflict=user_id', TA, { user_id: A.user.id, data: { pad: 'x'.repeat(262200) }, revision: 3 }, { Prefer: 'resolution=merge-duplicates' }); seen('save > 256 KiB', big);
  ok('H20 data > 256 KiB -> 400 code 23514', big.status === 400 && big.body.code === '23514');
  const ua = await raw('PATCH', `/rest/v1/fenomen_saves?user_id=eq.${A.user.id}`, TA, { updated_at: '2000-01-01T00:00:00Z', revision: 3 }); seen('client writes updated_at', ua);
  ok('H21 client cannot write updated_at -> 403', ua.status === 403);
}
// ------------------------------------------------------------------ anon
{
  const s = await raw('GET', '/rest/v1/fenomen_saves?select=user_id', ANON); seen('anon GET fenomen_saves', s);
  ok('H30 anon select fenomen_saves -> 401', s.status === 401);
  const i = await raw('POST', '/rest/v1/fenomen_saves', ANON, { user_id: A.user.id, data: {} });
  ok('H31 anon insert -> 401', i.status === 401);
  const bk = await raw('GET', '/rest/v1/fenomen_save_backups', ANON);
  ok('H32 anon select backups -> 401', bk.status === 401);
  for (const [fn, body] of [['fenomen_reset_save', { p_data: {} }], ['fenomen_list_save_backups', {}], ['fenomen_delete_my_account', {}], ['fenomen_purge_inactive_accounts', {}], ['fenomen_cleanup_save_backups', {}], ['_fenomen_delete_user', { p_uid: A.user.id }]]) {
    const r = await raw('POST', `/rest/v1/rpc/${fn}`, ANON, body); seen(`anon rpc ${fn}`, r);
    ok(`H33 anon rpc/${fn} -> 401`, r.status === 401, `HTTP ${r.status} ${r.body && r.body.code}`);
  }
}
// ------------------------------------------------------------------ reset + backups
{
  const r1 = await A.c.rpc('fenomen_reset_save', { p_data: { v: 2, followers: 0 }, p_save_version: 2, p_expected_revision: 1 }); seen('reset with old expected revision', { status: r1.status, body: r1.error });
  ok('H40 reset with an old expected revision -> 409 PT409', r1.status === 409 && r1.error.code === 'PT409');
  const r2 = await A.c.rpc('fenomen_reset_save', { p_data: { v: 2, followers: 0 }, p_save_version: 2, p_expected_revision: 2, p_device: 'masaustu' });
  ok('H41 reset -> 200 {revision 3, backup_id}', r2.status === 200 && r2.data.revision === 3 && !!r2.data.backup_id, JSON.stringify(r2.data));
  const old = await raw('POST', '/rest/v1/fenomen_saves?on_conflict=user_id', TA, { user_id: A.user.id, data: { v: 2, followers: 40 }, revision: 3 }, { Prefer: 'resolution=merge-duplicates' });
  ok('H42 old device (knew revision 2) cannot overwrite the reset -> 409', old.status === 409);
  await B.c.rpc('fenomen_reset_save', { p_data: { v: 2 }, p_expected_revision: 1 });
  const la = await A.c.rpc('fenomen_list_save_backups'); const lb = await B.c.rpc('fenomen_list_save_backups');
  ok('H43 list: A sees only its own backup (revision 2, 40 followers), B only its own', la.data.length === 1 && la.data[0].revision === 2 && la.data[0].summary.followers === 40 && lb.data.length === 1 && lb.data[0].summary.followers === 999 && la.data[0].id !== lb.data[0].id,
    JSON.stringify(la.data[0]));
  const direct = await raw('GET', '/rest/v1/fenomen_save_backups', TA); seen('authenticated GET fenomen_save_backups', direct);
  ok('H44 authenticated cannot read the backup table directly -> 403', direct.status === 403);
  const cl = await raw('POST', '/rest/v1/rpc/fenomen_cleanup_save_backups', TA, {}); seen('authenticated rpc cleanup', cl);
  ok('H45 authenticated rpc cleanup -> 403', cl.status === 403);
  const cs = await admin.rpc('fenomen_cleanup_save_backups');
  ok('H46 service_role rpc cleanup -> 200 (0 deleted: nothing is 30 days old)', cs.status === 200 && cs.data === 0, JSON.stringify(cs));
}
// ------------------------------------------------------------------ delete account
{
  const other = await raw('POST', '/rest/v1/rpc/fenomen_delete_my_account', TA, { p_uid: B.user.id }); seen('rpc delete_my_account with p_uid', other);
  ok('H50 fenomen_delete_my_account(p_uid => B) does not exist -> 404 PGRST202', other.status === 404 && other.body.code === 'PGRST202');
  const inner = await raw('POST', '/rest/v1/rpc/_fenomen_delete_user', TA, { p_uid: B.user.id }); seen('authenticated rpc _fenomen_delete_user', inner);
  ok('H51 authenticated rpc/_fenomen_delete_user(B) -> 403', inner.status === 403 && sql(`select count(*) from auth.users where id = '${B.user.id}'`) === '1');
  const sp = await raw('POST', '/rest/v1/rpc/fenomen_purge_inactive_accounts', TA, {}); seen('authenticated rpc purge', sp);
  ok('H52 authenticated rpc purge -> 403', sp.status === 403);
  const authTables = sql("select string_agg(format('select %L as t, count(*) as n from auth.%I where %I::text = :uid', c.table_name, c.table_name, c.column_name), ' union all ') from information_schema.columns c where c.table_schema = 'auth' and c.column_name = 'user_id'");
  const residue = (uid) => sql(`select coalesce(string_agg(t || '=' || n, ','), '') from (${authTables.replaceAll(':uid', `'${uid}'`)}) x where n > 0`);
  const bBefore = sql(`select md5(string_agg(x::text, '')) from (select (select row(data, revision) from public.fenomen_saves where user_id = '${B.user.id}'), (select count(*) from public.fenomen_save_backups where user_id = '${B.user.id}'), (select count(*) from auth.users where id = '${B.user.id}'), (select count(*) from auth.identities where user_id = '${B.user.id}'), (select count(*) from auth.sessions where user_id = '${B.user.id}')) x`);
  ok('H53 before: A has rows in auth tables (identities, sessions, ...)', residue(A.user.id).includes('identities='), residue(A.user.id));
  const d = await A.c.rpc('fenomen_delete_my_account');
  ok('H54 A rpc fenomen_delete_my_account -> 200 {deleted:true, saves:1, backups:1}', d.status === 200 && d.data.deleted === true && d.data.saves === 1 && d.data.backups === 1, JSON.stringify(d.data));
  ok('H55 A gone from auth.users; NO row with A\'s user_id left in any auth table (identities, sessions, refresh_tokens, one_time_tokens, mfa_*, ...)',
    sql(`select count(*) from auth.users where id = '${A.user.id}'`) === '0' && residue(A.user.id) === '' && sql(`select count(*) from auth.refresh_tokens where user_id = '${A.user.id}'`) === '0', residue(A.user.id));
  ok('H56 A\'s save + backups gone', sql(`select (select count(*) from public.fenomen_saves where user_id = '${A.user.id}') + (select count(*) from public.fenomen_save_backups where user_id = '${A.user.id}')`) === '0');
  ok('H57 B untouched', bBefore === sql(`select md5(string_agg(x::text, '')) from (select (select row(data, revision) from public.fenomen_saves where user_id = '${B.user.id}'), (select count(*) from public.fenomen_save_backups where user_id = '${B.user.id}'), (select count(*) from auth.users where id = '${B.user.id}'), (select count(*) from auth.identities where user_id = '${B.user.id}'), (select count(*) from auth.sessions where user_id = '${B.user.id}')) x`));
  // the risk: the access token stays valid until it expires (PostgREST only checks the signature/exp)
  const after = await raw('GET', '/rest/v1/fenomen_saves?select=user_id', TA); seen('deleted user\'s old JWT: GET fenomen_saves', after);
  ok('H58 RISK documented: deleted user\'s old access token still accepted by PostgREST until exp (200 [])', after.status === 200 && after.body.length === 0);
  const recreate = await raw('POST', '/rest/v1/fenomen_saves', TA, { user_id: A.user.id, data: { v: 2 }, revision: 1 }); seen('deleted user\'s old JWT: insert', recreate);
  ok('H59 ...but cannot recreate data: insert -> 409 (23503 FK)', recreate.status === 409 && recreate.body.code === '23503');
  const gu = await raw('GET', '/auth/v1/user', TA); seen('deleted user\'s old JWT: GET /auth/v1/user', gu);
  ok('H60 GoTrue rejects the old token (/auth/v1/user)', gu.status >= 400, `HTTP ${gu.status} ${gu.text.slice(0, 80)}`);
  const so = await A.c.auth.signOut(); MAP.push(`signOut() (global) after delete -> ${so.error ? 'error ' + so.error.status + ' ' + (so.error.code || '') : 'ok'}`);
  const sl = await A.c.auth.signOut({ scope: 'local' }); const ses = await A.c.auth.getSession();
  ok('H61 signOut({scope:"local"}) after delete clears the local session without error', !sl.error && !ses.data.session, so.error ? `global signOut: ${so.error.status} ${so.error.code || ''}` : 'global signOut: ok');
  const rf = await raw('POST', '/auth/v1/token?grant_type=refresh_token', ANON, { refresh_token: A.session.refresh_token }); seen('deleted user\'s refresh token', rf);
  ok('H62 deleted user\'s refresh token -> rejected', rf.status >= 400);
}
// ------------------------------------------------------------------ alternative path: GoTrue admin API deleteUser (as supabase_auth_admin) -> FK cascade
{
  await C.c.from('fenomen_saves').upsert({ user_id: C.user.id, data: { v: 2 }, revision: 1 }, { onConflict: 'user_id' });
  await C.c.rpc('fenomen_reset_save', { p_data: { v: 2 }, p_expected_revision: 1 });
  const pre = sql(`select (select count(*) from public.fenomen_saves where user_id = '${C.user.id}') || '/' || (select count(*) from public.fenomen_save_backups where user_id = '${C.user.id}')`);
  const r = await admin.auth.admin.deleteUser(C.user.id);
  const post = sql(`select (select count(*) from auth.users where id = '${C.user.id}') || '/' || (select count(*) from public.fenomen_saves where user_id = '${C.user.id}') || '/' || (select count(*) from public.fenomen_save_backups where user_id = '${C.user.id}')`);
  ok('H70 alternative: admin API deleteUser (GoTrue, supabase_auth_admin) also removes save + backups via ON DELETE CASCADE', !r.error && pre === '1/1' && post === '0/0/0', `before ${pre}, after user/save/backups ${post}`);
}
// ------------------------------------------------------------------ refresh does not move last_sign_in_at (24-month criterion risk)
{
  const l0 = sql(`select last_sign_in_at from auth.users where id = '${B.user.id}'`);
  await sleep(1100);
  const r = await B.c.auth.refreshSession({ refresh_token: B.session.refresh_token });
  const l1 = sql(`select last_sign_in_at from auth.users where id = '${B.user.id}'`);
  ok('H80 RISK documented: refreshing the session (staying signed in) does NOT update auth.users.last_sign_in_at', !r.error && l0 === l1, `${r.error ? r.error.message : 'refresh ok'}; last_sign_in_at unchanged: ${l0 === l1}`);
}
console.log('\nHTTP status map observed:'); for (const m of MAP) console.log('  ' + m);
console.log(`\nHTTP/supabase-js checks: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
