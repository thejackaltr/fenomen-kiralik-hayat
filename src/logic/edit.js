// Kurgu mini-game rules (pure): a playhead sweeps 0..1; tap "KES" while it is inside a green "iyi an" zone.
import { CFG } from './config.js';

export function makeZones(rnd, n = CFG.edit.zones, width = CFG.edit.zoneWidth) {
  // split 0.08..0.96 into n equal slots and put one zone at a random spot inside each slot
  const zones = [], lo = 0.08, span = (0.96 - lo) / n;
  for (let i = 0; i < n; i++) { const a = lo + i * span + rnd() * Math.max(0, span - width); zones.push({ a, b: a + width, used: false }); }
  return zones;
}
// returns 'perfect' | 'hit' | 'miss'
export function cut(zones, pos) {
  const z = zones.find((z) => !z.used && pos >= z.a && pos <= z.b);
  if (!z) return 'miss';
  z.used = true;
  const mid = (z.a + z.b) / 2, half = (z.b - z.a) / 2;
  return Math.abs(pos - mid) <= half * 0.35 ? 'perfect' : 'hit';
}
export function quality(results) {
  const E = CFG.edit;
  const hits = results.filter((r) => r !== 'miss').length, perfect = results.filter((r) => r === 'perfect').length;
  return Math.min(E.qMax, Math.round((E.qMin + hits * E.qPerHit + perfect * E.qPerfectBonus) * 100) / 100);
}
