import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import tr from '../../src/locales/tr.json' with { type: 'json' };
import { registerLocales, setLocale, detect, t, plural, upper, lower, setPseudo, setMissingHandler, available } from '../../src/logic/i18n.js';
import { fmt, money, pct } from '../../src/logic/format.js';
import { LUXURY, WEARABLES, EQUIPMENT, STAFF, INVESTMENTS, TITLES, IFSA_CARDS, PATHS } from '../../src/logic/config.js';

registerLocales({ tr });
const nb = (s) => s.replace(/[\u00a0\u202f]/g, ' ');
const lookup = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), tr);

test('every catalog ID has its text in tr.json', () => {
  const keys = [
    ...LUXURY.flatMap((d) => ['items.names.' + d.id, 'items.desc.' + d.id]), ...WEARABLES.map((d) => 'wear.' + d.id),
    ...EQUIPMENT.flatMap((d) => ['equip.' + d.id + '.name', 'equip.' + d.id + '.desc']), ...STAFF.flatMap((d) => ['staff.' + d.id + '.name', 'staff.' + d.id + '.desc']),
    ...INVESTMENTS.flatMap((d) => ['invest.' + d.id + '.name', 'invest.' + d.id + '.desc']), ...TITLES.map((d) => 'video.titles.' + d.id),
    ...TITLES.filter((d) => d.needs && d.needs !== 'apology').map((d) => 'video.needs.' + d.needs),
    ...IFSA_CARDS.flatMap((d) => ['ifsa.cards.' + d.id + '.title', 'ifsa.cards.' + d.id + '.body']), ...PATHS.flatMap((d) => ['paths.' + d.id + '.name', 'paths.' + d.id + '.desc'])
  ];
  for (const k of keys) assert.equal(typeof lookup(k), 'string', k);
});
test('every t() key used in src exists in tr.json', () => {
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } })('src');
  const missing = [];
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\b(?:t|plural)\('([\w.]+)'(?!\s*\+)/g)) { if (/[._]$/.test(m[1])) continue; const v = lookup(m[1]); if (v === undefined) missing.push(f + ': ' + m[1]); }
  assert.deepEqual(missing, []);
});
test('plan texts are used verbatim (video titles + İfşa comment)', () => {
  const T = tr.video.titles;
  assert.equal(T.t_morning, 'SABAH 5 RUTİNİM (öğlen kalktım)'); assert.equal(T.t_car, 'Bu arabayı neden aldım? (almadım)');
  assert.equal(T.t_secrets, 'Zenginlerin bilmeni istemediği 3 sır'); assert.equal(T.t_whatjob, 'Herkes soruyor: Ne iş yapıyorum?');
  assert.equal(T.t_spent, 'Bütün birikimimi buna harcadım!!'); assert.equal(T.t_villa, 'Villamda bir gün');
  assert.equal(T.t_24h, '24 saat aralıksız oynadım, sonra uyudum'); assert.equal(T.t_newpc, 'Yeni bilgisayarımı kurduk (ışıkları dahil)');
  assert.equal(T.t_apology, 'Gerçekler ortaya çıktı… (özür videosu)');
  assert.ok(tr.ifsa.cards.ifsa_comment.body.includes("Aracı yarın saat 10'da teslim edin lütfen."));
  assert.ok(tr.ifsa.cards.ifsa_sign.body.includes('Günlük kiralık')); assert.ok(tr.ifsa.cards.ifsa_live.body.includes('Kira ödemeniz yarın'));
  assert.equal(tr.ifsa.apology, 'Özür videosu çek'); assert.equal(tr.ifsa.ignore, 'Görmezden gel');
});
test('v1.0.1 Yazı fixes are exact', () => {
  setLocale('tr');
  assert.equal(plural('welcome.auto', 3, { n: '3' }), 'Menajerin 3 video yükledi.');
  assert.equal(plural('welcome.auto', 1, { n: '1' }), 'Menajerin 1 video yükledi.');
  assert.equal(tr.ifsa.cards.ifsa_plate.body, 'Takipçiler videodaki arabanın plakasını bir kiralama sitesinde buldu.');
  assert.equal(t('toast.rented', { x: 'Altın kol saati' }), 'Altın kol saati kiralandı. Kirası her gün kasadan düşer.');
  assert.equal(tr.meta.description, 'Sıfırdan fenomen ol: video çek, kurgula, yayınla. Lüksü kirala ya da gerçekten satın al, yalnız ifşa olmamaya dikkat et!');
  assert.equal(tr.staff.editor.desc, 'Kurguyu senin yerine yapar, kalitesi hep aynıdır. Menajer tutmak için önce Kurgucu gerekir.');
  assert.equal(tr.paths.vlog.desc, 'Günlük hayatın ve rutinlerin. Takipçiler seni samimi bulur.');
  assert.equal(tr.video.titles.t_gameend, 'Bu oyunu kimse bitiremedi (ben de)'); assert.equal(tr.video.titles.t_invest, 'Paramı nereye yatırdım? (gerçekten)');
});
test('Turkish case mapping via toLocaleUpperCase', () => {
  setLocale('tr');
  assert.equal(upper(t('tags.rented')), 'KİRALIK'); assert.equal(upper('ifşa'), 'İFŞA'); assert.equal(lower('KIRALIK'), 'kıralık');
});
test('Intl.PluralRules picks x.one / x.other', () => {
  registerLocales({ en: { plural: { videos: { one: '{n} video', other: '{n} videos' } } } });
  setLocale('en'); assert.equal(plural('plural.videos', 1), '1 video'); assert.equal(plural('plural.videos', 3), '3 videos');
  setLocale('tr'); assert.equal(plural('plural.videos', 3), '3 video'); assert.equal(plural('plural.videos', 1), '1 video');
});
test('missing keys fall back to Turkish and warn once (dev)', () => {
  const warns = []; setMissingHandler((k, loc, fb) => warns.push([k, loc, fb]));
  registerLocales({ en: { hud: { money: 'Money' } } }); setLocale('en');
  assert.equal(t('hud.money'), 'Money'); assert.equal(t('hud.followers'), tr.hud.followers); t('hud.followers');
  assert.deepEqual(warns, [['hud.followers', 'en', true]]);
  assert.equal(t('no.such.key'), 'no.such.key'); assert.equal(warns.length, 2);
  setMissingHandler(null); setLocale('tr');
});
test('device language detection + stored choice', () => {
  assert.equal(detect(['de-DE', 'en-US']), 'en'); assert.equal(detect(['de-DE']), 'tr'); assert.equal(detect(['en-US'], 'tr'), 'tr'); assert.equal(detect([], 'xx'), 'tr');
  assert.ok(available().includes('tr'));
});
test('pseudo-localisation stretches strings by ~30%', () => {
  setLocale('tr'); const s = t('studio.shoot'); setPseudo(30); const p = t('studio.shoot'); setPseudo(0);
  assert.ok(p.length >= Math.floor(s.length * 1.3)); assert.ok(p.startsWith(s));
});
test('Intl number formatting: tr "1,5 Mn", en "1.5M", extended suffixes after Intl, neutral currency', () => {
  setLocale('tr'); assert.equal(nb(fmt(1500000)), '1,5 Mn'); assert.equal(nb(fmt(999)), '999'); assert.equal(nb(fmt(2.5)), '2,5');
  assert.equal(nb(fmt(3e15)), '3 Ktr'); assert.equal(nb(fmt(4.5e18)), '4,5 Knt'); assert.ok(/E/.test(fmt(1e40)));
  const m = money(1234); assert.ok(m.includes('¤') && !/TL|₺/.test(m));
  assert.equal(nb(pct(0.72)), '%72');
  registerLocales({ en: { fmt: { money: '¤{v}' } } }); setLocale('en'); assert.equal(fmt(1500000), '1.5M'); setLocale('tr');
});
test('no hardcoded UI text: Turkish-looking string literals only in locale files', () => {
  const files = ['src/ui/ui.js', 'src/ui/share.js', 'src/render/scene.js', 'src/render/doll.js', 'src/controller.js', 'src/main.js', 'src/logic/game.js', 'src/logic/format.js', 'index.html'];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const m of src.matchAll(/(['"`])((?:(?!\1).)*[çğıöşüÇĞİÖŞÜ](?:(?!\1).)*)\1/g)) bad.push(f + ': ' + m[2]);
    if (f.endsWith('.html')) for (const m of src.matchAll(/>([^<>%{]*[A-Za-zçğıöşü]{3,}[^<>]*)</g)) bad.push(f + ': ' + m[1]);
  }
  assert.deepEqual(bad, []);
});
test('no text baked into images: the art generator never draws text', () => {
  const art = fs.readFileSync('tools/art/art.js', 'utf8');
  assert.ok(!/fillText|strokeText/.test(art));
  const build = fs.readFileSync('tools/art/build.mjs', 'utf8'); assert.ok(!/fillText|strokeText/.test(build));
});
test('content rules: no forbidden platform/brand names, FanKutusu is non-explicit', () => {
  const all = JSON.stringify(tr).toLowerCase() + fs.readFileSync('tools/art/art.js', 'utf8').toLowerCase();
  for (const w of ['onlyfans', 'only fans', 'lucifer', 'ferrari', 'lamborghini', 'porsche', 'rolex', 'patek', 'bugatti', 'mercedes', 'bmw', 'tesla', 'gucci', 'nike', 'adidas', 'youtube', 'tiktok', 'instagram', 'twitch', ' tl"', '₺', '+18', 'çıplak', 'müstehcen içerik']) assert.ok(!all.includes(w), w);
  assert.equal(tr.fanbox.name, 'FanKutusu');
});
