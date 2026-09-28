// Balance simulation: a scripted "reasonable player". All numbers come from CFG.
// simulate(): one account (run) — milestone timeline for tuning the first 30–40 minutes.
// campaign(): several runs with "Kanalı Sat" + Şöhret tree spending — prestige pacing.
// Usage: npm run balance
import * as G from '../src/logic/game.js';
import { CFG, LUXURY, EQUIPMENT, INVESTMENTS, WEARABLES, FAME_TREE } from '../src/logic/config.js';

const FLEX_WEAR = WEARABLES.filter((w) => G.canRentWear(w.id) && w.style >= 0.06).map((w) => w.id);
// Şöhret spending order of the scripted player (cheap, useful first)
const TREE_ORDER = ['f_editor', 'f_watch_01', 'f_painting', 'f_camera', 'f_car_01', 'f_manager', 'f_sneaker', 'f_suit', 'f_watch_02', 'f_car_02', 'f_boat', 'f_villa'];

function step(s, st, o) {
  const mark = (k) => { if (!st.ms.find((m) => m.k === k)) st.ms.push({ k, t: +((st.t0 + s.sim) / 60).toFixed(1), run: st.run, rt: +(s.sim / 60).toFixed(1) }); return true; };
  if (s.ifsa.pending) G.resolveIfsa(s, s.trust < 45 ? 'apology' : (G.rand(s) < 0.5 ? 'apology' : 'ignore'));
  if (s.sim >= st.next) {
    const all = G.showable(s); const show = o.policy === 'flaunt' || s.trust > 40 ? all : all.filter((id) => G.owned(s, id)); const inv = G.investTypes(s) > 0;
    const titles = G.availableTitles(s, show, inv); const t = titles[Math.floor(G.rand(s) * titles.length)];
    const outfit = s.trust > 40 || o.policy === 'flaunt' ? s.wear.worn : G.honestOutfit(s);
    G.publish(s, { titleId: t, show, showInvest: inv, quality: Math.max(o.quality, G.editorQuality(s)), outfit });
    st.next = s.sim + o.shootEvery;
  }
  const tryBuy = () => {
    if (s.staff.editor === 0 && G.hire(s, 'editor')) return mark('kurgucu');
    if (s.staff.editor > 0 && s.staff.manager === 0 && G.hire(s, 'manager')) return mark('menajer');
    for (const l of LUXURY) {
      if (o.policy !== 'buyonly' && !G.hasItem(s, l.id) && s.money > G.rentPerDay(l.id) * 4 && G.rentItem(s, l.id)) return mark('kira:' + l.id);
      if (G.rented(s, l.id) && s.money > l.price * 1.2 && G.buyItem(s, l.id)) return mark('al:' + l.id);
      if (o.policy === 'buyonly' && !G.hasItem(s, l.id) && s.money > l.price * 1.2 && G.buyItem(s, l.id)) return mark('al:' + l.id);
    }
    if (o.wear) for (const id of FLEX_WEAR) {    // rented clothing
      if (!s.wear.owned.includes(id) && !s.wear.rented[id] && s.money > G.rentPerDay(id) * 6 && G.rentWear(s, id)) return mark('kirakiyafet:' + id);
      if (s.wear.rented[id] && s.money > G.priceOf(id) * 1.5 && G.buyWear(s, id)) return mark('alkiyafet:' + id);
    }
    const eq = EQUIPMENT.map((e) => ({ id: e.id, c: G.equipCost(e.id, s.equip[e.id]) })).filter((e) => s.equip[e.id] < CFG.equipMax).sort((a, b) => a.c - b.c)[0];
    if (eq && s.money > eq.c * 1.1 && G.upgradeEquip(s, eq.id)) return mark('ekipman' + Object.values(s.equip).reduce((a, b) => a + b));
    for (const id of ['editor', 'manager']) if (G.canHire(s, id) && s.staff[id] > 0 && s.money > G.staffCost(s, id) * 2 && G.hire(s, id)) return mark(id + s.staff[id]);
    for (const i of INVESTMENTS) if (s.money > G.investCost(s, i.id) * 1.5 && G.buyInvest(s, i.id)) return mark('yatirim:' + i.id);
    if (G.fanboxAvailable(s) && G.unlockFanbox(s)) return mark('fankutusu');
    return false;
  };
  for (let k = 0; k < 3; k++) if (!tryBuy()) break;
  G.tick(s, 1);
  if (s.money > 0) mark('ilk_para');
  if (G.canSell(s)) { mark('satilabilir'); if (st.sellAt == null) st.sellAt = s.sim; }
  if (s.meta.achievements.includes('rent_free')) mark('kiraliksiz_hayat');
  for (const f of [1e5, 1e6, 1e7]) if (s.followers >= f) mark('takipci_' + f);
  if (s.sim % 300 === 0) st.snaps.push({ run: st.run, min: +((st.t0 + s.sim) / 60).toFixed(0), money: Math.round(s.money), followers: Math.round(s.followers), trust: Math.round(s.trust), videos: s.stats.videos, ifsa: s.stats.ifsa, income: +G.incomePerSec(s).toFixed(1), fame: G.fameGain(s) });
  s.events.length = 0;
}
const defaults = { path: 'vlog', minutes: 40, seed: 7, quality: 1.25, shootEvery: 22, policy: 'mixed', wear: false };
export function simulate(opts = {}) {
  const o = Object.assign({}, defaults, opts);
  if (o.wear === false && o.path === 'luks') o.wear = true;
  const s = G.newGame(0, o.seed); G.createCharacter(s, { body: 'f' }); G.choosePath(s, o.path);
  const st = { ms: [], snaps: [], next: 0, run: 1, t0: 0 };
  while (s.sim < o.minutes * 60) step(s, st, o);
  return { s, ms: st.ms, snaps: st.snaps };
}
// prestige campaign: play a run, sell the channel once the next Şöhret point is "far" (stall), spend points, repeat
export function campaign(opts = {}) {
  const o = Object.assign({}, defaults, { runs: 4, maxRunMin: 90, stallMin: 6, minutes: 600 }, opts);
  if (o.wear === false && o.path === 'luks') o.wear = true;
  let s = G.newGame(0, o.seed); G.createCharacter(s, { body: 'f' }); G.choosePath(s, o.path);
  const st = { ms: [], snaps: [], next: 0, run: 1, t0: 0 }; const runs = [];
  let lastGain = 0, lastGainAt = 0;
  while (st.t0 + s.sim < o.minutes * 60 && st.run <= o.runs) {
    step(s, st, o);
    const g = G.fameGain(s); if (g > lastGain) { lastGain = g; lastGainAt = s.sim; }
    const stalled = g >= 1 && s.sim - lastGainAt > o.stallMin * 60;
    if ((stalled || s.sim >= o.maxRunMin * 60) && G.canSell(s) && st.run < o.runs) {
      runs.push({ run: st.run, sellable: +(st.sellAt / 60).toFixed(1), sold: +(s.sim / 60).toFixed(1), peak: Math.round(s.stats.peakFollowers), gain: g, owned: LUXURY.filter((l) => G.owned(s, l.id)).length });
      st.t0 += s.sim; s = G.sellChannel(s, 0); G.createCharacter(s, { body: 'f', channel: 'Yeni' }); G.choosePath(s, o.path);
      for (let again = true; again;) { again = false; for (const id of TREE_ORDER) if (G.buyFameNode(s, id)) { again = true; st.ms.push({ k: 'agac:' + id, t: +(st.t0 / 60).toFixed(1), run: st.run + 1, rt: 0 }); break; } }
      st.run++; st.next = 0; lastGain = 0; lastGainAt = 0; st.sellAt = null;
    }
  }
  runs.push({ run: st.run, sellable: st.sellAt == null ? null : +(st.sellAt / 60).toFixed(1), sold: null, played: +(s.sim / 60).toFixed(1), peak: Math.round(s.stats.peakFollowers), gain: G.fameGain(s), owned: LUXURY.filter((l) => G.owned(s, l.id)).length });
  return { s, ms: st.ms, snaps: st.snaps, runs };
}
if (process.argv[1] && process.argv[1].endsWith('balance.mjs')) {
  for (const [path, policy] of [['vlog', 'mixed'], ['oyun', 'mixed'], ['luks', 'mixed']]) {
    const r = simulate({ path, policy, minutes: 60 });
    console.log('\n== ' + path + ' / ' + policy + ' (tek hesap, 60 dk) ==');
    console.table(r.snaps.map(({ run, ...x }) => x));
    console.log(r.ms.map((m) => m.t + 'dk ' + m.k).join(', '));
  }
  for (const path of ['vlog', 'oyun', 'luks']) {
    const c = campaign({ path });
    console.log('\n== ' + path + ' / Kanalı Sat kampanyası ==');
    console.table(c.runs);
    console.log(c.ms.filter((m) => /satilabilir|kiraliksiz|agac|takipci|al:villa/.test(m.k)).map((m) => m.t + 'dk (hesap ' + m.run + ', ' + m.rt + 'dk) ' + m.k).join('\n'));
  }
}
