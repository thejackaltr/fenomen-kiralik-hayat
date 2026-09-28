// Controller: owns the state, runs the real-time loop, autosaves locally, handles offline catch-up.
import * as G from './logic/game.js';
import { load, save, SAVE_KEY } from './logic/save.js';
import { LUX } from './logic/config.js';

export class Controller {
  constructor(storage, now = Date.now()) {
    this.storage = storage; this.listeners = {};
    this.loadState(now);
    this.last = performance.now(); this.lastSave = 0; this.timer = null;
  }
  loadState(now = Date.now()) {
    const s = load(this.storage, now);
    this.state = s || G.newGame(now);
    this.pendingWelcome = null;
    if (s && s.created) { const sum = G.catchUp(this.state, now); if (sum && (sum.views > 0 || sum.money !== 0 || sum.repossessed.length)) this.pendingWelcome = sum; }
    this.state.events.length = 0;
  }
  // a different save was put in storage (import / move): load it and rebuild the UI
  reload(now = Date.now()) { this.loadState(now); this.last = performance.now(); this.emit('reset'); if (this.pendingWelcome) this.emit('welcome', this.pendingWelcome); this.emit('loaded', this.state); }
  on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); }
  emit(ev, d) { for (const fn of this.listeners[ev] || []) fn(d); }
  start() { if (!this.timer) { this.last = performance.now(); this.timer = setInterval(() => this.frame(), 250); } }
  stop() { clearInterval(this.timer); this.timer = null; }
  frame() {
    const s = this.state, nowP = performance.now();
    let dt = (nowP - this.last) / 1000; this.last = nowP;
    if (!s.created) { s.lastSeen = Date.now(); return; }
    if (dt > 5) { this.resume(Date.now()); return; }   // throttled tab: use wall clock
    G.tick(s, dt); s.lastSeen = Date.now(); s.meta.playSec = (s.meta.playSec || 0) + dt;
    this.drain(); this.emit('tick', s);
    if (nowP - this.lastSave > 5000) { this.lastSave = nowP; this.save(); }
  }
  drain() { const ev = this.state.events.splice(0); for (const e of ev) this.emit(e.type, e); if (ev.length) this.emit('change'); }
  resume(now = Date.now()) {
    const s = this.state; if (!s.created) return;
    const sum = G.catchUp(s, now);
    this.last = performance.now();
    const hadIfsa = s.events.some((e) => e.type === 'ifsa');
    this.drain(); if (!hadIfsa) this.emit('change');
    if (sum && (sum.views > 0 || sum.repossessed.length)) this.emit('welcome', sum);
    this.save();
  }
  save() { this.state.lastSeen = Date.now(); return save(this.storage, this.state); }
  reset() { try { this.storage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } this.state = G.newGame(Date.now()); this.emit('reset'); this.emit('wiped'); }
  // "Kanalı Sat": swap in the brand-new account (keeps Şöhret/tree/achievements), then the UI shows the creator again
  sell() { const ns = G.sellChannel(this.state, Date.now()); if (!ns) return null; this.state = ns; this.state.events.length = 0; this.save(); this.emit('sold', ns.lastSale); return ns.lastSale; }
  // actions -> { ok }
  act(fn, ...args) { const ok = fn(this.state, ...args); this.drain(); if (ok) { this.emit('change'); this.save(); } return ok; }
  create(opts, path) { G.createCharacter(this.state, opts); const ok = G.choosePath(this.state, path); if (ok) { this.state.lastSeen = Date.now(); this.save(); this.emit('created', { path }); this.emit('change'); } return ok; }
  publish(opts) { const v = G.publish(this.state, opts); this.drain(); this.emit('change'); this.save(); return v; }
  resolveIfsa(choice) { const r = G.resolveIfsa(this.state, choice); if (r) this.emit('ifsaResolved', r); this.emit('change'); this.save(); return r; }
}
