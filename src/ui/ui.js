// DOM UI. Text only via textContent (h()), every string from the locale via t()/plural().
import { h, clear } from './dom.js';
import { t, plural, upper, available, locale } from '../logic/i18n.js';
import { fmt, money, fmtDuration, pct } from '../logic/format.js';
import * as G from '../logic/game.js';
import { makeZones, cut as editCut, quality as editQuality } from '../logic/edit.js';
import { CFG, LUXURY, WEARABLES, EQUIPMENT, STAFF, INVESTMENTS, TITLES, PATHS, SKINS, HAIRS, LUX, WEAR, TTL, CARD, FAME, FAME_TREE, EQ, STF } from '../logic/config.js';
import { url as assetUrl } from '../render/assets.js';
import { drawScene, thumbCanvas } from '../render/scene.js';
import { drawDoll, wearThumb } from '../render/doll.js';
import { openShare } from './share.js';
import { Sound } from './sound.js';
import { showDetails } from './privacy.js';
import { exportSave, openImport } from './savefile.js';

// Element.append(null) would print "null": always go through ap()
function ap(el, ...k) { el.append(...k.filter((x) => x != null && x !== false)); return el; }
const SLOTS = ['top', 'bottom', 'shoes', 'accessory', 'glasses'];
const itemName = (id) => (WEAR[id] ? t('wear.' + id) : t('items.names.' + id));

export class UI {
  constructor(root, ctrl, opts) {
    this.root = root; this.ctrl = ctrl; this.opts = opts || {};
    this.tab = 'studio'; this.shopTab = 'luxury'; this.modals = []; this.modalOpen = null; this.flow = null;
    ctrl.on('change', () => this.refresh());
    ctrl.on('tick', () => this.tickUpdate());
    this.sound = this.opts.sound || new Sound();
    ctrl.on('ifsa', () => { this.sound.play('ifsa'); this.queueIfsa(); });
    ctrl.on('published', (e) => { if (!e.auto) this.sound.play('notify'); });
    ctrl.on('welcome', (sum) => { this.sound.play('notify'); this.showWelcome(sum); });
    ctrl.on('achievement', (e) => { this.sound.play('notify'); this.showAchievement(e); });
    ctrl.on('fameNode', (e) => this.toast(t('fame.bought', { x: this.nodeName(e.id) }), 'ok'));
    ctrl.on('sold', (e) => { this.flow = null; this.tab = 'studio'; this.build(); this.toast(t('sell.done', { n: fmt(e.gain) }), 'ok'); });
    ctrl.on('repossessed', (e) => this.toast(t('toast.repossessed', { x: itemName(e.id) }), 'bad'));
    ctrl.on('reset', () => { this.flow = null; this.build(); });
    ctrl.on('loaded', (s) => { if (s.ifsa.pending) this.queueIfsa(); });
    this.build();
  }
  get s() { return this.ctrl.state; }

  // ------------------------------------------------------------ layout
  build() {
    const r = clear(this.root);
    this.toastEl = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.modalEl = h('div', { class: 'modal-wrap hidden', 'data-test': 'modal' });
    if (!this.s.created) { ap(r, this.buildCreator(), this.modalEl, this.toastEl); return; }
    this.hud = h('header', { class: 'hud' },
      this.hudMoney = h('div', { class: 'stat money', 'data-test': 'hud-money', title: t('hud.money') }),
      this.hudFollowers = h('div', { class: 'stat followers', 'data-test': 'hud-followers', title: t('hud.followers') }),
      h('div', { class: 'stat trust', title: t('hud.trustHint'), 'data-test': 'hud-trust' },
        h('span', { class: 'lbl', text: t('hud.trust') }), this.trustBar = h('div', { class: 'bar' }, this.trustFill = h('i')), this.trustTxt = h('span', { class: 'val' })),
      this.soundBtn = h('button', { class: 'icon-btn sound-btn', 'data-test': 'sound-toggle', onclick: () => { this.sound.toggle(); this.updateSoundBtn(); this.toast(t(this.sound.muted ? 'sound.off' : 'sound.on')); } }),
      h('button', { class: 'icon-btn', 'aria-label': t('nav.settings'), title: t('nav.settings'), 'data-test': 'settings-open', onclick: () => this.showSettings() }, '⚙'));
    this.stage = h('canvas', { class: 'stage-canvas', 'data-test': 'stage' });
    this.hintEl = h('div', { class: 'tut hidden', 'data-test': 'tut-hint' });
    this.panel = h('section', { class: 'panel' });
    this.nav = h('nav', { class: 'tabs' }, ...['studio', 'shop', 'closet', 'channel'].map((id) =>
      h('button', { class: 'tab', 'data-tab': id, 'data-test': 'tab-' + id, onclick: () => this.setTab(id) }, h('span', { class: 'ti ti-' + id }), h('span', { class: 'tl', text: t('nav.' + id) }))));
    this.sheetEl = h('div', { class: 'sheet hidden', 'data-test': 'sheet' });
    ap(r, this.hud, h('main', { class: 'main' }, h('section', { class: 'stage' }, this.stage, this.hintEl), this.panel), this.nav, this.sheetEl, this.modalEl, this.toastEl);
    new ResizeObserver(() => this.drawStage()).observe(this.stage);
    this.updateSoundBtn();
    this.refresh();
  }
  updateSoundBtn() {
    const m = this.sound.muted, b = this.soundBtn; if (!b) return;
    b.textContent = m ? '🔇' : '🔊'; b.setAttribute('aria-label', t(m ? 'sound.unmute' : 'sound.mute')); b.title = t(m ? 'sound.unmute' : 'sound.mute');
    b.setAttribute('aria-pressed', m ? 'true' : 'false'); b.classList.toggle('muted', m);
  }
  setTab(id) { this.sellGain = undefined; this.tab = id; this.panel.scrollTop = 0; this.refresh(); }
  refresh() {
    if (!this.s.created) return;
    if (!this.panel) return this.build();
    for (const b of this.nav.children) b.classList.toggle('on', b.dataset.tab === this.tab);
    const p = clear(this.panel);
    if (this.tab === 'studio') this.renderStudio(p);
    else if (this.tab === 'shop') this.renderShop(p);
    else if (this.tab === 'closet') this.renderCloset(p);
    else this.renderChannel(p);
    this.drawStage(); this.tickUpdate(); this.updateTutorial();
  }
  tickUpdate() {
    if (!this.hud) return;
    const s = this.s;
    this.hudMoney.textContent = money(s.money);
    this.hudFollowers.textContent = fmt(Math.floor(s.followers));
    this.trustFill.style.width = Math.round(s.trust) + '%';
    this.trustFill.className = s.trust < 35 ? 'low' : s.trust < 65 ? 'mid' : 'high';
    this.trustTxt.textContent = pct(s.trust / 100);
    // affordability without rebuilding (no click races)
    for (const b of this.panel.querySelectorAll('[data-cost]')) b.disabled = s.money + 1e-9 < +b.dataset.cost || b.dataset.lock === '1';
    if (this.tab === 'studio' && this.liveList) this.updateLive();
    // channel tab: rebuild only when the Şöhret preview changes (rare); the progress bar updates in place (no click races)
    if (this.tab === 'channel' && this.sellGain !== undefined) {
      if (this.sellGain !== G.fameGain(s)) this.refresh();
      else if (this.sellBar) this.sellBar.style.width = Math.min(100, s.stats.peakFollowers / FAME.minFollowers * 100) + '%';
    }
    if (this.tut === 'equip' && s.money >= G.equipCost('camera', 0)) this.updateTutorial();
  }

  // ------------------------------------------------------------ stage
  sceneSpec(show, extra) {
    const s = this.s;
    return Object.assign({ char: s.char, worn: s.wear.worn, colors: s.wear.colors, path: s.path, show: show || [], exposed: [] }, extra || {});
  }
  drawStage() {
    if (!this.stage || !this.stage.isConnected) return;
    const r = this.stage.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.stage.width !== W || this.stage.height !== H) { this.stage.width = W; this.stage.height = H; }
    // the studio shows your whole (rented or owned) life; KİRALIK tags only appear in shop/closet (and videos after an İfşa)
    const all = G.showable(this.s);
    const ctx = this.stage.getContext('2d');
    drawScene(ctx, W, H, this.sceneSpec(all, { dollScale: Math.min(0.92, 0.92 * (W / H) / 1.1 + 0.3), dollX: W / H < 1.3 ? 0.66 : 0.7 }));
  }

  // ------------------------------------------------------------ creator
  buildCreator() {
    const s = this.s;
    const c = { body: s.char.body || 'm', skin: s.char.skin, hair: s.char.hair, channel: '' };
    let step = 0, path = null;
    const wrap = h('div', { class: 'creator', 'data-test': 'creator' });
    const preview = h('canvas', { class: 'creator-doll', width: 256, height: 512, 'data-test': 'creator-doll' });
    const draw = () => { const x = preview.getContext('2d'); x.clearRect(0, 0, 256, 512); drawDoll(x, 128, 500, 500, c, s.wear.worn, s.wear.colors); };
    const render = () => {
      clear(wrap);
      if (step === 0) {
        const sw = (arr, key, label) => h('div', { class: 'field' }, h('div', { class: 'lbl', text: label }), h('div', { class: 'swatches' }, ...arr.map((col, i) =>
          h('button', { class: 'swatch' + (c[key] === i ? ' on' : ''), style: { background: col }, 'aria-label': t('creator.swatch', { n: i + 1 }), 'data-test': key + '-' + i, onclick: () => { c[key] = i; render(); } }))));
        const input = h('input', { type: 'text', maxlength: '24', class: 'input', placeholder: t('creator.channelPlaceholder'), 'data-test': 'channel-input', value: c.channel, oninput: (e) => { c.channel = e.target.value; } });
        ap(wrap, h('h1', { class: 'logo', text: t('app.name') }), h('p', { class: 'tagline', text: s.meta.sales ? t('sell.newAccount') : t('app.tagline') }),
          s.meta.fame > 0 || s.meta.unlocks.length ? h('p', { class: 'center chip fame-chip', 'data-test': 'creator-fame' }, h('img', { src: assetUrl('items/fame_star'), alt: '', width: 20, height: 20 }), t('fame.points', { n: fmt(s.meta.fame) })) : null,
          h('div', { class: 'creator-row' },
            h('div', { class: 'doll-box' }, preview),
            h('div', { class: 'creator-form' },
              h('h2', { text: t('creator.title') }),
              h('div', { class: 'field' }, h('div', { class: 'lbl', text: t('creator.body') }), h('div', { class: 'seg' }, ...['m', 'f'].map((b) =>
                h('button', { class: 'btn' + (c.body === b ? ' primary' : ''), 'data-test': 'body-' + b, onclick: () => { c.body = b; render(); } }, t('creator.body_' + b))))),
              sw(SKINS, 'skin', t('creator.skin')), sw(HAIRS, 'hair', t('creator.hair')),
              h('div', { class: 'field' }, h('div', { class: 'lbl', text: t('creator.channel') }), input),
              h('button', { class: 'btn primary big', 'data-test': 'creator-next', onclick: () => { step = 1; render(); } }, t('creator.next')))));
        draw();
      } else {
        ap(wrap, h('h2', { class: 'center', text: t('creator.pathTitle') }),
          h('div', { class: 'paths' }, ...PATHS.map((p) => h('button', { class: 'path-card' + (path === p.id ? ' on' : '') + (p.playable ? '' : ' soon'), disabled: !p.playable, 'data-test': 'path-' + p.id,
            onclick: () => { path = p.id; render(); } },
            h('img', { src: assetUrl('items/path_' + p.id), alt: '', width: 72, height: 72 }),
            h('div', { class: 'pc-body' }, h('b', { text: t('paths.' + p.id + '.name') }), h('span', { text: t('paths.' + p.id + '.desc') })),
            p.playable ? null : h('em', { class: 'soon-tag', text: upper(t('creator.soon')) })))),
          h('div', { class: 'row center' },
            h('button', { class: 'btn', onclick: () => { step = 0; render(); } }, t('common.back')),
            h('button', { class: 'btn primary big', disabled: !path, 'data-test': 'creator-start', onclick: () => {
              this.ctrl.create({ body: c.body, skin: c.skin, hair: c.hair, channel: c.channel.trim() || t('creator.channelDefault') }, path);
              this.build();
            } }, t('creator.start'))));
      }
    };
    render();
    return wrap;
  }

  // ------------------------------------------------------------ studio
  renderStudio(p) {
    const s = this.s;
    const inc = G.investIncomePerSec(s) + G.fanboxPerSec(s), rent = G.rentPerSec(s) * CFG.daySec;
    ap(p, 
      h('button', { class: 'btn primary huge shoot-btn', 'data-test': 'shoot', onclick: () => this.startShoot() }, h('span', { class: 'rec' }), t('studio.shoot')),
      h('div', { class: 'chips' },
        inc > 0 ? h('span', { class: 'chip ok', text: t('studio.passive', { v: t('fmt.perSec', { v: money(inc) }) }) }) : null,
        rent > 0 ? h('span', { class: 'chip bad', 'data-test': 'rent-chip', text: t('studio.rentCost', { v: t('fmt.perDay', { v: money(rent) }) }) }) : null,
        s.staff.manager > 0 ? h('span', { class: 'chip', text: t('studio.manager', { t: fmtDuration(G.managerInterval(s)) }) }) : null),
      G.fatigue(s) < 0.6 ? h('p', { class: 'note', text: t('studio.fatigue') }) : null,
      h('h3', { text: t('studio.live') }),
      this.liveList = h('div', { class: 'live', 'data-test': 'live-list' }));
    this.liveKey = '';
    this.updateLive();
  }
  updateLive() {
    const s = this.s, key = s.videos.map((v) => v.id).join(',');
    if (key !== this.liveKey) {
      this.liveKey = key; clear(this.liveList); this.liveRows = {};
      if (!s.videos.length) ap(this.liveList, h('p', { class: 'muted', text: t('studio.none') }));
      for (const v of s.videos.slice().reverse()) {
        const th = thumbCanvas(this.videoSpec(v), 192, 108);
        const row = { views: h('span', { class: 'v' }), earn: h('span', { class: 'e' }), bar: h('i') };
        this.liveRows[v.id] = row;
        ap(this.liveList, h('div', { class: 'video-row' }, h('div', { class: 'thumb' }, th),
          h('div', { class: 'vr-body' }, h('div', { class: 'vt', text: t('video.titles.' + v.titleId) }),
            h('div', { class: 'vm' }, row.views, row.earn, v.auto ? h('span', { class: 'chip sm', text: t('studio.auto') }) : null),
            h('div', { class: 'progress' }, row.bar))));
      }
    }
    for (const v of s.videos) { const r = this.liveRows[v.id]; if (!r) continue; r.views.textContent = plural('plural.views', Math.floor(v.got), { n: fmt(Math.floor(v.got)) }); r.earn.textContent = t('studio.earned', { v: money(v.money) }); r.bar.style.width = Math.min(100, v.got / Math.max(1, v.total) * 100) + '%'; }
  }
  videoSpec(v, withTitle) {
    const s = this.s;
    return { char: s.char, worn: v.outfit || s.wear.worn, colors: v.colors || s.wear.colors, path: s.path, show: v.show, exposed: v.exposed || [], investShow: v.showInvest,
      investIcons: INVESTMENTS.filter((x) => s.invest[x.id]).map((x) => x.id), title: withTitle === false ? null : t('video.titles.' + v.titleId) };
  }

  // ------------------------------------------------------------ shoot -> edit -> publish
  startShoot() {
    const s = this.s;
    const all = G.showable(s);
    const f = this.flow = { step: 'plan', show: all.filter((id) => G.owned(s, id) || this.tut === 'show'), showInvest: G.investTypes(s) > 0, titleId: null, quality: 1, results: [] };
    if (this.tut === 'show') f.show = all.slice();
    const avail = G.availableTitles(s, f.show, f.showInvest); f.titleId = avail[0];
    this.openSheet();
  }
  openSheet() { this.sheetEl.classList.remove('hidden'); this.renderFlow(); }
  closeSheet() { this.flow = null; if (this.editRaf) cancelAnimationFrame(this.editRaf); this.sheetEl.classList.add('hidden'); clear(this.sheetEl); this.updateTutorial(); }
  renderFlow() {
    const f = this.flow, s = this.s, el = clear(this.sheetEl);
    if (!f) return;
    const box = h('div', { class: 'sheet-box' }); ap(el, box);
    const preview = h('canvas', { class: 'preview', 'data-test': 'preview' });
    const spec = () => this.sceneSpec(f.show, { exposed: f.show.filter((id) => G.rented(s, id) && s.items[id].exposed).concat(Object.values(s.wear.worn).filter((id) => id && s.wear.rented[id] && s.wear.rented[id].exposed)), investShow: f.showInvest, investIcons: INVESTMENTS.filter((x) => s.invest[x.id]).map((x) => x.id), title: f.titleId ? t('video.titles.' + f.titleId) : '' });
    const paint = (extra) => thumbCanvas(Object.assign(spec(), extra || {}), 640, 360, preview);
    if (f.step === 'plan') {
      const avail = G.availableTitles(s, f.show, f.showInvest);
      if (!avail.includes(f.titleId)) f.titleId = avail[0];
      const est = G.videoFactors(s, { titleId: f.titleId, show: f.show, showInvest: f.showInvest, quality: 1.2 }).expected;
      const titles = s.ifsa.apologyDue ? ['t_apology'] : TITLES.filter((x) => !x.special && x.paths.includes(s.path)).map((x) => x.id);
      const all = G.showable(s);
      ap(box, h('div', { class: 'sheet-head' }, h('h2', { text: t('shoot.title') }), h('button', { class: 'icon-btn', 'aria-label': t('shoot.cancel'), 'data-test': 'shoot-cancel', onclick: () => this.closeSheet() }, '✕')),
        preview,
        h('h3', { text: t('shoot.show') }),
        all.length || G.investTypes(s) ? h('div', { class: 'chips wrap' },
          ...all.map((id) => h('button', { class: 'chip toggle' + (f.show.includes(id) ? ' on' : ''), 'data-test': 'show-' + id, onclick: () => { f.show = f.show.includes(id) ? f.show.filter((x) => x !== id) : f.show.concat(id); this.renderFlow(); } },
            h('img', { src: assetUrl('items/' + id), alt: '', width: 28, height: 28 }), itemName(id))),
          G.investTypes(s) ? h('button', { class: 'chip toggle' + (f.showInvest ? ' on' : ''), 'data-test': 'show-invest', onclick: () => { f.showInvest = !f.showInvest; this.renderFlow(); } }, t('shoot.showInvest')) : null)
          : h('p', { class: 'muted', text: t('shoot.showNone') }),
        f.show.some((id) => G.rented(s, id)) || Object.values(s.wear.worn).some((id) => id && s.wear.rented[id]) ? h('p', { class: 'note warn', 'data-test': 'rented-warn', text: t('shoot.rentedWarn') }) : null,
        h('h3', { text: t('shoot.pickTitle') }),
        h('div', { class: 'titles' }, ...titles.map((id) => {
          const ok = avail.includes(id), need = TTL[id].needs;
          return h('button', { class: 'title-opt' + (f.titleId === id ? ' on' : ''), disabled: !ok, 'data-test': 'title-' + id, onclick: () => { f.titleId = id; this.renderFlow(); } },
            h('span', { text: t('video.titles.' + id) }), !ok && need ? h('small', { text: t('video.needs.' + need) }) : null);
        })),
        h('p', { class: 'estimate', 'data-test': 'estimate', text: t('shoot.estimate', { v: fmt(est) }) }),
        h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: () => this.closeSheet() }, t('shoot.cancel')),
          h('button', { class: 'btn primary big', 'data-test': 'shoot-go', disabled: !f.titleId, onclick: () => { f.step = 'shooting'; this.renderFlow(); } }, t('shoot.go'))));
      paint();
    } else if (f.step === 'shooting') {
      const bar = h('i');
      ap(box, h('h2', { text: t('shoot.shooting') }), preview, h('div', { class: 'progress big' }, bar));
      const t0 = performance.now(), dur = CFG.video.shootSec * 1000;
      const anim = () => {
        if (this.flow !== f || f.step !== 'shooting') return;
        const k = Math.min(1, (performance.now() - t0) / dur);
        bar.style.width = k * 100 + '%'; paint({ title: null, rec: Math.floor(k * 6) % 2 === 0, bob: Math.sin(k * 20) * 4 });
        if (k < 1) this.editRaf = requestAnimationFrame(anim); else { f.step = 'edit'; this.renderFlow(); }
      };
      this.editRaf = requestAnimationFrame(anim);
    } else if (f.step === 'edit') {
      this.renderEdit(box, f, preview, paint);
    } else if (f.step === 'publish') {
      ap(box, h('h2', { text: t('publish.title') }), preview,
        h('p', { class: 'quality', 'data-test': 'quality', text: t('edit.quality', { q: fmt(f.quality) }) }),
        h('div', { class: 'row end' }, h('button', { class: 'btn primary huge', 'data-test': 'publish-go', onclick: () => this.doPublish() }, t('publish.go'))));
      paint();
    }
    this.updateTutorial();
  }
  renderEdit(box, f, preview, paint) {
    const s = this.s, E = CFG.edit;
    const zones = makeZones(Math.random);
    f.results = [];
    const track = h('div', { class: 'track', 'data-test': 'edit-track' });
    for (const z of zones) ap(track, h('div', { class: 'zone', style: { left: z.a * 100 + '%', width: (z.b - z.a) * 100 + '%' } }));
    const head = h('div', { class: 'playhead' }); ap(track, head);
    const fb = h('div', { class: 'edit-fb', 'aria-live': 'polite', 'data-test': 'edit-feedback' });
    const cuts = h('div', { class: 'cuts' });
    let pos = 0, t0 = performance.now(), ended = false;
    const finish = () => { if (ended) return; ended = true; cancelAnimationFrame(this.editRaf); f.quality = editQuality(f.results); f.step = 'publish'; this.ctrl.emit('editGame'); setTimeout(() => { if (this.flow === f) this.renderFlow(); }, 450); };
    const doCut = () => {
      if (ended || f.results.length >= E.maxCuts) return;
      const r = editCut(zones, pos); f.results.push(r);
      ap(track, h('div', { class: 'mark ' + r, style: { left: pos * 100 + '%' } }));
      fb.textContent = t('edit.' + r); fb.className = 'edit-fb ' + r;
      cuts.textContent = '✂'.repeat(E.maxCuts - f.results.length);
      if (f.results.length >= E.maxCuts) finish();
    };
    track.addEventListener('pointerdown', (e) => { e.preventDefault(); doCut(); });
    cuts.textContent = '✂'.repeat(E.maxCuts);
    ap(box, h('h2', { text: t('edit.title') }), preview, h('p', { class: 'muted', text: t('edit.help') }), track, h('div', { class: 'edit-row' }, cuts, fb),
      h('div', { class: 'row end' },
        s.staff.editor > 0 ? h('button', { class: 'btn', 'data-test': 'edit-editor', onclick: () => { ended = true; cancelAnimationFrame(this.editRaf); f.quality = G.editorQuality(s); f.step = 'publish'; this.renderFlow(); } }, t('edit.editor')) : null,
        h('button', { class: 'btn primary huge cut-btn', 'data-test': 'edit-cut', onpointerdown: (e) => { e.preventDefault(); doCut(); }, onclick: (e) => { if (e.detail === 0) doCut(); } }, t('edit.cut'))));
    window.__edit = { zones, get pos() { return pos; }, cut: doCut };   // test hook
    paint({ title: null });
    const anim = () => {
      if (this.flow !== f || ended) return;
      pos = Math.min(1, (performance.now() - t0) / (E.durationSec * 1000));
      head.style.left = pos * 100 + '%';
      if (pos >= 1) finish(); else this.editRaf = requestAnimationFrame(anim);
    };
    this.editRaf = requestAnimationFrame(anim);
  }
  doPublish() {
    const f = this.flow; if (!f) return;
    const v = this.ctrl.publish({ titleId: f.titleId, show: f.show, showInvest: f.showInvest, quality: f.quality });
    this.closeSheet(); this.tab = 'studio';
    this.toast(t('toast.published', { v: fmt(v.total) }), 'ok');
    if (this.tut === 'show' && v.show.some((id) => G.rented(this.s, id))) { this.s.tut = 99; this.toast(t('tut.done'), 'ok'); }
    this.refresh();
  }

  // ------------------------------------------------------------ İfşa
  queueIfsa() {
    this.queueModal((box, close) => {
      const s = this.s, p = s.ifsa.pending; if (!p) { close(); return; }
      const wearId = WEAR[p.itemId] ? p.itemId : null;
      const th = thumbCanvas(this.sceneSpec(wearId ? [] : [p.itemId], { exposed: [p.itemId], title: null, worn: wearId ? Object.assign({}, s.wear.worn, { [WEAR[wearId].slot]: wearId }) : s.wear.worn }), 640, 360);
      box.classList.add('ifsa');
      ap(box, h('div', { class: 'ifsa-head', text: t('ifsa.title') }),
        h('div', { class: 'ifsa-card', 'data-test': 'ifsa-card' }, th,
          h('h2', { text: t('ifsa.cards.' + p.cardId + '.title') }),
          h('p', { text: t('ifsa.cards.' + p.cardId + '.body', { item: itemName(p.itemId) }) }),
          h('p', { class: 'bad', text: t('ifsa.lost', { v: fmt(p.loss) }) })),
        h('h3', { text: t('ifsa.question') }),
        h('div', { class: 'col' },
          h('button', { class: 'btn primary big choice', 'data-test': 'ifsa-apology', onclick: () => { this.ctrl.resolveIfsa('apology'); close(); this.toast(t('ifsa.afterApology')); } }, h('b', { text: t('ifsa.apology') }), h('small', { text: t('ifsa.apologyHint') })),
          h('button', { class: 'btn big choice danger', 'data-test': 'ifsa-ignore', onclick: () => { this.ctrl.resolveIfsa('ignore'); close(); this.toast(t('ifsa.afterIgnore')); } }, h('b', { text: t('ifsa.ignore') }), h('small', { text: t('ifsa.ignoreHint') }))));
    }, { dismissable: false });
  }

  // ------------------------------------------------------------ shop
  renderShop(p) {
    const tabs = ['luxury', 'wear', 'equip', 'team', 'invest'];
    ap(p, h('div', { class: 'subtabs' }, ...tabs.map((id) => h('button', { class: 'subtab' + (this.shopTab === id ? ' on' : ''), 'data-test': 'shop-tab-' + id, onclick: () => { this.shopTab = id; this.refresh(); } }, t('shop.tabs.' + id)))));
    const list = h('div', { class: 'cards' }); ap(p, list);
    const s = this.s;
    const buyBtn = (label, cost, fn, test, extraCls) => h('button', { class: 'btn ' + (extraCls || 'primary'), 'data-cost': cost, 'data-test': test, disabled: s.money + 1e-9 < cost, onclick: () => { if (fn()) this.sound.play('cash'); else this.toast(t('toast.noMoney'), 'bad'); } }, label + ' · ' + money(cost));
    if (this.shopTab === 'luxury') {
      p.insertBefore(h('p', { class: 'note', text: t('shop.rentExplain') }), list);
      for (const d of LUXURY) ap(list, this.luxuryCard(d, buyBtn));
    } else if (this.shopTab === 'wear') {
      p.insertBefore(h('p', { class: 'note', text: t('shop.rentWearInfo') }), list);
      for (const d of WEARABLES) {
        const own = s.wear.owned.includes(d.id), rent = s.wear.rented[d.id], on = s.wear.worn[d.slot] === d.id;
        const wearBtn = h('button', { class: 'btn' + (on ? ' ghost' : ''), disabled: on, 'data-test': 'wear-' + d.id, onclick: () => this.ctrl.act(G.wear, d.id) }, on ? t('shop.wearing') : t('shop.wear'));
        const actions = h('div', { class: 'row wrap' });
        if (own) ap(actions, wearBtn);
        else if (rent) ap(actions, wearBtn, buyBtn(t('shop.buyOut'), d.price, () => { const ok = this.ctrl.act(G.buyWear, d.id); if (ok) this.toast(t('toast.bought', { x: itemName(d.id) }), 'ok'); return ok; }, 'wear-buy-' + d.id),
          h('button', { class: 'btn ghost', 'data-test': 'wear-return-' + d.id, onclick: () => { if (this.ctrl.act(G.returnWear, d.id)) this.toast(t('toast.returned', { x: itemName(d.id) })); } }, t('shop.return')));
        else ap(actions, buyBtn(t('shop.buy'), d.price, () => this.ctrl.act(G.buyWear, d.id), 'wear-buy-' + d.id),
          G.canRentWear(d.id) ? buyBtn(t('shop.rent'), G.rentPerDay(d.id) * CFG.rent.upfrontDays, () => { const ok = this.ctrl.act(G.rentWear, d.id); if (ok) this.toast(t('toast.rented', { x: itemName(d.id) })); return ok; }, 'wear-rent-' + d.id, 'secondary') : null);
        ap(list, h('div', { class: 'card', 'data-test': 'wearcard-' + d.id }, this.wearImg(d.id, 96),
          h('div', { class: 'card-body' }, h('b', { text: t('wear.' + d.id) }), h('span', { class: 'muted', text: t('wear.slots.' + d.slot) + (d.style ? ' · ' + t('shop.style', { v: pct(d.style) }) : '') }),
            G.canRentWear(d.id) && !own ? h('div', { class: 'chips' }, h('span', { class: 'chip bad', text: t('shop.rentInfo', { v: t('fmt.perDay', { v: money(G.rentPerDay(d.id)) }) }) })) : null,
            actions)));
      }
    } else if (this.shopTab === 'equip') {
      for (const d of EQUIPMENT) {
        const l = s.equip[d.id], max = l >= CFG.equipMax;
        ap(list, h('div', { class: 'card' }, h('img', { class: 'card-img', src: assetUrl('items/' + d.icon), alt: '', width: 80, height: 80 }),
          h('div', { class: 'card-body' }, h('b', { text: t('equip.' + d.id + '.name') + ' · ' + t('shop.level', { n: l }) }), h('span', { class: 'muted', text: t('equip.' + d.id + '.desc') }),
            h('div', { class: 'row' }, max ? h('span', { class: 'chip ok', text: t('shop.max') }) : buyBtn(t('shop.upgrade'), G.equipCost(d.id, l), () => this.ctrl.act(G.upgradeEquip, d.id), 'equip-' + d.id)))));
      }
    } else if (this.shopTab === 'team') {
      for (const d of STAFF) {
        const l = s.staff[d.id], max = l >= d.levels.length, can = G.canHire(s, d.id);
        const info = l ? (d.id === 'editor' ? t('staff.quality', { q: fmt(G.editorQuality(s)) }) : t('staff.interval', { t: fmtDuration(G.managerInterval(s)) })) : '';
        const b = max ? h('span', { class: 'chip ok', text: t('shop.max') }) : buyBtn(l ? t('shop.upgrade') : t('shop.hire'), G.staffCost(s, d.id), () => this.ctrl.act(G.hire, d.id), 'hire-' + d.id);
        if (!max && !can) { b.dataset.lock = '1'; b.disabled = true; }
        ap(list, h('div', { class: 'card' }, h('img', { class: 'card-img', src: assetUrl('items/' + d.icon), alt: '', width: 80, height: 80 }),
          h('div', { class: 'card-body' }, h('b', { text: t('staff.' + d.id + '.name') + (l ? ' · ' + t('shop.level', { n: l }) : '') }), h('span', { class: 'muted', text: t('staff.' + d.id + '.desc') }),
            info ? h('span', { class: 'chip', text: info }) : null,
            !can && !max ? h('span', { class: 'chip bad', text: t('shop.requires', { x: t('staff.' + d.requires + '.name') }) }) : null,
            h('div', { class: 'row' }, b))));
      }
    } else {
      p.insertBefore(h('p', { class: 'note', text: t('shop.investExplain') }), list);
      for (const d of INVESTMENTS) {
        const n = s.invest[d.id] || 0;
        ap(list, h('div', { class: 'card' }, h('img', { class: 'card-img', src: assetUrl('items/' + d.id), alt: '', width: 80, height: 80 }),
          h('div', { class: 'card-body' }, h('b', { text: t('invest.' + d.id + '.name') }), h('span', { class: 'muted', text: t('invest.' + d.id + '.desc') }),
            h('span', { class: 'chip ok', text: t('shop.yield', { v: t('fmt.perDay', { v: pct(d.yieldPerDay) }) }) }), n ? h('span', { class: 'chip', text: t('shop.count', { n }) }) : null,
            h('div', { class: 'row' }, buyBtn(t('shop.buy'), G.investCost(s, d.id), () => this.ctrl.act(G.buyInvest, d.id), 'invest-' + d.id)))));
      }
      const fbOk = G.fanboxAvailable(s);
      ap(list, h('div', { class: 'card fanbox' }, h('img', { class: 'card-img', src: assetUrl('items/fanbox'), alt: '', width: 80, height: 80 }),
        h('div', { class: 'card-body' }, h('b', { text: t('fanbox.name') }), h('span', { class: 'muted', text: t('fanbox.desc') }),
          s.fanbox ? h('span', { class: 'chip ok', text: t('fanbox.active') + ' · ' + t('fanbox.income', { v: t('fmt.perSec', { v: money(G.fanboxPerSec(s)) }) }) })
            : fbOk ? h('div', { class: 'row' }, buyBtn(t('fanbox.unlock'), CFG.fanbox.cost, () => this.ctrl.act(G.unlockFanbox), 'fanbox'))
              : h('span', { class: 'chip bad', text: t('fanbox.locked', { n: fmt(CFG.fanbox.unlockFollowers) }) }))));
    }
  }
  luxuryCard(d, buyBtn, compact) {
    const s = this.s, it = s.items[d.id];
    const imgBox = h('div', { class: 'card-img lux' }, h('img', { src: assetUrl('items/' + d.id), alt: '' }));
    // KİRALIK tag: separate runtime layer over the item image (shop + closet only)
    if (it && it.status === 'rented') ap(imgBox, h('span', { class: 'rent-tag', 'data-test': 'rent-tag-' + d.id, text: upper(t('tags.rented')) }));
    if (it && it.status === 'rented' && it.exposed) ap(imgBox, h('span', { class: 'exposed-tag', text: t('ifsa.exposed') }));
    const actions = h('div', { class: 'row wrap' });
    if (!it) ap(actions, buyBtn(t('shop.buy'), d.price, () => { const ok = this.ctrl.act(G.buyItem, d.id); if (ok) this.toast(t('toast.bought', { x: itemName(d.id) }), 'ok'); return ok; }, 'buy-' + d.id),
      buyBtn(t('shop.rent'), G.rentPerDay(d.id) * CFG.rent.upfrontDays, () => { const ok = this.ctrl.act(G.rentItem, d.id); if (ok) this.toast(t('toast.rented', { x: itemName(d.id) })); return ok; }, 'rent-' + d.id, 'secondary'));
    else if (it.status === 'rented') ap(actions, buyBtn(t('shop.buyOut'), d.price, () => { const ok = this.ctrl.act(G.buyItem, d.id); if (ok) this.toast(t('toast.bought', { x: itemName(d.id) }), 'ok'); return ok; }, 'buy-' + d.id),
      h('button', { class: 'btn ghost', 'data-test': 'return-' + d.id, onclick: () => { if (this.ctrl.act(G.returnItem, d.id)) this.toast(t('toast.returned', { x: itemName(d.id) })); } }, t('shop.return')));
    else ap(actions, h('span', { class: 'chip ok', text: t('shop.owned') }));
    return h('div', { class: 'card' + (compact ? ' compact' : ''), 'data-test': (compact ? 'closet-item-' : 'lux-') + d.id }, imgBox,
      h('div', { class: 'card-body' }, h('b', { text: itemName(d.id) }), compact ? null : h('span', { class: 'muted', text: t('items.desc.' + d.id) }),
        h('div', { class: 'chips' }, h('span', { class: 'chip', text: t('shop.flex', { v: pct(d.flex) }) }), h('span', { class: 'chip bad', text: t('shop.rentInfo', { v: t('fmt.perDay', { v: money(G.rentPerDay(d.id)) }) }) })),
        actions));
  }

  // wear thumbnail + KİRALIK tag layer (shop/closet only) for rented clothes
  wearImg(id, size) {
    const s = this.s, r = s.wear.rented[id];
    const box = h('div', { class: 'card-img wear-img' }, wearThumb(id, s.wear.colors[id], size));
    if (r) ap(box, h('span', { class: 'rent-tag', 'data-test': 'rent-tag-' + id, text: upper(t('tags.rented')) }));
    if (r && r.exposed) ap(box, h('span', { class: 'exposed-tag', text: t('ifsa.exposed') }));
    return box;
  }

  // ------------------------------------------------------------ closet (inventory)
  renderCloset(p) {
    const s = this.s;
    ap(p, h('h3', { text: t('closet.items') }));
    const mine = LUXURY.filter((d) => s.items[d.id]);
    const rentAll = G.rentPerSec(s) * CFG.daySec;
    if (!mine.length) { ap(p, h('p', { class: 'muted', text: t('closet.empty') })); if (rentAll > 0) ap(p, h('p', { class: 'note warn', text: t('closet.rentedTotal', { v: money(rentAll) }) })); }
    else {
      const rent = rentAll;
      if (rent > 0) ap(p, h('p', { class: 'note warn', text: t('closet.rentedTotal', { v: money(rent) }) }));
      const g = h('div', { class: 'cards' }); ap(p, g);
      const buyBtn = (label, cost, fn, test, extraCls) => h('button', { class: 'btn ' + (extraCls || 'primary'), 'data-cost': cost, 'data-test': test, disabled: s.money < cost, onclick: () => { if (fn()) this.sound.play('cash'); else this.toast(t('toast.noMoney'), 'bad'); } }, label + ' · ' + money(cost));
      for (const d of mine) ap(g, this.luxuryCard(d, buyBtn, true));
    }
    if (G.investTypes(s)) ap(p, h('h3', { text: t('closet.investments') }), h('div', { class: 'chips wrap' }, ...INVESTMENTS.filter((x) => s.invest[x.id]).map((x) => h('span', { class: 'chip' }, h('img', { src: assetUrl('items/' + x.id), alt: '', width: 24, height: 24 }), t('invest.' + x.id + '.name') + ' ×' + s.invest[x.id]))));
    ap(p, h('h3', { text: t('closet.wearables') }));
    for (const slot of SLOTS) {
      const owned = WEARABLES.filter((d) => d.slot === slot && (s.wear.owned.includes(d.id) || s.wear.rented[d.id]));
      const row = h('div', { class: 'slot-row' }, h('div', { class: 'lbl', text: t('wear.slots.' + slot) }));
      const items = h('div', { class: 'wear-row' });
      if (slot === 'accessory' || slot === 'glasses') ap(items, h('button', { class: 'wear-opt' + (!s.wear.worn[slot] ? ' on' : ''), 'data-test': 'unwear-' + slot, onclick: () => this.ctrl.act(G.unwear, slot) }, h('span', { class: 'none', text: t('wear.none') })));
      for (const d of owned) {
        const on = s.wear.worn[slot] === d.id;
        ap(items, h('button', { class: 'wear-opt' + (on ? ' on' : ''), title: t('wear.' + d.id), 'aria-label': t('wear.' + d.id), 'data-test': 'wear-' + d.id, onclick: () => this.ctrl.act(G.wear, d.id) }, this.wearImg(d.id, 64)));
      }
      ap(row, items);
      const cur = s.wear.worn[slot];
      if (cur) ap(row, h('div', { class: 'swatches sm' }, h('span', { class: 'lbl', text: t('wear.color') }), ...WEAR[cur].palette.map((col, i) =>
        h('button', { class: 'swatch' + (((s.wear.colors[cur] || 0) === i) ? ' on' : ''), style: { background: col }, 'aria-label': t('creator.swatch', { n: i + 1 }), 'data-test': 'color-' + cur + '-' + i, onclick: () => this.ctrl.act(G.setColor, cur, i) }))));
      ap(p, row);
    }
  }

  // ------------------------------------------------------------ channel
  renderChannel(p) {
    const s = this.s, st = s.stats;
    ap(p, h('h2', { class: 'channel-name', text: s.char.channel || t('creator.channelDefault') }),
      h('div', { class: 'stats' }, ...[['channel.videos', fmt(st.videos)], ['channel.views', fmt(st.views)], ['channel.earned', money(st.earned)], ['channel.ifsa', fmt(st.ifsa)], ['channel.repossessed', fmt(st.repossessed)]].map(([k, v]) =>
        h('div', { class: 'stat-box' }, h('b', { text: v }), h('span', { text: t(k) })))),
      h('button', { class: 'btn primary big', 'data-test': 'share-open', onclick: () => this.share() }, t('channel.share')));
    this.renderPrestige(p);
    ap(p, h('h3', { text: t('channel.recent') }));
    const vids = s.videos.slice().reverse().map((v) => ({ titleId: v.titleId, views: v.total, show: v.show, outfit: v.outfit, colors: v.colors, exposed: v.exposed, showInvest: v.showInvest })).concat(s.history);
    const g = h('div', { class: 'thumbs' });
    for (const v of vids.slice(0, 8)) ap(g, h('div', { class: 'thumb-card' }, thumbCanvas(this.videoSpec(v), 320, 180), h('span', { text: plural('plural.views', Math.floor(v.views), { n: fmt(v.views) }) })));
    if (!vids.length) ap(g, h('p', { class: 'muted', text: t('channel.noVideo') }));
    ap(p, g);
  }
  nodeName(id) { const n = FAME_TREE.flatMap((b) => b.nodes).find((x) => x.id === id); return n && n.give.item ? itemName(n.give.item) : t('fame.nodes.' + id); }
  nodeIcon(n) {
    const g = n.give;
    if (g.item) return h('img', { src: assetUrl('items/' + g.item), alt: '', width: 44, height: 44 });
    if (g.wear) return wearThumb(g.wear[0], 0, 44);
    if (g.staff) return h('img', { src: assetUrl('items/' + STF[g.staff[0]].icon), alt: '', width: 44, height: 44 });
    return h('img', { src: assetUrl('items/' + EQ[g.equip[0]].icon), alt: '', width: 44, height: 44 });
  }
  // Kanalı Sat + Şöhret tree + achievements
  renderPrestige(p) {
    const s = this.s, m = s.meta, gain = G.fameGain(s), peak = s.stats.peakFollowers;
    this.sellGain = gain; this.sellBar = null;
    const sell = h('div', { class: 'card prestige sell', 'data-test': 'sell-card' }, h('img', { class: 'card-img', src: assetUrl('items/sell_channel'), alt: '', width: 72, height: 72 }),
      h('div', { class: 'card-body' }, h('b', { text: t('sell.title') }), h('span', { class: 'muted', text: t('sell.desc') }),
        G.canSell(s) ? h('div', { class: 'chips' }, h('span', { class: 'chip ok', 'data-test': 'sell-gain', text: t('sell.gain', { n: fmt(gain) }) }), h('span', { class: 'chip', text: t('sell.next', { n: fmt(G.nextFameAt(s)) }) }))
          : h('div', {}, h('span', { class: 'chip', text: t('sell.progress', { n: fmt(FAME.minFollowers) }) }), h('div', { class: 'progress' }, this.sellBar = h('i', { style: { width: Math.min(100, peak / FAME.minFollowers * 100) + '%' } }))),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', 'data-test': 'sell-open', disabled: !G.canSell(s), onclick: () => this.confirmSell() }, t('sell.button')))));
    const fameCard = h('div', { class: 'card prestige fame', 'data-test': 'fame-card' }, h('img', { class: 'card-img', src: assetUrl('items/fame_star'), alt: '', width: 72, height: 72 }),
      h('div', { class: 'card-body' }, h('b', { text: t('fame.title') }),
        h('div', { class: 'chips' }, h('span', { class: 'chip ok', 'data-test': 'fame-points', text: t('fame.unspent') + ': ' + fmt(m.fame) }), h('span', { class: 'chip', text: t('fame.earned') + ': ' + fmt(m.fameEarned) }),
          m.sales ? h('span', { class: 'chip', text: t('sell.sales') + ': ' + fmt(m.sales) }) : null),
        h('div', { class: 'chips' }, h('span', { class: 'chip', text: t('fame.followBonus', { v: pct(G.fameFollowMult(s) - 1) }) }), h('span', { class: 'chip', text: t('fame.unspentBonus', { v: pct(G.fameViewsMult(s) - 1) }) }))));
    const tree = h('div', { class: 'tree', 'data-test': 'fame-tree' });
    for (const b of FAME_TREE) {
      ap(tree, h('div', { class: 'branch' }, h('div', { class: 'lbl', text: t('fame.branches.' + b.id) }), h('div', { class: 'nodes' }, ...b.nodes.map((n) => {
        const st = G.nodeState(s, n.id);
        return h('button', { class: 'node ' + st, disabled: st !== 'buyable', 'data-test': 'fame-node-' + n.id, title: this.nodeName(n.id),
          onclick: () => { if (this.ctrl.act(G.buyFameNode, n.id)) this.sound.play('cash'); } },
          this.nodeIcon(n), h('span', { class: 'nn', text: this.nodeName(n.id) }),
          h('small', { text: st === 'owned' ? t('fame.owned') : st === 'locked' ? t('fame.locked') : t('fame.buy', { n: fmt(n.cost) }) }));
      }))));
    }
    const ownedLux = LUXURY.filter((d) => G.owned(s, d.id)).length, done = m.achievements.includes('rent_free');
    const ach = h('div', { class: 'card prestige ach' + (done ? ' done' : ''), 'data-test': 'ach-rent_free' }, h('img', { class: 'card-img', src: assetUrl('items/ach_trophy'), alt: '', width: 72, height: 72 }),
      h('div', { class: 'card-body' }, h('b', { text: t('ach.rent_free.name') }), h('span', { class: 'muted', text: t('ach.rent_free.desc') }),
        done ? h('span', { class: 'chip ok', text: t('ach.earned') }) : h('div', {}, h('span', { class: 'chip', text: t('ach.progress', { a: ownedLux, b: LUXURY.length }) }), h('div', { class: 'progress' }, h('i', { style: { width: ownedLux / LUXURY.length * 100 + '%' } })))));
    ap(p, h('h3', { text: t('sell.title') }), sell, h('h3', { text: t('fame.title') }), fameCard, h('h3', { text: t('fame.tree') }), h('p', { class: 'note', text: t('fame.treeHelp') }), tree,
      h('h3', { text: t('ach.title') }), ach);
  }
  confirmSell() {
    const s = this.s;
    this.showModal((box, close) => ap(box, box.setAttribute('data-test', 'sell-confirm') || null, h('img', { src: assetUrl('items/sell_channel'), alt: '', width: 80, height: 80, class: 'modal-icon' }),
      h('h2', { text: t('sell.confirmTitle') }), h('p', { text: t('sell.confirm') }), h('p', { class: 'big ok', text: t('sell.gain', { n: fmt(G.fameGain(s)) }) }),
      h('div', { class: 'row end' }, h('button', { class: 'btn', onclick: close }, t('sell.no')),
        h('button', { class: 'btn primary', 'data-test': 'sell-yes', onclick: () => { close(); this.sound.play('cash'); this.ctrl.sell(); } }, t('sell.yes')))));
  }
  showAchievement(e) {
    this.toast(t('ach.' + e.id + '.done', { n: fmt(e.fame) }), 'ok');
    this.queueModal((box, close) => ap(box, box.setAttribute('data-test', 'achievement') || null, h('img', { src: assetUrl('items/ach_trophy'), alt: '', width: 96, height: 96, class: 'modal-icon' }),
      h('h2', { text: t('ach.' + e.id + '.name') }), h('p', { text: t('ach.' + e.id + '.desc') }), h('p', { class: 'big ok', text: t('fame.points', { n: '+' + fmt(e.fame) }) }),
      h('button', { class: 'btn primary big', 'data-test': 'achievement-ok', onclick: close }, t('welcome.ok'))));
    if (this.tab === 'channel') this.refresh();
  }
  lastVideo() { const s = this.s; const v = s.videos[s.videos.length - 1]; if (v) return { titleId: v.titleId, views: v.total, show: v.show, outfit: v.outfit, colors: v.colors, exposed: v.exposed, showInvest: v.showInvest }; return s.history[0] || null; }
  share() {
    const v = this.lastVideo();
    if (!v) { this.toast(t('channel.noVideo')); return; }
    openShare(this, this.s, this.videoSpec(v), v);
  }

  // ------------------------------------------------------------ modals / toasts
  queueModal(render, opts) { this.modals.push(Object.assign({ render, dismissable: true }, opts || {})); if (!this.modalOpen) this.nextModal(); }
  showModal(render, opts) { this.queueModal(render, opts); }
  nextModal() {
    const m = this.modals.shift(); this.modalOpen = m || null;
    clear(this.modalEl);
    if (!m) { this.modalEl.classList.add('hidden'); return; }
    this.modalEl.classList.remove('hidden');
    const box = h('div', { class: 'modal ' + (m.cls || ''), role: 'dialog', 'aria-modal': 'true' });
    ap(this.modalEl, box);
    this.modalEl.onclick = (e) => { if (e.target === this.modalEl && m.dismissable) this.closeModal(); };
    m.render(box, () => this.closeModal());
  }
  closeModal() { if (this.modalOpen && this.modalOpen.onClose) this.modalOpen.onClose(); this.nextModal(); }
  toast(text, kind) {
    const el = h('div', { class: 'toast ' + (kind || ''), text }); ap(this.toastEl, el);
    setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
  }
  showWelcome(sum) {
    this.queueModal((box, close) => {
      box.setAttribute('data-test', 'welcome');
      ap(box, h('h2', { text: t('welcome.title') }), h('p', { text: t('welcome.away', { t: fmtDuration(sum.seconds || 0) }) }),
        h('ul', { class: 'welcome-list' },
          h('li', { text: t('welcome.views', { v: fmt(sum.views) }) }),
          sum.auto ? h('li', { text: plural('welcome.auto', sum.auto, { n: fmt(sum.auto) }) }) : null,
          h('li', { text: t('welcome.followers', { v: fmt(Math.max(0, sum.followers)) }) }),
          sum.rent > 0 ? h('li', { class: 'bad', text: t('welcome.rent', { v: money(sum.rent) }) }) : null,
          ...(sum.repossessed || []).map((id) => h('li', { class: 'bad', text: t('welcome.repossessed', { x: itemName(id) }) })),
          h('li', { class: 'big', text: t('welcome.money', { v: money(sum.money) }) })),
        h('button', { class: 'btn primary big', 'data-test': 'welcome-ok', onclick: close }, t('welcome.ok')));
    });
  }
  showSettings() {
    const o = this.opts;
    this.showModal((box, close) => {
      ap(box, h('h2', { text: t('settings.title') }));
      const langs = available();
      if (langs.length > 1) {   // hidden while only Turkish ships
        const sel = h('select', { class: 'input', 'data-test': 'lang-picker', onchange: (e) => o.changeLocale && o.changeLocale(e.target.value) }, ...langs.map((c) => h('option', { value: c, selected: c === locale() }, t('lang.' + c))));
        ap(box, h('label', { class: 'field' }, h('span', { class: 'lbl', text: t('settings.language') }), sel));
      }
      if (o.install && o.install.available()) ap(box, h('button', { class: 'btn', onclick: () => o.install.prompt() }, t('settings.install')));
      else if (o.install && o.install.ios()) ap(box, h('p', { class: 'muted', text: t('settings.iosInstall') }));
      if (o.tools) ap(box, h('h3', { text: t('settings.saveTitle') }), h('div', { class: 'row' },
        h('button', { class: 'btn', 'data-test': 'save-export', onclick: () => { close(); exportSave(this, o.tools); } }, t('saveFile.export')),
        h('button', { class: 'btn', 'data-test': 'save-import', onclick: () => { close(); openImport(this, o.tools); } }, t('saveFile.import'))));
      if (o.tel) {
        const tel = o.tel;
        const box2 = h('input', { type: 'checkbox', 'data-test': 'tel-toggle', checked: tel.enabled(), onchange: (e) => {
          const on = e.target.checked;
          if (tel.noticeNeeded()) { tel.answerNotice(on); const b = document.querySelector('[data-test=tel-banner]'); if (b) b.remove(); } else tel.setEnabled(on);
        } });
        ap(box, h('h3', { text: t('settings.privacy') }), h('label', { class: 'toggle-row' }, box2, h('span', { text: t('settings.telemetry') })),
          h('p', { class: 'muted small' }, t('settings.telemetryHint'), ' ', h('button', { class: 'link', 'data-test': 'settings-tel-details', onclick: () => { close(); showDetails(this); } }, t('telemetry.detailsLink'))));
      }
      ap(box, h('p', { class: 'muted', text: t('settings.credits') }), h('p', { class: 'muted small', text: t('settings.version', { v: o.version || '' }) }),
        h('button', { class: 'btn danger', 'data-test': 'reset', onclick: () => { close(); this.confirmReset(); } }, t('settings.reset')),
        h('button', { class: 'btn primary', onclick: close }, t('settings.close')));
    });
  }
  confirmReset() {
    this.showModal((box, close) => ap(box, h('p', { text: t('settings.resetConfirm') }), h('div', { class: 'row end' },
      h('button', { class: 'btn', onclick: close }, t('settings.no')),
      h('button', { class: 'btn danger', 'data-test': 'reset-yes', onclick: () => { close(); this.ctrl.reset(); } }, t('settings.yes')))));
  }

  // ------------------------------------------------------------ tutorial (first minutes)
  // steps: shoot -> title -> edit -> publish -> equip -> rent -> show -> done (s.tut stores progress)
  updateTutorial() {
    const s = this.s; if (!this.hintEl) return;
    let step = null, target = null;
    if (s.tut < 99) {
      if (s.stats.videos === 0) step = this.flow ? ({ plan: 'title', shooting: null, edit: 'edit', publish: 'publish' })[this.flow.step] : 'shoot';
      else if (!EQUIPMENT.some((e) => s.equip[e.id] > 0)) step = s.money >= G.equipCost('camera', 0) ? 'equip' : null;
      else if (!Object.keys(s.items).length && s.stats.ifsa === 0) step = 'rent';
      else if (Object.values(s.items).some((it) => it.status === 'rented') && s.ifsa.rentedVideos === 0) step = 'show';
      else if (s.stats.videos > 0 && Object.keys(s.items).length) { s.tut = 99; }
    }
    this.tut = step;
    for (const el of this.root.querySelectorAll('.pulse')) el.classList.remove('pulse');
    if (!step || (this.flow && !['title', 'edit', 'publish'].includes(step))) { this.hintEl.classList.add('hidden'); return; }
    if (step === 'shoot' || step === 'show') target = this.tab === 'studio' ? this.panel.querySelector('[data-test=shoot]') : this.nav.querySelector('[data-tab=studio]');
    if (step === 'equip') target = this.tab === 'shop' ? (this.shopTab === 'equip' ? this.panel.querySelector('[data-test=equip-camera]') : this.panel.querySelector('[data-test=shop-tab-equip]')) : this.nav.querySelector('[data-tab=shop]');
    if (step === 'rent') target = this.tab === 'shop' ? (this.shopTab === 'luxury' ? this.panel.querySelector('[data-test=rent-watch_01]') : this.panel.querySelector('[data-test=shop-tab-luxury]')) : this.nav.querySelector('[data-tab=shop]');
    if (step === 'title') target = this.sheetEl.querySelector('.title-opt.on');
    if (step === 'edit') target = this.sheetEl.querySelector('[data-test=edit-cut]');
    if (step === 'publish') target = this.sheetEl.querySelector('[data-test=publish-go]');
    if (target) target.classList.add('pulse');
    const inSheet = !!this.flow;
    const host = inSheet ? this.sheetEl.querySelector('.sheet-box') : null;
    clear(this.hintEl).append(h('span', { text: t('tut.' + step) }), h('button', { class: 'link', 'data-test': 'tut-skip', onclick: () => { s.tut = 99; this.updateTutorial(); } }, t('tut.skip')));
    this.hintEl.classList.remove('hidden');
    if (host && this.hintEl.parentNode !== host) host.prepend(this.hintEl);
    else if (!host && this.hintEl.parentNode !== this.stage.parentNode) this.stage.parentNode.append(this.hintEl);
  }
}
export { CARD };
