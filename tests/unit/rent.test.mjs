import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/logic/game.js';
import { CFG, LUX } from '../../src/logic/config.js';

const fresh = () => { const s = G.newGame(0, 7); G.choosePath(s, 'vlog'); s.stats.videos = 5; return s; };

test('renting charges one day upfront, then rent per in-game day', () => {
  const s = fresh(); s.money = 10000;
  const day = G.rentPerDay('watch_01');
  assert.equal(day, Math.ceil(LUX.watch_01.price * CFG.rent.ratePerDay));
  assert.ok(G.rentItem(s, 'watch_01'));
  assert.equal(s.money, 10000 - day);
  G.tick(s, CFG.daySec);
  assert.ok(Math.abs(s.money - (10000 - 2 * day)) < 1e-6);
  assert.equal(G.rentItem(s, 'watch_01'), false, 'cannot rent twice');
});
test('rented items give exactly the same flex and follower boost as owned ones', () => {
  const a = fresh(), b = fresh(); a.money = b.money = 1e6;
  G.rentItem(a, 'car_01'); G.buyItem(b, 'car_01');
  const fa = G.videoFactors(a, { titleId: 't_car', show: ['car_01'] }), fb = G.videoFactors(b, { titleId: 't_car', show: ['car_01'] });
  assert.equal(fa.flex, fb.flex); assert.equal(fa.followPerView, fb.followPerView); assert.ok(fa.flex > 1);
});
test('buying is expensive upfront, renting costs daily; buying out ends the rent', () => {
  const s = fresh(); s.money = 1e6;
  G.rentItem(s, 'car_01'); assert.ok(G.rentPerSec(s) > 0);
  assert.ok(G.buyItem(s, 'car_01')); assert.equal(s.items.car_01.status, 'owned'); assert.equal(G.rentPerSec(s), 0);
  assert.equal(G.buyItem(s, 'car_01'), false, 'already owned');
});
test('buying clears the İfşa stigma; exposed rented items lose most of their flex', () => {
  const s = fresh(); s.money = 1e6; G.rentItem(s, 'car_01');
  const f0 = G.itemFlex(s, 'car_01'); s.items.car_01.exposed = true;
  assert.ok(Math.abs(G.itemFlex(s, 'car_01') - f0 * CFG.ifsa.exposedFlex) < 1e-9);
  G.buyItem(s, 'car_01'); assert.equal(s.items.car_01.exposed, false); assert.equal(G.itemFlex(s, 'car_01'), f0);
});
test('returning a rented item stops the rent; owned items cannot be returned', () => {
  const s = fresh(); s.money = 1e6; G.rentItem(s, 'watch_01'); G.buyItem(s, 'painting_01');
  assert.ok(G.returnItem(s, 'watch_01')); assert.equal(s.items.watch_01, undefined);
  assert.equal(G.returnItem(s, 'painting_01'), false);
});
test('unpaid rent: the most expensive rented item is repossessed, trust drops, money floors at 0', () => {
  const s = fresh(); s.money = G.rentPerDay('villa_01') + G.rentPerDay('watch_01') + 5;
  assert.ok(G.rentItem(s, 'villa_01')); assert.ok(G.rentItem(s, 'watch_01'));
  const t0 = s.trust;
  G.tick(s, 10);   // 5 ¤ covers the watch for 10 s but not the villa
  assert.equal(s.items.villa_01, undefined); assert.ok(s.items.watch_01);
  assert.equal(s.stats.repossessed, 1); assert.equal(s.trust, t0 - CFG.trust.repossessCost);
  assert.ok(s.money >= 0);
  assert.ok(s.events.some((e) => e.type === 'repossessed' && e.id === 'villa_01'));
});
test('the manager only shows owned items (never rented)', () => {
  const s = fresh(); s.money = 1e7; G.hire(s, 'editor'); G.hire(s, 'manager');
  G.rentItem(s, 'car_01'); G.buyItem(s, 'watch_01');
  G.tick(s, G.managerInterval(s) + 0.1);
  const v = s.videos[s.videos.length - 1];
  assert.ok(v.auto); assert.deepEqual(v.show, ['watch_01']);
});
