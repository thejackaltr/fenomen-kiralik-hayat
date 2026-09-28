// v2: Lüks Yaşam, rented clothing, Kanalı Sat / Şöhret tree / Kiralıksız Hayat, v1 -> v2 save migration
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as G from '../../src/logic/game.js';
import { CFG, FAME, FAME_TREE, FAME_NODES, LUXURY, PATH, STARTER_WEAR } from '../../src/logic/config.js';
import { serialize, deserialize } from '../../src/logic/save.js';

const fresh = (path = 'vlog', seed = 3) => { const s = G.newGame(0, seed); G.createCharacter(s, { body: 'f', channel: 'Test' }); G.choosePath(s, path); s.money = 1e7; s.followers = 5000; return s; };

// ---------- Lüks Yaşam ----------
test('Lüks Yaşam: rented items give the biggest follower boost (CFG), owned items the same as vlog', () => {
  const fpv = (path, rent) => { const s = fresh(path); rent ? G.rentItem(s, 'car_01') : G.buyItem(s, 'car_01'); return G.videoFactors(s, { titleId: 't_car', show: ['car_01'] }).followPerView; };
  assert.ok(fpv('luks', true) > fpv('vlog', true) * 1.1, 'rented boost bigger on luks');
  assert.ok(Math.abs(fpv('luks', false) - fpv('vlog', false)) < 1e-12, 'owned boost identical');
  assert.ok(PATH.luks.rentFollowMult > Math.max(PATH.vlog.rentFollowMult, PATH.oyun.rentFollowMult));
});
test('Lüks Yaşam: highest İfşa risk and trust cost', () => {
  for (const tr of [100, 70, 40, 0]) assert.ok(G.ifsaChance(tr, 'luks') > G.ifsaChance(tr, 'vlog'));
  assert.ok(G.ifsaChance(0, 'luks') <= 0.85);
  const cost = (path) => { const s = fresh(path); s.trust = 80; G.rentItem(s, 'watch_01'); G.publish(s, { titleId: 't_whatjob', show: ['watch_01'] }); return 80 - s.trust; };
  assert.ok(cost('luks') > cost('vlog'));
});

// ---------- rented clothing ----------
test('rent clothing: only flashy pieces, pays upfront, worn at once, costs rent per day', () => {
  const s = fresh(); const m0 = s.money;
  assert.equal(G.rentWear(s, 'top_hoodie_01'), false, 'cheap pieces are buy-only');
  assert.equal(G.rentWear(s, 'top_suit_01'), true);
  assert.equal(s.money, m0 - G.rentPerDay('top_suit_01') * CFG.rent.upfrontDays);
  assert.equal(s.wear.worn.top, 'top_suit_01'); assert.ok(!s.wear.owned.includes('top_suit_01'));
  assert.equal(G.rentWear(s, 'top_suit_01'), false, 'no double rent');
  assert.ok(Math.abs(G.rentPerSec(s) - G.rentPerDay('top_suit_01') / CFG.daySec) < 1e-9);
  assert.ok(G.styleBonus(s) > 0);
});
test('rented clothes count as rented in videos (trust, İfşa) — the manager never wears them', () => {
  const s = fresh(); G.rentWear(s, 'glasses_sun_01'); s.trust = 60;
  G.publish(s, { titleId: 't_whatjob' });
  assert.equal(s.trust, 60 - CFG.trust.rentedShownCost, 'worn rented piece = rented shown');
  assert.equal(s.ifsa.rentedVideos, 1);
  const auto = G.publish(s, { titleId: 't_whatjob', auto: true });
  assert.equal(auto.outfit.glasses, STARTER_WEAR.glasses, 'manager uses the honest outfit');
});
test('clothing İfşa: tag card, exposed flag, tag in later videos only; exposed piece loses most style', () => {
  const s = fresh(); G.rentWear(s, 'top_suit_01');
  const st0 = G.styleBonus(s);
  const v0 = G.publish(s, { titleId: 't_whatjob' }); assert.deepEqual(v0.exposed, []);
  const p = G.triggerIfsa(s, ['top_suit_01']);
  assert.ok(['ifsa_tag', 'ifsa_live'].includes(p.cardId)); assert.equal(p.itemId, 'top_suit_01');
  assert.equal(s.wear.rented.top_suit_01.exposed, true);
  G.resolveIfsa(s, 'apology'); s.ifsa.apologyDue = false;
  const v1 = G.publish(s, { titleId: 't_whatjob' }); assert.deepEqual(v1.exposed, ['top_suit_01']);
  assert.ok(G.styleBonus(s) < st0);
  // cards for clothes only
  const w = G.pickCard(fresh(), ['acc_chain_01']); assert.ok(['ifsa_tag', 'ifsa_live'].includes(w.cardId));
});
test('return / buy out / repossession of rented clothes', () => {
  const s = fresh(); G.rentWear(s, 'shoes_loafers_01'); G.rentWear(s, 'acc_chain_01');
  assert.equal(G.returnWear(s, 'shoes_loafers_01'), true); assert.equal(s.wear.worn.shoes, STARTER_WEAR.shoes);
  assert.equal(G.buyWear(s, 'acc_chain_01'), true); assert.ok(s.wear.owned.includes('acc_chain_01') && !s.wear.rented.acc_chain_01 && s.wear.worn.accessory === 'acc_chain_01');
  const r = fresh(); G.rentWear(r, 'top_suit_01'); r.money = 0; G.tick(r, 5);
  assert.ok(!r.wear.rented.top_suit_01 && r.wear.worn.top === STARTER_WEAR.top && r.stats.repossessed === 1);
});

// ---------- Kanalı Sat / Şöhret ----------
test('Şöhret gain: floor(sqrt(peak/unit)) from the threshold on', () => {
  const s = fresh();
  s.stats.peakFollowers = FAME.minFollowers - 1; assert.equal(G.fameGain(s), 0); assert.equal(G.canSell(s), false);
  s.stats.peakFollowers = FAME.minFollowers; assert.equal(G.fameGain(s), 5); assert.equal(G.canSell(s), true);
  s.stats.peakFollowers = 1e6; assert.equal(G.fameGain(s), Math.floor(Math.sqrt(1e6 / FAME.unit)));
  assert.ok(G.nextFameAt(s) > 1e6);
});
test('Kanalı Sat: new account, Şöhret + tree + achievements + look kept, everything else reset', () => {
  const s = fresh('luks'); G.rentItem(s, 'car_01'); G.buyItem(s, 'watch_01'); G.hire(s, 'editor'); s.stats.peakFollowers = 400000; s.char.hair = 4; G.setColor(s, 'top_tshirt_01', 2);
  const ns = G.sellChannel(s, 123);
  assert.equal(ns.meta.fame, 7); assert.equal(ns.meta.fameEarned, 7); assert.equal(ns.meta.sales, 1);
  assert.equal(ns.created, false); assert.equal(ns.money, 0); assert.equal(ns.followers, 0); assert.deepEqual(ns.items, {}); assert.equal(ns.staff.editor, 0);
  assert.equal(ns.char.hair, 4); assert.equal(ns.char.channel, ''); assert.equal(ns.wear.colors.top_tshirt_01, 2);
  assert.deepEqual(ns.lastSale, { gain: 7, followers: 400000 });
  assert.equal(G.sellChannel(fresh(), 0), null, 'below threshold: no sale');
});
test('Şöhret tree: sequential branches, costs, applies now and to every future account', () => {
  const s = fresh(); s.meta.fame = 10;
  assert.equal(G.nodeState(s, 'f_sneaker'), 'locked'); assert.equal(G.buyFameNode(s, 'f_sneaker'), false);
  assert.equal(G.buyFameNode(s, 'f_watch_01'), true); assert.equal(s.meta.fame, 9); assert.equal(s.items.watch_01.status, 'owned');
  assert.equal(G.buyFameNode(s, 'f_watch_01'), false, 'once');
  assert.equal(G.buyFameNode(s, 'f_suit'), false, 'ev: painting first');
  G.buyFameNode(s, 'f_painting'); G.buyFameNode(s, 'f_suit'); G.buyFameNode(s, 'f_editor');
  assert.equal(s.meta.fame, 10 - 1 - 2 - 3 - 1); assert.ok(s.wear.owned.includes('top_suit_01')); assert.equal(s.staff.editor, 1);
  assert.equal(G.nodeState(s, 'f_villa'), 'poor');
  s.stats.peakFollowers = FAME.minFollowers; const ns = G.sellChannel(s, 0);
  assert.equal(ns.items.watch_01.status, 'owned'); assert.equal(ns.items.painting_01.status, 'owned'); assert.equal(ns.staff.editor, 1); assert.ok(ns.wear.owned.includes('bottom_suit_01'));
  const total = FAME_TREE.flatMap((b) => b.nodes).reduce((a, n) => a + n.cost, 0); assert.ok(total >= 60, 'tree is a long-term goal');
  for (const id of Object.keys(FAME_NODES)) assert.ok(FAME_NODES[id].branch && FAME_NODES[id].cost > 0);
});
test('Şöhret bonuses: earned boosts follower gain, each UNSPENT point a small capped views bonus', () => {
  const s = fresh(); const base = G.videoFactors(s, { titleId: 't_whatjob' });
  s.meta.fameEarned = 10; s.meta.fame = 10; const f = G.videoFactors(s, { titleId: 't_whatjob' });
  assert.ok(Math.abs(f.followPerView / base.followPerView - (1 + 10 * FAME.followPerEarned)) < 1e-9);
  assert.ok(Math.abs(f.expected / base.expected - (1 + 10 * FAME.unspentBonus)) < 1e-9);
  s.meta.fame = 1000; assert.equal(G.fameViewsMult(s), 1 + FAME.unspentCap);
});
test('Kiralıksız Hayat: owning every flex item (bought or via tree) once gives Şöhret', () => {
  const s = fresh(); s.money = 1e9;
  for (const d of LUXURY.slice(0, -1)) G.buyItem(s, d.id);
  G.rentItem(s, 'villa_01'); assert.deepEqual(s.meta.achievements, [], 'rented does not count');
  G.buyItem(s, 'villa_01');
  assert.deepEqual(s.meta.achievements, ['rent_free']); assert.equal(s.meta.fame, FAME.achievementBonus);
  assert.ok(s.events.some((e) => e.type === 'achievement'));
  G.checkAchievements(s); assert.equal(s.meta.fame, FAME.achievementBonus, 'only once');
});

// ---------- save migration v1 -> v2 ----------
const V1 = fs.readFileSync(new URL('../fixtures/save_v1.json', import.meta.url), 'utf8');
test('v1 save (real v1.0.1 output) migrates losslessly', () => {
  const o = JSON.parse(V1); assert.equal(o.v, 1); assert.equal(o.meta, undefined);
  const s = deserialize(V1, o.lastSeen);
  assert.equal(s.v, 2);
  for (const k of Object.keys(o)) {
    if (k === 'v' || k === 'events') continue;
    if (k === 'wear') { assert.deepEqual(s.wear.owned, o.wear.owned); assert.deepEqual(s.wear.worn, o.wear.worn); assert.deepEqual(s.wear.colors, o.wear.colors); continue; }
    assert.deepEqual(s[k], o[k], 'field ' + k + ' kept');
  }
  assert.deepEqual(s.wear.rented, {}); assert.equal(s.meta.fame, 0); assert.deepEqual(s.meta.unlocks, []); assert.equal(s.meta.bestFollowers, o.stats.peakFollowers);
  // and it keeps playing
  G.tick(s, 60); G.publish(s, { titleId: 't_car', show: ['watch_01'] }); assert.ok(s.stats.videos > o.stats.videos);
});
test('v2 round trip keeps meta, rented clothes and drops invalid v2 data', () => {
  const s = fresh('luks'); G.rentWear(s, 'top_suit_01'); s.wear.rented.top_suit_01.exposed = true; s.meta.fame = 3; s.meta.unlocks = ['f_watch_01']; s.meta.achievements = ['rent_free']; s.meta.sales = 2;
  const back = deserialize(serialize(s), 0);
  assert.deepEqual(back.wear.rented, s.wear.rented); assert.equal(back.wear.worn.top, 'top_suit_01'); assert.deepEqual(back.meta.unlocks, ['f_watch_01']); assert.equal(back.meta.sales, 2); assert.equal(back.path, 'luks');
  const o = JSON.parse(serialize(s));
  o.wear.rented.top_hoodie_01 = { exposed: false }; o.wear.rented.zzz = {}; o.meta.unlocks.push('f_nope'); o.meta.achievements.push('fake'); o.meta.fame = -4;
  const b2 = deserialize(JSON.stringify(o), 0);
  assert.deepEqual(Object.keys(b2.wear.rented), ['top_suit_01']); assert.deepEqual(b2.meta.unlocks, ['f_watch_01']); assert.deepEqual(b2.meta.achievements, ['rent_free']); assert.equal(b2.meta.fame, 0);
  // a sold-but-not-yet-created account survives a reload with its Şöhret
  s.stats.peakFollowers = FAME.minFollowers; const ns = G.sellChannel(s, 0); const b3 = deserialize(serialize(ns), 0);
  assert.equal(b3.created, false); assert.equal(b3.meta.fame, ns.meta.fame); assert.equal(b3.meta.sales, 3);
});
