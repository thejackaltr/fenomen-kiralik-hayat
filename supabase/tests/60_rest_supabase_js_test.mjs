// LOCAL TEST ONLY. Exercises the exact Frontend contract with supabase-js against a LOCAL
// PostgREST (anon role, no JWT). A tiny proxy maps /rest/v1/* -> PostgREST like Kong does and
// drops the placeholder apikey/Authorization headers (Kong would validate the real anon key).
// Env: SUPABASE_JS_DIR (dir with node_modules/@supabase/supabase-js), PGRST_PORT, PROXY_PORT.
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(process.env.SUPABASE_JS_DIR.replace(/\/?$/, '/'));
const { createClient } = require('@supabase/supabase-js');
const PGRST = Number(process.env.PGRST_PORT), PROXY = Number(process.env.PROXY_PORT);

const seen = [];
const proxy = http.createServer((req, res) => {
  const headers = { ...req.headers }; delete headers.apikey; delete headers.authorization; delete headers.host;
  seen.push({ method: req.method, url: req.url, prefer: req.headers.prefer || '' });
  const up = http.request({ host: '127.0.0.1', port: PGRST, method: req.method, path: req.url.replace(/^\/rest\/v1/, ''), headers },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  req.pipe(up);
});
await new Promise((r) => proxy.listen(PROXY, '127.0.0.1', r));

const supabase = createClient(`http://127.0.0.1:${PROXY}`, 'PLACEHOLDER_ANON_KEY', { auth: { persistSession: false, autoRefreshToken: false } });
const ok = { event: 'first_video', version: '2.1.0', device_class: 'mobil', play_bucket: '10-30' };
let fail = 0;
const check = (label, cond, detail) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}  ${detail}`); if (!cond) fail++; };
const fmt = (r) => `status=${r.status} error=${r.error ? `${r.error.code} ${r.error.message}` : 'null'} data=${JSON.stringify(r.data)}`;

let r = await supabase.from('anon_stats_events').insert(ok);
check('J1 supabase-js insert() without select() -> 201, no error', r.status === 201 && !r.error, fmt(r));
// supabase-js sends no "return=representation" without .select(); PostgREST's default is then minimal (201, empty body)
check('J2 request did NOT ask for the row back', !/return=representation/.test(seen.at(-1).prefer), `prefer="${seen.at(-1).prefer}"`);

r = await supabase.from('anon_stats_events').insert(ok).select();
check('J3 insert().select() is rejected (needs SELECT)', !!r.error && r.error.code === '42501', `${fmt(r)} prefer="${seen.at(-1).prefer}"`);
r = await supabase.from('anon_stats_events').select('*');
check('J4 select() rejected', !!r.error && r.error.code === '42501', fmt(r));
r = await supabase.from('anon_stats_events').update({ play_bucket: '0-10' }).eq('event', 'first_video');
check('J5 update() rejected', !!r.error && r.error.code === '42501', fmt(r));
r = await supabase.from('anon_stats_events').delete().eq('event', 'first_video');
check('J6 delete() rejected', !!r.error && r.error.code === '42501', fmt(r));
r = await supabase.from('anon_stats_events').insert({ ...ok, event: 'not_allowed' });
check('J7 unknown event -> 400 check_violation', r.status === 400 && r.error?.code === '23514', fmt(r));
r = await supabase.from('anon_stats_events').insert({ ...ok, created_at: '2020-01-01' });
check('J8 sending created_at rejected', !!r.error && r.error.code === '42501', fmt(r));
r = await supabase.from('anon_stats_events').insert({ ...ok, install_id: 'abc' });
check('J9 extra field (install_id) rejected', !!r.error, fmt(r));
r = await supabase.from('anon_stats_events').insert(Array.from({ length: 6 }, () => ok));
check('J10 6 rows in one request rejected', r.status === 400 && r.error?.code === '23514', fmt(r));
r = await supabase.rpc('anon_stats_cleanup');
check('J11 rpc anon_stats_cleanup rejected', !!r.error, fmt(r));

proxy.close();
console.log(fail ? `REST/supabase-js: ${fail} FAIL` : 'REST/supabase-js: all PASS');
process.exit(fail ? 1 : 0);
