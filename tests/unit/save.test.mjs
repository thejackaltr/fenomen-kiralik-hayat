import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../../src/logic/game.js';
import { serialize, deserialize, save, load, SAVE_KEY } from '../../src/logic/save.js';
import tr from '../../src/locales/tr.json' with { type: 'json' };

function played() {
  const s = G.newGame(1000, 9); G.createCharacter(s, { body: 'f', skin: 3, hair: 4, channel: 'Kanalım' }); G.choosePath(s, 'oyun');
  s.money = 1e6; G.rentItem(s, 'car_01'); G.buyItem(s, 'watch_01'); G.buyWear(s, 'glasses_sun_01'); G.setColor(s, 'glasses_sun_01', 2);
  G.upgradeEquip(s, 'pc'); G.hire(s, 'editor'); G.buyInvest(s, 'inv_fund');
  G.publish(s, { titleId: 't_24h', show: ['watch_01'] }); G.tick(s, 30);
  s.items.car_01.exposed = true;
  return s;
}
test('save/load round-trip keeps everything', () => {
  const s = played(); const r = deserialize(serialize(s));
  for (const k of ['money', 'followers', 'trust', 'path', 'sim', 'fanbox', 'rng']) assert.deepEqual(r[k], s[k], k);
  assert.deepEqual(r.items, s.items); assert.deepEqual(r.wear, s.wear); assert.deepEqual(r.char, s.char);
  assert.deepEqual(r.equip, s.equip); assert.deepEqual(r.staff, s.staff); assert.deepEqual(r.invest, s.invest);
  assert.equal(r.videos.length, s.videos.length); assert.equal(r.videos[0].titleId, 't_24h');
});
test('saves store IDs, never display names', () => {
  const json = serialize(played());
  assert.ok(json.includes('"car_01"') && json.includes('glasses_sun_01') && json.includes('t_24h'));
  for (const name of [tr.items.names.car_01, tr.items.names.watch_01, tr.wear.glasses_sun_01, tr.video.titles.t_24h]) assert.ok(!json.includes(name), name);
  assert.ok(!json.includes('"events"'));
});
test('unknown IDs and bad values are dropped/clamped on load', () => {
  const o = JSON.parse(serialize(played()));
  o.items.car_99 = { status: 'owned' }; o.items.watch_01.status = 'stolen';
  o.wear.owned.push('hat_zz'); o.wear.worn.glasses = 'hat_zz'; o.equip.camera = 999; o.invest.inv_moon = 3; o.path = 'luks'; o.money = -5; o.trust = 500;
  const r = deserialize(JSON.stringify(o));
  assert.equal(r.items.car_99, undefined); assert.equal(r.items.watch_01, undefined);
  assert.ok(!r.wear.owned.includes('hat_zz')); assert.equal(r.wear.worn.glasses, null);
  assert.equal(r.equip.camera, 6); assert.equal(r.invest.inv_moon, undefined);
  assert.equal(r.path, null); assert.equal(r.created, false); assert.equal(r.money, 0); assert.equal(r.trust, 100);
});
test('corrupt or foreign data loads as null', () => {
  assert.equal(deserialize('{nope'), null); assert.equal(deserialize('null'), null); assert.equal(deserialize('{"a":1}'), null);
});
test('storage helpers use the versioned key', () => {
  const mem = new Map(); const st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = played(); assert.ok(save(st, s)); assert.ok(mem.has(SAVE_KEY));
  assert.equal(load(st).money, s.money);
});
