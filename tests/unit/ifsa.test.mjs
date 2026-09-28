import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/logic/game.js';
import { CFG, IFSA_CARDS } from '../../src/logic/config.js';

const fresh = (seed = 3) => { const s = G.newGame(0, seed); G.choosePath(s, 'vlog'); s.stats.videos = 5; s.money = 1e7; s.followers = 10000; return s; };

test('İfşa probability rises as Güven falls (monotonic, bounded)', () => {
  let prev = -1;
  for (let g = 100; g >= 0; g -= 5) { const p = G.ifsaChance(g); assert.ok(p >= prev); prev = p; }
  assert.equal(G.ifsaChance(100), CFG.ifsa.base);
  assert.ok(G.ifsaChance(0) <= CFG.ifsa.max);
  assert.ok(G.ifsaChance(20) > G.ifsaChance(80) * 2);
});
test('empirical İfşa frequency tracks Güven', () => {
  const rate = (trust) => {
    let hits = 0; const N = 3000;
    for (let i = 0; i < N; i++) {
      const s = fresh(1000 + i); G.rentItem(s, 'car_01'); s.ifsa.rentedVideos = 5; s.trust = trust;
      G.publish(s, { titleId: 't_car', show: ['car_01'] });
      if (s.ifsa.pending) hits++;
    }
    return hits / N;
  };
  const hi = rate(90), lo = rate(20);
  assert.ok(Math.abs(hi - G.ifsaChance(90 - CFG.trust.rentedShownCost)) < 0.03, 'hi ' + hi);
  assert.ok(Math.abs(lo - G.ifsaChance(20 - CFG.trust.rentedShownCost)) < 0.04, 'lo ' + lo);
  assert.ok(lo > hi * 2);
});
test('no İfşa without rented items; grace for the first rented video; cooldown', () => {
  const s = fresh(); s.trust = 0; G.buyItem(s, 'car_01');
  for (let i = 0; i < 50; i++) G.publish(s, { titleId: 't_car', show: ['car_01'] });
  assert.equal(s.stats.ifsa, 0, 'owned items are safe');
  const r = fresh(); r.trust = 0; G.rentItem(r, 'watch_01');
  G.publish(r, { titleId: 't_spent', show: ['watch_01'] });
  assert.equal(r.ifsa.pending, null, 'grace video');
  r.ifsa.lastAt = r.sim; r.ifsa.rentedVideos = 5;
  for (let i = 0; i < 30; i++) G.publish(r, { titleId: 't_spent', show: ['watch_01'] });
  assert.equal(r.ifsa.pending, null, 'cooldown');
});
test('cards match the exposed item category; follower loss on reveal; item gets exposed', () => {
  const s = fresh(); G.rentItem(s, 'villa_01');
  const c = G.pickCard(s, ['villa_01']); assert.ok(['ifsa_sign', 'ifsa_live'].includes(c.cardId)); assert.equal(c.itemId, 'villa_01');
  const w = G.pickCard(s, ['watch_01']); assert.ok(['ifsa_watch', 'ifsa_live'].includes(w.cardId));
  const f0 = s.followers; const p = G.triggerIfsa(s, ['villa_01']);
  assert.equal(s.followers, f0 - Math.floor(f0 * CFG.ifsa.followerLoss)); assert.equal(p.loss, Math.floor(f0 * CFG.ifsa.followerLoss));
  assert.equal(s.items.villa_01.exposed, true);
  assert.equal(IFSA_CARDS.length, 6);
});
test('"Özür videosu çek": followers drop, Güven recovers a bit, next video is the apology', () => {
  const s = fresh(); G.rentItem(s, 'car_01'); s.trust = 30; G.triggerIfsa(s, ['car_01']);
  const f0 = s.followers; const r = G.resolveIfsa(s, 'apology');
  assert.ok(r.delta < 0); assert.ok(s.followers < f0); assert.equal(s.trust, 30 + CFG.trust.apologyGain);
  assert.deepEqual(G.availableTitles(s, ['car_01']), ['t_apology']);
  G.publish(s, { titleId: 't_apology' }); assert.equal(s.ifsa.apologyDue, false);
});
test('"Görmezden gel": followers briefly rise, Güven drops hard, İfşa gets likelier', () => {
  const s = fresh(); G.rentItem(s, 'car_01'); s.trust = 60; G.triggerIfsa(s, ['car_01']);
  const p0 = G.ifsaChance(s.trust), f0 = s.followers; const r = G.resolveIfsa(s, 'ignore');
  assert.ok(r.delta > 0 && s.followers > f0); assert.equal(s.trust, 60 - CFG.trust.ignoreCost);
  assert.ok(G.ifsaChance(s.trust) > p0);
  assert.ok(s.buffs.some((b) => b.kind === 'follow' && b.mult > 1));
  G.tick(s, CFG.ifsa.ignoreBuffSec + 1); assert.equal(s.buffs.length, 0, 'the boost is brief');
});
test('showing rented items erodes Güven, honest videos rebuild it', () => {
  const s = fresh(); G.rentItem(s, 'car_01'); s.ifsa.lastAt = 0; s.sim = 1; s.trust = 50;
  s.ifsa.rentedVideos = -100; // keep İfşa out of this test
  G.publish(s, { titleId: 't_car', show: ['car_01'] }); assert.equal(s.trust, 50 - CFG.trust.rentedShownCost);
  G.publish(s, { titleId: 't_morning', show: [] }); assert.equal(s.trust, 50 - CFG.trust.rentedShownCost + CFG.trust.honestGain);
});
