import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/logic/game.js';
import { CFG } from '../../src/logic/config.js';

const fresh = (path = 'vlog') => { const s = G.newGame(0, 42); G.createCharacter(s, { body: 'f', skin: 2, hair: 1, channel: 'Test' }); assert.ok(G.choosePath(s, path)); return s; };

test('new game starts from zero', () => {
  const s = G.newGame(0, 1);
  assert.equal(s.money, 0); assert.equal(s.followers, 0); assert.equal(s.trust, CFG.start.trust); assert.equal(s.created, false);
  assert.deepEqual(Object.keys(s.items), []);
});
test('only playable paths can be chosen', () => {
  const s = G.newGame(0, 1);
  assert.equal(G.choosePath(s, 'egitim'), false); assert.equal(G.choosePath(s, 'nope'), false);
  assert.equal(G.choosePath(G.newGame(0, 1), 'luks'), true);
  assert.equal(G.choosePath(s, 'oyun'), true); assert.equal(s.created, true);
});
test('published video pays money + followers as views arrive, converging to its total', () => {
  const s = fresh();
  const v = G.publish(s, { titleId: 't_morning', quality: 1 });
  assert.ok(v.total > 0);
  G.tick(s, CFG.video.tauSec);
  assert.ok(s.money > 0 && s.followers > 0);
  const part = s.stats.views; assert.ok(part > v.total * 0.55 && part < v.total * 0.7, 'about 63% after one tau');
  G.tick(s, CFG.video.tauSec * CFG.video.lifeTau);
  assert.equal(s.videos.length, 0); assert.ok(Math.abs(s.stats.views - v.total) < 1e-6);
  assert.ok(Math.abs(s.money - v.total * CFG.video.moneyPerView) < 1e-6);
  assert.equal(s.history[0].titleId, 't_morning');
});
test('edit quality multiplies views', () => {
  const a = fresh(), b = fresh();
  const lo = G.videoFactors(a, { titleId: 't_morning', quality: 0.6 }).expected, hi = G.videoFactors(b, { titleId: 't_morning', quality: 1.6 }).expected;
  assert.ok(Math.abs(hi / lo - 1.6 / 0.6) < 1e-9);
});
test('equipment, style and path weights raise expected views', () => {
  const s = fresh(); s.stats.videos = 5;
  const base = G.videoFactors(s, { titleId: 't_morning' }).expected;
  s.money = 1e6; assert.ok(G.upgradeEquip(s, 'camera')); assert.ok(G.buyWear(s, 'top_suit_01'));
  assert.ok(G.videoFactors(s, { titleId: 't_morning' }).expected > base);
  const o = fresh('oyun'); o.money = 1e6; G.upgradeEquip(o, 'pc');
  const v = fresh('vlog'); v.money = 1e6; G.upgradeEquip(v, 'pc');
  assert.ok(G.equipMult(o) > G.equipMult(v), 'PC matters more for gaming');
});
test('publishing too often tires the audience', () => {
  const s = fresh(); const f0 = G.fatigue(s);
  for (let i = 0; i < 4; i++) G.publish(s, { titleId: 't_morning' });
  assert.ok(G.fatigue(s) < f0);
  G.tick(s, CFG.video.fatigueWindowSec + 1, 5);
  // recent list is pruned on the next publish; fatigue counts only the window
  assert.equal(G.fatigue(s), 1);
});
test('cannot buy without money; money never goes negative', () => {
  const s = fresh();
  assert.equal(G.upgradeEquip(s, 'camera'), false); assert.equal(G.buyItem(s, 'car_01'), false); assert.equal(G.hire(s, 'editor'), false);
  assert.equal(s.money, 0);
});
test('manager needs an editor and auto-publishes on its interval', () => {
  const s = fresh(); s.money = 1e7;
  assert.equal(G.canHire(s, 'manager'), false);
  assert.ok(G.hire(s, 'editor')); assert.ok(G.hire(s, 'manager'));
  const n = s.stats.videos; G.tick(s, G.managerInterval(s) * 3 + 0.5);
  assert.equal(s.stats.videos - n, 3); assert.equal(s.stats.autoVideos, 3);
  assert.ok(s.videos.every((v) => v.quality === G.editorQuality(s)));
});
test('investments pay passive income; fanbox unlocks at a follower threshold', () => {
  const s = fresh(); s.money = 1e7;
  assert.ok(G.buyInvest(s, 'inv_fund')); const inc = G.investIncomePerSec(s);
  assert.ok(Math.abs(inc - 5000 * 0.04 / CFG.daySec) < 1e-9);
  assert.ok(G.investCost(s, 'inv_fund') > 5000, 'price grows per unit');
  assert.equal(G.unlockFanbox(s), false); s.followers = CFG.fanbox.unlockFollowers;
  assert.ok(G.unlockFanbox(s)); assert.ok(G.fanboxPerSec(s) > 0);
});
test('offline catch-up is capped and reported', () => {
  const s = fresh(); s.money = 1e6; G.hire(s, 'editor'); G.hire(s, 'manager'); G.buyInvest(s, 'inv_fund');
  s.lastSeen = 0;
  const sum = G.catchUp(s, 48 * 3600 * 1000);
  assert.equal(sum.seconds, CFG.offlineCapSec);
  assert.ok(sum.views > 0 && sum.auto > 0 && sum.invest > 0);
  assert.equal(G.catchUp(s, 48 * 3600 * 1000 + 5000), null, 'short gaps are silent');
});
test('title requirements', () => {
  const s = fresh(); s.money = 1e7;
  assert.ok(!G.availableTitles(s).includes('t_car'));
  G.rentItem(s, 'car_01');
  assert.ok(G.availableTitles(s, ['car_01']).includes('t_car'));
  assert.ok(!G.availableTitles(s, []).includes('t_car'));
  G.buyInvest(s, 'inv_land'); assert.ok(G.availableTitles(s, [], true).includes('t_invest'));
  const o = fresh('oyun'); assert.ok(G.availableTitles(o).includes('t_24h')); assert.ok(!G.availableTitles(o).includes('t_morning'));
  assert.ok(!G.availableTitles(o).includes('t_newpc')); o.money = 1e4; G.upgradeEquip(o, 'pc'); assert.ok(G.availableTitles(o).includes('t_newpc'));
});
