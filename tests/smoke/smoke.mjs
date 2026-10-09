// Headless smoke test: mobile 390x844 (touch) + desktop 1280x800, against BASE (local preview or the live URL).
// Usage: BASE=http://localhost:4180/ node tests/smoke/smoke.mjs   (SHOTS=1 writes screenshots/)
// v2.1 move tests need a SECOND origin serving the same build (acts as the old github.io address):
//   OLD_BASE=http://127.0.0.1:4192/ (default: BASE with localhost <-> 127.0.0.1 swapped). The app is pointed at these
//   origins through window.__FENOMEN_CFG__ (see src/config.js), injected with an init script.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const TR = JSON.parse(fs.readFileSync(new URL('../../src/locales/tr.json', import.meta.url), 'utf8'));
const BASE = process.env.BASE || 'http://localhost:4180/';
const SHOTS = process.env.SHOTS === '1';
const exe = process.env.CHROME || '/usr/bin/google-chrome';
const results = []; let failed = 0;
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) failed++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: 'screenshots/' + name }); };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
// v1/v2 runs predate the counter notice: answer it up front so the band never covers what they tap
const NOTICE_SEEN = () => { try { if (!localStorage.getItem('fenomen_tel_notice')) localStorage.setItem('fenomen_tel_notice', '1'); } catch (e) { /* ignore */ } };
// Turkish month names (tr-TR 'long'), for expectations derived from a timestamp instead of a hard-coded month
const TR_MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const TEXT_HOOK = () => {   // record every string drawn on canvases (to check the KİRALIK layer rules)
  window.__texts = [];
  const f = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { window.__texts.push(String(s)); return f.call(this, s, ...a); };
};

async function run(kind) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' } : { viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  await ctx.addInitScript(TEXT_HOOK); await ctx.addInitScript(NOTICE_SEEN);
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  const tap = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); if (mobile) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(60); const b = await el.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click(); };
  const S = (js, arg) => p.evaluate(js, arg);
  const tag = '[' + kind + '] ';

  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForSelector('[data-test=creator]');
  ok(tag + 'html lang is tr', (await S(() => document.documentElement.lang)) === 'tr');
  ok(tag + 'title from locale', (await p.title()) === 'Fenomen: Kiralık Hayat');
  await tap(mobile ? '[data-test=body-f]' : '[data-test=body-m]');
  await tap('[data-test=skin-2]'); await tap('[data-test=hair-' + (mobile ? 2 : 5) + ']');
  await p.fill('[data-test=channel-input]', mobile ? 'Işıl Vlog' : 'Oyuncu Çağrı');
  await shot(p, (mobile ? '01-character-creator.png' : 'desktop-01-character-creator.png'));
  await tap('[data-test=creator-next]');
  ok(tag + 'eğitim is "yakında", Lüks Yaşam playable (v2)', await S(() => document.querySelector('[data-test=path-egitim]').disabled && !document.querySelector('[data-test=path-luks]').disabled));
  await tap('[data-test=path-' + (mobile ? 'vlog' : 'oyun') + ']');
  await tap('[data-test=creator-start]');
  await p.waitForSelector('[data-test=shoot]');
  ok(tag + 'tutorial starts with the shoot hint', (await S(() => document.querySelector('[data-test=tut-hint]').textContent)).includes('İlk videonu çek'));

  // --- çek -> kurgula -> yayınla
  await tap('[data-test=shoot]');
  await p.waitForSelector('[data-test=shoot-go]');
  const titles = await S(() => [...document.querySelectorAll('.title-opt:not([disabled])')].map((b) => b.textContent));
  ok(tag + 'plan titles offered', titles.length >= 2 && (mobile ? titles.some((x) => x.includes('SABAH 5 RUTİNİM')) : titles.some((x) => x.includes('24 saat aralıksız'))), titles.join(' | '));
  await tap('[data-test=shoot-go]');
  await p.waitForSelector('[data-test=edit-track]', { timeout: 8000 });
  await S(async () => { const e = window.__edit; const z = e.zones[0]; while (e.pos < (z.a + z.b) / 2) await new Promise((r) => requestAnimationFrame(r)); });
  await tap('[data-test=edit-cut]');
  await p.waitForTimeout(150);
  await shot(p, mobile ? '02-video-editing.png' : 'desktop-02-video-editing.png');
  await S(async () => { const e = window.__edit; for (const z of e.zones.slice(1)) { while (e.pos < (z.a + z.b) / 2) await new Promise((r) => requestAnimationFrame(r)); e.cut(); } });
  await p.waitForSelector('[data-test=publish-go]', { timeout: 9000 });
  const q = await S(() => document.querySelector('[data-test=quality]').textContent);
  ok(tag + 'edit quality shown and >= x1', /×(1|1,\d+)$/.test(q.replace(/\s/g, '')), q);
  await tap('[data-test=publish-go]');
  await p.waitForSelector('.video-row');
  await p.waitForTimeout(2500);
  const st1 = await S(() => { const s = window.__fenomen.ctrl.state; return { money: s.money, followers: s.followers, videos: s.stats.videos }; });
  ok(tag + 'published video earns money + followers', st1.videos === 1 && st1.money > 0 && st1.followers > 0, JSON.stringify(st1));

  // --- shop: ekipman, then rent a watch
  await S(() => { const f = window.__fenomen; f.ctrl.state.money += 3000; f.ctrl.emit('change'); });
  await tap('[data-test=tab-shop]'); await tap('[data-test=shop-tab-equip]'); await tap('[data-test=equip-camera]');
  ok(tag + 'camera upgraded', (await S(() => window.__fenomen.ctrl.state.equip.camera)) === 1);
  await tap('[data-test=shop-tab-team]'); await tap('[data-test=hire-editor]');
  ok(tag + 'editor hired', (await S(() => window.__fenomen.ctrl.state.staff.editor)) === 1);
  await tap('[data-test=shop-tab-wear]'); await tap('[data-test=wear-buy-glasses_sun_01]');
  ok(tag + 'flashy sunglasses bought + worn', (await S(() => window.__fenomen.ctrl.state.wear.worn.glasses)) === 'glasses_sun_01');
  await S(() => { const f = window.__fenomen; f.ctrl.state.money += 20000; f.ctrl.emit('change'); });
  await tap('[data-test=wear-buy-top_suit_01]'); await tap('[data-test=wear-buy-bottom_suit_01]');
  await tap('[data-test=shop-tab-luxury]'); await tap('[data-test=rent-watch_01]'); await tap('[data-test=rent-car_01]');
  ok(tag + 'watch + car rented', await S(() => { const s = window.__fenomen.ctrl.state; return s.items.watch_01?.status === 'rented' && s.items.car_01?.status === 'rented'; }));
  ok(tag + 'KİRALIK tag in shop', (await S(() => document.querySelector('[data-test=rent-tag-watch_01]')?.textContent)) === 'KİRALIK');
  await tap('[data-test=tab-closet]');
  const tagTxt = await S(() => document.querySelector('[data-test=closet-item-car_01] .rent-tag')?.textContent);
  ok(tag + 'KİRALIK tag in inventory (toLocaleUpperCase)', tagTxt === 'KİRALIK', tagTxt);
  await S(() => document.querySelector('[data-test=closet-item-watch_01]').scrollIntoView({ block: 'start' }));
  if (SHOTS) await p.waitForTimeout(3300);   // let the toasts fade
  await shot(p, mobile ? '03-rented-item-kiralik.png' : 'desktop-03-rented-item-kiralik.png');

  // --- video with rented items BEFORE İfşa: no KİRALIK drawn in the video
  await S(() => { window.__texts.length = 0; });
  await tap('[data-test=tab-studio]'); await tap('[data-test=shoot]'); await p.waitForSelector('[data-test=shoot-go]');
  const chips = await S(() => ({ w: document.querySelector('[data-test=show-watch_01]')?.classList.contains('on'), c: document.querySelector('[data-test=show-car_01]')?.classList.contains('on') }));
  if (!chips.w) await tap('[data-test=show-watch_01]');
  if (!chips.c) await tap('[data-test=show-car_01]');
  ok(tag + 'rented warning shown', !!(await p.$('[data-test=rented-warn]')));
  ok(tag + 'car title unlocked by showing the car', !(await S(() => document.querySelector('[data-test=title-t_car]').disabled)));
  await tap('[data-test=title-t_car]');
  await tap('[data-test=shoot-go]'); await p.waitForSelector('[data-test=edit-editor]', { timeout: 8000 }); await tap('[data-test=edit-editor]');
  await p.waitForSelector('[data-test=publish-go]'); await tap('[data-test=publish-go]');
  await p.waitForTimeout(400);
  ok(tag + 'no KİRALIK in videos before İfşa', !(await S(() => window.__texts.includes('KİRALIK'))));

  // --- İfşa card (forced, since it is random) + "Özür videosu çek"
  await S(() => { const f = window.__fenomen; f.ctrl.state.followers = Math.max(f.ctrl.state.followers, 12480); if (!f.ctrl.state.ifsa.pending) f.G.triggerIfsa(f.ctrl.state, ['car_01']); f.ctrl.drain(); });
  await p.waitForSelector('[data-test=ifsa-card]');
  const card = await S(() => document.querySelector('[data-test=ifsa-card]').textContent);
  ok(tag + 'İfşa card shows a plan card text', /plakas|teslim edin|Kira ödemeniz|Günlük kiralık|başka bir fenomen/.test(card), card.slice(0, 80));
  ok(tag + 'KİRALIK visible in video after İfşa', await S(() => window.__texts.includes('KİRALIK')));
  await shot(p, mobile ? '04-ifsa-card.png' : 'desktop-04-ifsa-card.png');
  const t0 = await S(() => window.__fenomen.ctrl.state.trust);
  await tap(mobile ? '[data-test=ifsa-apology]' : '[data-test=ifsa-ignore]');
  const t1 = await S(() => window.__fenomen.ctrl.state.trust);
  ok(tag + 'İfşa choice moves Güven the right way', mobile ? t1 > t0 : t1 < t0, t0 + ' -> ' + t1);
  if (mobile) {
    await tap('[data-test=shoot]'); await p.waitForSelector('[data-test=shoot-go]');
    const only = await S(() => [...document.querySelectorAll('.title-opt')].map((b) => b.textContent));
    ok(tag + 'apology video is next', only.length === 1 && only[0].includes('özür videosu'), only.join('|'));
    await tap('[data-test=shoot-cancel]');
  }

  // --- share card
  await tap('[data-test=tab-channel]'); await tap('[data-test=share-open]');
  await p.waitForSelector('[data-test=share-img]');
  const sh = await S(() => window.__lastShare);
  ok(tag + 'share card 1080x1920 with UTM link', sh.width === 1080 && sh.height === 1920 && sh.url.includes('utm_source=share') && sh.url.includes('utm_campaign=fenomen'), sh.url);
  ok(tag + 'share text drawn at runtime', await S(() => window.__texts.join(' ').includes('Sen de fenomen ol')));
  await p.waitForTimeout(300);
  await shot(p, mobile ? '05-share-card.png' : 'desktop-05-share-card.png');
  if (SHOTS && mobile) { const d = await S(() => document.querySelector('[data-test=share-img]').src); fs.writeFileSync('screenshots/05-share-card-image.png', Buffer.from(d.split(',')[1], 'base64')); }
  await p.keyboard.press('Escape');
  await S(() => { const f = window.__fenomen; f.ui.closeModal(); });

  // --- settings: language picker hidden with a single locale
  await tap('[data-test=settings-open]');
  ok(tag + 'language picker hidden (only tr ships)', !(await p.$('[data-test=lang-picker]')));
  await S(() => window.__fenomen.ui.closeModal());
  if (SHOTS) { await tap('[data-test=tab-studio]'); await p.waitForTimeout(300); await shot(p, mobile ? '06-studio.png' : 'desktop-06-studio.png'); }

  // --- hire a menajer so the welcome-back popup reports auto videos
  await S(() => { const f = window.__fenomen; f.ctrl.state.money += 5000; f.ctrl.emit('change'); });
  await tap('[data-test=tab-shop]'); await tap('[data-test=shop-tab-team]'); await tap('[data-test=hire-manager]');
  ok(tag + 'manager hired', (await S(() => window.__fenomen.ctrl.state.staff.manager)) === 1);
  // --- welcome back (offline earnings): pretend we left 2 hours ago
  await S(() => { const f = window.__fenomen; f.ctrl.save(); f.ctrl.stop(); const k = 'fenomen_save_v1'; const o = JSON.parse(localStorage.getItem(k)); o.lastSeen -= 2 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(o)); window.onpagehide = null; });
  await p.evaluate(() => { window.__noSave = true; });
  await ctx.addInitScript(() => { const k = 'fenomen_save_v1'; if (sessionStorage.getItem('shifted')) return; sessionStorage.setItem('shifted', '1'); const o = JSON.parse(localStorage.getItem(k) || 'null'); if (o) { o.lastSeen = Date.now() - 2 * 3600 * 1000; localStorage.setItem(k, JSON.stringify(o)); } });
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-test=welcome]', { timeout: 8000 });
  const wtxt = await S(() => document.querySelector('[data-test=welcome]').textContent);
  ok(tag + 'welcome-back popup after 2 h', wtxt.includes('Tekrar hoş geldin'));
  ok(tag + 'welcome.auto text (Yazı v1.0.1)', /Menajerin [\d.]+ video yükledi\./.test(wtxt), (wtxt.match(/Menajerin[^.]*\./) || [''])[0]);
  if (SHOTS && mobile) await shot(p, '07-welcome-back.png');
  await tap('[data-test=welcome-ok]');
  ok(tag + 'save survived reload (IDs)', await S(() => { const s = window.__fenomen.ctrl.state; return s.char.channel.length > 0 && s.wear.worn.glasses === 'glasses_sun_01' && s.wear.worn.top === 'top_suit_01' && s.equip.camera === 1 && s.staff.editor === 1 && (!!s.items.car_01 || s.stats.repossessed > 0); }));

  // --- offline reload via the service worker (production build only)
  const hasSw = await S(async () => { if (!('serviceWorker' in navigator)) return false; const r = await Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((res) => setTimeout(() => res(false), 8000))]); return r; });
  if (hasSw) {
    await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    if (!(await S(() => !!navigator.serviceWorker.controller))) { await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(500); }
    await ctx.setOffline(true);
    const before = errors.length;
    await p.reload({ waitUntil: 'load' });
    await p.waitForSelector('[data-test=shoot]', { timeout: 10000 }).catch(() => {});
    const offOk = await S(() => !!document.querySelector('[data-test=shoot]') && !!document.querySelector('.stage-canvas'));
    const imgsOk = await S(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
    ok(tag + 'offline reload works (SW)', offOk && imgsOk);
    ok(tag + 'no errors while offline', errors.length === before, errors.slice(before).join(' | '));
    await ctx.setOffline(false);
  } else ok(tag + 'service worker available', false);

  // --- pseudo-30: +30% text must not overflow
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push('pageerror(pseudo): ' + e.message));
  await p2.goto(BASE + '?pseudo=30', { waitUntil: 'load' });
  await p2.waitForSelector('[data-test=shoot]');
  await p2.waitForTimeout(300);
  while (await p2.$('[data-test=welcome-ok]')) { await p2.click('[data-test=welcome-ok]'); await p2.waitForTimeout(200); }
  const over = [];
  for (const tab of ['studio', 'shop', 'closet', 'channel']) {
    await p2.click('[data-test=tab-' + tab + ']');
    await p2.waitForTimeout(150);
    over.push(...await p2.evaluate((tab) => {
      const bad = []; const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) bad.push(tab + ': page scrollWidth ' + document.documentElement.scrollWidth);
      for (const el of document.querySelectorAll('.panel button, .panel .card, .hud .stat, .chip, .title-opt')) {
        const r = el.getBoundingClientRect(); if (!r.width) continue;
        if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible') bad.push(tab + ': ' + el.className + ' ' + el.scrollWidth + '>' + el.clientWidth);
        if (r.right > vw + 1 && !el.closest('.subtabs') && !el.closest('.wear-row')) bad.push(tab + ': ' + el.className + ' right ' + Math.round(r.right));
      }
      return bad;
    }, tab));
  }
  ok(tag + 'pseudo-30: no overflow', over.length === 0, over.slice(0, 5).join(' | '));
  if (SHOTS && mobile) { await p2.click('[data-test=tab-shop]'); await p2.waitForTimeout(200); await p2.screenshot({ path: 'screenshots/08-pseudo30-shop.png' }); }
  await p2.close();

  const real = errors.filter((e) => !/requestfailed: .*(favicon)/.test(e));
  ok(tag + 'no console errors/warnings', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}


// ---------------------------------------------------------------- v2: Lüks Yaşam, rented clothes, Kanalı Sat, Şöhret, sound
async function runV2(kind) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' } : { viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  await ctx.addInitScript(TEXT_HOOK); await ctx.addInitScript(NOTICE_SEEN);
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const tap = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); if (mobile) { await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(60); const b = await el.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click(); };
  const S = (js, arg) => p.evaluate(js, arg);
  const tag = '[v2 ' + kind + '] ';
  const vshot = async (name) => { if (SHOTS) { await p.waitForTimeout(250); await p.screenshot({ path: 'screenshots/v2-' + (mobile ? '' : 'desktop-') + name + '.png' }); } };
  const give = (m) => S((m) => { const f = window.__fenomen; f.ctrl.state.money += m; f.ctrl.emit('change'); }, m);
  const publishQuick = async () => {
    await tap('[data-test=tab-studio]'); await tap('[data-test=shoot]'); await p.waitForSelector('[data-test=shoot-go]');
    await tap('[data-test=shoot-go]'); await p.waitForSelector('[data-test=edit-editor]', { timeout: 8000 }); await tap('[data-test=edit-editor]');
    await p.waitForSelector('[data-test=publish-go]'); await tap('[data-test=publish-go]'); await p.waitForTimeout(300);
  };
  const create = async (name) => {
    await p.waitForSelector('[data-test=creator]');
    await p.fill('[data-test=channel-input]', name); await tap('[data-test=creator-next]');
    await tap('[data-test=path-luks]'); await tap('[data-test=creator-start]'); await p.waitForSelector('[data-test=shoot]');
  };

  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForSelector('[data-test=creator]');
  await tap('[data-test=body-f]'); await tap('[data-test=hair-3]');
  await p.fill('[data-test=channel-input]', 'Lüks Ece'); await tap('[data-test=creator-next]');
  await tap('[data-test=path-luks]');
  ok(tag + 'Lüks Yaşam selectable in the creator', await S(() => document.querySelector('[data-test=path-luks]').classList.contains('on')));
  await vshot('luks-creator');
  await tap('[data-test=creator-start]'); await p.waitForSelector('[data-test=shoot]');
  await S(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); });
  ok(tag + 'Lüks Yaşam home background', await S(() => window.__fenomen.ctrl.state.path === 'luks'));
  // sound on by default, one-tap toggle
  ok(tag + 'sound on by default (toggle says "Sesi kapat")', (await S(() => document.querySelector('[data-test=sound-toggle]').getAttribute('aria-label'))) === 'Sesi kapat');

  // --- rented clothing
  await give(12000);
  await tap('[data-test=tab-shop]'); await tap('[data-test=shop-tab-team]'); await tap('[data-test=hire-editor]');
  ok(tag + 'cash register sound on purchase', await S(() => window.__sounds.some((x) => x.name === 'cash' && !x.muted)));
  await tap('[data-test=shop-tab-wear]');
  ok(tag + 'cheap clothes are not rentable', !(await p.$('[data-test=wear-rent-top_hoodie_01]')));
  await tap('[data-test=wear-rent-top_suit_01]'); await tap('[data-test=wear-rent-glasses_sun_01]');
  ok(tag + 'suit + sunglasses rented and worn', await S(() => { const s = window.__fenomen.ctrl.state; return !!s.wear.rented.top_suit_01 && s.wear.worn.top === 'top_suit_01' && s.wear.worn.glasses === 'glasses_sun_01' && !s.wear.owned.includes('top_suit_01'); }));
  ok(tag + 'KİRALIK tag on rented clothes in shop', (await S(() => document.querySelector('[data-test=wearcard-top_suit_01] .rent-tag')?.textContent)) === 'KİRALIK');
  await tap('[data-test=tab-closet]');
  ok(tag + 'KİRALIK tag on rented clothes in closet', (await S(() => document.querySelector('[data-test=wear-top_suit_01] .rent-tag')?.textContent)) === 'KİRALIK');
  await S(() => document.querySelector('.slot-row').scrollIntoView({ block: 'start' }));
  if (SHOTS) await p.waitForTimeout(3000);
  await vshot('rented-clothes');
  // video before İfşa: no tag drawn
  await S(() => { window.__texts.length = 0; });
  await tap('[data-test=tab-studio]'); await tap('[data-test=shoot]'); await p.waitForSelector('[data-test=shoot-go]');
  ok(tag + 'rented warning also for worn rented clothes', !!(await p.$('[data-test=rented-warn]')));
  await tap('[data-test=shoot-cancel]');
  await publishQuick();
  ok(tag + 'notification sound on publish', await S(() => window.__sounds.some((x) => x.name === 'notify')));
  ok(tag + 'no KİRALIK on clothes in videos before İfşa', !(await S(() => window.__texts.includes('KİRALIK'))));
  // İfşa on clothing (forced)
  await S(() => { const f = window.__fenomen; f.ctrl.state.followers = Math.max(f.ctrl.state.followers, 9000); f.G.triggerIfsa(f.ctrl.state, ['top_suit_01']); f.ctrl.state.ifsa.pending.cardId = 'ifsa_tag'; f.ctrl.drain(); });
  await p.waitForSelector('[data-test=ifsa-card]');
  const card = await S(() => document.querySelector('[data-test=ifsa-card]').textContent);
  ok(tag + 'clothing İfşa card (Etiket ifşası)', card.includes('Etiket ifşası') && card.includes('kiralama etiketini'), card.slice(0, 90));
  ok(tag + 'İfşa alert sound', await S(() => window.__sounds.some((x) => x.name === 'ifsa')));
  ok(tag + 'KİRALIK drawn on the clothes after İfşa', await S(() => window.__texts.includes('KİRALIK')));
  await vshot('ifsa-clothes');
  await tap('[data-test=ifsa-apology]');
  await S(() => { window.__texts.length = 0; const f = window.__fenomen; f.ctrl.state.ifsa.apologyDue = false; });
  await publishQuick();
  ok(tag + 'next video with the exposed suit shows the tag', await S(() => { const s = window.__fenomen.ctrl.state; const v = s.videos[s.videos.length - 1]; return v.exposed.includes('top_suit_01') && window.__texts.includes('KİRALIK'); }));
  // buy out a rented piece clears the stigma
  await give(3000); await tap('[data-test=tab-shop]'); await tap('[data-test=shop-tab-wear]'); await tap('[data-test=wear-buy-top_suit_01]');
  ok(tag + 'buy-out rented suit -> owned, tag gone', await S(() => { const s = window.__fenomen.ctrl.state; return s.wear.owned.includes('top_suit_01') && !s.wear.rented.top_suit_01 && !document.querySelector('[data-test=wearcard-top_suit_01] .rent-tag'); }));

  // --- Kanalı Sat
  await tap('[data-test=tab-channel]');
  ok(tag + 'Kanalı Sat locked below the threshold', await S(() => document.querySelector('[data-test=sell-open]').disabled));
  await S(() => { const f = window.__fenomen; const s = f.ctrl.state; s.followers = 260000; s.stats.peakFollowers = 260000; f.ctrl.emit('change'); });
  await p.waitForSelector('[data-test=sell-gain]');
  ok(tag + 'sell preview: "Kazanacağın Şöhret: 5"', (await S(() => document.querySelector('[data-test=sell-gain]').textContent)) === 'Kazanacağın Şöhret: 5');
  await S(() => document.querySelector('[data-test=sell-card]').scrollIntoView({ block: 'start' }));
  await vshot('kanali-sat');
  await tap('[data-test=sell-open]'); await p.waitForSelector('[data-test=sell-yes]');
  await vshot('kanali-sat-onay');
  await tap('[data-test=sell-yes]');
  await p.waitForSelector('[data-test=creator]');
  ok(tag + 'sell.newAccount text (Yazı v2.0.2)', (await S(() => document.querySelector('.tagline').textContent)) === 'Yeni hesabın açıldı. Bir kariyer yolu seç.');
  ok(tag + 'after sale: creator for the new account, 5 Şöhret kept', (await S(() => document.querySelector('[data-test=creator-fame]')?.textContent)) === '5 Şöhret' && await S(() => window.__fenomen.ctrl.state.money === 0 && window.__fenomen.ctrl.state.meta.sales === 1));
  await vshot('yeni-hesap');
  await create('Lüks Ece 2');
  // --- Şöhret tree
  await S(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); });
  await tap('[data-test=tab-channel]');
  await tap('[data-test=fame-node-f_watch_01]'); await tap('[data-test=fame-node-f_editor]'); await tap('[data-test=fame-node-f_painting]');
  ok(tag + 'tree nodes bought: watch owned + editor hired now', await S(() => { const s = window.__fenomen.ctrl.state; return s.items.watch_01?.status === 'owned' && s.items.painting_01?.status === 'owned' && s.staff.editor === 1 && s.meta.fame === 1; }));
  ok(tag + 'fame.locked + f_camera texts (Yazı v2.0.2)', await S(() => document.querySelector('[data-test=fame-node-f_boat] small').textContent === 'Önce bir öncekini aç.' && document.querySelector('[data-test=fame-node-f_camera] .nn').textContent === '3. seviye kamera'));
  ok(tag + 'locked node needs the previous one', await S(() => document.querySelector('[data-test=fame-node-f_boat]').disabled && document.querySelector('[data-test=fame-node-f_boat]').classList.contains('locked')));
  ok(tag + 'channel tab is not rebuilt while followers grow (no click races)', await S(() => { const el = document.querySelector('[data-test=fame-node-f_sneaker]'); const f = window.__fenomen; const st = f.ctrl.state.stats; st.peakFollowers = 50000; f.ui.tickUpdate(); st.peakFollowers = 90000; f.ui.tickUpdate(); return el.isConnected; }));
  await S(() => document.querySelector('[data-test=fame-tree]').scrollIntoView({ block: 'start' }));
  if (SHOTS) await p.waitForTimeout(2800);
  await vshot('sohret-agaci');
  // second sale: the new account starts owning the tree items
  await S(() => { const f = window.__fenomen; const s = f.ctrl.state; s.followers = 210000; s.stats.peakFollowers = 210000; f.ctrl.emit('change'); });
  await tap('[data-test=sell-open]'); await tap('[data-test=sell-yes]');
  await create('Lüks Ece 3');
  ok(tag + 'each new account starts owning the chosen items', await S(() => { const s = window.__fenomen.ctrl.state; return s.items.watch_01?.status === 'owned' && s.items.painting_01?.status === 'owned' && s.staff.editor === 1 && s.meta.fame === 6 && s.meta.sales === 2 && s.stats.videos === 0; }));
  // --- Kiralıksız Hayat
  await give(5e6);
  await S(() => { const f = window.__fenomen; for (const id of ['sneaker_rare_01', 'car_01', 'watch_02', 'car_02', 'boat_01']) f.G.buyItem(f.ctrl.state, id); f.ctrl.state.events.length = 0; f.ctrl.emit('change'); });
  await tap('[data-test=tab-shop]'); await tap('[data-test=shop-tab-luxury]'); await tap('[data-test=buy-villa_01]');
  await p.waitForSelector('[data-test=achievement]');
  ok(tag + 'achievement "Kiralıksız Hayat" +5 Şöhret', (await S(() => document.querySelector('[data-test=achievement]').textContent)).includes('Kiralıksız Hayat') && await S(() => window.__fenomen.ctrl.state.meta.achievements.includes('rent_free') && window.__fenomen.ctrl.state.meta.fame === 11));
  await vshot('kiraliksiz-hayat');
  await tap('[data-test=achievement-ok]');

  // --- sound toggle remembered across reload
  await tap('[data-test=sound-toggle]');
  ok(tag + 'mute: one tap', (await S(() => localStorage.getItem('fenomen_sound'))) === 'off' && (await S(() => document.querySelector('[data-test=sound-toggle]').getAttribute('aria-label'))) === 'Sesi aç');
  await vshot('ses-kapali');
  await S(() => window.__fenomen.ctrl.save());
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=shoot]');
  while (await p.$('[data-test=welcome-ok]')) { await tap('[data-test=welcome-ok]'); await p.waitForTimeout(150); }
  ok(tag + 'mute remembered after reload', (await S(() => document.querySelector('[data-test=sound-toggle]').getAttribute('aria-label'))) === 'Sesi aç');
  ok(tag + 'meta survives reload', await S(() => { const m = window.__fenomen.ctrl.state.meta; return m.sales === 2 && m.unlocks.length === 3 && m.achievements.includes('rent_free'); }));
  await tap('[data-test=sound-toggle]');
  ok(tag + 'unmute: one tap', (await S(() => localStorage.getItem('fenomen_sound'))) === 'on');

  // --- v1 save migrates losslessly in the browser
  const v1 = fs.readFileSync(new URL('../fixtures/save_v1.json', import.meta.url), 'utf8');
  await ctx.addInitScript(() => { const v = sessionStorage.getItem('injectV1'); if (v) { sessionStorage.removeItem('injectV1'); localStorage.setItem('fenomen_save_v1', v); } });
  await S((v1) => sessionStorage.setItem('injectV1', v1), v1);
  await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=shoot]');
  while (await p.$('[data-test=welcome-ok]')) { await tap('[data-test=welcome-ok]'); await p.waitForTimeout(150); }
  const mig = await S((v1) => { const o = JSON.parse(v1), s = window.__fenomen.ctrl.state; return s.v === 2 && s.char.channel === o.char.channel && JSON.stringify(Object.keys(s.items).sort()) === JSON.stringify(Object.keys(o.items).sort()) && s.staff.manager === o.staff.manager && s.invest.inv_fund === o.invest.inv_fund && s.wear.worn.top === o.wear.worn.top && s.meta.fame === 0 && s.fanbox === o.fanbox; }, v1);
  ok(tag + 'v1 save loads in v2 (lossless)', mig);

  const real = errors.filter((e) => !/requestfailed: .*(favicon)/.test(e));
  ok(tag + 'no console errors/warnings', real.length === 0, real.slice(0, 5).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- v2.1: counter notice + switch, save file, move to the new address
async function secondOrigin() {
  const cands = [process.env.OLD_BASE, BASE.replace('localhost', '127.0.0.1'), BASE.replace('127.0.0.1', 'localhost')].filter((u) => u && new URL(u).origin !== new URL(BASE).origin);
  for (const u of cands) { try { const r = await fetch(u); if (r.ok) return u; } catch (e) { /* try next */ } }
  return null;
}
async function runV21() {
  const NEW = BASE, OLD = await secondOrigin();
  const NEW_O = new URL(NEW).origin;
  const cfgFor = (o) => ({ oldOrigin: OLD ? new URL(OLD).origin : 'http://old.invalid', baseUrl: NEW, moveMode: 'none', redirectDelayMs: 1500, ...o });
  const newCtx = async (kind, cfg) => {
    const mobile = kind === 'mobile';
    const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR', acceptDownloads: true } : { viewport: { width: 1280, height: 800 }, locale: 'tr-TR', acceptDownloads: true });
    await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, cfg);
    const p = await ctx.newPage(); const errors = [];
    const watch = (pg) => { pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); }); pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message)); };
    watch(p);
    const tap = async (sel, pg = p) => { const el = await pg.waitForSelector(sel, { state: 'visible', timeout: 8000 }); if (mobile) { await el.scrollIntoViewIfNeeded(); await pg.waitForTimeout(60); const b = await el.boundingBox(); await pg.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click(); };
    return { ctx, p, errors, tap, watch, S: (js, a) => p.evaluate(js, a) };
  };
  const create = async (T, name, path = 'vlog') => { await T.p.waitForSelector('[data-test=creator]'); await T.p.fill('[data-test=channel-input]', name); await T.tap('[data-test=creator-next]'); await T.tap('[data-test=path-' + path + ']'); await T.tap('[data-test=creator-start]'); await T.p.waitForSelector('[data-test=shoot]'); await T.S(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); }); };
  const sent = (T) => T.S(() => window.__fenomen.tel.transport.sent.map((x) => x.event));
  const publishMini = async (T) => {   // shoot -> kurgu mini-game (3 cuts) -> publish
    await T.tap('[data-test=tab-studio]'); await T.tap('[data-test=shoot]'); await T.tap('[data-test=shoot-go]');
    await T.p.waitForSelector('[data-test=edit-track]', { timeout: 8000 }); await T.S(() => { for (let i = 0; i < 3; i++) window.__edit.cut(); });
    await T.tap('[data-test=publish-go]'); await T.p.waitForTimeout(300);
  };
  const setFollowers = (T, n, channel) => T.S(([n, c]) => { const f = window.__fenomen; f.ctrl.state.followers = n; if (c) f.ctrl.state.char.channel = c; f.ctrl.save(); f.ctrl.emit('change'); }, [n, channel]);
  const tagOf = (k) => '[v2.1 ' + k + '] ';
  const done = async (T, k) => { const real = T.errors.filter((e) => !/favicon/.test(e)); ok(tagOf(k) + 'no console errors/warnings', real.length === 0, real.slice(0, 4).join(' | ')); await T.ctx.close(); };

  // ---- A: counter notice band + Settings switch (mobile)
  {
    const T = await newCtx('mobile', cfgFor({})), tag = tagOf('sayaç');
    await T.p.goto(NEW, { waitUntil: 'load' }); await T.p.waitForSelector('[data-test=creator]');
    ok(tag + 'first launch shows the notice band (Tamam / Kapat equal + Ayrıntılar)', await T.S(() => { const ok = document.querySelector('[data-test=tel-ok]').getBoundingClientRect(), off = document.querySelector('[data-test=tel-off]').getBoundingClientRect(); return !!document.querySelector('[data-test=tel-banner]') && Math.abs(ok.width - off.width) < 2 && Math.abs(ok.height - off.height) < 2 && !!document.querySelector('[data-test=tel-details]'); }));
    // KVKK: equal visual weight = identical class + identical computed look (no primary/secondary)
    const eq = await T.S(() => { const a = document.querySelector('[data-test=tel-ok]'), b = document.querySelector('[data-test=tel-off]'); const ca = getComputedStyle(a), cb = getComputedStyle(b);
      const props = ['background-color', 'background-image', 'color', 'border-top-width', 'border-top-style', 'border-top-color', 'border-radius', 'font-size', 'font-weight', 'padding-top', 'padding-left', 'box-shadow', 'opacity'];
      return { same: a.className === b.className, cls: a.className, diff: props.filter((p) => ca.getPropertyValue(p) !== cb.getPropertyValue(p)) }; });
    ok(tag + '"Tamam" and "Kapat": identical className and computed style', eq.same && eq.diff.length === 0 && !/primary/.test(eq.cls), eq.cls + ' diff=' + eq.diff.join(','));
    await create(T, 'Sayaç Deneme', 'luks');
    ok(tag + 'nothing sent before the notice is answered', (await sent(T)).length === 0 && (await T.S(() => window.__fenomen.tel.held().length)) >= 3);
    await T.tap('[data-test=tel-details]'); await T.p.waitForSelector('[data-test=tel-details-modal]');
    ok(tag + '"Ayrıntılar" opens the details', (await T.S(() => document.querySelector('[data-test=tel-details-modal]').textContent)).includes('180 gün') && (await T.S(() => document.querySelector('[data-test=tel-details-modal]').textContent)).includes('Ziyaret ve olay kayıtları da 13 ay sonra silinir.'));
    const dp = await T.S(() => { const ps = [...document.querySelectorAll('[data-test=tel-details-modal] p')]; return { n: ps.length, empty: ps.filter((p) => !p.textContent.trim()).length }; });
    const want = TR.telemetry.details.filter((x) => x.trim()).length;
    ok(tag + 'details: empty items render no paragraph (' + want + ' of ' + TR.telemetry.details.length + ' shown)', dp.empty === 0 && dp.n === want, JSON.stringify(dp));
    await T.tap('[data-test=tel-details-close]');
    await T.tap('[data-test=tel-ok]');
    const s1 = await sent(T);
    ok(tag + '"Tamam" sends the waiting events once, in order', JSON.stringify(s1) === JSON.stringify(['game_open_new', 'session_start', 'character_created', 'path_chosen_luks']) && !(await T.p.$('[data-test=tel-banner]')), s1.join(','));
    ok(tag + 'payload = exactly 4 contract fields, semver', await T.S(() => { const p = window.__fenomen.tel.transport.sent[0]; return JSON.stringify(Object.keys(p)) === '["event","version","device_class","play_bucket"]' && /^\d+\.\d+\.\d+$/.test(p.version) && p.device_class === 'mobil' && p.play_bucket === '0-10'; }));
    await T.S(() => window.__fenomen.ctrl.save()); await T.p.reload({ waitUntil: 'load' }); await T.p.waitForSelector('[data-test=shoot]');
    ok(tag + 'after reload: no band, nothing re-sent (flags + 30 min session limit)', !(await T.p.$('[data-test=tel-banner]')) && (await sent(T)).length === 0);
    await T.tap('[data-test=settings-open]');
    ok(tag + 'Settings > Gizlilik switch is on', await T.S(() => document.querySelector('[data-test=tel-toggle]').checked));
    await T.tap('[data-test=tel-toggle]'); await T.S(() => window.__fenomen.ui.closeModal());
    ok(tag + 'switch off stored', (await T.S(() => localStorage.getItem('fenomen_tel'))) === 'off');
    await publishMini(T);
    ok(tag + 'switch off: nothing sent (video + kurgu done)', (await sent(T)).length === 0 && (await T.S(() => window.__fenomen.ctrl.state.stats.videos)) === 1);
    await T.tap('[data-test=settings-open]'); await T.tap('[data-test=tel-toggle]'); await T.S(() => window.__fenomen.ui.closeModal());
    await publishMini(T);
    const s2 = await sent(T);
    ok(tag + 'switch on again: next milestone is sent once', s2.filter((x) => x === 'first_video').length === 1 && s2.includes('first_edit_game'), s2.join(','));
    await publishMini(T);
    ok(tag + 'first_video not sent twice', (await sent(T)).filter((x) => x === 'first_video').length === 1);
    await done(T, 'sayaç');
  }
  // ---- A2: "Kapat" on the notice
  {
    const T = await newCtx('desktop', cfgFor({})), tag = tagOf('sayaç kapat');
    await T.p.goto(NEW, { waitUntil: 'load' }); await T.p.waitForSelector('[data-test=tel-banner]');
    await T.tap('[data-test=tel-off]');
    await create(T, 'Kapalı Sayaç'); await publishMini(T);
    ok(tag + '"Kapat": counter off, nothing is ever sent', (await sent(T)).length === 0 && (await T.S(() => localStorage.getItem('fenomen_tel'))) === 'off');
    await T.tap('[data-test=settings-open]');
    ok(tag + 'Settings switch shows off', !(await T.S(() => document.querySelector('[data-test=tel-toggle]').checked)));
    await T.S(() => window.__fenomen.ui.closeModal());
    await done(T, 'sayaç kapat');
  }
  // ---- B: export / import save file (+ code)
  {
    const T = await newCtx('desktop', cfgFor({})), tag = tagOf('kayıt dosyası');
    await T.ctx.addInitScript(NOTICE_SEEN);
    await T.p.goto(NEW, { waitUntil: 'load' }); await create(T, 'Dosya Kanalı'); await setFollowers(T, 12345);
    await T.tap('[data-test=settings-open]');
    const [dl] = await Promise.all([T.p.waitForEvent('download'), T.tap('[data-test=save-export]')]);
    const file = await dl.path(); const env = JSON.parse(fs.readFileSync(file, 'utf8'));
    ok(tag + 'export downloads a JSON file with format, version, checksum', env.format === 'fenomen-save' && env.version === 1 && /^[0-9a-f]{8}$/.test(env.checksum) && Math.floor(env.save.followers) === 12345 && /^fenomen-kayit-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await T.p.waitForSelector('[data-test=export-code]');
    const code = await T.S(() => document.querySelector('[data-test=export-code]').value);
    ok(tag + 'export also shows a copyable code', /^z[A-Za-z0-9_-]+$/.test(code));
    await T.S(() => window.__fenomen.ui.closeModal());
    await setFollowers(T, 5, 'Değişti');
    await T.tap('[data-test=settings-open]'); await T.tap('[data-test=save-import]');
    await T.p.setInputFiles('[data-test=import-file]', file);
    await T.p.waitForSelector('[data-test=import-confirm]', { timeout: 8000 });
    const conf = await T.S(() => document.querySelector('[data-test=import-confirm]').textContent);
    // "Son oynama" = the exported file's own lastSeen, not a fixed month: day/month/year read in the page's time zone
    // (the app formats it there), month spelled with a fixed Turkish table -> passes in any month/year.
    const lp = await T.S((ts) => { const d = new Date(ts); return { d: d.getDate(), m: d.getMonth(), y: d.getFullYear() }; }, env.save.lastSeen);
    const wantLast = 'Son oynama: ' + lp.d + ' ' + TR_MONTHS[lp.m] + ' ' + lp.y;
    ok(tag + 'import asks first and shows both saves', conf.includes('yerine geçecek') && new RegExp('Yüklenecek kayıt · 12,3\\d?\\sB takipçi · ' + wantLast + '\\b').test(conf) && conf.includes('Şimdiki kayıt · 5 takipçi'), wantLast + ' | ' + conf.slice(0, 160));
    await T.tap('[data-test=import-yes]');
    await T.p.waitForTimeout(300);
    ok(tag + 'import restores the exported save', await T.S(() => { const s = window.__fenomen.ctrl.state; return Math.floor(s.followers) >= 12345 && s.char.channel === 'Dosya Kanalı'; }));
    ok(tag + 'replaced save kept as backup', await T.S(() => { const b = JSON.parse(localStorage.getItem('fenomen_save_backup')); return JSON.parse(b.save).followers === 5 && b.at > 0; }));
    // second import while the single backup slot is taken: ask first, default = download the existing backup
    const bakState = () => T.S(() => { const b = JSON.parse(localStorage.getItem('fenomen_save_backup') || 'null'); const s = JSON.parse(localStorage.getItem('fenomen_save_v1')); return { bak: b && JSON.parse(b.save).char.channel, bakF: b && JSON.parse(b.save).followers, cur: s.char.channel, curF: Math.floor(s.followers) }; });
    const importFile = async () => { await T.tap('[data-test=settings-open]'); await T.tap('[data-test=save-import]'); await T.p.setInputFiles('[data-test=import-file]', file); await T.p.waitForSelector('[data-test=import-confirm]', { timeout: 8000 }); await T.tap('[data-test=import-yes]'); };
    await setFollowers(T, 6, 'İkinci');
    await importFile();
    const step = await T.p.waitForSelector('[data-test=backup-step]', { timeout: 4000 }).catch(() => null); await T.p.waitForTimeout(120);
    const st1 = await T.S(() => ({ t: document.querySelector('[data-test=backup-step]').textContent, focus: document.activeElement && document.activeElement.getAttribute('data-test'), btns: [...document.querySelectorAll('[data-test=backup-step] button')].map((b) => b.getAttribute('data-test')) }));
    ok(tag + '2nd import: backup step appears before anything is overwritten', !!step && st1.t.includes('Mevcut yedeği indir') && st1.t.includes('Yedeği sil ve devam et') && st1.t.includes('Mevcut yedek · 5 takipçi') && JSON.stringify(await bakState()) === JSON.stringify({ bak: 'Değişti', bakF: 5, cur: 'İkinci', curF: 6 }), st1.t.slice(0, 160));
    ok(tag + 'backup step: download is the default (focused) option, cancel offered', st1.focus === 'backup-download' && st1.btns[0] === 'backup-download' && st1.btns.includes('backup-cancel'), JSON.stringify(st1));
    const [bdl] = await Promise.all([T.p.waitForEvent('download'), T.p.keyboard.press('Enter')]);   // Enter = the focused default
    const benv = JSON.parse(fs.readFileSync(await bdl.path(), 'utf8'));
    ok(tag + '"Mevcut yedeği indir" downloads the FIRST backup (not lost)', benv.format === 'fenomen-save' && benv.save.char.channel === 'Değişti' && benv.save.followers === 5 && /^fenomen-yedek-\d{4}-\d\d-\d\d\.json$/.test(bdl.suggestedFilename()), bdl.suggestedFilename() + ' ' + (benv.save && benv.save.char.channel));
    await T.p.waitForTimeout(300);
    ok(tag + '...then the import proceeds, replaced save becomes the backup', JSON.stringify(await bakState()) === JSON.stringify({ bak: 'İkinci', bakF: 6, cur: 'Dosya Kanalı', curF: 12345 }) && await T.S(() => window.__fenomen.ctrl.state.char.channel === 'Dosya Kanalı'), JSON.stringify(await bakState()));
    await setFollowers(T, 7, 'Üçüncü');
    await importFile(); await T.tap('[data-test=backup-cancel]'); await T.p.waitForTimeout(300);
    ok(tag + 'backup step "Vazgeç": import aborted, save and backup unchanged', JSON.stringify(await bakState()) === JSON.stringify({ bak: 'İkinci', bakF: 6, cur: 'Üçüncü', curF: 7 }) && await T.S(() => window.__fenomen.ctrl.state.char.channel === 'Üçüncü') && !(await T.p.$('[data-test=backup-step]')), JSON.stringify(await bakState()));
    const bad = '/tmp/fenomen-bad-save.json'; fs.writeFileSync(bad, '{"hello":"world"}');
    await T.tap('[data-test=settings-open]'); await T.tap('[data-test=save-import]');
    await T.p.setInputFiles('[data-test=import-file]', bad); await T.p.waitForTimeout(300);
    ok(tag + 'bad file -> saveFile.importBad, nothing changed', (await T.S(() => document.querySelector('.toasts').textContent)).includes('Fenomen kaydı değil') && await T.S(() => window.__fenomen.ctrl.state.char.channel === 'Üçüncü'));
    await T.p.fill('[data-test=import-code]', code); await T.tap('[data-test=import-code-go]');
    ok(tag + 'import by code reaches the same confirmation', !!(await T.p.waitForSelector('[data-test=import-confirm]').catch(() => null)));
    await T.tap('[data-test=import-no]');
    await done(T, 'kayıt dosyası');
  }
  if (!OLD) { ok('[v2.1] second origin for the move tests (set OLD_BASE)', false); return; }
  // ---- C: old address redirect page: SW + caches removed, auto redirect, import on the new address
  {
    const T = await newCtx('desktop', cfgFor({ moveMode: 'none' })), tag = tagOf('taşıma');
    await T.ctx.addInitScript(NOTICE_SEEN);
    await T.p.goto(OLD, { waitUntil: 'load' }); await create(T, 'Eski Adres');
    await setFollowers(T, 4242);
    const hadSw = await T.S(async () => { if (!('serviceWorker' in navigator)) return false; return Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 8000))]); });
    await T.S(() => { const f = window.__fenomen; f.ctrl.save(); f.ctrl.stop(); window.onpagehide = null; });
    await T.ctx.addInitScript(() => { window.__FENOMEN_CFG__.moveMode = 'redirect'; });
    await T.p.reload({ waitUntil: 'load' });
    await T.p.waitForSelector('[data-test=move-page]');
    const pg = await T.S(() => ({ t: document.querySelector('[data-test=move-page]').textContent, go: !!document.querySelector('[data-test=move-go]'), dl: !!document.querySelector('[data-test=move-download]'), hi: !!document.querySelector('[data-test=move-homeicon]') }));
    ok(tag + 'old address shows the redirect page (title, "Şimdi geç", "Kaydı indir", home icon note)', pg.t.includes('Fenomen yeni adresine taşındı!') && pg.go && pg.dl && pg.hi && pg.t.includes('Birkaç saniye içinde'));
    await T.S(() => window.__move.removed);
    const swGone = await T.S(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).filter((k) => k.startsWith('fenomen-')).length }));
    ok(tag + 'old service worker unregistered + caches cleared', hadSw && swGone.regs === 0 && swGone.caches === 0, JSON.stringify({ hadSw, ...swGone }));
    await T.p.waitForURL((u) => u.origin === NEW_O, { timeout: 8000 });
    await T.p.waitForSelector('[data-test=shoot]');
    ok(tag + 'auto redirect -> new address, fragment removed', await T.S(() => location.hash === '' && !location.href.includes('import=')));
    ok(tag + 'import.done toast', (await T.S(() => document.querySelector('.toasts').textContent)).includes('Kaydın taşındı'));
    ok(tag + 'save arrived on the new address', await T.S(() => { const s = window.__fenomen.ctrl.state; return s.char.channel === 'Eski Adres' && Math.floor(s.followers) >= 4242; }));
    ok(tag + 'counter flags + notice travelled along (no second count)', await T.S(() => localStorage.getItem('fenomen_sent_character_created') === 'true' && localStorage.getItem('fenomen_tel_notice') === '1' && window.__fenomen.tel.transport.sent.every((p) => p.event === 'session_start')));
    const p2 = await T.ctx.newPage(); T.watch(p2); await p2.addInitScript(() => { window.__FENOMEN_CFG__.moveMode = 'none'; });
    await p2.goto(OLD, { waitUntil: 'load' }); await p2.waitForSelector('[data-test=shoot]');
    ok(tag + 'old save is kept on the old address, only marked as migrated', await p2.evaluate(() => !!localStorage.getItem('fenomen_save_v1') && +localStorage.getItem('fenomen_migrated_at') > 0));
    await p2.close();
    await done(T, 'taşıma');
  }
  // ---- D: oversize save -> no auto redirect, only "Kaydı indir"
  {
    const T = await newCtx('mobile', cfgFor({ moveMode: 'redirect', redirectDelayMs: 600, maxHashChars: 200 })), tag = tagOf('taşıma büyük');
    const OLD_O = new URL(OLD).origin;
    const save = JSON.parse(fs.readFileSync(new URL('../fixtures/save_v1.json', import.meta.url), 'utf8'));
    await T.ctx.addInitScript(([o, s]) => { if (location.origin === o && !localStorage.getItem('fenomen_save_v1')) localStorage.setItem('fenomen_save_v1', s); }, [OLD_O, JSON.stringify(save)]);
    await T.p.goto(OLD, { waitUntil: 'load' }); await T.p.waitForSelector('[data-test=move-page]');
    await T.p.waitForTimeout(1800);
    const st = await T.S(() => ({ origin: location.origin, go: !!document.querySelector('[data-test=move-go]'), big: !!document.querySelector('[data-test=move-toobig]'), hi: !!document.querySelector('[data-test=move-homeicon]') }));
    ok(tag + 'over the limit (config maxHashChars): no auto redirect, no "Şimdi geç"', st.origin === OLD_O && !st.go && st.big && st.hi, JSON.stringify(st));
    const [dl] = await Promise.all([T.p.waitForEvent('download'), T.tap('[data-test=move-download]')]);
    const env = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    ok(tag + '"Kaydı indir" gives a valid save file', env.format === 'fenomen-save' && env.save.char.channel === save.char.channel);
    await done(T, 'taşıma büyük');
  }
  // ---- E/F: new address: broken #import -> import.fail; existing save -> conflict choice
  {
    const T = await newCtx('desktop', cfgFor({})), tag = tagOf('içe aktarma');
    await T.ctx.addInitScript(NOTICE_SEEN);
    await T.p.goto(NEW, { waitUntil: 'load' }); await create(T, 'Bu Cihaz'); await setFollowers(T, 777);
    await T.S(() => { const f = window.__fenomen; f.ctrl.save(); window.onpagehide = null; });
    await T.p.goto(NEW + '?t=1#import=zBOZUK!!', { waitUntil: 'load' });
    await T.p.waitForSelector('[data-test=import-fail]');
    ok(tag + 'broken data -> import.fail, fragment removed', (await T.S(() => document.querySelector('[data-test=import-fail]').textContent)).includes('otomatik taşınamadı') && await T.S(() => location.hash === ''));
    ok(tag + 'existing save untouched, no backup written', await T.S(() => { const s = window.__fenomen.ctrl.state; return s.char.channel === 'Bu Cihaz' && Math.floor(s.followers) >= 777 && !localStorage.getItem('fenomen_save_backup'); }));
    await T.tap('[data-test=import-fail-ok]');
    const mkCode = (followers, channel) => T.S(async ([n, c]) => { const x = window.__fenomen.transfer; const o = JSON.parse(localStorage.getItem('fenomen_save_v1')); o.followers = n; o.char.channel = c; o.lastSeen = Date.UTC(2026, 8, 1, 9, 30); return x.encodeEnvelope(x.buildEnvelope(o, { sent: ['first_video'], tel: 'on', notice: true })); }, [followers, channel]);
    let code = await mkCode(7777, 'Eski Kanal');
    await T.S(() => { window.__fenomen.ctrl.save(); window.onpagehide = null; });
    await T.p.goto(NEW + '?t=2#import=' + code, { waitUntil: 'load' });
    await T.p.waitForSelector('[data-test=import-conflict]');
    const c = await T.S(() => ({ t: document.querySelector('[data-test=import-conflict]').textContent, o: document.querySelector('[data-test=conflict-old]').textContent, n: document.querySelector('[data-test=conflict-new]').textContent, om: document.querySelector('[data-test=conflict-old-meta]').textContent, nm: document.querySelector('[data-test=conflict-new-meta]').textContent, h: location.hash }));
    ok(tag + 'conflict dialog: both saves with followers + last played date', c.t.includes('İki kayıt bulundu') && c.t.includes('bir süre bu cihazda yedek olarak kalır') && c.o.startsWith('Eski adresteki kayıt') && /^7,8\sB takipçi · Son oynama: 1 Eyl 2026$/.test(c.om) && c.n.startsWith('Bu cihazdaki kayıt') && /^7\d\d takipçi · Son oynama: \d{1,2} (Oca|Şub|Mar|Nis|May|Haz|Tem|Ağu|Eyl|Eki|Kas|Ara) \d{4}$/.test(c.nm) && c.h === '', c.om + ' | ' + c.nm);
    await T.tap('[data-test=conflict-old]'); await T.p.waitForTimeout(300);
    ok(tag + 'pick old-address save -> loaded, device save kept as backup', await T.S(() => { const s = window.__fenomen.ctrl.state; const b = JSON.parse(localStorage.getItem('fenomen_save_backup')); return s.char.channel === 'Eski Kanal' && Math.floor(s.followers) >= 7777 && JSON.parse(b.save).char.channel === 'Bu Cihaz'; }));
    code = await mkCode(99, 'Başka Kanal');
    await T.S(() => { window.__fenomen.ctrl.save(); window.onpagehide = null; });
    await T.p.goto(NEW + '?t=3#import=' + code, { waitUntil: 'load' });
    await T.tap('[data-test=conflict-new]');
    // the backup slot holds 'Bu Cihaz': picking now would overwrite it -> the step; "Vazgeç" aborts the import
    ok(tag + 'conflict pick with a taken backup slot -> backup step', !!(await T.p.waitForSelector('[data-test=backup-step]', { timeout: 4000 }).catch(() => null)));
    await T.tap('[data-test=backup-cancel]'); await T.p.waitForTimeout(200);
    ok(tag + 'backup step "Vazgeç" in the conflict flow: nothing changed', await T.S(() => { const s = window.__fenomen.ctrl.state; const b = JSON.parse(localStorage.getItem('fenomen_save_backup')); return s.char.channel === 'Eski Kanal' && JSON.parse(localStorage.getItem('fenomen_save_v1')).char.channel === 'Eski Kanal' && JSON.parse(b.save).char.channel === 'Bu Cihaz' && location.hash === ''; }));
    await T.S(() => { window.__fenomen.ctrl.save(); window.onpagehide = null; });
    await T.p.goto(NEW + '?t=4#import=' + code, { waitUntil: 'load' });
    await T.tap('[data-test=conflict-new]'); await T.tap('[data-test=backup-discard]'); await T.p.waitForTimeout(200);
    ok(tag + 'pick device save -> kept, incoming save kept as backup', await T.S(() => { const s = window.__fenomen.ctrl.state; const b = JSON.parse(localStorage.getItem('fenomen_save_backup')); return s.char.channel === 'Eski Kanal' && JSON.parse(b.save).char.channel === 'Başka Kanal'; }));
    await done(T, 'içe aktarma');
  }
  // ---- G: old address, grace period: game playable + "moved" band with one-click move
  {
    const T = await newCtx('desktop', cfgFor({ moveMode: 'banner' })), tag = tagOf('taşıma bandı');
    await T.ctx.addInitScript(NOTICE_SEEN);
    await T.p.goto(OLD, { waitUntil: 'load' }); await T.p.waitForSelector('[data-test=move-band]');
    await create(T, 'Band Kanalı'); await setFollowers(T, 3100);
    ok(tag + 'game playable with the band ("Şimdi geç", "Kaydı indir", home icon note)', await T.S(() => !!document.querySelector('[data-test=shoot]') && !!document.querySelector('[data-test=move-band] [data-test=move-go]') && !!document.querySelector('[data-test=move-band] [data-test=move-download]')));
    await T.tap('[data-test=move-go]');
    await T.p.waitForURL((u) => u.origin === NEW_O, { timeout: 8000 }); await T.p.waitForSelector('[data-test=shoot]');
    ok(tag + '"Şimdi geç" carries the save to the new address', await T.S(() => window.__fenomen.ctrl.state.char.channel === 'Band Kanalı' && location.hash === ''));
    await done(T, 'taşıma bandı');
  }
}

// 5 points (centre + the 4 corners, inset just inside the rounded corner): is the element the topmost one at every
// point, fully inside the viewport, and clear of the band (no rectangle overlap)?
const probe = (p, sel) => p.$eval(sel, (el) => {
  const r = el.getBoundingClientRect(), rad = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.width / 2, r.height / 2), i = Math.ceil(rad * 0.3) + 2;
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + i, r.top + i], [r.right - i, r.top + i], [r.left + i, r.bottom - i], [r.right - i, r.bottom - i]];
  const hits = pts.map(([x, y]) => document.elementFromPoint(x, y));
  const band = document.querySelector('[data-test=tel-banner]'), b = band && band.getBoundingClientRect();
  const overlap = !!b && !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom);
  return { top: hits.every((hit) => !!hit && (hit === el || el.contains(hit))), inView: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, overlap, bottom: Math.round(r.bottom * 10) / 10, bandTop: b ? Math.round(b.top * 10) / 10 : null, hit: hits.map((hit) => hit ? (hit.getAttribute('data-test') || hit.className || hit.tagName) : null), bandVisible: !!b && b.height > 0 && b.bottom <= innerHeight + 1 };
});
// ---- v2.1.1: (a) the unanswered notice band never covers Yayınla or another action; (b) milestones reached before the
// notice wait locally (fenomen_tel_pending) and are sent once on "Tamam", never on "Kapat" (counter -> local mock server)
async function runV211() {
  const cfg = { oldOrigin: 'http://old.invalid', baseUrl: BASE, moveMode: 'none' };
  const VIEWS = [
    ['desktop 1280x800', { viewport: { width: 1280, height: 800 } }],
    ['mobile 375x667', { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ['mobile 390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ['landscape 667x375', { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ['landscape 568x320', { viewport: { width: 568, height: 320 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]
  ];
  for (const [name, opts] of VIEWS) {
    const tag = '[v2.1.1 bant ' + name + '] ', touch = !!opts.hasTouch;
    const ctx = await browser.newContext({ ...opts, locale: 'tr-TR' });
    await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, cfg);
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    // REAL input only (no element.click()): scroll it into view like a player would, then a mouse click (Playwright refuses
    // when another element would receive it) or a touchscreen tap at the centre
    const bad = [];
    const press = async (sel) => {
      const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(120);
      const pr = await probe(p, sel); if (!pr.top || !pr.inView || pr.overlap) bad.push(sel + ' ' + JSON.stringify(pr));
      if (touch) { const b = await el.boundingBox(); await p.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); } else await el.click({ timeout: 4000 });
      return pr;
    };
    try {
      await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=tel-banner]');
      // the details text quotes “Tamam”: the real accept button must say exactly that; KVKK: Tamam/Kapat same size
      const nb = await p.evaluate(() => { const a = document.querySelector('[data-test=tel-ok]'), b = document.querySelector('[data-test=tel-off]'), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { ok: a.textContent, off: b.textContent, same: a.className === b.className && Math.abs(ra.width - rb.width) < 2 && Math.abs(ra.height - rb.height) < 2, oneLine: ra.height < 60 }; });
      ok(tag + 'banner accept button label is exactly "Tamam" (Kapat same class and size)', nb.ok === 'Tamam' && nb.ok === TR.telemetry.ok && nb.off === 'Kapat' && nb.same, JSON.stringify(nb));
      await p.fill('[data-test=channel-input]', 'Bant Testi');
      await press('[data-test=creator-next]'); await press('[data-test=path-vlog]'); await press('[data-test=creator-start]');
      await p.waitForSelector('[data-test=shoot]'); await p.waitForTimeout(300);
      // first studio screen of a new player, NO scrolling: "Video çek" and the tutorial's "Geç" are fully clear of the band
      const first = { shoot: await probe(p, '[data-test=shoot]'), skip: await probe(p, '[data-test=tut-skip]') };
      ok(tag + 'first studio screen (no scrolling): "Video çek" and tutorial "Geç" fully visible, topmost at 5 points, clear of the band', ['shoot', 'skip'].every((k) => first[k].top && first[k].inView && !first[k].overlap) && first.shoot.bandVisible, JSON.stringify(first));
      await p.evaluate(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); });
      await press('[data-test=tab-studio]'); await press('[data-test=shoot]'); await press('[data-test=shoot-go]');
      await p.waitForSelector('[data-test=edit-track]'); await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__edit.cut(); });
      await p.waitForSelector('[data-test=publish-go]', { state: 'visible' }); await p.waitForTimeout(300);
      const pub = await press('[data-test=publish-go]'); await p.waitForTimeout(500);
      const st = await p.evaluate(() => ({ videos: window.__fenomen.ctrl.state.stats.videos, band: !!document.querySelector('[data-test=tel-banner]'), notice: localStorage.getItem('fenomen_tel_notice') }));
      ok(tag + 'notice unanswered: "Yayınla" fully visible, topmost at 5 points (elementFromPoint), clear of the band', pub.top && pub.inView && !pub.overlap && pub.bandVisible, JSON.stringify(pub));
      ok(tag + 'real ' + (touch ? 'tap' : 'click') + ' on "Yayınla" publishes; band still shown, notice still unanswered', st.videos === 1 && st.band && st.notice === null, JSON.stringify(st));
      ok(tag + 'no other action on the way was covered (creator, tabs, Çek, Başla)', bad.length === 0, bad.join(' | '));
    } catch (e) { ok(tag + 'flow crashed: ' + e.message.split('\n')[0], false, bad.join(' | ')); }
    ok(tag + 'no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // (b) counter pointed at a local mock server that counts requests (CORS like the real endpoint)
  const http = await import('node:http');
  const MOCK_PORT = +(process.env.TEL_MOCK_PORT || 4196), hits = [];
  const srv = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'apikey, content-type, prefer' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { try { hits.push(JSON.parse(body).event); } catch (e) { hits.push('?'); } res.writeHead(201, cors); res.end(); });
  });
  await new Promise((r) => srv.listen(MOCK_PORT, '127.0.0.1', r));
  const telCfg = { ...cfg, telemetryUrl: 'http://127.0.0.1:' + MOCK_PORT, telemetryKey: 'smoke-anon-key' };
  const STAGES = ['game_open_new', 'character_created', 'path_chosen_vlog', 'first_video', 'first_edit_game'];
  const count = (id) => hits.filter((x) => x === id).length;
  try {
    for (const answer of ['tel-ok', 'tel-off']) {
      hits.length = 0;
      const tag = '[v2.1.1 bekleyen aşamalar ' + (answer === 'tel-ok' ? 'Tamam' : 'Kapat') + '] ';
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
      await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, telCfg);
      const p = await ctx.newPage(); const errors = []; p.on('pageerror', (e) => errors.push(e.message));
      const local = () => p.evaluate(() => ({ pending: JSON.parse(localStorage.getItem('fenomen_tel_pending') || 'null'), flags: Object.keys(localStorage).filter((k) => /^fenomen_(sent|retry)_/.test(k)), kind: window.__fenomen.tel.transport.kind }));
      await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=tel-banner]');
      await p.fill('[data-test=channel-input]', 'Sayaç Testi'); await p.click('[data-test=creator-next]'); await p.click('[data-test=path-vlog]'); await p.click('[data-test=creator-start]');
      await p.waitForSelector('[data-test=shoot]'); await p.evaluate(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); });
      await p.click('[data-test=tab-studio]'); await p.click('[data-test=shoot]'); await p.click('[data-test=shoot-go]');
      await p.waitForSelector('[data-test=edit-track]'); await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__edit.cut(); });
      await p.click('[data-test=publish-go]'); await p.waitForTimeout(800);
      const l1 = await local();
      ok(tag + 'before the notice: 5 stages reached, 0 requests, pending = stage ids only, nothing marked sent', l1.kind === 'http' && hits.length === 0 && JSON.stringify((l1.pending || []).slice().sort()) === JSON.stringify(STAGES.slice().sort()) && l1.flags.length === 0, JSON.stringify({ hits, l1 }));
      await p.evaluate(() => window.__fenomen.ctrl.save()); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=shoot]'); await p.waitForTimeout(800);
      const l2 = await local();
      ok(tag + 'after a reload: still 0 requests, pending kept, still nothing marked sent', hits.length === 0 && JSON.stringify(l2.pending) === JSON.stringify(l1.pending) && l2.flags.length === 0, JSON.stringify({ hits, l2 }));
      await p.click('[data-test=' + answer + ']'); await p.waitForTimeout(1500);
      const l3 = await local();
      if (answer === 'tel-ok') {
        ok(tag + '"Tamam": exactly ONE request per stage (+1 session_start), pending cleared', STAGES.every((id) => count(id) === 1) && count('session_start') === 1 && hits.length === STAGES.length + 1 && l3.pending === null, hits.join(','));
        await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=shoot]'); await p.waitForTimeout(1500);
        ok(tag + 'reload after "Tamam": no duplicate requests', hits.length === STAGES.length + 1, hits.join(','));
      } else {
        ok(tag + '"Kapat": ZERO requests, pending list cleared, counter off', hits.length === 0 && l3.pending === null && (await p.evaluate(() => localStorage.getItem('fenomen_tel'))) === 'off', JSON.stringify({ hits, l3 }));
        await p.reload({ waitUntil: 'load' }); await p.waitForSelector('[data-test=shoot]'); await p.waitForTimeout(1500);
        ok(tag + 'reload after "Kapat": still ZERO requests', hits.length === 0, hits.join(','));
      }
      ok(tag + 'no page errors', errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } finally { srv.close(); }
}

// ---- v2.1.4: short landscape screens (height <= 360px) use the side-by-side layout, band open AND closed (no jump).
// Nothing may be covered: first studio screen (Video çek, tutorial "Geç", every tab), Yayınla, and every control on the
// creator / studio / shop / closet / channel screens once a player scrolls it into the free area.
// Page side: centre the element between its scroll area's top (+ a sticky header in it) and the band's top edge.
const placeClear = (el) => {
  let sc = el.parentElement; while (sc && !(/(auto|scroll)/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement;
  if (!sc) return;
  const band = document.querySelector('[data-test=tel-banner]'), b = band && band.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  const sticky = [...sc.children].find((c) => getComputedStyle(c).position === 'sticky' && !c.contains(el)); const top = sr.top + (sticky ? sticky.getBoundingClientRect().height : 0);
  const bottom = b && b.top < sr.bottom && b.bottom > sr.top ? b.top : sr.bottom;
  const r = el.getBoundingClientRect(); sc.scrollTop += (r.top + r.height / 2) - (top + bottom) / 2;
};
const clear = (pr) => pr.top && pr.inView && !pr.overlap;
async function runV214() {
  const cfg = { oldOrigin: 'http://old.invalid', baseUrl: BASE, moveMode: 'none' };
  const SHORT = [[568, 320], [640, 360], [740, 360]], MODES = ['band open', 'after Tamam', 'after Kapat'];
  const rects = {};
  for (const [w, hgt] of SHORT) for (const mode of MODES) {
    const tag = '[v2.1.4 yatay ' + w + 'x' + hgt + ' ' + mode + '] ', open = mode === 'band open';
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' });
    await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, cfg);
    const p = await ctx.newPage(); const errors = [];
    p.on('pageerror', (e) => errors.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const tap = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); const bb = await el.boundingBox(); await p.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2); };
    const bad = [];
    const press = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(100); const pr = await probe(p, sel); if (!clear(pr)) bad.push(sel + ' ' + JSON.stringify(pr)); await tap(sel); return pr; };
    const sweep = async (scope) => {
      const n = await p.$$eval(scope + ' button, ' + scope + ' input, ' + scope + ' a[href]', (els) => els.map((e, k) => e.setAttribute('data-sweep', k)).length);
      const miss = [];
      for (let k = 0; k < n; k++) {
        const sel = '[data-sweep="' + k + '"]', el = await p.$(sel); if (!el || !(await el.isVisible())) continue;
        await el.scrollIntoViewIfNeeded(); await p.$eval(sel, placeClear); await p.waitForTimeout(30);
        const pr = await probe(p, sel); if (!clear(pr)) miss.push((await el.evaluate((e) => e.getAttribute('data-test') || e.textContent.trim().slice(0, 20))) + ' ' + JSON.stringify(pr));
      }
      await p.$$eval('[data-sweep]', (els) => els.forEach((e) => e.removeAttribute('data-sweep')));
      await p.$eval(scope, (e) => { e.scrollTop = 0; });
      return { n, miss };
    };
    const layout = () => p.evaluate(() => { const R = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.top, r.bottom, r.left, r.right].map((v) => Math.round(v * 10) / 10); }; return { main: getComputedStyle(document.querySelector('.main')).flexDirection, tabsPos: getComputedStyle(document.querySelector('.tabs')).position, stage: R('.stage'), panel: R('.panel'), shoot: R('[data-test=shoot]'), tabs: R('.tabs') }; });
    try {
      await p.goto(BASE, { waitUntil: 'load' }); await p.waitForSelector('[data-test=tel-banner]');
      const btns = {}; for (const s of ['tel-ok', 'tel-off', 'tel-details']) btns[s] = await probe(p, '[data-test=' + s + ']');
      const cut = await p.$eval('[data-test=tel-banner] .nb-text', (t) => t.scrollHeight > t.clientHeight + 1 || t.getBoundingClientRect().bottom > t.closest('[data-test=tel-banner]').getBoundingClientRect().bottom + 0.5);
      ok(tag + 'band: Tamam / Kapat / Ayrıntılar fully visible and topmost at 5 points, text not cut', Object.values(btns).every((b) => b.top && b.inView) && !cut, JSON.stringify({ btns, cut }));
      if (!open) { await tap('[data-test=' + (mode === 'after Tamam' ? 'tel-ok' : 'tel-off') + ']'); await p.waitForTimeout(300); ok(tag + 'real tap answers the notice, band gone', !(await p.$('[data-test=tel-banner]'))); }
      const cr = await sweep('.creator');
      ok(tag + 'creator: every control (' + cr.n + ') reachable and clear (5 points)', cr.miss.length === 0, cr.miss.slice(0, 3).join(' | '));
      await p.fill('[data-test=channel-input]', 'Yatay Test');
      await press('[data-test=creator-next]'); await press('[data-test=path-vlog]'); await press('[data-test=creator-start]');
      await p.waitForSelector('[data-test=shoot]'); await p.waitForTimeout(300);
      const first = { shoot: await probe(p, '[data-test=shoot]'), skip: await probe(p, '[data-test=tut-skip]') };
      for (const t of ['studio', 'shop', 'closet', 'channel']) first['tab-' + t] = await probe(p, '[data-test=tab-' + t + ']');
      ok(tag + 'first studio screen (no scrolling): Video çek, tutorial "Geç" and every tab fully visible, topmost at 5 points', Object.values(first).every(clear), JSON.stringify(first));
      const lay = await layout(); rects[w + 'x' + hgt] = rects[w + 'x' + hgt] || {}; rects[w + 'x' + hgt][mode] = lay;
      ok(tag + 'side-by-side layout, tab bar in the flow (not floating over the content)', lay.main === 'row' && lay.tabsPos === 'static' && lay.shoot[1] <= lay.tabs[0], JSON.stringify(lay));
      // every tab is clickable with a real tap and every control on its screen is reachable and clear
      const sw = { studio: await sweep('.panel') };
      for (const t of ['shop', 'closet', 'channel', 'studio']) {
        await tap('[data-test=tab-' + t + ']'); await p.waitForTimeout(250);
        const on = await p.$eval('.tab.on', (e) => e.getAttribute('data-tab')); if (on !== t) bad.push('tab-' + t + ' tap -> ' + on);
        if (t !== 'studio') sw[t] = await sweep('.panel');
      }
      ok(tag + 'every tab opens with a real tap; every control on studio/shop/closet/channel reachable and clear', !bad.some((b) => b.startsWith('tab-')) && Object.values(sw).every((x) => x.miss.length === 0), JSON.stringify(Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.n + (v.miss.length ? ' MISS ' + v.miss.slice(0, 2).join(' | ') : '')]))));
      await p.evaluate(() => { const f = window.__fenomen; f.ctrl.state.tut = 99; f.ui.updateTutorial(); });
      await press('[data-test=shoot]'); await press('[data-test=shoot-go]');
      await p.waitForSelector('[data-test=edit-track]'); await p.evaluate(() => { for (let i = 0; i < 3; i++) window.__edit.cut(); });
      await p.waitForSelector('[data-test=publish-go]', { state: 'visible' }); await p.waitForTimeout(300);
      const pub = await press('[data-test=publish-go]'); await p.waitForTimeout(500);
      const st = await p.evaluate(() => ({ videos: window.__fenomen.ctrl.state.stats.videos, band: !!document.querySelector('[data-test=tel-banner]') }));
      ok(tag + '"Yayınla" fully visible, topmost at 5 points, clear of the band; real tap publishes', clear(pub) && st.videos === 1 && st.band === open, JSON.stringify({ pub, st }));
      ok(tag + 'no action on the way was covered (creator, Başla, Video çek, Çek)', bad.length === 0, bad.join(' | '));
      if (open) {   // answering the band moves nothing: same stage, panel, Video çek and tab bar
        await p.evaluate(() => { document.querySelector('.panel').scrollTop = 0; }); await p.waitForTimeout(100);
        const before = await layout(); await tap('[data-test=tel-ok]'); await p.waitForTimeout(400); const after = await layout();
        ok(tag + '"Tamam" moves nothing (stage, panel, Video çek, tab bar identical)', !(await p.$('[data-test=tel-banner]')) && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
      }
    } catch (e) { ok(tag + 'flow crashed: ' + e.message.split('\n')[0], false, bad.join(' | ')); }
    ok(tag + 'no page/console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
  for (const [size, m] of Object.entries(rects)) ok('[v2.1.4 yatay ' + size + '] same layout with the band open, after Tamam and after Kapat', MODES.every((k) => m[k]) && MODES.every((k) => JSON.stringify(m[k]) === JSON.stringify(m['band open'])), JSON.stringify(m));
  // portrait screens and landscape screens taller than 360px keep the v2.1.3 layout (floating tab bar, icon above label)
  const KEEP = [[390, 844], [375, 667], [360, 640], [1280, 800], [740, 400], [900, 420], [667, 375], [640, 361]];
  for (const [w, hgt] of KEEP) {
    const mobile = w < 900, ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, locale: 'tr-TR' });
    await ctx.addInitScript((c) => { window.__FENOMEN_CFG__ = c; }, cfg); await ctx.addInitScript(NOTICE_SEEN);
    const p = await ctx.newPage(); await p.goto(BASE, { waitUntil: 'load' });
    await p.fill('[data-test=channel-input]', 'Dikey'); await p.click('[data-test=creator-next]'); await p.click('[data-test=path-vlog]'); await p.click('[data-test=creator-start]'); await p.waitForSelector('[data-test=shoot]');
    const k = await p.evaluate(() => ({ main: getComputedStyle(document.querySelector('.main')).flexDirection, tabs: getComputedStyle(document.querySelector('.tabs')).position, tab: getComputedStyle(document.querySelector('.tab')).flexDirection }));
    ok('[v2.1.4 değişmeyen ' + w + 'x' + hgt + '] v2.1.3 layout kept (main ' + (w >= 900 ? 'row' : 'column') + ', floating tab bar, icon above label)', k.main === (w >= 900 ? 'row' : 'column') && k.tabs === 'fixed' && k.tab === 'column', JSON.stringify(k));
    await ctx.close();
  }
}

async function installability() {
  const dir = fs.mkdtempSync('/tmp/fen-prof-');
  const ctx = await chromium.launchPersistentContext(dir, { executablePath: exe, args: ['--no-sandbox'], viewport: { width: 1280, height: 800 } });
  const p = ctx.pages()[0] || await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const cdp = await ctx.newCDPSession(p);
  const r = await cdp.send('Page.getInstallabilityErrors');
  const m = await cdp.send('Page.getAppManifest');
  ok('[pwa] installable (no installability errors)', r.installabilityErrors.length === 0, JSON.stringify(r.installabilityErrors));
  ok('[pwa] manifest parsed without errors', m.errors.length === 0 && m.url.endsWith('manifest.webmanifest'), JSON.stringify(m.errors));
  await ctx.close();
}
try {
  if (process.env.ONLY === 'v21') { await runV21(); await runV211(); }      // quick loop while working on the v2.1 flows
  else if (process.env.ONLY === 'v211') await runV211();                    // notice band + pending milestones only
  else if (process.env.ONLY === 'v214') await runV214();                    // short landscape layout only
  else { await run('mobile'); await run('desktop'); await runV2('mobile'); await runV2('desktop'); await runV21(); await runV211(); await runV214(); await installability(); }
}
catch (e) { ok('smoke crashed: ' + e.message, false); }
await browser.close();
console.log(results.join('\n'));
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
