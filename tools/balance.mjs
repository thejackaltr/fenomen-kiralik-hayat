// Balance simulation: a scripted "reasonable player" for the first 40 minutes. All numbers come from CFG.
// Prints a milestone timeline so the first 20–30 minutes can be tuned. Usage: npm run balance
import * as G from '../src/logic/game.js';
import { CFG, LUXURY, EQUIPMENT, INVESTMENTS } from '../src/logic/config.js';

export function simulate({ path = 'vlog', minutes = 40, seed = 7, quality = 1.25, shootEvery = 22, policy = 'mixed', log = false } = {}) {
  const s = G.newGame(0, seed); G.createCharacter(s, { body: 'f' }); G.choosePath(s, path);
  const ms = []; const mark = (k) => { if (!ms.find((m) => m.k === k)) ms.push({ k, t: +(s.sim / 60).toFixed(1) }); };
  let next = 0;
  const snaps = [];
  while (s.sim < minutes * 60) {
    if (s.ifsa.pending) G.resolveIfsa(s, s.trust < 45 ? 'apology' : (G.rand(s) < 0.5 ? 'apology' : 'ignore'));
    if (s.sim >= next) {
      const all = G.showable(s); const show = policy === 'flaunt' || s.trust > 40 ? all : all.filter((id) => G.owned(s, id)); const inv = G.investTypes(s) > 0;
      const titles = G.availableTitles(s, show, inv); const t = titles.sort((a, b) => 0)[Math.floor(G.rand(s) * titles.length)];
      G.publish(s, { titleId: t, show, showInvest: inv, quality: Math.max(quality, G.editorQuality(s)) });
      next = s.sim + shootEvery;
    }
    // spending policy
    const tryBuy = () => {
      if (s.staff.editor === 0 && G.hire(s, 'editor')) return mark('kurgucu');
      if (s.staff.editor > 0 && s.staff.manager === 0 && G.hire(s, 'manager')) return mark('menajer');
      for (const l of LUXURY) {
        if (policy !== 'buyonly' && !G.hasItem(s, l.id) && s.money > G.rentPerDay(l.id) * 4 && G.rentItem(s, l.id)) return mark('kira:' + l.id);
        if (G.rented(s, l.id) && s.money > l.price * 1.2 && G.buyItem(s, l.id)) return mark('al:' + l.id);
        if (policy === 'buyonly' && !G.hasItem(s, l.id) && s.money > l.price * 1.2 && G.buyItem(s, l.id)) return mark('al:' + l.id);
      }
      const eq = EQUIPMENT.map((e) => ({ id: e.id, c: G.equipCost(e.id, s.equip[e.id]) })).sort((a, b) => a.c - b.c)[0];
      if (s.money > eq.c * 1.1 && G.upgradeEquip(s, eq.id)) return mark('ekipman' + Object.values(s.equip).reduce((a, b) => a + b));
      for (const i of INVESTMENTS) if (s.money > G.investCost(s, i.id) * 1.5 && G.buyInvest(s, i.id)) return mark('yatirim:' + i.id);
      if (G.fanboxAvailable(s) && G.unlockFanbox(s)) return mark('fankutusu');
      return false;
    };
    for (let k = 0; k < 3; k++) if (!tryBuy()) break;
    G.tick(s, 1);
    if (s.money > 0) mark('ilk_para');
    if (s.sim % 300 === 0) snaps.push({ min: s.sim / 60, money: Math.round(s.money), followers: Math.round(s.followers), trust: Math.round(s.trust), videos: s.stats.videos, ifsa: s.stats.ifsa, income: +G.incomePerSec(s).toFixed(1) });
    s.events.length = 0;
  }
  return { s, ms, snaps };
}
if (process.argv[1] && process.argv[1].endsWith('balance.mjs')) {
  for (const [path, policy] of [['vlog', 'mixed'], ['oyun', 'mixed'], ['vlog', 'flaunt']]) {
    const r = simulate({ path, policy });
    console.log('\n== ' + path + ' / ' + policy + ' ==');
    console.table(r.snaps);
    console.log(r.ms.map((m) => m.t + 'dk ' + m.k).join('\n'));
  }
}
