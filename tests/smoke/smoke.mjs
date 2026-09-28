// Headless smoke test: mobile 390x844 (touch) + desktop 1280x800, against BASE (local preview or the live URL).
// Usage: BASE=http://localhost:4180/ node tests/smoke/smoke.mjs   (SHOTS=1 writes screenshots/)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4180/';
const SHOTS = process.env.SHOTS === '1';
const exe = process.env.CHROME || '/usr/bin/google-chrome';
const results = []; let failed = 0;
const ok = (name, cond, extra) => { results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? ' — ' + extra : '')); if (!cond) failed++; };
const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: 'screenshots/' + name }); };

const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const TEXT_HOOK = () => {   // record every string drawn on canvases (to check the KİRALIK layer rules)
  window.__texts = [];
  const f = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, ...a) { window.__texts.push(String(s)); return f.call(this, s, ...a); };
};

async function run(kind) {
  const mobile = kind === 'mobile';
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'tr-TR' } : { viewport: { width: 1280, height: 800 }, locale: 'tr-TR' });
  await ctx.addInitScript(TEXT_HOOK);
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
  ok(tag + 'eğitim + lüks yaşam are "yakında"', await S(() => document.querySelector('[data-test=path-egitim]').disabled && document.querySelector('[data-test=path-luks]').disabled));
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
try { await run('mobile'); await run('desktop'); await installability(); }
catch (e) { ok('smoke crashed: ' + e.message, false); }
await browser.close();
console.log(results.join('\n'));
console.log((results.length - failed) + '/' + results.length + ' passed');
process.exit(failed ? 1 : 0);
