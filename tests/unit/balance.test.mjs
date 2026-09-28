import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../../tools/balance.mjs';

const at = (r, k) => (r.ms.find((m) => m.k === k) || { t: Infinity }).t;
for (const path of ['vlog', 'oyun']) {
  test('first 30 minutes pacing (' + path + ')', () => {
    const r = simulate({ path, minutes: 40 });
    assert.ok(at(r, 'ekipman1') <= 2, 'first equipment within 2 min');
    assert.ok(at(r, 'kira:watch_01') <= 6, 'first rent within 6 min');
    assert.ok(at(r, 'kurgucu') <= 14, 'editor within 14 min');
    assert.ok(at(r, 'menajer') <= 25, 'manager within 25 min');
    assert.ok(at(r, 'kira:car_01') <= 25, 'car rent within 25 min');
    assert.ok(Math.min(...r.ms.filter((m) => m.k.startsWith('yatirim')).map((m) => m.t)) <= 30, 'first investment within 30 min');
    assert.ok(Math.min(...r.ms.filter((m) => m.k.startsWith('al:')).map((m) => m.t)) <= 25, 'first rented->owned within 25 min');
    // something to buy every couple of minutes in the first 30 minutes
    const early = r.ms.filter((m) => m.t <= 30).map((m) => m.t).sort((a, b) => a - b);
    for (let i = 1; i < early.length; i++) assert.ok(early[i] - early[i - 1] <= 3.5, 'gap at ' + early[i]);
    for (const snap of r.snaps) for (const v of Object.values(snap)) assert.ok(Number.isFinite(v));
    assert.ok(r.s.money < 1e9 && r.s.followers < 1e9, 'no runaway numbers at 40 min');
  });
}
