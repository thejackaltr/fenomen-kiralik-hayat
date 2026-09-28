// Video scene / thumbnail composition (Canvas 2D). All text (titles, KİRALIK tag) is drawn at runtime from the locale.
import { img } from './assets.js';
import { drawDoll } from './doll.js';
import { LUX, PATH } from '../logic/config.js';
import { t, upper } from '../logic/i18n.js';

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Ubuntu, sans-serif';

// spec: { char, worn, colors, path, show:[ids], exposed:[ids], title, rec, investShow }
export function pickBg(spec) {
  const show = spec.show || [];
  const has = (cat) => show.find((id) => LUX[id] && LUX[id].cat === cat);
  if (has('villa')) return 'bg/bg_villa_01';
  if (has('boat')) return 'bg/bg_sea_01';
  if (has('car')) return 'bg/bg_street_01';
  return 'bg/' + ((PATH[spec.path] && PATH[spec.path].home) || 'bg_room_01');
}
function cover(ctx, im, W, H) {
  const s = Math.max(W / im.width, H / im.height);
  ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
}
// runtime KİRALIK stamp (separate layer; in videos only for items exposed by an İfşa)
export function drawRentTag(ctx, cx, cy, size, angle = -0.18) {
  const text = upper(t('tags.rented'));
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
  ctx.font = '900 ' + Math.round(size) + 'px ' + FONT;
  const w = ctx.measureText(text).width + size * 0.9, h = size * 1.45;
  ctx.fillStyle = 'rgba(220,20,40,0.92)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
}
export function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const n = cur ? cur + ' ' + w : w; if (ctx.measureText(n).width > maxW && cur) { lines.push(cur); cur = w; } else cur = n; }
  if (cur) lines.push(cur); return lines;
}
export function drawTitle(ctx, W, H, title, opts = {}) {
  let size = Math.round(H * (opts.size || 0.11));
  const maxW = W * (opts.maxW || 0.58), x0 = W * 0.04;
  let lines;
  for (;;) { ctx.font = '900 ' + size + 'px ' + FONT; lines = wrap(ctx, title, maxW); if (lines.length <= 3 || size < 10) break; size = Math.round(size * 0.88); }
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  let y = H * 0.05;
  lines.forEach((ln, i) => {
    const w = ctx.measureText(ln).width;
    ctx.fillStyle = i === 0 ? 'rgba(255,214,0,0.95)' : 'rgba(0,0,0,0.55)';
    ctx.fillRect(x0 - size * 0.18, y - size * 0.08, w + size * 0.36, size * 1.16);
    ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = i === 0 ? '#1a1a1a' : '#000';
    ctx.fillStyle = i === 0 ? '#1a1a1a' : '#ffffff';
    if (i !== 0) ctx.strokeText(ln, x0, y);
    ctx.fillText(ln, x0, y);
    y += size * 1.22;
  });
}
export function drawScene(ctx, W, H, spec) {
  const show = (spec.show || []).filter((id) => LUX[id]);
  const exposed = new Set(spec.exposed || []);
  const bgId = pickBg(spec);
  const bg = img(bgId);
  ctx.save();
  if (bg) cover(ctx, bg, W, H); else { ctx.fillStyle = '#2a2240'; ctx.fillRect(0, 0, W, H); }
  const tags = [];
  const isOutdoor = bgId.includes('street') || bgId.includes('sea');
  // wall art
  if (show.includes('painting_01') && !isOutdoor) {
    const im = img('items/painting_01'); const w = W * 0.13, h = w * 1.25, x = W * 0.08, y = H * 0.12;
    if (im) ctx.drawImage(im, x, y, w, h); if (exposed.has('painting_01')) tags.push([x + w / 2, y + h * 0.6, H * 0.045]);
  }
  // vehicles behind the character
  const boat = show.find((id) => LUX[id].cat === 'boat');
  if (boat) { const im = img('items/' + boat); const w = W * 0.52, h = w * im.height / im.width, x = W * 0.02, y = H * 0.62 - h; if (im) ctx.drawImage(im, x, y, w, h); if (exposed.has(boat)) tags.push([x + w / 2, y + h * 0.4, H * 0.06]); }
  const cars = show.filter((id) => LUX[id].cat === 'car');
  cars.forEach((car, i) => {
    const im = img('items/' + car); if (!im) return;
    const w = W * (cars.length > 1 ? 0.44 : 0.56), h = w * im.height / im.width, x = W * 0.01 + i * W * 0.2, y = H * 0.97 - h - i * H * 0.08;
    ctx.drawImage(im, x, y, w, h); if (exposed.has(car)) tags.push([x + w * 0.5, y + h * 0.35, H * 0.06]);
  });
  // character (+ watch on wrist)
  const watch = show.filter((id) => LUX[id].cat === 'watch').sort((a, b) => LUX[b].price - LUX[a].price)[0];
  const dh = H * (spec.dollScale || 0.9), dx = W * (spec.dollX || 0.72), dy = H * 0.99 + (spec.bob || 0);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(dx, dy - dh * 0.02, dh * 0.2, dh * 0.03, 0, 0, Math.PI * 2); ctx.fill();
  drawDoll(ctx, dx, dy, dh, spec.char, spec.worn, spec.colors, watch);
  if (watch && exposed.has(watch)) tags.push([dx - dh * 0.2, dy - dh * 0.25, H * 0.04]);
  // collectible sneaker on the floor
  if (show.includes('sneaker_rare_01')) { const im = img('items/sneaker_rare_01'); const w = W * 0.14, h = w * 0.6, x = dx - dh * 0.55, y = H * 0.97 - h; if (im) ctx.drawImage(im, x, y, w, h); if (exposed.has('sneaker_rare_01')) tags.push([x + w / 2, y + h * 0.3, H * 0.04]); }
  if (show.includes('villa_01') && exposed.has('villa_01')) tags.push([W * 0.55, H * 0.3, H * 0.07]);
  // investments shown: little icons row
  if (spec.investShow && spec.investIcons && spec.investIcons.length) spec.investIcons.forEach((id, i) => { const im = img('items/' + id); const s = H * 0.16; if (im) ctx.drawImage(im, W * 0.04 + i * s * 1.08, H * 0.8 - s, s, s); });
  for (const [x, y, s] of tags) drawRentTag(ctx, x, y, s);
  if (spec.title) drawTitle(ctx, W, H, spec.title, spec.titleOpts);
  if (spec.rec) { ctx.fillStyle = '#ff2a3a'; ctx.beginPath(); ctx.arc(W - H * 0.07, H * 0.08, H * 0.03, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
// convenience: render a thumbnail into a new or given canvas
export function thumbCanvas(spec, W = 640, H = 360, canvas) {
  const c = canvas || document.createElement('canvas'); c.width = W; c.height = H;
  drawScene(c.getContext('2d'), W, H, spec); return c;
}
