// v2.1: anonymous counter (contract), save export/import, move to the new address
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as G from '../../src/logic/game.js';
import { serialize, deserialize, SAVE_KEY } from '../../src/logic/save.js';
import { buildEnvelope, checkEnvelope, encodeEnvelope, decodeEnvelope, readCode, readFileText, validateSave, moveFragment, fragmentData, clearFragment,
  applyImport, isEmptySave, summary, readBackup, BACKUP_KEY, checksumOf, IMPORT_PREFIX, hasBackup, backupConflict, backupCandidate, BackupOccupiedError } from '../../src/logic/transfer.js';
import { checkLegal, emptyLegalItems, legalGuardPlugin } from '../../tools/legal-guard.mjs';
import { moveMode, prepareMove, markMigrated, daysLeft } from '../../src/logic/move.js';
import { createTelemetry, mockTransport, httpTransport, httpRequest, wireTelemetry, playBucket, captureUtm, EVENT_IDS, PAYLOAD_FIELDS, KEYS, SEMVER, DEVICE_CLASSES, PLAY_BUCKETS } from '../../src/telemetry.js';
import { OLD_ORIGIN, BASE_URL, NEW_ORIGIN, MOVE, TELEMETRY } from '../../src/config.js';
import { shareUrl } from '../../src/ui/share.js';
import { Controller } from '../../src/controller.js';
import tr from '../../src/locales/tr.json' with { type: 'json' };

class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
function played(followers = 4321) {
  const s = G.newGame(1000, 9); G.createCharacter(s, { body: 'f', skin: 2, hair: 1, channel: 'Kanal' }); G.choosePath(s, 'vlog');
  s.money = 1e5; G.rentItem(s, 'car_01'); G.buyItem(s, 'watch_01'); G.upgradeEquip(s, 'camera'); G.publish(s, { titleId: 't_morning', show: [] }); G.tick(s, 20);
  s.followers = followers; s.lastSeen = Date.UTC(2026, 8, 20, 12, 0); return JSON.parse(serialize(s));
}
const V1 = JSON.parse(fs.readFileSync(new URL('../fixtures/save_v1.json', import.meta.url), 'utf8'));
const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- transfer codec
test('compress/encode round-trip: z (deflate-raw) and j (plain) decode to the same envelope', async () => {
  const env = buildEnvelope(played(), { sent: ['first_video', 'path_chosen'], tel: 'on', notice: true }, 123);
  const z = await encodeEnvelope(env), j = await encodeEnvelope(env, { compress: false });
  assert.equal(z[0], 'z'); assert.equal(j[0], 'j'); assert.ok(/^[A-Za-z0-9_-]+$/.test(z.slice(1)), 'base64url only');
  assert.ok(z.length < j.length, 'compressed is smaller');
  for (const code of [z, j]) { const back = await decodeEnvelope(code); assert.deepEqual(back, env); const r = checkEnvelope(back); assert.ok(r.ok); }
  const r = await readCode(z); assert.equal(deserialize(r.env.save).followers, 4321);
});
test('size limit: a normal save fits the 16 KB fragment; oversize -> no fragment (download only)', async () => {
  const env = buildEnvelope(played());
  const frag = await moveFragment(env, MOVE.maxHashChars);
  assert.ok(frag.startsWith(IMPORT_PREFIX) && frag.length < MOVE.maxHashChars / 3, 'typical save far below the limit: ' + frag.length);
  assert.equal(await moveFragment(env, 50), null);
  const big = played(); big.pad = Array.from({ length: 30000 }, (_, i) => ((i * 2654435761) >>> 0).toString(36)).join('');
  const st = new Mem({ [SAVE_KEY]: JSON.stringify(big) });
  const mv = await prepareMove(st, {}, { baseUrl: 'https://new.example/' });
  assert.equal(mv.tooBig, true); assert.equal(mv.fragment, null); assert.equal(mv.url, null); assert.ok(mv.env, 'download still possible');
  const ok = await prepareMove(new Mem({ [SAVE_KEY]: JSON.stringify(played()) }), { sent: ['first_video'] }, { baseUrl: 'https://new.example/' });
  assert.equal(ok.tooBig, false); assert.ok(ok.url.startsWith('https://new.example/#import=z'));
});
test('schema validation: valid, invalid and tampered data', async () => {
  assert.ok(validateSave(played())); assert.ok(validateSave(V1), 'v1 save is valid');
  const noLast = played(); delete noLast.lastSeen; assert.ok(validateSave(noLast), 'old save without lastSeen still valid');
  for (const bad of [null, 5, [], {}, { ...played(), v: 99 }, { ...played(), money: 'x' }, { ...played(), char: null }, { ...played(), followers: -1 }, { ...played(), meta: undefined }, { ...played(), wear: { owned: 'x', worn: {} } }, { ...played(), created: 'yes' }])
    assert.equal(validateSave(bad), false, JSON.stringify(bad)?.slice(0, 60));
  const env = buildEnvelope(played());
  assert.equal(checkEnvelope({ ...env, format: 'other' }).reason, 'format');
  assert.equal(checkEnvelope({ ...env, version: 2 }).reason, 'version');
  const tampered = JSON.parse(JSON.stringify(env)); tampered.save.followers = 99999999;
  assert.equal(checkEnvelope(tampered).reason, 'checksum');
  assert.equal(checkEnvelope({ ...env, sent: ['<script>'] }).reason, 'sent');
  assert.equal(checkEnvelope({ ...env, tel: 'maybe' }).reason, 'tel');
  for (const code of ['', 'x123', 'zNOT-deflate', 'j' + Buffer.from('{"a":1}').toString('base64url'), 'z!!!']) assert.equal((await readCode(code)).ok, false, code);
  assert.equal(readFileText('not json').ok, false); assert.equal(readFileText(JSON.stringify(tampered)).ok, false);
  assert.ok(readFileText(JSON.stringify(env)).ok);
});
test('#import= fragment is read and cleared with history.replaceState (no reload, no new entry)', () => {
  assert.equal(fragmentData('#import=zABC'), 'zABC'); assert.equal(fragmentData('#other'), null); assert.equal(fragmentData(''), null);
  const calls = []; const win = { location: { pathname: '/app/', search: '?utm_source=x', hash: '#import=zABC' }, history: { state: null, replaceState: (...a) => calls.push(a) } };
  clearFragment(win);
  assert.deepEqual(calls, [[null, '', '/app/?utm_source=x']]);
});
test('conflict: the save you do not pick is kept as a backup (never deleted)', () => {
  const local = played(500), incoming = played(7777);
  const env = buildEnvelope(incoming);
  const st = new Mem({ [SAVE_KEY]: JSON.stringify(local) });
  assert.equal(isEmptySave(local), false); assert.equal(isEmptySave(null), true); assert.equal(isEmptySave(JSON.parse(serialize(G.newGame(1)))), true);
  // pick the old-address save: local one goes to backup
  assert.equal(applyImport(st, env, 'import', 'move', 42), true);
  assert.equal(JSON.parse(st.getItem(SAVE_KEY)).followers, 7777);
  let b = readBackup(st); assert.equal(b.at, 42); assert.equal(JSON.parse(b.save).followers, 500); assert.match(b.source, /replaced-local/);
  // pick this device's save: the incoming one goes to backup, local untouched
  const st2 = new Mem({ [SAVE_KEY]: JSON.stringify(local) });
  assert.equal(applyImport(st2, env, 'current', 'move', 43), false);
  assert.equal(JSON.parse(st2.getItem(SAVE_KEY)).followers, 500);
  b = readBackup(st2); assert.equal(JSON.parse(b.save).followers, 7777); assert.match(b.source, /unpicked-import/);
  // summary for the choice buttons (followers + last played, fallback when missing)
  assert.deepEqual(summary(incoming), { followers: 7777, lastPlayed: Date.UTC(2026, 8, 20, 12, 0) });
  const old = played(); delete old.lastSeen; assert.equal(summary(old).lastPlayed, null);
});
test('export -> wipe -> import gives the identical save', async () => {
  const s = played(); const env = buildEnvelope(s, {}, 1);
  const file = JSON.stringify(env, null, 2);
  const r = readFileText(file); assert.ok(r.ok);
  const st = new Mem(); applyImport(st, r.env);
  assert.equal(st.getItem(SAVE_KEY), JSON.stringify(s));
  assert.deepEqual(JSON.parse(serialize(deserialize(st.getItem(SAVE_KEY), 0))), JSON.parse(serialize(deserialize(JSON.stringify(s), 0))));
  assert.equal(env.checksum, checksumOf(s));
});

// ---------------------------------------------------------------- move mode + config
test('move mode: dormant until startDate, banner for graceDays, then redirect; other origins never', () => {
  const old = { origin: OLD_ORIGIN }, other = { origin: NEW_ORIGIN };
  assert.equal(moveMode(other, Date.now(), { ...MOVE, mode: 'redirect' }), 'none');
  assert.equal(moveMode(old, Date.now(), { ...MOVE, startDate: null, mode: 'auto' }), 'none');
  const cfg = { ...MOVE, startDate: '2026-10-01', mode: 'auto' };
  assert.equal(moveMode(old, Date.parse('2026-10-02T12:00:00+03:00'), cfg), 'banner');
  assert.equal(moveMode(old, Date.parse('2026-12-01T12:00:00+03:00'), cfg), 'redirect');
  assert.equal(daysLeft(Date.parse('2026-10-02T00:00:00+03:00'), cfg), 59);
  assert.equal(moveMode(old, 0, { ...MOVE, mode: 'banner' }), 'banner');
  assert.equal(MOVE.graceDays, 60); assert.equal(BASE_URL, 'https://fenomen.teserix.com/');
  const st = new Mem({ [SAVE_KEY]: '{"v":2}' }); markMigrated(st, 7); assert.equal(st.getItem('fenomen_migrated_at'), '7'); assert.equal(st.getItem(SAVE_KEY), '{"v":2}', 'old save kept');
});
test('share link points to the new address and keeps the UTM tags verbatim', () => {
  assert.equal(shareUrl(), 'https://fenomen.teserix.com/?utm_source=share&utm_medium=video_cover&utm_campaign=fenomen');
});
test('"github.io" appears in code only in src/config.js', () => {
  const files = ['index.html', 'vite.config.js', 'sw.template.js']; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else files.push(p); } })('src');
  const hits = files.filter((f) => fs.readFileSync(f, 'utf8').includes('github.io'));
  assert.deepEqual(hits, ['src/config.js']);
  assert.ok(fs.readFileSync('index.html', 'utf8').includes('%cfg:OG_IMAGE%'));
});

// ---------------------------------------------------------------- counter: contract
const CONTRACT_IDS = ['game_open_new', 'character_created', 'path_chosen_vlog', 'path_chosen_oyun', 'path_chosen_luks', 'first_video', 'first_edit_game', 'first_shop_buy', 'first_rent', 'first_ifsa', 'first_ifsa_ozur', 'first_ifsa_gormezden', 'first_staff', 'first_manager', 'followers_1B', 'followers_10B', 'followers_100B', 'followers_1M', 'first_sell', 'first_fame_node', 'kiraliksiz_hayat', 'session_start'];
const ready = (o = {}) => new Mem({ [KEYS.notice]: '1', ...o });
function mk(st, extra = {}) { const tr = mockTransport(false); return { tel: createTelemetry({ storage: st, transport: tr, version: '2.1.0-f29b9b4-mul8', device: 'mobil', playMinutes: () => 12, ...extra }), tr }; }
test('event list is exactly the 22 contract IDs; follower milestones are in it', () => {
  assert.deepEqual(EVENT_IDS, CONTRACT_IDS);
  for (const [, id] of TELEMETRY.followers) assert.ok(EVENT_IDS.includes(id));
  assert.equal(TELEMETRY.table, 'anon_stats_events');
});
test('payload has exactly event, version (semver), device_class, play_bucket', async () => {
  const { tel, tr } = mk(ready());
  tel.track('first_video'); await flush();
  const p = tr.sent[0];
  assert.deepEqual(Object.keys(p).sort(), [...PAYLOAD_FIELDS].sort()); assert.deepEqual(PAYLOAD_FIELDS, ['event', 'version', 'device_class', 'play_bucket']);
  assert.equal(p.version, '2.1.0'); assert.match(p.version, SEMVER); assert.ok(p.version.length >= 5 && p.version.length <= 11);
  assert.ok(EVENT_IDS.includes(p.event)); assert.ok(DEVICE_CLASSES.includes(p.device_class)); assert.equal(p.play_bucket, '10-30');
  assert.equal(tel.track('first_nope'), 'invalid'); assert.equal(tel.track('path_chosen_egitim'), 'invalid');
  for (const k of ['utm_source', 'utm_campaign', 'id', 'created_at', 'minute', 'install_id']) assert.ok(!(k in p), k);
});
test('play bucket boundaries: [0,10) [10,30) [30,60) [60,120) >=120', () => {
  const cases = [[0, '0-10'], [9.99, '0-10'], [10, '10-30'], [29.9, '10-30'], [30, '30-60'], [59.9, '30-60'], [60, '60-120'], [119.9, '60-120'], [120, '120+'], [9999, '120+']];
  for (const [m, b] of cases) assert.equal(playBucket(m), b, String(m));
  assert.deepEqual(PLAY_BUCKETS, ['0-10', '10-30', '30-60', '60-120', '120+']);
});
test('HTTP request: POST /rest/v1/anon_stats_events, apikey only, Prefer return=minimal, one row, no select', async () => {
  const cfg = { url: 'https://fenomen-api.teserix.com/', key: 'sb_publishable_TEST', table: 'anon_stats_events', timeoutMs: 5000 };
  const calls = []; const tp = httpTransport(cfg, (u, init) => { calls.push([u, init]); return Promise.resolve({ status: 201 }); });
  const payload = { event: 'first_video', version: '2.1.0', device_class: 'mobil', play_bucket: '0-10' };
  assert.deepEqual(await tp.send(payload), { ok: true, status: 201 });
  const [u, init] = calls[0];
  assert.equal(u, 'https://fenomen-api.teserix.com/rest/v1/anon_stats_events'); assert.ok(!/select|return=representation/.test(u));
  assert.equal(init.method, 'POST'); assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Prefer: 'return=minimal', apikey: 'sb_publishable_TEST' });
  assert.ok(!('Authorization' in init.headers)); assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.keepalive, true);
  const body = JSON.parse(init.body); assert.ok(!Array.isArray(body), 'one row, not an array'); assert.deepEqual(Object.keys(body), PAYLOAD_FIELDS);
  assert.deepEqual(await httpTransport(cfg, () => Promise.resolve({ status: 400 })).send(payload), { ok: false, status: 400 });
  assert.deepEqual(await httpTransport(cfg, () => Promise.reject(new Error('offline'))).send(payload), { ok: false, status: 0 });
  assert.deepEqual(await httpTransport(cfg, () => { throw new Error('sync'); }).send(payload), { ok: false, status: 0 });
  assert.equal(httpRequest(cfg, payload).init.headers.Prefer, 'return=minimal');
});

// ---------------------------------------------------------------- counter: behaviour
test('sent_* flags: each event is sent once per device, also across reloads; only the first path counts', async () => {
  const st = ready(); let { tel, tr } = mk(st);
  assert.equal(tel.track('first_video'), 'sent'); await flush();
  assert.equal(tel.track('first_video'), 'dup'); assert.equal(st.getItem('fenomen_sent_first_video'), 'true');
  tel.track('path_chosen_vlog'); tel.track('path_chosen_luks'); tel.track('followers_1B');
  ({ tel, tr } = mk(st));                                          // "reload"
  assert.equal(tel.track('first_video'), 'dup'); assert.equal(tel.track('path_chosen_oyun'), 'dup'); tel.followers(5e6); await flush();
  assert.deepEqual(tr.sent.map((p) => p.event), ['followers_10B', 'followers_100B', 'followers_1M']);
});
test('session_start at most every 30 minutes (device clock)', () => {
  let t = 1e12; const st = ready(); const { tel, tr } = mk(st, { now: () => t });
  assert.equal(tel.sessionStart(), 'sent'); t += 29 * 60000; assert.equal(tel.sessionStart(), 'rate'); t += 2 * 60000; assert.equal(tel.sessionStart(), 'sent');
  assert.equal(tr.sent.length, 2);
});
test('toggle off / notice "Kapat" means nothing is sent; nothing before the notice is answered', async () => {
  const st = new Mem(); const { tel, tr } = mk(st);
  assert.equal(tel.noticeNeeded(), true);
  assert.equal(tel.track('game_open_new'), 'held'); assert.equal(tel.sessionStart(), 'held'); tel.track('character_created');
  assert.equal(tr.sent.length, 0, 'no request before the notice');
  tel.answerNotice(true); await flush();
  assert.deepEqual(tr.sent.map((p) => p.event), ['game_open_new', 'session_start', 'character_created']);
  tel.setEnabled(false);
  for (const id of ['first_video', 'first_rent', 'session_start']) assert.equal(tel.track(id), 'off');
  tel.followers(1e7); assert.equal(tr.sent.length, 3);
  // "Kapat" on the notice
  const st2 = new Mem(); const b = mk(st2);
  b.tel.track('game_open_new'); b.tel.answerNotice(false); b.tel.track('first_video'); b.tel.sessionStart(); await flush();
  assert.equal(b.tr.sent.length, 0); assert.equal(st2.getItem(KEYS.pref), 'off');
});
test('first_*: flag only after 2xx; failure leaves no flag and retries once on the next launch', async () => {
  const st = ready(); let { tel, tr } = mk(st);
  tr.fail = true;
  assert.equal(tel.track('first_rent'), 'sent'); await tel.last;
  assert.equal(st.getItem('fenomen_sent_first_rent'), null, 'no flag on failure');
  assert.equal(st.getItem('fenomen_retry_first_rent'), 'pending');
  assert.equal(tel.track('first_rent'), 'retry-later', 'not again in the same session'); assert.equal(tr.sent.length, 1);
  // next launch: seed must not swallow the pending retry, retry succeeds (201) -> flag set, marker removed
  ({ tel, tr } = mk(st)); tel.seed(played());
  assert.equal(st.getItem('fenomen_sent_first_rent'), null);
  assert.equal(tel.track('first_rent'), 'retry-later', 'live trigger waits for the launch retry');
  assert.deepEqual(await tel.retryPending(), [['first_rent', true]]);
  assert.equal(st.getItem('fenomen_sent_first_rent'), 'true'); assert.equal(st.getItem('fenomen_retry_first_rent'), null);
  assert.deepEqual(tr.sent.map((p) => p.event), ['first_rent']);
  assert.equal(tel.track('first_rent'), 'dup');
});
test('first_*: a failed launch retry is not retried again (no loop); 201 sets the flag at once', async () => {
  const st = ready(); let { tel, tr } = mk(st);
  tr.fail = true; tel.track('first_ifsa'); await tel.last;
  ({ tel, tr } = mk(st)); tr.fail = true;
  assert.deepEqual(await tel.retryPending(), [['first_ifsa', false]]);
  assert.equal(st.getItem('fenomen_retry_first_ifsa'), 'retried');
  ({ tel, tr } = mk(st));
  assert.deepEqual(await tel.retryPending(), []); assert.equal(tel.track('first_ifsa'), 'retry-later'); assert.equal(tr.sent.length, 0);
  // success path
  tel.track('first_staff'); await tel.last; assert.equal(st.getItem('fenomen_sent_first_staff'), 'true'); assert.equal(st.getItem('fenomen_retry_first_staff'), null);
});
test('seed: milestones an older save already reached are marked without sending', async () => {
  const st = ready(); const { tel, tr } = mk(st);
  const s = played(15000); tel.seed(s);
  for (const k of ['game_open_new', 'character_created', 'path_chosen', 'first_video', 'first_shop_buy', 'first_rent', 'followers_1B', 'followers_10B']) assert.equal(st.getItem(KEYS.sent + k), 'true', k);
  assert.equal(st.getItem(KEYS.sent + 'followers_100B'), null); assert.equal(st.getItem(KEYS.sent + 'first_sell'), null);
  await flush(); assert.equal(tr.sent.length, 0);
});
test('flags + preference travel with an exported save (union, "off" wins)', () => {
  const a = ready({ [KEYS.sent + 'first_video']: 'true', [KEYS.pref]: 'off' }); const ta = mk(a).tel;
  const st = ta.exportState(); assert.deepEqual(st, { sent: ['first_video'], tel: 'off', notice: true });
  const b = new Mem({ [KEYS.sent + 'first_rent']: 'true' }); const tb = mk(b).tel; tb.absorb(st);
  // follower milestone ids contain upper case (followers_10B / _1M): they must survive the envelope check
  const env = buildEnvelope(played(), { sent: ['followers_10B', 'followers_1M', 'path_chosen'] });
  assert.ok(checkEnvelope(env).ok); const c = new Mem(); mk(c).tel.absorb(env); assert.equal(c.getItem(KEYS.sent + 'followers_10B'), 'true');
  assert.deepEqual(tb.exportState(), { sent: ['first_rent', 'first_video'], tel: 'off', notice: true });
});
test('UTM of the landing URL is stored once, locally, and never attached to events', async () => {
  const st = ready();
  assert.deepEqual(captureUtm(st, '?utm_source=share&utm_campaign=fenomen&x=1'), { utm_source: 'share', utm_campaign: 'fenomen' });
  assert.deepEqual(captureUtm(st, '?utm_source=other'), { utm_source: 'share', utm_campaign: 'fenomen' }, 'first visit wins');
  const { tel, tr } = mk(st); tel.track('first_video'); await flush();
  assert.ok(!JSON.stringify(tr.sent).includes('utm'));
});
test('controller events drive the counter (create, hire, İfşa choice, edit mini-game)', async () => {
  const st = ready(); const ctrl = new Controller(st, 1000); const { tel, tr } = mk(st); wireTelemetry(ctrl, tel);
  ctrl.create({ body: 'm', skin: 1, hair: 1, channel: 'x' }, 'oyun');
  ctrl.state.money = 1e6; ctrl.act(G.hire, 'editor'); ctrl.act(G.rentItem, 'car_01'); ctrl.emit('editGame');
  G.triggerIfsa(ctrl.state, ['car_01']); ctrl.drain(); ctrl.resolveIfsa('ignore');
  await flush();
  assert.deepEqual(tr.sent.map((p) => p.event), ['character_created', 'path_chosen_oyun', 'first_shop_buy', 'first_staff', 'first_rent', 'first_edit_game', 'first_ifsa', 'first_ifsa_gormezden']);
});
test('active play time is stored in meta.playSec and survives save/load and Kanalı Sat', () => {
  const s = G.newGame(0, 1); s.meta.playSec = 1234.5;
  assert.equal(deserialize(serialize(s), 0).meta.playSec, 1234.5);
  s.created = true; s.path = 'vlog'; s.stats.peakFollowers = 1e6; assert.equal(G.sellChannel(s, 0).meta.playSec, 1234.5);
});

// ---------------------------------------------------------------- texts
test('v2.1 texts: copy writer keys present, temporary changes applied, no "rıza", placeholders', () => {
  assert.equal(tr.move.title, 'Fenomen yeni adresine taşındı!'); assert.equal(tr.move.download, 'Kaydı indir');
  assert.equal(tr.saveFile.importYes, 'Evet, yükle'); assert.equal(tr.import.done, 'Kaydın taşındı. Kaldığın yerden devam et!');
  assert.ok(tr.import.conflictBody.includes('yedekte kalır'));
  for (const k of ['optOld', 'optNew']) assert.ok(tr.import[k].includes('{f}') && tr.import[k].includes('{d}'), k);
  assert.equal(tr.settings.telemetry, 'İsimsiz istatistik gönder'); assert.equal(tr.telemetry.ok, 'Tamam'); assert.equal(tr.telemetry.off, 'Kapat');
  const all = JSON.stringify(tr).toLocaleLowerCase('tr');
  assert.ok(!all.includes('rıza')); assert.ok(!all.includes('onlyfans'));
});
test('no hardcoded UI text in the v2.1 files', () => {
  const bad = [];
  for (const f of ['src/config.js', 'src/telemetry.js', 'src/logic/transfer.js', 'src/logic/move.js', 'src/ui/move.js', 'src/ui/privacy.js', 'src/ui/savefile.js']) {
    const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const m of src.matchAll(/(['"`])((?:(?!\1).)*[çğıöşüÇĞİÖŞÜ](?:(?!\1).)*)\1/g)) bad.push(f + ': ' + m[2]);
  }
  assert.deepEqual(bad, []);
});

// ---- fix round: single backup slot is never overwritten silently ----
test('backup slot: a second import refuses to overwrite the backup unless overwriteBackup is set', () => {
  const a = played(500), b = played(600), c = played(700);
  const st = new Mem({ [SAVE_KEY]: JSON.stringify(a) });
  assert.equal(hasBackup(st), false); assert.equal(backupConflict(st, buildEnvelope(b)), false);
  applyImport(st, buildEnvelope(b), 'import', 'file', 1);                       // backup = a
  assert.equal(JSON.parse(readBackup(st).save).followers, 500);
  const envC = buildEnvelope(c);
  assert.equal(backupConflict(st, envC), true); assert.equal(JSON.parse(backupCandidate(st, envC)).followers, 600);
  const before = [st.getItem(SAVE_KEY), st.getItem(BACKUP_KEY)];
  assert.throws(() => applyImport(st, envC, 'import', 'file', 2), BackupOccupiedError);
  assert.throws(() => applyImport(st, envC, 'current', 'move', 2), BackupOccupiedError);
  assert.deepEqual([st.getItem(SAVE_KEY), st.getItem(BACKUP_KEY)], before);  // refused = nothing changed
  assert.equal(applyImport(st, envC, 'import', 'file', 3, { overwriteBackup: true }), true);
  assert.equal(JSON.parse(st.getItem(SAVE_KEY)).followers, 700); assert.equal(JSON.parse(readBackup(st).save).followers, 600);
});
test('backup slot: empty or identical local save needs no backup (and is not a conflict)', () => {
  const inc = played(900), env = buildEnvelope(inc);
  const bak = JSON.stringify({ at: 1, source: 'x', save: JSON.stringify(played(1)) });
  const st = new Mem({ [SAVE_KEY]: serialize(G.newGame(1)), [BACKUP_KEY]: bak });
  assert.equal(backupConflict(st, env), false);
  assert.equal(applyImport(st, env), true); assert.equal(st.getItem(BACKUP_KEY), bak);      // fresh local save is not "backed up" over the real backup
  assert.equal(backupConflict(st, env), false); applyImport(st, env); assert.equal(st.getItem(BACKUP_KEY), bak);   // same save again
  assert.equal(backupConflict(st, env, 'current'), true);                                    // keeping current would park the import in the slot
});

// ---- fix round: legal text release guard ----
test('legal guard: empty telemetry.details item fails the build, filled passes, ALLOW_EMPTY_LEGAL=1 passes', () => {
  const full = { telemetry: { details: ['a', 'b', 'Veri sorumlusu: …'] } };
  const empty = { telemetry: { details: ['a', 'b', ''] } };
  assert.deepEqual(checkLegal(full, {}), { ok: true, skipped: false, empty: [] });
  assert.throws(() => checkLegal(empty, {}), /\[legal-guard\].*telemetry\.details boş: son madde #3 \(veri sorumlusu, alıcılar, haklar\).*ALLOW_EMPTY_LEGAL=1 npm run build/);
  assert.throws(() => checkLegal({ telemetry: { details: ['a', '   ', 'c'] } }, {}), /madde #2/);
  assert.throws(() => checkLegal({}, {}), /legal-guard/);
  assert.throws(() => checkLegal(empty, { ALLOW_EMPTY_LEGAL: '0' }), /legal-guard/);
  assert.deepEqual(checkLegal(empty, { ALLOW_EMPTY_LEGAL: '1' }), { ok: false, skipped: true, empty: [2] });
  assert.deepEqual(emptyLegalItems(tr), tr.telemetry.details.every((p) => p.trim()) ? [] : [tr.telemetry.details.length - 1]);
  // Vite plugin: build-only, throws in buildStart
  const p = legalGuardPlugin(empty, {}); assert.equal(p.apply, 'build');
  assert.throws(() => p.buildStart.call({ warn() {} }), /legal-guard/);
  const warned = []; legalGuardPlugin(empty, { ALLOW_EMPTY_LEGAL: '1' }).buildStart.call({ warn: (m) => warned.push(m) });
  assert.equal(warned.length, 1); legalGuardPlugin(full, {}).buildStart.call({ warn: (m) => warned.push(m) }); assert.equal(warned.length, 1);
  assert.match(fs.readFileSync('vite.config.js', 'utf8'), /legalGuardPlugin\(tr\)/);
});

// ---- fix round: KVKK equal visual weight for the notice buttons ----
test('notice: "Tamam" and "Kapat" use the same class (no primary/secondary)', async () => {
  const src = fs.readFileSync('src/ui/privacy.js', 'utf8');
  const cls = (id) => (src.match(new RegExp("class: ([^,]+), 'data-test': '" + id + "'")) || [])[1];
  assert.ok(cls('tel-ok')); assert.equal(cls('tel-ok'), cls('tel-off'));
  const { NOTICE_BTN } = await import('../../src/ui/privacy.js');
  assert.doesNotMatch(NOTICE_BTN, /primary/);
  assert.doesNotMatch(fs.readFileSync('src/style.css', 'utf8'), /\.primary\.nb-btn/);
});
