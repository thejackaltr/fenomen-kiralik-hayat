import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZones, cut, quality } from '../../src/logic/edit.js';
import { CFG } from '../../src/logic/config.js';

test('zones are inside the track and do not overlap', () => {
  for (let i = 0; i < 200; i++) {
    const z = makeZones(Math.random);
    assert.equal(z.length, CFG.edit.zones);
    for (let k = 0; k < z.length; k++) { assert.ok(z[k].a >= 0 && z[k].b <= 1); if (k) assert.ok(z[k].a >= z[k - 1].b); }
  }
});
test('cuts: perfect / hit / miss; a zone counts once', () => {
  const z = [{ a: 0.2, b: 0.3, used: false }, { a: 0.6, b: 0.7, used: false }];
  assert.equal(cut(z, 0.25), 'perfect'); assert.equal(cut(z, 0.25), 'miss');
  assert.equal(cut(z, 0.61), 'hit'); assert.equal(cut(z, 0.5), 'miss');
});
test('quality: more good cuts, better video', () => {
  assert.equal(quality([]), CFG.edit.qMin);
  assert.ok(quality(['hit']) > quality(['miss']));
  assert.ok(quality(['perfect', 'perfect', 'perfect']) <= CFG.edit.qMax);
  assert.ok(quality(['perfect', 'perfect', 'perfect']) > quality(['hit', 'hit', 'hit']));
});
