// Three sound effects, synthesized in code with WebAudio (no audio files; CC0 / original).
//   notify — soft two-note chime (video published, welcome back, achievement)
//   cash   — cash-register "ka-ching" (buy, rent, upgrade, hire, invest, Şöhret node)
//   ifsa   — falling alert siren (İfşa!)
// On by default; one-tap mute, remembered in localStorage. The AudioContext is created lazily on the
// first user gesture (autoplay policy), and every failure is swallowed so audio never breaks the game.
const KEY = 'fenomen_sound';
const has = () => typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);

export class Sound {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    let v = null; try { v = storage && storage.getItem(KEY); } catch (e) { /* private mode */ }
    this.muted = v === 'off';
    this.ctx = null;
    this.log = [];                         // test hook: window.__sounds
    if (typeof window !== 'undefined') window.__sounds = this.log;
    const unlock = () => { this.ensure(); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); };
    if (typeof window !== 'undefined') for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
  }
  ensure() {
    if (this.ctx || !has()) return this.ctx;
    try { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); } catch (e) { this.ctx = null; }
    return this.ctx;
  }
  setMuted(m) { this.muted = !!m; try { this.storage && this.storage.setItem(KEY, this.muted ? 'off' : 'on'); } catch (e) { /* ignore */ } }
  toggle() { this.setMuted(!this.muted); if (!this.muted) this.play('notify'); return this.muted; }
  play(name) {
    this.log.push({ name, muted: this.muted });
    if (this.log.length > 50) this.log.shift();
    if (this.muted) return false;
    const ctx = this.ensure(); if (!ctx || ctx.state !== 'running') return false;
    try { (FX[name] || (() => {}))(ctx, ctx.currentTime + 0.01); return true; } catch (e) { return false; }
  }
}
function tone(ctx, t, { type = 'sine', f0, f1 = f0, dur, vol = 0.2, attack = 0.005 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(ctx, t, dur, vol, hp) {
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  src.connect(f).connect(g).connect(ctx.destination); src.start(t);
}
const FX = {
  notify(ctx, t) { tone(ctx, t, { f0: 880, dur: 0.18, vol: 0.14 }); tone(ctx, t + 0.11, { f0: 1318.5, dur: 0.3, vol: 0.12 }); },
  cash(ctx, t) {
    noise(ctx, t, 0.05, 0.25, 2000);                                          // drawer "ka"
    tone(ctx, t + 0.05, { type: 'triangle', f0: 2093, dur: 0.35, vol: 0.12 });  // bell "ching"
    tone(ctx, t + 0.05, { type: 'sine', f0: 3136, dur: 0.25, vol: 0.06 });
    tone(ctx, t + 0.13, { type: 'triangle', f0: 2637, dur: 0.4, vol: 0.1 });
  },
  ifsa(ctx, t) { for (let i = 0; i < 2; i++) tone(ctx, t + i * 0.28, { type: 'sawtooth', f0: 988, f1: 494, dur: 0.26, vol: 0.09, attack: 0.01 }); }
};
