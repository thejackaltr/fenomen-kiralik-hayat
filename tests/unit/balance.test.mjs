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

// ---------- v2: Lüks Yaşam, audience saturation, Kanalı Sat prestige ----------
import { campaign } from '../../tools/balance.mjs';
test('Lüks Yaşam pacing: playable end to end, early game like the others', () => {
  const r = simulate({ path: 'luks', minutes: 40 });
  assert.ok(at(r, 'ekipman1') <= 2 && at(r, 'kira:watch_01') <= 6 && at(r, 'kurgucu') <= 14 && at(r, 'menajer') <= 25);
  assert.ok(r.ms.some((m) => m.k.startsWith('kirakiyafet:')), 'rents clothing');
  assert.ok(r.s.stats.ifsa > simulate({ path: 'vlog', minutes: 40 }).s.stats.ifsa, 'more İfşa than vlog');
});
for (const path of ['vlog', 'oyun', 'luks']) {
  test('first Kanalı Sat is reachable in run 1 (' + path + ')', () => {
    const t = at(simulate({ path, minutes: 60 }), 'satilabilir');
    assert.ok(t >= 25 && t <= 45, 'sellable at ' + t + ' min');
  });
}
test('no runaway: single account after 150 min stays below 1e8 followers', () => {
  for (const path of ['vlog', 'luks']) { const r = simulate({ path, minutes: 150 }); assert.ok(r.s.followers < 1e8, path + ' ' + r.s.followers); }
});
test('prestige: each new account reaches Kanalı Sat sooner; content lasts far beyond 40 min', () => {
  for (const path of ['vlog', 'luks']) {
    const c = campaign({ path, minutes: 300 });
    assert.ok(c.runs.length >= 3);
    for (let i = 1; i < c.runs.length; i++) assert.ok(c.runs[i].sellable < c.runs[i - 1].sellable, path + ' run ' + (i + 1) + ' sellable sooner');
    const kh = c.ms.find((m) => m.k === 'kiraliksiz_hayat');
    assert.ok(kh && kh.t >= 90 && kh.run >= 2, path + ': Kiralıksız Hayat after 90 min and after a sale (' + (kh && kh.t) + ')');
    assert.ok(c.runs[1].peak > c.runs[0].peak, 'run 2 gets further than run 1');
  }
});
