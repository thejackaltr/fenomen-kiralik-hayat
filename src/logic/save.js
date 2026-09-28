// Local save only (v1 has no backend). Everything is stored by ID and validated against the catalogs on load,
// so renamed/translated texts never break a save and unknown IDs are dropped.
// v1 -> v2 migration is lossless: every v1 field is kept; new v2 fields (meta, wear.rented) get defaults.
import { CFG, WEAR, LUX, EQ, STF, INV, TTL, PATH, CARD, BODIES, SKINS, HAIRS, STARTER_WEAR, FAME_NODES, ACHIEVEMENTS } from './config.js';
import { newGame, newMeta, canRentWear } from './game.js';

export const SAVE_KEY = 'fenomen_save_v1';
const num = (x, d = 0) => (typeof x === 'number' && isFinite(x) ? x : d);

export function serialize(s) {
  const o = Object.assign({}, s); delete o.events;
  return JSON.stringify(o);
}
export function deserialize(str, now = Date.now()) {
  let o; try { o = typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return null; }
  if (!o || typeof o !== 'object' || typeof o.v !== 'number') return null;
  const s = newGame(num(o.startedAt, now), num(o.rng, 1) >>> 0);
  s.created = !!o.created; s.lastSeen = num(o.lastSeen, now); s.sim = num(o.sim); s.nextId = num(o.nextId, 1);
  const c = o.char || {};
  s.char = { body: BODIES.includes(c.body) ? c.body : 'm', skin: Math.min(SKINS.length - 1, Math.max(0, num(c.skin, 1) | 0)), hair: Math.min(HAIRS.length - 1, Math.max(0, num(c.hair) | 0)), channel: String(c.channel || '').slice(0, 24) };
  s.path = PATH[o.path] && PATH[o.path].playable ? o.path : null;
  if (!s.path) s.created = false;
  s.money = Math.max(0, num(o.money)); s.followers = Math.max(0, num(o.followers)); s.trust = Math.min(CFG.trust.max, Math.max(0, num(o.trust, CFG.start.trust)));
  const w = o.wear || {};
  s.wear.owned = Array.from(new Set([...(Array.isArray(w.owned) ? w.owned : []).filter((id) => WEAR[id]), ...Object.values(STARTER_WEAR).filter(Boolean)]));
  for (const [id, r] of Object.entries(w.rented || {})) if (canRentWear(id) && !s.wear.owned.includes(id) && r) s.wear.rented[id] = { exposed: !!r.exposed, since: num(r.since) };
  for (const slot of Object.keys(STARTER_WEAR)) { const id = w.worn && w.worn[slot]; s.wear.worn[slot] = id && WEAR[id] && WEAR[id].slot === slot && (s.wear.owned.includes(id) || s.wear.rented[id]) ? id : STARTER_WEAR[slot]; }
  for (const [id, i] of Object.entries(w.colors || {})) if (WEAR[id]) s.wear.colors[id] = Math.min(WEAR[id].palette.length - 1, Math.max(0, num(i) | 0));
  for (const [id, it] of Object.entries(o.items || {})) if (LUX[id] && it && (it.status === 'owned' || it.status === 'rented')) s.items[id] = { status: it.status, exposed: it.status === 'rented' && !!it.exposed, since: num(it.since) };
  for (const id of Object.keys(EQ)) s.equip[id] = Math.min(CFG.equipMax, Math.max(0, num(o.equip && o.equip[id]) | 0));
  for (const id of Object.keys(STF)) s.staff[id] = Math.min(STF[id].levels.length, Math.max(0, num(o.staff && o.staff[id]) | 0));
  for (const [id, n] of Object.entries(o.invest || {})) if (INV[id]) s.invest[id] = Math.max(0, num(n) | 0);
  s.fanbox = !!o.fanbox;
  const okVideo = (v) => v && TTL[v.titleId] && Array.isArray(v.show);
  s.videos = (Array.isArray(o.videos) ? o.videos : []).filter(okVideo).map((v) => Object.assign({}, v, { show: v.show.filter((id) => LUX[id]), exposed: (v.exposed || []).filter((id) => LUX[id] || WEAR[id]) }));
  s.history = (Array.isArray(o.history) ? o.history : []).filter(okVideo).slice(0, 8);
  s.recent = (Array.isArray(o.recent) ? o.recent : []).filter((x) => typeof x === 'number');
  s.buffs = (Array.isArray(o.buffs) ? o.buffs : []).filter((b) => b && b.kind === 'follow');
  s.managerTimer = num(o.managerTimer);
  const f = o.ifsa || {};
  s.ifsa = { pending: f.pending && CARD[f.pending.cardId] && (LUX[f.pending.itemId] || WEAR[f.pending.itemId]) ? f.pending : null, lastAt: num(f.lastAt, -1e9), rentedVideos: num(f.rentedVideos), apologyDue: !!f.apologyDue };
  for (const k of Object.keys(s.stats)) s.stats[k] = num(o.stats && o.stats[k]);
  s.tut = num(o.tut);
  const m = o.meta || {}, d = newMeta();           // v1 saves have no meta -> defaults
  const ach = new Set(ACHIEVEMENTS.map((a) => a.id));
  s.meta = { fame: Math.max(0, num(m.fame) | 0), fameEarned: Math.max(0, num(m.fameEarned) | 0), unlocks: (Array.isArray(m.unlocks) ? m.unlocks : d.unlocks).filter((id) => FAME_NODES[id]),
    achievements: (Array.isArray(m.achievements) ? m.achievements : d.achievements).filter((id) => ach.has(id)), sales: Math.max(0, num(m.sales) | 0), bestFollowers: Math.max(num(m.bestFollowers), s.stats.peakFollowers) };
  if (o.lastSale && typeof o.lastSale.gain === 'number') s.lastSale = { gain: o.lastSale.gain, followers: num(o.lastSale.followers) };
  s.v = CFG.saveVersion;
  return s;
}
export function load(storage, now) { try { const r = storage.getItem(SAVE_KEY); return r ? deserialize(r, now) : null; } catch (e) { return null; } }
export function save(storage, s) { try { storage.setItem(SAVE_KEY, serialize(s)); return true; } catch (e) { return false; } }
