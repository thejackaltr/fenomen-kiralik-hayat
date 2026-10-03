// v2.2 smoke: optional e-mail login + cloud save against a FAKE Supabase (tests/smoke/fake-supabase.mjs, Playwright
// routes only; no real server, no real save). Run: ONLY=v22 BASE=... OLD_BASE=... node tests/smoke/smoke.mjs
// SHOTS22=/dir writes the v2.2 screenshots (1x) there.
import fs from 'node:fs';
import { createFakeSupabase, FAKE_URL, FAKE_KEY } from './fake-supabase.mjs';

const TR = JSON.parse(fs.readFileSync(new URL('../../src/locales/tr.json', import.meta.url), 'utf8'));
const tr = (k, vars = {}) => { let v = k.split('.').reduce((o, p) => (o ? o[p] : undefined), TR); if (typeof v !== 'string') throw new Error('no tr ' + k); for (const [a, b] of Object.entries(vars)) v = v.split('{' + a + '}').join(String(b)); return v; };
const want = (k) => !process.env.SECTIONS || process.env.SECTIONS.split(',').includes(k);   // see smoke.mjs
const NOTICE_SEEN = () => { try { if (!localStorage.getItem('fenomen_tel_notice')) localStorage.setItem('fenomen_tel_notice', '1'); } catch (e) { /* ignore */ } };

export async function runV22({ browser, BASE, OLD, ok }) {
  const NEW_O = new URL(BASE).origin, OLD_O = OLD ? new URL(OLD).origin : null;
  const SHOTS = process.env.SHOTS22 || '';
  const cfgFor = (o = {}) => ({ oldOrigin: OLD_O || 'http://old.invalid', baseUrl: BASE, moveMode: 'none', cloudUrl: FAKE_URL, cloudKey: FAKE_KEY, loginOrigin: NEW_O, cloudResendSec: 2, cloudSyncSec: 3600, cloudTimeoutMs: 4000, cloudSendGapMs: 0, cloudNetLockMs: 0, cloudRateLockMs: 0, ...o });
  // (the auth brake is off by default here so the blocks can send codes back to back; v22-K runs it with the real 5 s / 10 s)
  const tagOf = (k) => '[v2.2 ' + k + '] ';

  async function dev(fake, { vw = 1280, vh = 800, mobile = false, cfg = cfgFor(), url = BASE, notice = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'tr-TR', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
    await ctx.route(FAKE_URL + '/**', (r) => fake.handle(r));
    await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, cfg);
    if (notice) await ctx.addInitScript(NOTICE_SEEN);
    const p = await ctx.newPage(); const errors = [];
    // expected noise: SW blocked on purpose (serviceWorkers: 'block'); failed fake answers the test injected itself
    p.on('console', (m) => { if (m.type() !== 'error' && m.type() !== 'warning') return; const u = (m.location() || {}).url || ''; if (/Service Worker registration blocked by Playwright/.test(m.text())) return; if (u.startsWith(FAKE_URL) && /Failed to load resource/.test(m.text())) return; errors.push(m.type() + ': ' + m.text()); });
    p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const tap = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); if (mobile) { const b = await el.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click(); };
    const S = (js, a) => p.evaluate(js, a);
    await p.goto(url, { waitUntil: 'load' });
    return { ctx, p, errors, tap, S, mobile };
  }
  const create = async (T, name, path = 'vlog') => { await T.p.waitForSelector('[data-test=creator]'); await T.p.fill('[data-test=channel-input]', name); await T.tap('[data-test=creator-next]'); await T.tap('[data-test=path-' + path + ']'); await T.tap('[data-test=creator-start]'); await T.p.waitForSelector('[data-test=shoot]'); await T.S(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); }); };
  const publishMini = async (T) => {
    await T.tap('[data-test=tab-studio]'); await T.tap('[data-test=shoot]'); await T.tap('[data-test=shoot-go]');
    await T.p.waitForSelector('[data-test=edit-track]', { timeout: 8000 }); await T.S(() => { for (let i = 0; i < 3; i++) window.__edit.cut(); });
    await T.tap('[data-test=publish-go]'); await T.p.waitForTimeout(300);
  };
  const set = (T, o) => T.S((o) => { const s = window.__fenomen.ctrl.state; if (o.followers != null) s.followers = o.followers; if (o.money != null) s.money = o.money; if (o.sales != null) s.meta.sales = o.sales; if (o.fame != null) { s.meta.fame = o.fame; s.meta.fameEarned = Math.max(s.meta.fameEarned || 0, o.fame); } window.__fenomen.ctrl.save(); window.__fenomen.ctrl.emit('change'); }, o);
  const localSave = (T) => T.S(() => localStorage.getItem('fenomen_save_v1'));
  const state = (T) => T.S(() => { const s = window.__fenomen.ctrl.state; return { channel: s.char && s.char.channel, videos: s.stats.videos, followers: Math.floor(s.followers), created: !!s.created, sales: s.meta.sales || 0 }; });
  const modalTest = (T) => T.S(() => { const m = document.querySelector('.modal-wrap:not(.hidden) .modal') || document.querySelector('[role=dialog]'); return m ? m.getAttribute('data-test') : null; });
  const toasts = (T) => T.S(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent));
  const waitToast = async (T, text, ms = 6000) => { try { await T.p.waitForFunction((t) => [...document.querySelectorAll('.toast')].some((x) => x.textContent === t), text, { timeout: ms }); return true; } catch (e) { return false; } };
  const openSettings = async (T) => { await T.S(() => { while (window.__fenomen.ui.modalOpen) window.__fenomen.ui.closeModal(); }); await T.tap('[data-test=settings-open]'); await T.p.waitForSelector('[data-test=settings-open]'); };
  // fire and forget: a sync may wait for the player (choice screen / keep window); idle() waits for the end
  const sync = (T, fn, a) => T.S(([fn, a]) => { window.__fenomen.account.sync[fn](a); }, [fn, a]);
  const login = async (T, fake, email) => {
    await openSettings(T); await T.tap('[data-test=account-signin]');
    await T.p.waitForSelector('[data-test=login-modal]'); await T.p.fill('[data-test=login-email]', email); await T.tap('[data-test=login-send]');
    await T.p.waitForSelector('[data-test=code-modal]'); await T.p.fill('[data-test=code-input]', fake.codeOf(email.toLowerCase())); await T.tap('[data-test=code-verify]');
    await T.p.waitForSelector('[data-test=code-modal]', { state: 'detached', timeout: 8000 });
  };
  const idle = async (T) => { await T.p.waitForFunction(() => !window.__fenomen.account.sync.busy(), null, { timeout: 8000 }).catch(() => {}); };
  const done = async (T, k) => { const real = T.errors.filter((e) => !/favicon/.test(e)); ok(tagOf(k) + 'no console errors/warnings', real.length === 0, real.slice(0, 4).join(' | ')); await T.ctx.close(); };
  const shot = async (T, name) => { if (SHOTS) await T.p.screenshot({ path: SHOTS + '/fenomen-v22-' + name + '.png' }); };
  // topmost at the centre and 4 inner corners, fully inside the viewport
  const clearAt = (T, sel) => T.p.$eval(sel, (el) => {
    el.scrollIntoView({ block: 'nearest' });
    const r = el.getBoundingClientRect(), i = 4;
    const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + i, r.top + i], [r.right - i, r.top + i], [r.left + i, r.bottom - i], [r.right - i, r.bottom - i]];
    const top = pts.every(([x, y]) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit)); });
    return { top, inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight + 0.5 && r.right <= innerWidth + 0.5, w: Math.round(r.width), h: Math.round(r.height) };
  });

  // ---- A: guest unchanged; no cloud config = no account section; login screen texts and order
  if (want('v22-A')) {
    const fake = createFakeSupabase({ resendSec: 2 }), tag = tagOf('misafir');
    const T0 = await dev(fake, { cfg: cfgFor({ cloudUrl: null, cloudKey: null }) });
    await create(T0, 'Bulutsuz'); await openSettings(T0);
    ok(tag + 'cloud not configured (no build env): Settings has no "Bulut kayıt" section, no login', !(await T0.p.$('[data-test=account-signin]')) && !(await T0.p.$('[data-test=account-move-note]')) && !(await T0.S(() => document.querySelector('.modal').textContent.includes('Bulut kayıt'))));
    await done(T0, 'misafir env yok');
    const T = await dev(fake);
    await create(T, 'Misafir Kanal'); await publishMini(T); await set(T, { followers: 500 });
    ok(tag + 'guest play: 0 requests to the cloud', fake.log.length === 0, fake.log.map((x) => x.path).join(','));
    await openSettings(T);
    const sec = await T.S(() => ({ guest: (document.querySelector('[data-test=account-guest]') || {}).textContent, btn: !!document.querySelector('[data-test=account-signin]'), link: !!document.querySelector('[data-test=settings-account-details]') }));
    ok(tag + 'Settings: "Bulut kayıt" with guest note + "Giriş yap"; Gizlilik links the full account text', sec.guest === tr('account.guestNote') && sec.btn && sec.link, JSON.stringify(sec));
    await T.tap('[data-test=settings-account-details]'); await T.p.waitForSelector('[data-test=account-privacy-modal]');
    const det = await T.S(() => ({ h: document.querySelector('[data-test=account-privacy-modal] h2').textContent, ps: [...document.querySelectorAll('[data-test=account-privacy-modal] p')].map((p) => p.textContent) }));
    ok(tag + 'Ayarlar > Gizlilik: full text (title + ' + TR.account.privacy.details.length + ' paragraphs, placeholders as they are)', det.h === tr('account.privacy.title') && JSON.stringify(det.ps) === JSON.stringify(TR.account.privacy.details), det.ps.length + '');
    await T.tap('[data-test=account-privacy-close]');
    await openSettings(T); await T.tap('[data-test=account-signin]'); await T.p.waitForSelector('[data-test=login-modal]');
    const L = await T.S(() => { const q = (s) => document.querySelector('[data-test=' + s + ']'); const R = (s) => q(s).getBoundingClientRect();
      return { title: document.querySelector('[data-test=login-modal] h2').textContent, optional: q('login-optional').textContent, age: q('login-age').textContent, priv: q('login-privacy').textContent, privVisible: R('login-privacy').height > 0 && getComputedStyle(q('login-privacy')).display !== 'none', ageVisible: R('login-age').height > 0,
        order: R('login-email').bottom <= R('login-privacy').top && R('login-privacy').bottom <= R('login-send').top, details: q('login-details').textContent }; });
    ok(tag + 'login screen: title, optional, age note, e-mail field; summary + "Ayrıntılar" between the field and "Kod gönder"', L.title === tr('auth.login.title') && L.optional === tr('auth.login.optional') && L.age === tr('auth.login.age') && L.priv === tr('auth.login.privacySummary') + ' ' + tr('account.privacy.detailsLink') && L.privVisible && L.ageVisible && L.order && L.details === tr('account.privacy.detailsLink'), JSON.stringify(L));
    await T.tap('[data-test=login-details]'); await T.p.waitForSelector('[data-test=account-privacy-modal]');
    ok(tag + '"Ayrıntılar" on the login screen opens the full text', (await T.S(() => document.querySelector('[data-test=account-privacy-modal]').textContent)).includes(TR.account.privacy.details[0]));
    await T.tap('[data-test=account-privacy-close]'); await T.p.waitForSelector('[data-test=login-modal]');
    ok(tag + 'closing the details returns to the login screen', true);
    await T.tap('[data-test=login-later]');
    const before = await localSave(T);
    ok(tag + '"Şimdi değil": nothing sent, save unchanged', fake.log.length === 0 && !(await T.p.$('[data-test=login-modal]')) && before === (await localSave(T)));
    await done(T, 'misafir');
  }

  // ---- B: "Kod gönder" errors (one test each), code screen, resend, wrong / bad code, rule 1 (cloud empty -> upload)
  if (want('v22-B')) {
    const fake = createFakeSupabase({ resendSec: 2 }), tag = tagOf('giriş');
    // this block counts the writes of push() itself: the instant write after a publish (tested in B2) is off here,
    // otherwise its timer (15 s after the login write) could add a write in the middle of a count
    const T = await dev(fake, { cfg: cfgFor({ cloudPushDelayMs: 3600 * 1000 }) });
    await create(T, 'Giriş Kanalı'); await publishMini(T);
    await openSettings(T); await T.tap('[data-test=account-signin]'); await T.p.waitForSelector('[data-test=login-modal]');
    const err = () => T.S(() => { const e = document.querySelector('[data-test=login-error]'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
    const trySend = async (email) => { await T.p.fill('[data-test=login-email]', email); await T.tap('[data-test=login-send]'); await T.p.waitForFunction(() => { const b = document.querySelector('[data-test=login-send]'); return !b || !b.disabled; }); await T.p.waitForTimeout(50); };
    await trySend('yanlis-adres');
    ok(tag + 'bad address (local check): auth.login.badEmail, nothing sent', (await err()) === tr('auth.login.badEmail') && fake.log.length === 0);
    const cases = [
      ['429 over_email_send_rate_limit', 429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 42 seconds.' }, 'auth.login.rateLimit'],
      ['429 over_request_rate_limit', 429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 'auth.login.rateLimit'],
      ['500 Error sending magic link email (SMTP/Resend)', 500, { code: 500, error_code: 'unexpected_failure', msg: 'Error sending magic link email' }, 'auth.login.quotaFull'],
      ['500 Error sending confirmation email (quota)', 500, { code: 500, msg: 'Error sending confirmation email' }, 'auth.login.quotaFull'],
      ['400 email_address_invalid', 400, { code: 400, error_code: 'email_address_invalid', msg: 'Email address "a@b.cd" is invalid' }, 'auth.login.sendFail'],
      ['400 validation_failed (e-mail format)', 400, { code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' }, 'auth.login.sendFail'],
      ['500 other error', 500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' }, 'auth.login.sendError'],
      ['422 otp_disabled', 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' }, 'auth.login.sendError'],
      ['400 validation_failed (not the e-mail)', 400, { code: 400, error_code: 'validation_failed', msg: 'Unsupported otp type' }, 'auth.login.sendError'],
      ['network error (online)', 'abort', null, 'auth.login.netOrRate']
    ];
    for (const [name, st, body, key] of cases) {
      fake.fail('POST', '/auth/v1/otp', st, body); await trySend('oyuncu@example.com');
      const e = await err();
      ok(tag + 'send error ' + name + ' -> ' + key, e === tr(key) && !!(await T.p.$('[data-test=login-modal]')), e);
    }
    await T.ctx.setOffline(true); await trySend('oyuncu@example.com'); const off = await err(); await T.ctx.setOffline(false);
    ok(tag + 'send while offline -> auth.code.offline (no request)', off === tr('auth.code.offline'), off);
    const nOtp = fake.calls(/POST \/auth\/v1\/otp/).length;
    await trySend('Oyuncu@Example.com');
    await T.p.waitForSelector('[data-test=code-modal]');
    const C = await T.S(() => ({ sent: document.querySelector('[data-test=code-sent]').textContent, input: (({ inputMode, autocomplete, maxLength }) => ({ inputMode, autocomplete, maxLength }))(document.querySelector('[data-test=code-input]')), resend: document.querySelector('[data-test=code-resend]').textContent, dis: document.querySelector('[data-test=code-resend]').disabled }));
    ok(tag + 'code screen: address shown, numeric one-time-code input (6), resend waits with a countdown', C.sent === tr('auth.code.sent', { email: 'Oyuncu@Example.com' }) && C.input.inputMode === 'numeric' && C.input.autocomplete === 'one-time-code' && C.input.maxLength === 6 && C.dis && /\(\d+ sn\)$/.test(C.resend) && fake.calls(/POST \/auth\/v1\/otp/).length === nOtp + 1, JSON.stringify(C));
    const lastOtp = fake.calls(/POST \/auth\/v1\/otp/).pop();
    ok(tag + 'code request: e-mail + create_user, apikey only (no Authorization)', lastOtp.body.email === 'Oyuncu@Example.com' && lastOtp.body.create_user === true && !lastOtp.auth && lastOtp.apikey === FAKE_KEY, JSON.stringify(lastOtp.body));
    await shot(T, 'code-1280x800');
    const cerr = () => T.S(() => { const e = document.querySelector('[data-test=code-error]'); return e && !e.classList.contains('hidden') ? e.textContent : ''; });
    const verify = async (code) => { await T.p.fill('[data-test=code-input]', code); await T.tap('[data-test=code-verify]'); await T.p.waitForTimeout(150); await T.p.waitForFunction(() => { const b = document.querySelector('[data-test=code-verify]'); return !b || !b.disabled; }); };
    const nVer = fake.calls(/verify/).length;
    await verify('12a4');
    ok(tag + 'bad code format -> auth.code.badCode, nothing sent', (await cerr()) === tr('auth.code.badCode') && fake.calls(/verify/).length === nVer);
    await verify('000000');
    ok(tag + 'wrong code (403 otp_expired) -> auth.code.wrongCode', (await cerr()) === tr('auth.code.wrongCode'));
    fake.fail('POST', '/auth/v1/verify', 429, { code: 429, error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }); await verify('111111');
    ok(tag + 'verify 429 -> auth.code.rateLimit', (await cerr()) === tr('auth.code.rateLimit'));
    fake.fail('POST', '/auth/v1/verify', 'abort'); await verify('111111');
    ok(tag + 'verify network error (online) -> auth.login.netOrRate', (await cerr()) === tr('auth.login.netOrRate'));
    const first = fake.codeOf('oyuncu@example.com');
    await T.p.waitForFunction(() => !document.querySelector('[data-test=code-resend]').disabled, null, { timeout: 5000 });
    ok(tag + 'after the wait: "Kodu tekrar gönder" enabled', (await T.S(() => document.querySelector('[data-test=code-resend]').textContent)) === tr('auth.code.resend'));
    fake.fail('POST', '/auth/v1/otp', 429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'wait' }); await T.tap('[data-test=code-resend]'); await T.p.waitForTimeout(200);
    ok(tag + 'resend refused (429) -> auth.login.rateLimit on the code screen, button usable again', (await cerr()) === tr('auth.login.rateLimit') && !(await T.S(() => document.querySelector('[data-test=code-resend]').disabled)));
    await T.tap('[data-test=code-resend]'); await T.p.waitForTimeout(250);
    const R = await T.S(() => ({ note: document.querySelector('[data-test=code-note]').textContent, dis: document.querySelector('[data-test=code-resend]').disabled }));
    ok(tag + '"Kodu tekrar gönder": new code sent, "Yeni kodu gönderdik." + countdown again', R.note === tr('auth.code.resent') && R.dis && fake.codeOf('oyuncu@example.com') !== first, JSON.stringify(R));
    if (first !== fake.codeOf('oyuncu@example.com')) { await verify(first); ok(tag + 'the old code no longer works', (await cerr()) === tr('auth.code.wrongCode')); }
    await T.tap('[data-test=code-change-email]'); await T.p.waitForSelector('[data-test=login-modal]');
    ok(tag + '"Başka adres kullan" returns to the e-mail screen with the address filled', (await T.p.inputValue('[data-test=login-email]')) === 'Oyuncu@Example.com');
    fake.forgetCodeWindow('oyuncu@example.com'); await trySend('Oyuncu@Example.com'); await T.p.waitForSelector('[data-test=code-modal]');
    const local0 = JSON.parse(await localSave(T));
    await verify(fake.codeOf('oyuncu@example.com')); await T.p.waitForSelector('[data-test=code-modal]', { state: 'detached' }); await idle(T);
    const row = fake.rowFor('oyuncu@example.com');
    ok(tag + 'rule 1: cloud empty -> device save uploaded (revision 1, device masaustu), toast sync.uploaded', await waitToast(T, tr('sync.uploaded')) && row && row.revision === 1 && row.device === 'masaustu' && row.data.char.channel === 'Giriş Kanalı' && row.data.stats.videos === local0.stats.videos, JSON.stringify(row && { rev: row.revision, dev: row.device }));
    const w = fake.calls(/fenomen_saves/);
    ok(tag + 'cloud requests carry apikey + the player token; only own row (user_id filter)', w.every((x) => x.apikey === FAKE_KEY && /^Bearer at-/.test(x.auth || '')) && w.filter((x) => x.method === 'GET').every((x) => x.search.includes('user_id=eq.' + fake.userId('oyuncu@example.com'))));
    await openSettings(T);
    const S1 = await T.S(() => ({ who: document.querySelector('[data-test=account-signed-in]').textContent, st: document.querySelector('[data-test=account-status]').textContent }));
    ok(tag + 'Settings signed in: "{email} ile giriş yaptın." + "Buluta kaydedildi · hh:mm"', S1.who === tr('account.signedIn', { email: 'oyuncu@example.com' }) && /^Buluta kaydedildi · \d\d:\d\d$/.test(S1.st), JSON.stringify(S1));
    const tel = await T.S(() => window.__fenomen.tel.transport.sent || []);
    ok(tag + 'counter payloads unchanged by the login (4 fields, no e-mail / account id)', tel.every((x) => JSON.stringify(Object.keys(x)) === '["event","version","device_class","play_bucket"]') && !JSON.stringify(tel).includes('example.com') && !JSON.stringify(tel).includes(fake.userId('oyuncu@example.com')));
    // periodic push + push when hidden: only when the save changed
    await T.S(() => window.__fenomen.ui.closeModal());
    await publishMini(T); const W = /POST \/rest\/v1\/fenomen_saves/, nW = fake.calls(W).length;
    // freeze the game loop first: a 250 ms tick between this push and the next one changes the save (money, playSec),
    // and then the second push rightly writes -> that was the flaky "nothing changed" check
    await T.S(() => { window.__fenomen.ctrl.stop(); window.__fenomen.ctrl.save(); });
    await sync(T, 'push'); await idle(T);
    const r2 = fake.rowFor('oyuncu@example.com');
    ok(tag + 'push after new progress: upsert (on_conflict=user_id) with revision 2 = known 1 + 1', r2.revision === 2 && fake.calls(W).length === nW + 1 && fake.calls(W).pop().search.includes('on_conflict=user_id') && fake.calls(W).pop().body.revision === 2 && r2.data.stats.videos === (await state(T)).videos);
    const nW2 = fake.calls(W).length;
    await sync(T, 'push'); await idle(T);
    ok(tag + 'nothing changed since the last write: no request', fake.calls(W).length === nW2);
    await T.S(() => window.__fenomen.ctrl.start());
    await T.p.reload({ waitUntil: 'load' }); await T.p.waitForSelector('[data-test=shoot]'); await idle(T); await T.p.waitForTimeout(200);
    ok(tag + 'reload: still signed in, cloud checked once, no choice screen', (await T.S(() => window.__fenomen.account.sync.signedIn())) && (await modalTest(T)) !== 'cloud-conflict' && (await T.S(() => window.__fenomen.account.sync.status().kind)) === 'saved');
    // offline -> status + one toast, then the "online" event writes it
    await publishMini(T); await T.ctx.setOffline(true); await sync(T, 'push'); await idle(T);
    const offT = (await toasts(T)).filter((x) => x === tr('sync.offline')).length; await sync(T, 'push'); await idle(T);
    ok(tag + 'offline: status "İnternet yok…", toast once per episode, device save kept', offT === 1 && (await toasts(T)).filter((x) => x === tr('sync.offline')).length === 1 && (await T.S(() => window.__fenomen.account.sync.status().kind)) === 'offline');
    await T.ctx.setOffline(false); await T.p.waitForTimeout(400); await idle(T);
    ok(tag + 'back online: the waiting progress is written', fake.rowFor('oyuncu@example.com').data.stats.videos === (await state(T)).videos && (await T.S(() => window.__fenomen.account.sync.status().kind)) === 'saved');
    fake.fail('POST', '/rest/v1/fenomen_saves', 'abort'); await publishMini(T); await sync(T, 'push'); await idle(T);
    ok(tag + 'server unreachable: sync.unreachable toast + status', (await waitToast(T, tr('sync.unreachable'))) && (await T.S(() => window.__fenomen.account.sync.status().kind)) === 'unreachable');
    await done(T, 'giriş');
  }

  // ---- B2: write right away: a published video (debounced, coalesced), page hidden / pagehide (keepalive); 60 s kept
  if (want('v22-B2')) {
    const fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('anında');
    const T = await dev(fake, { cfg: cfgFor({ cloudPushDelayMs: 400, cloudPushGapMs: 2500 }) });
    await create(T, 'Anında Kanal'); await publishMini(T); await login(T, fake, 'aninda@example.com'); await idle(T);
    // deterministic: no fixed sleeps decide a result. Gap/delay are lower bounds checked on the page's own clock
    // (sync.lastWrite() = start of each write), "nothing more will come" = no write scheduled (sync.soonPending()).
    // 2 ms slack = Date.now() rounding only (not network time).
    const W = /POST \/rest\/v1\/fenomen_saves/, rev = () => fake.rowFor('aninda@example.com').revision;
    const writes = () => fake.calls(W), lastAt = () => T.S(() => window.__fenomen.account.sync.lastWrite()), GAP = 2500 - 2, DELAY = 400 - 2;
    const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await T.p.waitForTimeout(50); } return false; };
    const pending = () => T.S(() => window.__fenomen.account.sync.soonPending());
    const n0 = writes().length, r0 = rev(), loginAt = await lastAt();
    await publishMini(T);
    const w1 = await until(() => writes().length === n0 + 1); await idle(T);
    ok(tag + 'video published: written without waiting for the 60 s write (one upsert, revision + 1, >= 2.5 s after the login write), nothing else scheduled',
      w1 && rev() === r0 + 1 && (await lastAt()) - loginAt >= GAP && !(await pending()) && writes().length === n0 + 1, JSON.stringify({ n: writes().length - n0, gap: (await lastAt()) - loginAt }));
    // five publishes back to back (as the manager can do) -> one request
    const n1 = writes().length, prevAt = await lastAt();
    const [p5, tBurst] = await T.S(() => { const f = window.__fenomen; for (let i = 0; i < 5; i++) { f.ctrl.state.followers += 10; f.ctrl.emit('published', { auto: true }); } return [f.account.sync.soonPending(), Date.now()]; });
    const w2 = await until(() => writes().length === n1 + 1); await idle(T);
    ok(tag + '5 publishes in a row -> 1 write (>= 0.4 s after them, >= 2.5 s after the previous write), then nothing scheduled',
      p5 && w2 && (await lastAt()) - tBurst >= DELAY && (await lastAt()) - prevAt >= GAP && !(await pending()) && writes().length === n1 + 1, JSON.stringify({ n: writes().length - n1, afterBurst: (await lastAt()) - tBurst, gap: (await lastAt()) - prevAt }));
    // right after a write: held back until the gap is over, then written once
    const at2 = await lastAt();
    const p1 = await T.S(() => { const f = window.__fenomen; f.ctrl.state.followers += 10; f.ctrl.emit('published', { auto: true }); return f.account.sync.soonPending(); });
    const w3 = await until(() => writes().length === n1 + 2); await idle(T);
    ok(tag + 'a publish right after a write waits for the gap (>= 2.5 s after that write), then 1 write', p1 && w3 && (await lastAt()) - at2 >= GAP && !(await pending()) && writes().length === n1 + 2, JSON.stringify({ gap: (await lastAt()) - at2 }));
    // page hidden: the write starts in the same task (no delay); pagehide right after: nothing new -> no request
    const n2 = writes().length;
    await T.S(() => window.__fenomen.ctrl.emit('published', { auto: true }));   // a scheduled write is replaced by the flush
    const H = await T.S(() => { window.__fenomen.ctrl.state.followers += 77; Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); const s = window.__fenomen.account.sync; return { busy: s.busy(), pending: s.soonPending() }; });
    await T.S(() => { window.dispatchEvent(new Event('pagehide')); }); await idle(T);
    ok(tag + 'page hidden: written at once (keepalive path, scheduled write cancelled); pagehide right after: no second request', H.busy && !H.pending && writes().length === n2 + 1 && Math.floor(fake.rowFor('aninda@example.com').data.followers) === (await state(T)).followers, JSON.stringify({ ...H, n: writes().length - n2 }));
    await T.S(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    const n3 = writes().length;
    const PH = await T.S(() => { window.__fenomen.ctrl.state.followers += 5; window.dispatchEvent(new Event('pagehide')); return window.__fenomen.account.sync.busy(); }); await idle(T);
    ok(tag + 'pagehide alone (tab closed): written at once', PH && writes().length === n3 + 1);
    await done(T, 'anında');
  }

  // ---- C: rule 2 (first video not published here -> cloud save loaded, no backup); D: rule 3 conflict at 568x320
  const seedCloud = async (fake, email) => {   // "device A": desktop with progress, signed in -> cloud row (rule 1)
    const A = await dev(fake);
    await create(A, 'Bulut Kanalı'); await publishMini(A); await publishMini(A); await set(A, { followers: 4321, money: 12345, sales: 2, fame: 120 });
    await login(A, fake, email); await idle(A);
    const up = !!fake.rowFor(email) && fake.rowFor(email).data.char.channel === 'Bulut Kanalı';
    await done(A, 'bulut A'); return up;
  };
  if (want('v22-C')) {
    const tag = tagOf('kural 2'), shared = createFakeSupabase({ resendSec: 0 });
    ok(tag + 'device A uploads (rule 1)', await seedCloud(shared, 'iki@example.com'));
    const B = await dev(shared, { vw: 390, vh: 844, mobile: true });
    await create(B, 'Yeni Cihaz');
    await login(B, shared, 'iki@example.com'); await idle(B);
    const st = await state(B);
    ok(tag + 'device B without a published video: cloud save loaded, toast "Buluttaki kaydın yüklendi.", no choice screen', (await waitToast(B, tr('sync.cloudLoaded'))) && st.channel === 'Bulut Kanalı' && st.followers >= 4321 && (await modalTest(B)) !== 'cloud-conflict', JSON.stringify(st));
    ok(tag + 'no backup of the replaced device save (fenomen_save_backup empty), no keep window', !(await B.S(() => localStorage.getItem('fenomen_save_backup'))) && !(await B.p.$('[data-test=keep-modal]')));
    await done(B, 'kural 2 B');
  }
  if (want('v22-C')) for (const [vw, vh, mobile] of [[568, 320, true], [1280, 800, false]]) {   // rule 3 belongs to block C (SECTIONS)
    const tag = tagOf('kural 3 ' + vw + 'x' + vh), shared = createFakeSupabase({ resendSec: 0 });
    await seedCloud(shared, 'iki@example.com');
    const C = await dev(shared, { vw, vh, mobile });
    await create(C, 'Üçüncü Cihaz', 'oyun'); await publishMini(C); await set(C, { followers: 999, money: 50, sales: 0, fame: 5 });
    const cloudBefore = JSON.stringify(shared.rowFor('iki@example.com'));
    await login(C, shared, 'iki@example.com');
    await C.p.waitForSelector('[data-test=cloud-conflict]', { timeout: 8000 });
    const K = await C.S(() => { const q = (s) => document.querySelector('[data-test=' + s + ']'); const tx = (s) => (q(s) || {}).textContent || null;
      const lines = (s) => { const el = q(s); const lh = parseFloat(getComputedStyle(el).lineHeight) || 16; return Math.round(el.getBoundingClientRect().height / lh); };
      const split = (s) => { const sp = [...q(s).querySelectorAll('.half')]; const lh = parseFloat(getComputedStyle(q(s)).lineHeight) || 16; return { parts: sp.length, onePerSpan: sp.every((x) => new Set([...x.getClientRects()].map((r) => Math.round(r.top))).size === 1), wrappedAtMark: sp.length === 2 && sp[1].getBoundingClientRect().top > sp[0].getBoundingClientRect().top + 2 }; };
      const box = document.querySelector('[data-test=cloud-conflict]');
      return { title: box.querySelector('h2').textContent, body: tx('cloud-conflict-body'), cloudHead: q('conflict-cloud').querySelector('.choice-head').textContent, devHead: q('conflict-device').querySelector('.choice-head').textContent,
        cm: tx('conflict-cloud-meta'), dm: tx('conflict-device-meta'), cl: tx('conflict-cloud-last'), dl: tx('conflict-device-last'), rec: [...document.querySelectorAll('[data-test=conflict-recommended]')].map((x) => x.closest('.choice-card').getAttribute('data-test')),
        recText: tx('conflict-recommended'), cmLines: lines('conflict-cloud-meta'), dmLines: lines('conflict-device-meta'), cmSplit: split('conflict-cloud-meta'), dmSplit: split('conflict-device-meta'),
        hScroll: box.scrollWidth > box.clientWidth + 1, sideBySide: q('conflict-cloud').getBoundingClientRect().top === q('conflict-device').getBoundingClientRect().top,
        useCloud: tx('use-cloud'), useDevice: tx('use-device'), dismiss: (() => { document.querySelector('.modal-wrap') && document.querySelector('.modal-wrap').click(); return !!document.querySelector('[data-test=cloud-conflict]'); })() }; });
    const reMeta = /^[\d.,]+([\s\u00a0][A-Za-zçğıöşüÇĞİÖŞÜ]+\.?)? takipçi · [\d.,]+([\s\u00a0][A-Za-zçğıöşüÇĞİÖŞÜ]+\.?)? ¤ · [\d.,]+ Şöhret · \d+ satış$/;
    ok(tag + 'choice screen: title + body (rule 3), two columns side by side with header, meta, metaLast, button', K.title === tr('sync.conflict.title') && K.body === tr('sync.conflict.body') && K.cloudHead === tr('sync.conflict.optCloud') && K.devHead === tr('sync.conflict.optDevice') && K.sideBySide && K.useCloud === tr('sync.conflict.useCloud') && K.useDevice === tr('sync.conflict.useDevice'), JSON.stringify(K));
    ok(tag + 'meta "{f} takipçi · {v} ¤ · {n} Şöhret · {k} satış" in both columns', reMeta.test(K.cm) && reMeta.test(K.dm) && K.cm.endsWith('2 satış') && K.dm.endsWith('0 satış'), K.cm + ' | ' + K.dm);
    ok(tag + 'metaLast "{c} · {d}": device type + short date/time', /^Masaüstü · \d{1,2} \S+ \d\d:\d\d$/.test(K.cl) && new RegExp('^' + (mobile ? 'Mobil' : 'Masaüstü') + ' · \\d{1,2} \\S+ \\d\\d:\\d\\d$').test(K.dl), K.cl + ' | ' + K.dl);
    ok(tag + '"Önerilen" only on the more advanced save (cloud: 2 sales vs 0)', JSON.stringify(K.rec) === '["conflict-cloud"]' && K.recText === tr('sync.conflict.recommended'), JSON.stringify(K.rec));
    ok(tag + 'meta at most 2 lines; when it wraps, it wraps right after "¤"; no horizontal scroll', K.cmLines <= 2 && K.dmLines <= 2 && K.cmSplit.parts === 2 && K.cmSplit.onePerSpan && K.dmSplit.onePerSpan && (K.cmLines === 1 || K.cmSplit.wrappedAtMark) && (K.dmLines === 1 || K.dmSplit.wrappedAtMark) && !K.hScroll, JSON.stringify({ c: [K.cmLines, K.cmSplit], d: [K.dmLines, K.dmSplit] }));
    ok(tag + 'not dismissable by tapping outside', K.dismiss);
    const bt = { cloud: await clearAt(C, '[data-test=use-cloud]'), device: await clearAt(C, '[data-test=use-device]') };
    const cw = await C.S(() => { const g = document.querySelector('.choice-grid').getBoundingClientRect(), a = document.querySelector('[data-test=conflict-cloud]').getBoundingClientRect(), b = document.querySelector('[data-test=conflict-device]').getBoundingClientRect(); return { g: g.width, a: a.width, b: b.width }; });
    ok(tag + 'both buttons fully visible and topmost (5 points), columns equal width, buttons fill their column', bt.cloud.top && bt.cloud.inView && bt.device.top && bt.device.inView && Math.abs(cw.a - cw.b) < 2 && bt.cloud.w >= cw.a - 24 && bt.device.w >= cw.b - 24, JSON.stringify({ bt, cw }));
    ok(tag + 'nothing written while the choice is open', JSON.stringify(shared.rowFor('iki@example.com')) === cloudBefore);
    await C.S(() => document.querySelector('.modal').scrollTop = 0);
    await shot(C, 'conflict-' + vw + 'x' + vh);
    if (vw === 568) {
      const mine = await localSave(C);
      await C.tap('[data-test=use-device]'); await C.p.waitForSelector('[data-test=keep-modal]');
      const KP = await C.S(() => ({ h: document.querySelector('[data-test=keep-modal] h2').textContent, p: document.querySelector('[data-test=keep-modal] p').textContent }));
      await C.p.waitForFunction(() => document.querySelector('[data-test=keep-code]').value.length > 20);
      const code = await C.S(() => document.querySelector('[data-test=keep-code]').value);
      await shot(C, 'keep-568x320');
      const kb = { copy: await clearAt(C, '[data-test=keep-copy]'), cont: await clearAt(C, '[data-test=keep-continue]') };
      await C.tap('[data-test=keep-copy]'); await C.p.waitForTimeout(150);
      ok(tag + 'after the choice: keep window once (keepTitle/keepBody), code of the cloud save, "Kodu kopyala" -> "Kod kopyalandı"', KP.h === tr('sync.conflict.keepTitle') && KP.p === tr('sync.conflict.keepBody') && code.length > 20 && (await C.S(() => document.querySelector('[data-test=keep-copy]').textContent)) === tr('sync.conflict.keepCopied') && kb.copy.top && kb.cont.top && kb.copy.inView && kb.cont.inView, JSON.stringify(kb));
      await C.tap('[data-test=keep-continue]'); await idle(C);
      const row = shared.rowFor('iki@example.com');
      ok(tag + '"Bu cihazdakini seç": cloud overwritten with the device save (revision + 1), device save unchanged, no local backup', row.data.char.channel === 'Üçüncü Cihaz' && row.revision === JSON.parse(cloudBefore).revision + 1 && JSON.parse(await localSave(C)).char.channel === 'Üçüncü Cihaz' && !(await C.S(() => localStorage.getItem('fenomen_save_backup'))), 'rev ' + row.revision);
      ok(tag + 'keep window shown only once', !(await C.p.$('[data-test=keep-modal]')) && (await modalTest(C)) !== 'cloud-conflict');
      await C.p.reload({ waitUntil: 'load' }); await C.p.waitForSelector('[data-test=shoot]'); await idle(C);
      ok(tag + 'reload after the choice: no new choice screen', !(await C.p.$('[data-test=cloud-conflict]')) && (await state(C)).channel === 'Üçüncü Cihaz');
      void mine;
    } else {
      await C.tap('[data-test=use-cloud]'); await C.p.waitForSelector('[data-test=keep-modal]');
      const KP = await C.S(() => document.querySelector('[data-test=keep-modal] h2').textContent);
      await C.p.waitForFunction(() => document.querySelector('[data-test=keep-code]').value.length > 20);
      await C.tap('[data-test=keep-continue]'); await idle(C);
      ok(tag + '"Buluttakini seç": keep window for the device save, then the cloud save is loaded here, cloud unchanged, no local backup', KP === tr('sync.conflict.keepTitle') && (await state(C)).channel === 'Bulut Kanalı' && JSON.stringify(shared.rowFor('iki@example.com')) === cloudBefore && !(await C.S(() => localStorage.getItem('fenomen_save_backup'))));
    }
    await done(C, 'kural 3 ' + vw + 'x' + vh);
  }

  // ---- C2: end to end, new device: create a character, sign in -> the cloud save is loaded, never a choice screen
  if (want('v22-C2')) {
    const tag = tagOf('yeni cihaz'), shared = createFakeSupabase({ resendSec: 0 });
    ok(tag + 'device A (desktop) has progress in the cloud', await seedCloud(shared, 'yeni@example.com'));
    const cloud = shared.rowFor('yeni@example.com');
    const N = await dev(shared, { vw: 360, vh: 640, mobile: true });
    ok(tag + 'new device: empty storage, character creation shown', !(await localSave(N)) && !!(await N.p.waitForSelector('[data-test=creator]')));
    // watch the whole time: did a choice or keep window ever show up?
    await N.S(() => { window.__seen = []; new MutationObserver(() => { for (const s of ['cloud-conflict', 'keep-modal', 'keep-reset']) if (document.querySelector('[data-test=' + s + ']') && !window.__seen.includes(s)) window.__seen.push(s); }).observe(document.body, { childList: true, subtree: true }); });
    await create(N, 'Yepyeni');
    const before = shared.log.length;
    await login(N, shared, 'yeni@example.com'); await idle(N);
    const st = await state(N), mine = shared.log.slice(before).filter((x) => /fenomen_saves/.test(x.path));
    ok(tag + 'signed in: cloud save loaded (channel, videos, followers), toast "Buluttaki kaydın yüklendi."', st.channel === 'Bulut Kanalı' && st.videos === cloud.data.stats.videos && st.followers >= Math.floor(cloud.data.followers) && (await waitToast(N, tr('sync.cloudLoaded'))), JSON.stringify(st));
    ok(tag + 'no choice screen and no keep window at any time', JSON.stringify(await N.S(() => window.__seen)) === '[]');
    ok(tag + 'the new device only read the cloud (GET), wrote nothing; cloud unchanged', mine.length > 0 && mine.every((x) => x.method === 'GET') && JSON.stringify(shared.rowFor('yeni@example.com')) === JSON.stringify(cloud), mine.map((x) => x.method).join(','));
    ok(tag + 'the device knows the cloud revision (next write = revision + 1)', (await N.S(() => JSON.parse(localStorage.getItem('fenomen_cloud_sync')).revision)) === cloud.revision);
    await N.p.reload({ waitUntil: 'load' }); await idle(N); await N.p.waitForTimeout(300);
    ok(tag + 'reload: still the cloud save, no choice screen', (await state(N)).channel === 'Bulut Kanalı' && !(await N.p.$('[data-test=cloud-conflict]')));
    await done(N, 'yeni cihaz');
  }

  // ---- E: rule 4 (a write is refused during play) + F: reset on another device + reset signed in
  if (want('v22-E')) {
    const fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('kural 4');
    const A = await dev(fake), B = await dev(fake, { vw: 390, vh: 844, mobile: true });
    await create(A, 'Dört Kanal'); await publishMini(A); await login(A, fake, 'dort@example.com'); await idle(A);
    await create(B, 'B Cihaz'); await login(B, fake, 'dort@example.com'); await idle(B);
    ok(tag + 'both devices on the same cloud save', (await state(B)).channel === 'Dört Kanal');
    // B idles (no new actions), A plays and writes -> B loads silently on its next sync
    await publishMini(A); await sync(A, 'push'); await idle(A);
    await sync(B, 'push'); await idle(B);
    ok(tag + 'nothing new on B: the newer cloud save is loaded (toast cloudLoaded), no choice screen', (await state(B)).videos === (await state(A)).videos && !(await B.p.$('[data-test=cloud-conflict]')) && (await waitToast(B, tr('sync.cloudLoaded'))));
    // both play: A writes first, B's write is refused -> choice screen with bodyNewer
    await publishMini(A); await sync(A, 'push'); await idle(A);
    await set(B, { sales: 3 }); await publishMini(B); const revA = fake.rowFor('dort@example.com').revision;
    await sync(B, 'push');
    await B.p.waitForSelector('[data-test=cloud-conflict]', { timeout: 8000 });
    ok(tag + 'B refused (409 PT409 stale_revision) -> choice screen with "bodyNewer", "Önerilen" on B (3 sales)', (await B.S(() => document.querySelector('[data-test=cloud-conflict-body]').textContent)) === tr('sync.conflict.bodyNewer') && fake.calls(/POST \/rest\/v1\/fenomen_saves/).some((x) => x.auth) && JSON.stringify(await B.S(() => [...document.querySelectorAll('[data-test=conflict-recommended]')].map((x) => x.closest('.choice-card').getAttribute('data-test')))) === '["conflict-device"]' && fake.rowFor('dort@example.com').revision === revA);
    {
      const posts = fake.calls(/POST \/rest\/v1\/fenomen_saves/), lp = posts[posts.length - 1], row = fake.rowFor('dort@example.com');
      const aVideos = (await state(A)).videos;
      ok(tag + '409 explicit: B wrote with its old revision (+1 = ' + revA + ', server already ' + revA + ') -> refused; the cloud still holds A\'s save; no other write from B while the choice is open',
        lp.body.revision === revA && row.revision === revA && row.data.stats.videos === aVideos && row.data.meta.sales !== 3 && posts.filter((x) => x.body && x.body.data && x.body.data.meta && x.body.data.meta.sales === 3).length === 1,
        JSON.stringify({ sent: lp.body.revision, server: row.revision }));
    }
    await B.tap('[data-test=use-cloud]'); await B.p.waitForSelector('[data-test=keep-modal]'); await B.tap('[data-test=keep-continue]'); await idle(B);
    ok(tag + '"Buluttakini seç" on B: A\'s save loaded, cloud untouched', (await state(B)).videos === (await state(A)).videos && (await state(B)).sales === 0 && fake.rowFor('dort@example.com').revision === revA);

    // ---- F1: reset signed in on A (backup note, RPC with the known revision), failure first
    const tf = tagOf('sıfırlama');
    await openSettings(A); await A.tap('[data-test=reset]'); await A.p.waitForSelector('[data-test=reset-signed-in]');
    const RS = await A.S(() => ({ t: document.querySelector('[data-test=reset-signed-in] p').textContent, n: document.querySelector('[data-test=reset-backup-note]').textContent }));
    ok(tf + 'signed in: "Tüm ilerleme bu cihazdan ve buluttan silinecek." + backup note with {n}=30', RS.t === tr('reset.confirmSignedIn') && RS.n === tr('reset.backupNote', { n: 30 }), JSON.stringify(RS));
    const beforeReset = await localSave(A);
    fake.fail('POST', '/rest/v1/rpc/fenomen_reset_save', 500, { code: 'XX000', message: 'boom' });
    await A.tap('[data-test=reset-yes]'); await A.p.waitForTimeout(300); await idle(A);
    ok(tf + 'RPC failed: "Kayıt şu an sıfırlanamadı…", nothing reset here', (await A.S(() => document.querySelector('[data-test=reset-error]').textContent)) === tr('reset.failed') && (await localSave(A)) !== null && JSON.parse(await localSave(A)).char.channel === 'Dört Kanal' && fake.backups.length === 0);
    void beforeReset;
    // 409 PT409 on the RPC (another device moved on): dialog closes, pull again (CONTRACT §3), nothing reset here
    const pullsBefore = fake.calls(/GET \/rest\/v1\/fenomen_saves/).length;
    fake.fail('POST', '/rest/v1/rpc/fenomen_reset_save', 409, { code: 'PT409', message: 'stale_revision' });
    await A.tap('[data-test=reset-yes]'); await A.p.waitForSelector('[data-test=reset-signed-in]', { state: 'detached' }); await idle(A); await A.p.waitForTimeout(200);
    ok(tf + 'RPC 409 stale_revision: dialog closes, cloud pulled again, nothing reset here', fake.calls(/GET \/rest\/v1\/fenomen_saves/).length > pullsBefore && JSON.parse(await localSave(A)).char.channel === 'Dört Kanal' && fake.backups.length === 0);
    await openSettings(A); await A.tap('[data-test=reset]'); await A.p.waitForSelector('[data-test=reset-signed-in]');
    // B has unsynced progress when A resets
    await publishMini(B); await set(B, { followers: 77777 });
    const revBefore = fake.rowFor('dort@example.com').revision;
    await A.tap('[data-test=reset-yes]'); await A.p.waitForSelector('[data-test=reset-signed-in]', { state: 'detached' }); await idle(A);
    const rc = fake.calls(/rpc\/fenomen_reset_save/).pop();
    ok(tf + '"Evet": fenomen_reset_save(p_data new game, p_expected_revision = known) -> 30-day backup on the server, new game here', rc.body.p_expected_revision === revBefore && rc.body.p_data && !rc.body.p_data.created && fake.backups.length === 1 && fake.rowFor('dort@example.com').revision === revBefore + 1 && (await A.p.waitForSelector('[data-test=creator]').then(() => true)), JSON.stringify({ exp: rc.body.p_expected_revision, revBefore }));
    await B.S(() => { window.__fenomen.ctrl.save(); });
    await sync(B, 'push');
    await B.p.waitForSelector('[data-test=keep-reset]', { timeout: 8000 });
    const KR = await B.S(() => ({ h: document.querySelector('[data-test=keep-reset] h2').textContent, p: document.querySelector('[data-test=keep-reset] p').textContent }));
    ok(tf + 'B with unsynced progress: keep window (keepTitleReset/keepBodyReset) first, no choice screen', KR.h === tr('sync.conflict.keepTitleReset') && KR.p === tr('sync.conflict.keepBodyReset') && !(await B.p.$('[data-test=cloud-conflict]')));
    await B.p.waitForFunction(() => document.querySelector('[data-test=keep-code]').value.length > 20);
    await B.tap('[data-test=keep-continue]'); await idle(B);
    const rowAfter = fake.rowFor('dort@example.com');
    ok(tf + 'then the reset save is loaded + "reset.otherDevice"; B did not overwrite the reset', (await waitToast(B, tr('reset.otherDevice'))) && !(await state(B)).created && rowAfter.revision === revBefore + 1 && !rowAfter.data.created && !(await B.p.$('[data-test=cloud-conflict]')) && !(await B.p.$('[data-test=keep-reset]')));
    // second reset from B, A has nothing unsynced -> A: no keep window, toast only
    await create(B, 'Sonra B'); await sync(B, 'push'); await idle(B);
    await A.p.reload({ waitUntil: 'load' }); await idle(A); await A.p.waitForTimeout(300);
    ok(tf + 'A (no own progress) follows B\'s new save silently', (await state(A)).channel === 'Sonra B');
    await openSettings(B); await B.tap('[data-test=reset]'); await B.tap('[data-test=reset-yes]'); await B.p.waitForSelector('[data-test=reset-signed-in]', { state: 'detached' }); await idle(B);
    await sync(A, 'push'); await idle(A); await A.p.waitForTimeout(200);
    ok(tf + 'A without unsynced progress: no keep window, reset save loaded + "reset.otherDevice"', !(await A.p.$('[data-test=keep-reset]')) && (await waitToast(A, tr('reset.otherDevice'))) && !(await state(A)).created && fake.backups.length === 2);
    ok(tf + 'the player never lists or restores backups (no list/restore RPC calls)', fake.calls(/list_save_backups|restore/).length === 0);
    await done(A, 'kural 4 A'); await done(B, 'kural 4 B');
  }

  // ---- G: logout keeps the device save; H: delete account (failure, then success) keeps the device save
  if (want('v22-G')) {
    const fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('çıkış');
    const T = await dev(fake);
    await create(T, 'Çıkış Kanal'); await publishMini(T); await login(T, fake, 'cikis@example.com'); await idle(T);
    await T.S(() => { window.__fenomen.ctrl.stop(); window.__fenomen.ctrl.save(); });
    const before = await localSave(T);
    await openSettings(T); await T.tap('[data-test=account-signout]');
    ok(tag + '"Çıkış yap": toast signedOut, signed out, device save untouched', (await waitToast(T, tr('account.signedOut'))) && !(await T.S(() => window.__fenomen.account.sync.signedIn())) && (await localSave(T)) === before && !(await T.S(() => localStorage.getItem('fenomen_auth'))) && !(await T.S(() => localStorage.getItem('fenomen_cloud_sync'))));
    ok(tag + 'server session revoked (POST /auth/v1/logout)', fake.calls(/POST \/auth\/v1\/logout/).length === 1);
    await T.S(() => window.__fenomen.ctrl.start()); const n = fake.log.length; await publishMini(T); await sync(T, 'push');
    await openSettings(T);
    ok(tag + 'after logout: guest again, no cloud requests', fake.log.length === n && !!(await T.p.$('[data-test=account-signin]')));
    await T.S(() => window.__fenomen.ui.closeModal());
    await login(T, fake, 'cikis@example.com'); await idle(T); if (await T.p.$('[data-test=cloud-conflict]')) { await T.tap('[data-test=use-device]'); await T.tap('[data-test=keep-continue]'); await idle(T); }
    const td = tagOf('hesap sil');
    await T.S(() => { window.__fenomen.ctrl.stop(); window.__fenomen.ctrl.save(); }); const keep = await localSave(T);
    await openSettings(T); await T.tap('[data-test=account-delete]'); await T.p.waitForSelector('[data-test=delete-modal]');
    const D = await T.S(() => ({ h: document.querySelector('[data-test=delete-modal] h2').textContent, p: document.querySelector('[data-test=delete-modal] p').textContent, no: document.querySelector('[data-test=delete-no]').textContent, yes: document.querySelector('[data-test=delete-yes]').textContent }));
    ok(td + 'confirm: title, body, "Vazgeç" / "Evet, sil"', D.h === tr('account.delete.title') && D.p === tr('account.delete.body') && D.no === tr('account.delete.no') && D.yes === tr('account.delete.yes'));
    await shot(T, 'delete-1280x800');
    fake.fail('POST', '/rest/v1/rpc/fenomen_delete_my_account', 'abort');
    await T.tap('[data-test=delete-yes]'); await T.p.waitForTimeout(300);
    ok(td + 'failure: "Hesabın şu an silinemedi…", still signed in, device save untouched', (await T.S(() => document.querySelector('[data-test=delete-error]').textContent)) === tr('account.delete.failed') && (await T.S(() => window.__fenomen.account.sync.signedIn())) && (await localSave(T)) === keep && fake.users.size === 1);
    await T.tap('[data-test=delete-yes]'); await T.p.waitForSelector('[data-test=delete-modal]', { state: 'detached' });
    const dc = fake.calls(/fenomen_delete_my_account/).pop();
    ok(td + 'success: fenomen_delete_my_account() without parameters; account, cloud save and backups gone; toast done', JSON.stringify(dc.body) === '{}' && fake.users.size === 0 && fake.saves.size === 0 && fake.backups.length === 0 && (await waitToast(T, tr('account.delete.done'))));
    ok(td + 'device save untouched, signed out', (await localSave(T)) === keep && !(await T.S(() => window.__fenomen.account.sync.signedIn())) && !(await T.S(() => localStorage.getItem('fenomen_auth'))));
    await done(T, 'çıkış/sil');
  }

  // ---- I: the server ends the session (signed out elsewhere): notice once; delete while the session is gone: no retry
  if (want('v22-I')) {
    const fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('oturum düştü');
    const T = await dev(fake);
    await create(T, 'Düşen Oturum'); await publishMini(T); await login(T, fake, 'dusen@example.com'); await idle(T);
    await T.S(() => { window.__fenomen.ctrl.stop(); window.__fenomen.ctrl.save(); }); const keep = await localSave(T);
    ok(tag + 'the server ends every session of this account', fake.revokeSessions('dusen@example.com') > 0);
    await T.S(() => { window.__fenomen.ctrl.state.followers += 50; window.__fenomen.ctrl.save(); }); const keep2 = await localSave(T);
    await sync(T, 'push'); await idle(T);
    ok(tag + 'next write: 401, refresh refused -> toast "' + tr('account.signedOutByServer') + '"', await waitToast(T, tr('account.signedOutByServer')));
    ok(tag + 'signed out here, sync state cleared, device save kept (incl. the unsent progress)', !(await T.S(() => window.__fenomen.account.sync.signedIn())) && !(await T.S(() => localStorage.getItem('fenomen_auth'))) && !(await T.S(() => localStorage.getItem('fenomen_cloud_sync'))) && Math.floor(JSON.parse(await localSave(T)).followers) === Math.floor(JSON.parse(keep2).followers) && JSON.parse(keep2).followers > JSON.parse(keep).followers, JSON.stringify({ now: JSON.parse(await localSave(T)).followers, keep2: JSON.parse(keep2).followers, keep: JSON.parse(keep).followers }));
    ok(tag + 'the notice is shown once', (await toasts(T)).filter((x) => x === tr('account.signedOutByServer')).length === 1);
    await openSettings(T);
    ok(tag + 'Settings: guest again ("Giriş yap")', !!(await T.p.$('[data-test=account-signin]')));
    // delete: the dialog is open while the session dies
    await T.S(() => window.__fenomen.ui.closeModal());
    await login(T, fake, 'dusen@example.com'); await idle(T); if (await T.p.$('[data-test=cloud-conflict]')) { await T.tap('[data-test=use-device]'); await T.tap('[data-test=keep-continue]'); await idle(T); }
    const users = fake.users.size, saves = fake.saves.size, nT = (await toasts(T)).length;
    await openSettings(T); await T.tap('[data-test=account-delete]'); await T.p.waitForSelector('[data-test=delete-modal]');
    fake.revokeSessions('dusen@example.com');
    await T.tap('[data-test=delete-yes]'); await T.p.waitForSelector('[data-test=delete-error]:not(.hidden)', { timeout: 8000 });
    const D = await T.S(() => ({ err: document.querySelector('[data-test=delete-error]').textContent, yes: !!document.querySelector('[data-test=delete-yes]'), no: document.querySelector('[data-test=delete-no]') && !document.querySelector('[data-test=delete-no]').disabled }));
    ok(tag + 'delete with the session gone: "' + tr('account.delete.signedOut') + '" (not delete.failed), no "Evet, sil" (no retry), "Vazgeç" usable', D.err === tr('account.delete.signedOut') && !D.yes && D.no, JSON.stringify(D));
    ok(tag + 'nothing deleted on the server, signed out here, device save kept, no extra toast', fake.users.size === users && fake.saves.size === saves && !(await T.S(() => window.__fenomen.account.sync.signedIn())) && (await localSave(T)) !== null && !(await toasts(T)).slice(nT).includes(tr('account.signedOutByServer')));
    await T.tap('[data-test=delete-no]'); await T.p.waitForSelector('[data-test=delete-modal]', { state: 'detached' });
    await done(T, 'oturum düştü');
  }

  // ---- K: Cloudflare rate limit on /auth/v1/otp + /verify (10 req / 10 s per IP, 10 s block; its 429 has NO CORS header on
  // the Free plan -> the page sees a TypeError, simulated with route.abort(): Playwright's route.fulfill adds the CORS
  // header itself, so a header-less 429 cannot be faked with a route). Real brake: 5 s between code requests that went out;
  // locks: network error / our timeout 10 s, HTTP 429 Retry-After (max 120 s) or 30 s. Page clock under Playwright control
  // (fastForward), every request counted: nothing is sent while a button is locked, nothing is retried behind the player.
  if (want('v22-K')) {
    const HTML429 = '<!DOCTYPE html><html><head><title>Access denied | fenomen-api.teserix.com used Cloudflare to restrict access</title></head><body><h1>Error 1015</h1><p>You are being rate limited</p></body></html>';
    for (const [vw, vh] of [[360, 640], [568, 320]]) {
      const size = vw + 'x' + vh, fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('hız sınırı ' + size);
      const T = await dev(fake, { vw, vh, mobile: true, cfg: cfgFor({ cloudSendGapMs: 5000, cloudNetLockMs: 10000, cloudRateLockMs: 30000, cloudResendSec: 60, cloudTimeoutMs: 4000 }) });
      await create(T, 'Hız Kanalı');
      await T.p.clock.install();   // from here Date.now / setTimeout in the page move only when the test says so
      await openSettings(T); await T.tap('[data-test=account-signin]'); await T.p.waitForSelector('[data-test=login-modal]');
      const otp = () => fake.calls(/POST \/auth\/v1\/otp/).length, ver = () => fake.calls(/POST \/auth\/v1\/verify/).length;
      const btn = (sel) => T.S((q) => { const b = document.querySelector(q); return b ? { dis: b.disabled, txt: b.textContent } : null; }, sel);
      const msg = (sel) => T.S((q) => { const e = document.querySelector(q); return e && !e.classList.contains('hidden') ? e.textContent : ''; }, sel);
      const settle = (sel) => T.p.waitForFunction((q) => { const b = document.querySelector(q); return !b || !/…$/.test(b.textContent); }, sel, { timeout: 8000 });
      const run = async (ms) => { await T.p.clock.fastForward(ms); await T.p.waitForTimeout(40); };
      const press = async (sel) => { await T.S((q) => document.querySelector(q).click(), sel); await settle(sel); await T.p.waitForTimeout(50); };
      const free = (b, label) => !!b && !b.dis && b.txt === label;
      const locked = (b, label, s) => !!b && b.dis && b.txt === tr(label, { s });
      const inView = (sel) => T.S((q) => document.querySelector(q).scrollIntoView({ block: 'end' }), sel);
      const count = { send: otp, verify: ver };
      // a locked button: countdown from s, presses / Enter send nothing, 1 s before the end still locked, then free
      const cycle = async (sel, kind, countKey, idleKey, ms, form) => {
        const n = count[kind](), s = Math.ceil(ms / 1000), b0 = await btn(sel);
        await T.S(([q, f]) => { document.querySelector(q).click(); if (f) document.querySelector(f).requestSubmit(); }, [sel, form]);
        await run(ms - 1000); const b1 = await btn(sel); await run(1000); const b2 = await btn(sel);
        return { ok: locked(b0, countKey, s) && locked(b1, countKey, 1) && free(b2, tr(idleKey)) && count[kind]() === n, detail: JSON.stringify([b0, b1, b2, count[kind]() - n]) };
      };
      const LOGIN = ['[data-test=login-send]', 'send', 'auth.login.sendIn', 'auth.login.send', 0, '[data-test=login-modal] form'];
      const sendCase = async (name, prep, wantMsg, wantMs, shotName) => {
        const n0 = otp(); prep(); await press(LOGIN[0]);
        const m = await msg('[data-test=login-error]');
        if (shotName) { await inView(LOGIN[0]); await shot(T, shotName + '-' + size); }
        const c = await cycle(LOGIN[0], LOGIN[1], LOGIN[2], LOGIN[3], wantMs, LOGIN[5]);
        ok(tag + name + ' -> ' + wantMsg + ', exactly 1 request; "Kod gönder (' + Math.ceil(wantMs / 1000) + ' sn)" locked, nothing sent while locked, then free', m === tr(wantMsg) && otp() === n0 + 1 && c.ok, m + ' ' + c.detail);
      };
      await T.p.fill('[data-test=login-email]', 'hiz@example.com');

      // (c) navigator.onLine false -> the existing offline text; nothing left the device -> no 5 s gap: a real request may go at once
      let n0 = otp(); await T.ctx.setOffline(true); await press(LOGIN[0]);
      const off = await msg('[data-test=login-error]'); await T.ctx.setOffline(false);
      const offB = await btn(LOGIN[0]);
      ok(tag + '(c) navigator.onLine false -> auth.code.offline, no request, button free at once (no gap, no lock)', off === tr('auth.code.offline') && otp() === n0 && free(offB, tr('auth.login.send')) && (await T.S(() => navigator.onLine)), off + ' ' + JSON.stringify(offB));

      // (a) real HTTP 429 (CORS headers present, HTML body) -> auth.login.rateLimit + lock: Retry-After or 30 s
      await sendCase('(a) 429 right after the offline attempt, no Retry-After', () => fake.failRaw('POST', '/auth/v1/otp', 429, HTML429), 'auth.login.rateLimit', 30000, 'ratelimit');
      await sendCase('(a) 429 Retry-After: 45 (exposed)', () => fake.failRaw('POST', '/auth/v1/otp', 429, HTML429, { headers: { 'Retry-After': '45' }, expose: 'Retry-After' }), 'auth.login.rateLimit', 45000);
      const at = await T.S(() => Math.floor((Date.now() + 60000) / 1000) * 1000);   // HTTP dates have 1 s resolution: lock in (59, 60] s
      await sendCase('(a) 429 Retry-After: HTTP date (+60 s)', () => fake.failRaw('POST', '/auth/v1/otp', 429, HTML429, { headers: { 'Retry-After': new Date(at).toUTCString() }, expose: 'Retry-After' }), 'auth.login.rateLimit', 60000);
      await sendCase('(a) 429 Retry-After: 600 -> capped at 120 s', () => fake.failRaw('POST', '/auth/v1/otp', 429, HTML429, { headers: { 'Retry-After': '600' }, expose: 'Retry-After' }), 'auth.login.rateLimit', 120000);
      await sendCase('(a) 429 Retry-After: invalid ("soon") -> 30 s', () => fake.failRaw('POST', '/auth/v1/otp', 429, 'error code: 1015', { type: 'text/plain', headers: { 'Retry-After': 'soon' }, expose: 'Retry-After' }), 'auth.login.rateLimit', 30000);
      await sendCase('(a) 429 Retry-After: 45 NOT exposed (no Access-Control-Expose-Headers, unreadable for the page) -> 30 s', () => fake.failRaw('POST', '/auth/v1/otp', 429, HTML429, { headers: { 'Retry-After': '45' } }), 'auth.login.rateLimit', 30000);

      // our own timeout (cloudTimeoutMs 4 s here): auth.code.unreachable + 10 s lock
      n0 = otp(); fake.fail('POST', '/auth/v1/otp', 'hang'); await T.S((q) => document.querySelector(q).click(), LOGIN[0]);
      await T.p.waitForTimeout(100); const tB0 = await btn(LOGIN[0]);
      await run(4000); await settle(LOGIN[0]); await T.p.waitForTimeout(50);
      const tm = await msg('[data-test=login-error]');
      await inView(LOGIN[0]); await shot(T, 'timeout-' + size);
      const tc = await cycle(LOGIN[0], 'send', LOGIN[2], LOGIN[3], 10000, LOGIN[5]);
      ok(tag + 'our timeout -> auth.code.unreachable, exactly 1 request; "Kod gönder (10 sn)" locked, nothing sent while locked, then free', tB0 && tB0.dis && tB0.txt === tr('auth.login.sending') && tm === tr('auth.code.unreachable') && otp() === n0 + 1 && tc.ok, tm + ' ' + tc.detail);

      // (b) route.abort() = network error while online -> netOrRate + 10 s lock
      await sendCase('(b) login screen, network error, navigator.onLine true', () => fake.fail('POST', '/auth/v1/otp', 'abort'), 'auth.login.netOrRate', 10000, 'netorrate');

      // double press on a free button: one request; the code screen opens
      n0 = otp(); await T.S(() => { const q = document.querySelector('[data-test=login-send]'); q.click(); q.click(); document.querySelector('[data-test=login-modal] form').requestSubmit(); });
      await T.p.waitForSelector('[data-test=code-modal]');
      ok(tag + 'double press + Enter on "Kod gönder": exactly 1 request, code screen', otp() === n0 + 1);

      // code screen: verify network error -> netOrRate + "Giriş yap (10 sn)"; real 429 -> auth.code.rateLimit + 30 s
      await T.p.fill('[data-test=code-input]', '111111');
      const VER = ['[data-test=code-verify]', 'verify', 'auth.code.verifyIn', 'auth.code.verify'];
      let v0 = ver(); fake.fail('POST', '/auth/v1/verify', 'abort'); await press(VER[0]);
      const d = await msg('[data-test=code-error]');
      await inView(VER[0]); await shot(T, 'verify-netorrate-' + size);
      let c = await cycle(VER[0], VER[1], VER[2], VER[3], 10000, '[data-test=code-modal] form');
      ok(tag + '(d) code screen, verify network error -> the same auth.login.netOrRate text as the login screen, exactly 1 request; "Giriş yap (10 sn)" locked, then free', d === tr('auth.login.netOrRate') && ver() === v0 + 1 && c.ok, d + ' ' + c.detail);
      v0 = ver(); fake.failRaw('POST', '/auth/v1/verify', 429, HTML429); await press(VER[0]);
      const e = await msg('[data-test=code-error]');
      await inView(VER[0]); await shot(T, 'verify-ratelimit-' + size);
      c = await cycle(VER[0], VER[1], VER[2], VER[3], 30000, '[data-test=code-modal] form');
      ok(tag + '(d) verify HTTP 429 (HTML body) -> auth.code.rateLimit, exactly 1 request; "Giriş yap (30 sn)" locked, then free', e === tr('auth.code.rateLimit') && ver() === v0 + 1 && c.ok, e + ' ' + c.detail);
      // resend after its 60 s: network error -> netOrRate + "Kodu tekrar gönder (10 sn)"
      await run(60000); n0 = otp(); fake.fail('POST', '/auth/v1/otp', 'abort'); await press('[data-test=code-resend]');
      const r = await msg('[data-test=code-error]');
      c = await cycle('[data-test=code-resend]', 'send', 'auth.code.resendIn', 'auth.code.resend', 10000, null);
      ok(tag + '(d) resend network error -> auth.login.netOrRate, exactly 1 request; "Kodu tekrar gönder (10 sn)", then free', r === tr('auth.login.netOrRate') && otp() === n0 + 1 && c.ok, r + ' ' + c.detail);
      ok(tag + 'totals: ' + otp() + ' code requests, ' + ver() + ' verify requests (one per accepted press)', otp() === 10 && ver() === 2, otp() + '/' + ver());
      await done(T, 'hız sınırı ' + size);
    }
  }

  // ---- J: old address (github.io) = no login, "Giriş için yeni adrese geç" note; login origin only
  if (!want('v22-J')) { /* skipped */ } else if (OLD) {
    const fake = createFakeSupabase({ resendSec: 0 }), tag = tagOf('eski adres');
    const T = await dev(fake, { url: OLD, cfg: cfgFor({ oldOrigin: OLD_O, moveMode: 'banner' }) });
    await create(T, 'Eski Adres'); await openSettings(T);
    const N = await T.S(() => { const n = document.querySelector('[data-test=account-move-note]'); return n && { ps: [...n.querySelectorAll('p')].map((p) => p.textContent), link: n.querySelector('a').textContent, href: n.querySelector('a').href }; });
    ok(tag + 'Settings: moveDomain text + saveHint + "Yeni adrese git" (href = new address), no "Giriş yap"', N && N.ps[0] === tr('auth.moveDomain.text') && N.ps[1] === tr('auth.moveDomain.saveHint') && N.link === tr('auth.moveDomain.linkLabel') && N.href === BASE && !(await T.p.$('[data-test=account-signin]')), JSON.stringify(N));
    ok(tag + 'no account text link in Gizlilik, no request to the cloud', !(await T.p.$('[data-test=settings-account-details]')) && fake.log.length === 0);
    await T.S(() => document.querySelector('[data-test=account-move-note]').scrollIntoView({ block: 'center' }));
    await shot(T, 'githubio-note-1280x800');
    await done(T, 'eski adres');
    const T2 = await dev(fake, { cfg: cfgFor({ loginOrigin: 'https://fenomen.teserix.com' }) });
    await create(T2, 'Başka Köken'); await openSettings(T2);
    ok(tagOf('köken') + 'cloud configured but this is not the login address: no login, no request', !(await T2.p.$('[data-test=account-signin]')) && fake.log.length === 0);
    await done(T2, 'köken');
  } else ok(tagOf('eski adres') + 'second origin available', false, 'OLD_BASE not reachable');
}

// ---- screenshots for the report (1x): login, code, conflict, old-address note at 5 sizes
export async function shotsV22({ browser, BASE, OLD, dir }) {
  const NEW_O = new URL(BASE).origin, OLD_O = new URL(OLD).origin;
  const sizes = [[360, 640], [375, 667], [568, 320], [390, 844], [1280, 800]];
  const out = [];
  for (const [w, hh] of sizes) {
    const mobile = w < 900, name = w + 'x' + hh;
    const fake = createFakeSupabase({ resendSec: 60 });
    const cfg = { oldOrigin: OLD_O, baseUrl: BASE, moveMode: 'none', cloudUrl: FAKE_URL, cloudKey: FAKE_KEY, loginOrigin: NEW_O, cloudResendSec: 60, cloudSyncSec: 3600 };
    const mk = async (url, c) => { const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, locale: 'tr-TR', serviceWorkers: 'block' }); await ctx.route(FAKE_URL + '/**', (r) => fake.handle(r)); await ctx.addInitScript((x) => { window.__FENOMEN_CFG__ = x; }, c); await ctx.addInitScript(NOTICE_SEEN); const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'load' }); return { ctx, p }; };
    const mkChar = async (p, n) => { await p.waitForSelector('[data-test=creator]'); await p.fill('[data-test=channel-input]', n); await p.click('[data-test=creator-next]'); await p.click('[data-test=path-vlog]'); await p.click('[data-test=creator-start]'); await p.waitForSelector('[data-test=shoot]'); await p.evaluate(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); }); };
    const snap = async (p, k) => { const f = dir + '/fenomen-v22-' + k + '-' + name + '.png'; await p.evaluate(() => { const m = document.querySelector('.modal'); if (m) m.scrollTop = 0; }); await p.waitForTimeout(250); await p.screenshot({ path: f }); out.push(f); };
    // cloud side: another device's save
    { const { ctx, p } = await mk(BASE, cfg); await mkChar(p, 'Bulut Kanalı');
      await p.evaluate(() => { const s = window.__fenomen.ctrl.state; s.followers = 12480; s.money = 356000; s.meta.sales = 2; s.meta.fame = 140; s.meta.fameEarned = 260; s.stats.videos = 40; window.__fenomen.ctrl.save(); });
      await p.evaluate(() => window.__fenomen.ui.showSettings()); await p.click('[data-test=account-signin]'); await p.fill('[data-test=login-email]', 'oyuncu@example.com'); await p.click('[data-test=login-send]'); await p.waitForSelector('[data-test=code-modal]');
      await p.fill('[data-test=code-input]', fake.codeOf('oyuncu@example.com')); await p.click('[data-test=code-verify]'); await p.waitForSelector('[data-test=code-modal]', { state: 'detached' }); await p.waitForTimeout(400); await ctx.close(); }
    fake.forgetCodeWindow('oyuncu@example.com');
    { const { ctx, p } = await mk(BASE, cfg); await mkChar(p, 'Telefon Kanalı');
      await p.evaluate(() => { const s = window.__fenomen.ctrl.state; s.followers = 3150; s.money = 9800; s.meta.fame = 12; s.meta.fameEarned = 12; s.stats.videos = 9; window.__fenomen.ctrl.save(); });
      await p.evaluate(() => window.__fenomen.ui.showSettings()); await p.click('[data-test=account-signin]'); await p.waitForSelector('[data-test=login-modal]');
      await p.fill('[data-test=login-email]', 'oyuncu@example.com'); await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await snap(p, 'login');
      await p.click('[data-test=login-send]'); await p.waitForSelector('[data-test=code-modal]'); await p.evaluate(() => document.activeElement && document.activeElement.blur());
      await snap(p, 'code');
      await p.fill('[data-test=code-input]', fake.codeOf('oyuncu@example.com')); await p.click('[data-test=code-verify]');
      await p.waitForSelector('[data-test=cloud-conflict]'); await snap(p, 'conflict');
      await ctx.close(); }
    { const { ctx, p } = await mk(OLD, Object.assign({}, cfg, { moveMode: 'banner' })); await mkChar(p, 'Eski Adres');
      await p.evaluate(() => window.__fenomen.ui.showSettings()); await p.waitForSelector('[data-test=account-move-note]');
      await p.evaluate(() => { const n = document.querySelector('[data-test=account-move-note]'); const m = document.querySelector('.modal'); m.scrollTop = n.offsetTop - 60; });
      await p.waitForTimeout(250); const f = dir + '/fenomen-v22-githubio-' + name + '.png'; await p.screenshot({ path: f }); out.push(f);
      await ctx.close(); }
  }
  return out;
}
