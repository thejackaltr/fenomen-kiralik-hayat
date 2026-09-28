// Every tunable number and every catalog lives here. Names/texts live in src/locales/*.json (keyed by ID).
// Saves store only IDs (e.g. car_01), never display names.
export const CFG = {
  saveVersion: 2,
  daySec: 240,                 // one in-game "gün" in real seconds (rent is quoted per day)
  offlineCapSec: 8 * 3600,     // offline earnings cap
  offlineStepSec: 5,
  start: { money: 0, followers: 0, trust: 70 },
  video: {
    base: 60,                  // views of a brand-new channel
    perFollower: 4,            // views per follower^followerExp
    followerExp: 0.6,
    moneyPerView: 0.3,
    followPerView: 0.15,
    tauSec: 35,                // views arrive as total*(1-e^(-t/tau))
    lifeTau: 6,                // a video is finished after lifeTau*tau
    fatigueWindowSec: 90,      // publishing too often tires the audience
    fatiguePerVideo: 0.15,
    randMin: 0.85, randMax: 1.2,
    maxActive: 14,
    newChannelBoost: [3, 2.2, 1.6],   // the algorithm loves brand-new channels (first 3 videos)
    shootSec: 2.2,             // "Çekiliyor…" animation (UI only)
    // v2 audience saturation: follower gain per view x 1/(1+followers/satFollowers)^satExp — stops the v1 runaway after ~30 min
    satFollowers: 20000, satExp: 0.7
  },
  edit: {                      // kurgu mini-game
    durationSec: 6, zones: 3, zoneWidth: 0.12, maxCuts: 3,
    qMin: 0.6, qPerHit: 0.3, qPerfectBonus: 0.05, qMax: 1.65
  },
  trust: {
    max: 100, rentedShownCost: 3, honestGain: 2, apologyGain: 15, apologyVideoGain: 5, ignoreCost: 25, repossessCost: 10,
    viewsMin: 0.7, viewsSpan: 0.6  // views multiplier = viewsMin + viewsSpan * trust/100
  },
  ifsa: {
    base: 0.04, slope: 0.5, max: 0.6,  // P(İfşa) per video showing rented items = base + slope*(100-trust)/100
    graceVideos: 1,                    // the first video with a rented item never triggers (tutorial)
    cooldownSec: 60,
    followerLoss: 0.08,                // on reveal
    apologyExtraLoss: 0.04,            // "Özür videosu çek"
    ignoreBoost: 0.03,                 // "Görmezden gel": brief rise…
    ignoreBuffMult: 1.5, ignoreBuffSec: 60,
    exposedFlex: 0.3,                  // an exposed rented item keeps only 30% of its flex
    apologyTitleMult: 1.5
  },
  rent: { ratePerDay: 0.03, wearRatePerDay: 0.05, wearMinPrice: 700, upfrontDays: 1 },
  styleCap: 0.5,
  followFromFlex: 0.5,         // follower bonus per point of flex (rented = same as owned)
  investShowPerType: 0.2,      // showing investments: views x (1 + 0.2 * owned investment types)
  fanbox: { unlockFollowers: 5000, cost: 3000, perFollowerSec: 0.0015 },
  equipGrowth: 2.3, equipMax: 6, equipEffect: 0.15,   // equipment bonuses add up: 1 + sum(level*effect*pathWeight)
  share: { url: 'https://thejackaltr.github.io/fenomen-kiralik-hayat/', utm: 'utm_source=share&utm_medium=video_cover&utm_campaign=fenomen' }
};

export const BODIES = ['m', 'f'];
export const SKINS = ['#f2d0b4', '#e8b48a', '#c68a60', '#8a5a3a'];
export const HAIRS = ['#2a1c14', '#6a3a1e', '#c8902e', '#e8d27a', '#b0302a', '#1c1c24'];

// career paths (content types). Only playable ones can be picked in v1.
export const PATHS = [
  { id: 'vlog', playable: true, flexW: 1.0, rentFollowMult: 1, ifsaMult: 1, rentTrustMult: 1, eqW: { camera: 1, mic: 0.6, light: 1, pc: 0.3 }, home: 'bg_room_01' },
  { id: 'oyun', playable: true, flexW: 0.6, rentFollowMult: 1, ifsaMult: 1, rentTrustMult: 1, eqW: { camera: 0.5, mic: 1, light: 0.5, pc: 1.4 }, home: 'bg_gaming_01' },
  { id: 'egitim', playable: false },
  // Lüks Yaşam: rented items boost followers the most, but İfşa risk and trust cost are the highest
  { id: 'luks', playable: true, flexW: 1.0, rentFollowMult: 1.8, ifsaMult: 1.5, rentTrustMult: 1.5, eqW: { camera: 1, mic: 0.4, light: 1.2, pc: 0.2 }, home: 'bg_lounge_01' }
];

// paper-doll: fixed layer order, grayscale layers tinted at runtime
export const LAYER_ORDER = ['body', 'bottom', 'top', 'shoes', 'accessory', 'glasses'];
export const WEARABLES = [
  { id: 'top_tshirt_01', slot: 'top', price: 0, style: 0, palette: ['#f4f4f4', '#2a2a30', '#d8483c', '#3fa0d2', '#f2c230'] },
  { id: 'top_hoodie_01', slot: 'top', price: 120, style: 0.04, palette: ['#7a3cff', '#3a3e4a', '#ff7ab8', '#3e9a4a'] },
  { id: 'top_suit_01', slot: 'top', price: 2500, style: 0.15, palette: ['#24242c', '#3a2a4a', '#6a1a24', '#e8e4dc'], fx: true },
  { id: 'bottom_jeans_01', slot: 'bottom', price: 0, style: 0, palette: ['#4a6aa8', '#2a2a34', '#8aa6d8'] },
  { id: 'bottom_shorts_01', slot: 'bottom', price: 60, style: 0.01, palette: ['#3a3a3a', '#c8a878', '#3fa0d2'] },
  { id: 'bottom_skirt_01', slot: 'bottom', price: 150, style: 0.03, palette: ['#d8483c', '#2a2a34', '#ff7ab8', '#f2c230'] },
  { id: 'bottom_suit_01', slot: 'bottom', price: 1200, style: 0.08, palette: ['#24242c', '#3a2a4a', '#6a1a24', '#e8e4dc'] },
  { id: 'shoes_sneakers_01', slot: 'shoes', price: 0, style: 0, palette: ['#ffffff', '#ff6a1a', '#2a2a30'] },
  { id: 'shoes_boots_01', slot: 'shoes', price: 250, style: 0.03, palette: ['#5a3a2a', '#1a1a1e', '#c8a878'] },
  { id: 'shoes_loafers_01', slot: 'shoes', price: 800, style: 0.06, palette: ['#151518', '#6a3a1e', '#e8e4dc'] },
  { id: 'acc_cap_01', slot: 'accessory', price: 90, style: 0.02, palette: ['#d8483c', '#2a2a30', '#3fa0d2', '#f4f4f4'] },
  { id: 'acc_chain_01', slot: 'accessory', price: 1500, style: 0.08, palette: ['#f2c230', '#d0d6e0'] },
  { id: 'glasses_round_01', slot: 'glasses', price: 200, style: 0.02, palette: ['#222222', '#c8902e', '#d0d6e0'] },
  { id: 'glasses_sun_01', slot: 'glasses', price: 1800, style: 0.12, palette: ['#f2c230', '#ff3fa4', '#d0d6e0', '#222222'], fx: true }
];
export const STARTER_WEAR = { top: 'top_tshirt_01', bottom: 'bottom_jeans_01', shoes: 'shoes_sneakers_01', accessory: null, glasses: null };

// luxury: buy OR rent. flex boosts views AND follower gain, rented or owned alike.
// scene: where the item appears in a video
export const LUXURY = [
  { id: 'watch_01', cat: 'watch', price: 900, flex: 0.2, scene: 'wrist', doll: 'acc_watch_01', tint: '#e8c060' },
  { id: 'sneaker_rare_01', cat: 'fashion', price: 1600, flex: 0.25, scene: 'floor' },
  { id: 'painting_01', cat: 'art', price: 6000, flex: 0.35, scene: 'wall' },
  { id: 'car_01', cat: 'car', price: 18000, flex: 0.6, scene: 'car', bg: 'bg_street_01' },
  { id: 'watch_02', cat: 'watch', price: 30000, flex: 0.5, scene: 'wrist', doll: 'acc_watch_02', tint: '#c8d0dc' },
  { id: 'car_02', cat: 'car', price: 60000, flex: 0.8, scene: 'car', bg: 'bg_street_01' },
  { id: 'boat_01', cat: 'boat', price: 1000000, flex: 1.0, scene: 'boat', bg: 'bg_sea_01' },
  { id: 'villa_01', cat: 'villa', price: 3000000, flex: 1.4, scene: 'villa', bg: 'bg_villa_01' }
];

export const EQUIPMENT = [
  { id: 'camera', icon: 'eq_camera', base: 80 },
  { id: 'mic', icon: 'eq_mic', base: 60 },
  { id: 'light', icon: 'eq_light', base: 50 },
  { id: 'pc', icon: 'eq_pc', base: 150 }
];
export const STAFF = [
  { id: 'editor', icon: 'staff_editor', levels: [{ cost: 600, quality: 1.1 }, { cost: 5000, quality: 1.25 }, { cost: 40000, quality: 1.4 }] },
  { id: 'manager', icon: 'staff_manager', requires: 'editor', levels: [{ cost: 2500, interval: 60 }, { cost: 20000, interval: 40 }, { cost: 150000, interval: 25 }] }
];
export const INVESTMENTS = [
  { id: 'inv_fund', price: 5000, yieldPerDay: 0.04, growth: 1.25 },
  { id: 'inv_land', price: 40000, yieldPerDay: 0.05, growth: 1.25 },
  { id: 'inv_cafe', price: 150000, yieldPerDay: 0.07, growth: 1.25 }
];

// video titles (text in tr.json video.titles.<id>)
// paths: which careers can use it; needs: requirement on what is shown; mult: title appeal
export const TITLES = [
  { id: 't_morning', paths: ['vlog', 'luks'], mult: 1.0 },
  { id: 't_whatjob', paths: ['vlog', 'oyun', 'luks'], mult: 1.0 },
  { id: 't_secrets', paths: ['vlog', 'luks'], mult: 1.05 },
  { id: 't_car', paths: ['vlog', 'oyun', 'luks'], needs: 'car', mult: 1.35 },
  { id: 't_spent', paths: ['vlog', 'oyun', 'luks'], needs: 'luxury', mult: 1.25 },
  { id: 't_villa', paths: ['vlog', 'oyun', 'luks'], needs: 'villa', mult: 1.4 },
  { id: 't_24h', paths: ['oyun'], mult: 1.0 },
  { id: 't_newpc', paths: ['oyun'], needs: 'pc', mult: 1.3 },
  { id: 't_gameend', paths: ['oyun'], mult: 1.05 },
  { id: 't_invest', paths: ['vlog', 'oyun', 'luks'], needs: 'invest', mult: 1.3 },
  { id: 't_outfit', paths: ['luks'], mult: 1.1 },
  { id: 't_apology', paths: ['vlog', 'oyun', 'luks'], needs: 'apology', mult: 1.0, special: true }
];

// İfşa cards (Yazı). trigger: which rented item category exposes it ('any' = any rented item)
export const IFSA_CARDS = [
  { id: 'ifsa_plate', trigger: 'car' },
  { id: 'ifsa_sign', trigger: 'villa' },
  { id: 'ifsa_comment', trigger: 'car' },
  { id: 'ifsa_watch', trigger: 'watch' },
  { id: 'ifsa_live', trigger: 'any' },
  { id: 'ifsa_tag', trigger: 'wear' }      // v2: rented clothing
];

// "Kanalı Sat" prestige (same shape as Kodhane's Borsa Payı): Şöhret = floor(sqrt(peak run followers / unit)).
// Earned Şöhret permanently boosts follower gain; each UNSPENT point adds a small views bonus (capped);
// points are spent in the Şöhret tree so every new account starts owning the chosen things.
export const FAME = {
  minFollowers: 200000,        // "Kanalı Sat" unlocks at this many followers
  unit: 8000,                  // points = floor(sqrt(peakFollowers / unit))
  followPerEarned: 0.06,       // +6% follower gain per Şöhret ever earned
  unspentBonus: 0.01, unspentCap: 0.5,   // +1% views per unspent point, max +50%
  achievementBonus: 5          // "Kiralıksız Hayat" gives Şöhret once
};
// Şöhret tree: branches of sequential nodes. give: { item } starts owned, { staff:[id,lvl] }, { equip:[id,lvl] }, { wear }
export const FAME_TREE = [
  { id: 'saat', nodes: [{ id: 'f_watch_01', cost: 1, give: { item: 'watch_01' } }, { id: 'f_sneaker', cost: 3, give: { item: 'sneaker_rare_01' } }, { id: 'f_watch_02', cost: 8, give: { item: 'watch_02' } }] },
  { id: 'garaj', nodes: [{ id: 'f_car_01', cost: 3, give: { item: 'car_01' } }, { id: 'f_car_02', cost: 8, give: { item: 'car_02' } }, { id: 'f_boat', cost: 15, give: { item: 'boat_01' } }] },
  { id: 'ev', nodes: [{ id: 'f_painting', cost: 2, give: { item: 'painting_01' } }, { id: 'f_suit', cost: 3, give: { wear: ['top_suit_01', 'bottom_suit_01', 'shoes_loafers_01'] } }, { id: 'f_villa', cost: 25, give: { item: 'villa_01' } }] },
  { id: 'ekip', nodes: [{ id: 'f_editor', cost: 1, give: { staff: ['editor', 1] } }, { id: 'f_camera', cost: 3, give: { equip: ['camera', 3] } }, { id: 'f_manager', cost: 6, give: { staff: ['manager', 1] } }] }
];
export const ACHIEVEMENTS = [
  { id: 'rent_free' }   // "Kiralıksız Hayat": truly own every flex (luxury) item at once
];

export const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
export const FAME_NODES = Object.fromEntries(FAME_TREE.flatMap((b) => b.nodes.map((n, i) => [n.id, Object.assign({ branch: b.id, index: i }, n)])));
export const WEAR = byId(WEARABLES), LUX = byId(LUXURY), EQ = byId(EQUIPMENT), STF = byId(STAFF), INV = byId(INVESTMENTS), TTL = byId(TITLES), PATH = byId(PATHS), CARD = byId(IFSA_CARDS);
