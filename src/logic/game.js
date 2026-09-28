// Pure game logic (no DOM). State is a plain JSON object; all catalogs/numbers come from config.js.
import { CFG, PATH, WEAR, LUX, EQ, STF, INV, TTL, TITLES, IFSA_CARDS, STARTER_WEAR, LUXURY, INVESTMENTS, EQUIPMENT, BODIES, SKINS, HAIRS } from './config.js';

// ---------- rng (seeded, stored in state so runs are reproducible) ----------
export function rand(s) {
  let t = (s.rng = (s.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const emit = (s, type, data) => { s.events.push(Object.assign({ type }, data || {})); };

export function newGame(now = Date.now(), seed = (Math.random() * 2 ** 32) >>> 0) {
  return {
    v: CFG.saveVersion, created: false, startedAt: now, lastSeen: now, sim: 0, rng: seed >>> 0, nextId: 1,
    char: { body: 'm', skin: 1, hair: 0, channel: '' }, path: null,
    money: CFG.start.money, followers: CFG.start.followers, trust: CFG.start.trust,
    wear: { owned: Object.values(STARTER_WEAR).filter(Boolean), worn: Object.assign({}, STARTER_WEAR), colors: {} },
    items: {},          // id -> { status: 'owned'|'rented', exposed: bool, since: sim }
    equip: { camera: 0, mic: 0, light: 0, pc: 0 },
    staff: { editor: 0, manager: 0 },
    invest: {},         // id -> count
    fanbox: false,
    videos: [],         // active (still earning) videos
    history: [],        // last few finished videos (for the channel page / share card)
    recent: [],         // publish times (sim) for fatigue
    buffs: [],          // { kind:'follow', mult, until }
    managerTimer: 0,
    ifsa: { pending: null, lastAt: -1e9, rentedVideos: 0, apologyDue: false },
    stats: { videos: 0, views: 0, earned: 0, ifsa: 0, apologies: 0, ignored: 0, repossessed: 0, rentPaid: 0, peakFollowers: 0, autoVideos: 0 },
    tut: 0, events: []
  };
}

// ---------- character / path ----------
export function createCharacter(s, { body, skin, hair, channel }) {
  if (!BODIES.includes(body)) body = 'm';
  s.char = { body, skin: clamp(skin | 0, 0, SKINS.length - 1), hair: clamp(hair | 0, 0, HAIRS.length - 1), channel: String(channel || '').slice(0, 24) };
  return s.char;
}
export function choosePath(s, id) {
  const p = PATH[id];
  if (!p || !p.playable) return false;
  s.path = id; s.created = true; return true;
}

// ---------- queries ----------
export const owned = (s, id) => s.items[id] && s.items[id].status === 'owned';
export const rented = (s, id) => s.items[id] && s.items[id].status === 'rented';
export const hasItem = (s, id) => !!s.items[id];
export function rentPerDay(id) { return Math.ceil(LUX[id].price * CFG.rent.ratePerDay); }
export function rentPerSec(s) { let r = 0; for (const [id, it] of Object.entries(s.items)) if (it.status === 'rented') r += rentPerDay(id) / CFG.daySec; return r; }
export function equipCost(id, level) { return Math.ceil(EQ[id].base * Math.pow(CFG.equipGrowth, level)); }
export function investCost(s, id) { return Math.ceil(INV[id].price * Math.pow(INV[id].growth, s.invest[id] || 0)); }
export function investTypes(s) { return INVESTMENTS.filter((x) => (s.invest[x.id] || 0) > 0).length; }
export function investIncomePerSec(s) { let r = 0; for (const x of INVESTMENTS) { const n = s.invest[x.id] || 0; for (let i = 0; i < n; i++) r += x.price * Math.pow(x.growth, i) * x.yieldPerDay / CFG.daySec; } return r; }
export function fanboxPerSec(s) { return s.fanbox ? s.followers * CFG.fanbox.perFollowerSec : 0; }
export function incomePerSec(s) { return investIncomePerSec(s) + fanboxPerSec(s) - rentPerSec(s); }
export function styleBonus(s) { let b = 0; for (const id of Object.values(s.wear.worn)) if (id && WEAR[id]) b += WEAR[id].style; return Math.min(CFG.styleCap, b); }
export function equipMult(s) {
  const w = PATH[s.path || 'vlog'].eqW; let m = 1;
  for (const e of EQUIPMENT) m += (s.equip[e.id] || 0) * CFG.equipEffect * (w[e.id] || 0);
  return m;
}
export function trustMult(s) { return CFG.trust.viewsMin + CFG.trust.viewsSpan * s.trust / CFG.trust.max; }
export function fatigue(s) { const n = s.recent.filter((t) => s.sim - t < CFG.video.fatigueWindowSec).length; return 1 / (1 + CFG.video.fatiguePerVideo * n); }
export function itemFlex(s, id) { const it = s.items[id]; if (!it) return 0; return LUX[id].flex * (it.status === 'rented' && it.exposed ? CFG.ifsa.exposedFlex : 1); }
export function editorQuality(s) { const l = s.staff.editor; return l ? STF.editor.levels[l - 1].quality : 0; }
export function managerInterval(s) { const l = s.staff.manager; return l ? STF.manager.levels[l - 1].interval : 0; }
export function ifsaChance(trust) { return clamp(CFG.ifsa.base + CFG.ifsa.slope * (CFG.trust.max - clamp(trust, 0, CFG.trust.max)) / CFG.trust.max, 0, CFG.ifsa.max); }

// ---------- titles ----------
function meets(s, t, show, showInvest) {
  if (!t.paths.includes(s.path)) return false;
  switch (t.needs) {
    case undefined: return true;
    case 'car': return show.some((id) => LUX[id] && LUX[id].cat === 'car');
    case 'villa': return show.includes('villa_01');
    case 'luxury': return show.length > 0;
    case 'pc': return s.equip.pc > 0;
    case 'invest': return showInvest && investTypes(s) > 0;
    case 'apology': return s.ifsa.apologyDue;
    default: return false;
  }
}
export function availableTitles(s, show = [], showInvest = false) {
  if (s.ifsa.apologyDue) return ['t_apology'];      // after "Özür videosu çek" the next video IS the apology
  return TITLES.filter((t) => !t.special && meets(s, t, show, showInvest)).map((t) => t.id);
}
// best title for the manager (highest mult)
export function bestTitle(s, show, showInvest) {
  const ids = availableTitles(s, show, showInvest);
  return ids.sort((a, b) => TTL[b].mult - TTL[a].mult)[0];
}
export function showable(s) { return Object.keys(s.items).filter((id) => LUX[id]); }

// ---------- video ----------
export function videoFactors(s, { titleId, show = [], showInvest = false, quality = 1 }) {
  show = show.filter((id) => s.items[id]);
  const flexSum = show.reduce((a, id) => a + itemFlex(s, id), 0);
  const p = PATH[s.path || 'vlog'];
  const t = TTL[titleId] || TTL.t_whatjob;
  const invest = showInvest && investTypes(s) > 0 ? 1 + CFG.investShowPerType * investTypes(s) : 1;
  const f = {
    raw: CFG.video.base + CFG.video.perFollower * Math.pow(Math.max(0, s.followers), CFG.video.followerExp),
    quality, equip: equipMult(s), flex: 1 + flexSum * p.flexW, style: 1 + styleBonus(s),
    title: t.mult * (titleId === 't_apology' ? CFG.ifsa.apologyTitleMult : 1), trust: trustMult(s), invest, fatigue: fatigue(s),
    boost: CFG.video.newChannelBoost[s.stats.videos] || 1
  };
  f.expected = f.raw * f.quality * f.equip * f.flex * f.style * f.title * f.trust * f.invest * f.fatigue * f.boost;
  let fb = 1; for (const b of s.buffs) if (b.kind === 'follow' && b.until > s.sim) fb *= b.mult;
  f.followPerView = CFG.video.followPerView * (1 + flexSum * CFG.followFromFlex) * fb;
  return f;
}
export function publish(s, { titleId, show = [], showInvest = false, quality = 1, auto = false }) {
  show = show.filter((id) => s.items[id]);
  if (!availableTitles(s, show, showInvest).includes(titleId)) titleId = bestTitle(s, show, showInvest) || 't_whatjob';
  const f = videoFactors(s, { titleId, show, showInvest, quality });
  const r = CFG.video.randMin + rand(s) * (CFG.video.randMax - CFG.video.randMin);
  const total = Math.round(f.expected * r);
  const rentedShown = show.filter((id) => rented(s, id));
  const v = { id: s.nextId++, titleId, show, showInvest: !!showInvest, quality, auto: !!auto, total, got: 0, age: 0, at: s.sim,
    mpv: CFG.video.moneyPerView, fpv: f.followPerView, exposed: rentedShown.filter((id) => s.items[id].exposed), money: 0, gained: 0,
    outfit: Object.assign({}, s.wear.worn), colors: Object.assign({}, s.wear.colors) };
  s.videos.push(v);
  if (s.videos.length > CFG.video.maxActive) finishVideo(s, s.videos[0]);
  s.recent.push(s.sim); s.recent = s.recent.filter((t) => s.sim - t < CFG.video.fatigueWindowSec);
  s.stats.videos++; if (auto) s.stats.autoVideos++;
  // Güven: showing rented luxury erodes trust, honest videos rebuild it
  if (rentedShown.length) s.trust = clamp(s.trust - CFG.trust.rentedShownCost, 0, CFG.trust.max);
  else s.trust = clamp(s.trust + CFG.trust.honestGain, 0, CFG.trust.max);
  if (titleId === 't_apology') { s.ifsa.apologyDue = false; s.trust = clamp(s.trust + CFG.trust.apologyVideoGain, 0, CFG.trust.max); }
  // İfşa roll (only for videos you publish yourself; the manager never shows rented items)
  if (rentedShown.length && !auto) rollIfsa(s, rentedShown);
  emit(s, 'published', { video: v.id, total, auto });
  return v;
}
function finishVideo(s, v) {
  const rest = v.total - v.got;
  if (rest > 0) credit(s, v, rest);
  s.videos = s.videos.filter((x) => x !== v);
  s.history.unshift({ id: v.id, titleId: v.titleId, views: v.total, money: v.money, show: v.show, outfit: v.outfit, colors: v.colors, exposed: v.exposed });
  s.history = s.history.slice(0, 8);
}
function credit(s, v, views) {
  v.got += views; const m = views * v.mpv, f = views * v.fpv;
  v.money += m; v.gained += f;
  s.money += m; s.followers += f; s.stats.views += views; s.stats.earned += m;
  if (s.followers > s.stats.peakFollowers) s.stats.peakFollowers = s.followers;
}

// ---------- İfşa ----------
export function pickCard(s, rentedShown) {
  const cats = new Set(rentedShown.map((id) => LUX[id].cat));
  const opts = IFSA_CARDS.filter((c) => c.trigger === 'any' || cats.has(c.trigger));
  const c = opts[Math.floor(rand(s) * opts.length)];
  const matching = rentedShown.filter((id) => c.trigger === 'any' || LUX[id].cat === c.trigger);
  return { cardId: c.id, itemId: matching.sort((a, b) => LUX[b].price - LUX[a].price)[0] };
}
function rollIfsa(s, rentedShown) {
  s.ifsa.rentedVideos++;
  if (s.ifsa.pending) return;
  if (s.ifsa.rentedVideos <= CFG.ifsa.graceVideos) return;
  if (s.sim - s.ifsa.lastAt < CFG.ifsa.cooldownSec) return;
  if (rand(s) >= ifsaChance(s.trust)) return;
  triggerIfsa(s, rentedShown);
}
export function triggerIfsa(s, rentedShown) {
  const pick = pickCard(s, rentedShown);
  const loss = Math.floor(s.followers * CFG.ifsa.followerLoss);
  s.followers -= loss; s.items[pick.itemId].exposed = true;
  s.ifsa.pending = Object.assign(pick, { loss }); s.ifsa.lastAt = s.sim; s.stats.ifsa++;
  emit(s, 'ifsa', s.ifsa.pending);
  return s.ifsa.pending;
}
// choice: 'apology' ("Özür videosu çek") | 'ignore' ("Görmezden gel")
export function resolveIfsa(s, choice) {
  const p = s.ifsa.pending; if (!p) return null;
  let delta;
  if (choice === 'apology') {
    delta = -Math.floor(s.followers * CFG.ifsa.apologyExtraLoss);
    s.trust = clamp(s.trust + CFG.trust.apologyGain, 0, CFG.trust.max);
    s.ifsa.apologyDue = true; s.stats.apologies++;
  } else {
    delta = Math.floor(s.followers * CFG.ifsa.ignoreBoost);
    s.trust = clamp(s.trust - CFG.trust.ignoreCost, 0, CFG.trust.max);
    s.buffs.push({ kind: 'follow', mult: CFG.ifsa.ignoreBuffMult, until: s.sim + CFG.ifsa.ignoreBuffSec });
    s.stats.ignored++;
  }
  s.followers = Math.max(0, s.followers + delta);
  s.ifsa.pending = null;
  return { choice, delta, trust: s.trust };
}

// ---------- shop ----------
function pay(s, cost) { if (s.money + 1e-9 < cost) return false; s.money -= cost; return true; }
export function buyItem(s, id) {
  const d = LUX[id]; if (!d || owned(s, id)) return false;
  if (!pay(s, d.price)) return false;
  s.items[id] = { status: 'owned', exposed: false, since: s.sim };  // buying clears the KİRALIK stigma
  emit(s, 'bought', { id }); return true;
}
export function rentItem(s, id) {
  const d = LUX[id]; if (!d || s.items[id]) return false;
  if (!pay(s, rentPerDay(id) * CFG.rent.upfrontDays)) return false;
  s.stats.rentPaid += rentPerDay(id) * CFG.rent.upfrontDays;
  s.items[id] = { status: 'rented', exposed: false, since: s.sim };
  emit(s, 'rented', { id }); return true;
}
export function returnItem(s, id) { if (!rented(s, id)) return false; delete s.items[id]; emit(s, 'returned', { id }); return true; }
export function buyWear(s, id) {
  const d = WEAR[id]; if (!d || s.wear.owned.includes(id)) return false;
  if (!pay(s, d.price)) return false;
  s.wear.owned.push(id); s.wear.worn[d.slot] = id; return true;
}
export function wear(s, id) { const d = WEAR[id]; if (!d || !s.wear.owned.includes(id)) return false; s.wear.worn[d.slot] = id; return true; }
export function unwear(s, slot) { if (slot === 'top' || slot === 'bottom' || slot === 'shoes') return false; s.wear.worn[slot] = null; return true; }
export function setColor(s, id, idx) { const d = WEAR[id]; if (!d) return false; s.wear.colors[id] = clamp(idx | 0, 0, d.palette.length - 1); return true; }
export function upgradeEquip(s, id) {
  if (!EQ[id]) return false; const l = s.equip[id] || 0; if (l >= CFG.equipMax) return false;
  if (!pay(s, equipCost(id, l))) return false; s.equip[id] = l + 1; return true;
}
export function staffCost(s, id) { const d = STF[id]; const l = s.staff[id] || 0; return l < d.levels.length ? d.levels[l].cost : Infinity; }
export function canHire(s, id) { const d = STF[id]; return !!d && (!d.requires || s.staff[d.requires] > 0) && (s.staff[id] || 0) < d.levels.length; }
export function hire(s, id) {
  if (!canHire(s, id)) return false;
  if (!pay(s, staffCost(s, id))) return false; s.staff[id] = (s.staff[id] || 0) + 1; return true;
}
export function buyInvest(s, id) { if (!INV[id]) return false; if (!pay(s, investCost(s, id))) return false; s.invest[id] = (s.invest[id] || 0) + 1; emit(s, 'invested', { id }); return true; }
export function fanboxAvailable(s) { return s.followers >= CFG.fanbox.unlockFollowers; }
export function unlockFanbox(s) { if (s.fanbox || !fanboxAvailable(s)) return false; if (!pay(s, CFG.fanbox.cost)) return false; s.fanbox = true; return true; }

// ---------- manager automation ----------
function managerVideo(s) {
  const show = showable(s).filter((id) => owned(s, id));
  const showInvest = investTypes(s) > 0;
  const titleId = bestTitle(s, show, showInvest);   // an owed apology video is published first
  if (!titleId) return null;
  return publish(s, { titleId, show, showInvest, quality: editorQuality(s), auto: true });
}

// ---------- time ----------
// advance simulation by dt seconds (split into small steps). Returns totals for the welcome-back popup.
export function tick(s, dt, step = 1) {
  const sum = { views: 0, money: 0, followers: 0, rent: 0, invest: 0, fanbox: 0, auto: 0, repossessed: [] };
  const m0 = s.money, f0 = s.followers, v0 = s.stats.views;
  let left = Math.max(0, dt);
  while (left > 1e-9) {
    const d = Math.min(step, left); left -= d;
    s.sim += d;
    const tau = CFG.video.tauSec;
    for (const v of s.videos.slice()) {
      const e0 = Math.exp(-v.age / tau); v.age += d; const e1 = Math.exp(-v.age / tau);
      const add = v.total * (e0 - e1);
      if (add > 0) credit(s, v, add);
      if (v.age >= tau * CFG.video.lifeTau) finishVideo(s, v);
    }
    const inv = investIncomePerSec(s) * d, fb = fanboxPerSec(s) * d, rent = rentPerSec(s) * d;
    s.money += inv + fb - rent; s.stats.earned += inv + fb; s.stats.rentPaid += rent;
    sum.invest += inv; sum.fanbox += fb; sum.rent += rent;
    // can't pay the rent -> the most expensive rented item is taken back (the unpaid part is written off)
    while (s.money < 0) {
      const r = Object.keys(s.items).filter((id) => rented(s, id)).sort((x, y) => LUX[y].price - LUX[x].price)[0];
      if (!r) { s.money = 0; break; }
      const unpaid = rentPerDay(r) / CFG.daySec * d;
      s.money += unpaid; s.stats.rentPaid -= unpaid; sum.rent -= unpaid;
      delete s.items[r]; s.stats.repossessed++; sum.repossessed.push(r);
      s.trust = clamp(s.trust - CFG.trust.repossessCost, 0, CFG.trust.max);
      emit(s, 'repossessed', { id: r });
    }
    // manager auto-publishes (needs an editor)
    if (s.staff.manager > 0 && s.staff.editor > 0) {
      s.managerTimer += d;
      const iv = managerInterval(s);
      while (s.managerTimer >= iv) { s.managerTimer -= iv; if (managerVideo(s)) sum.auto++; }
    }
    s.buffs = s.buffs.filter((b) => b.until > s.sim);
  }
  sum.views = s.stats.views - v0; sum.money = s.money - m0; sum.followers = s.followers - f0;
  return sum;
}
// offline catch-up: returns a summary (or null if the gap is too short to mention)
export function catchUp(s, now) {
  const gap = Math.min(CFG.offlineCapSec, Math.max(0, (now - s.lastSeen) / 1000));
  s.lastSeen = now;
  if (gap < 30) { if (gap > 0) tick(s, gap); return null; }
  const sum = tick(s, gap, CFG.offlineStepSec);
  sum.seconds = gap;
  return sum;
}
export { LUXURY, EQUIPMENT, INVESTMENTS };
