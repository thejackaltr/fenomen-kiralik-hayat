// Paper-doll composition. Fixed layer order: body, bottom, top, shoes, accessory, glasses.
// Every layer shares one canvas size and pivot (feet centre), so layers simply stack.
import { META, tinted, img } from './assets.js';
import { WEAR, LUX, SKINS, HAIRS, LAYER_ORDER } from '../logic/config.js';

export const DOLL = META.doll;   // { w, h, pivot }
const has = (id) => !!META.files['doll/' + id];
// -> [{ id, tint }] in draw order
export function layers(char, worn, colors, watchId) {
  const out = [];
  const b = char.body === 'f' ? 'f' : 'm';
  const push = (id, tint) => { if (has(id)) out.push({ id: 'doll/' + id, tint }); };
  const wearTint = (id) => { const d = WEAR[id]; return d.palette[(colors && colors[id]) || 0]; };
  for (const layer of LAYER_ORDER) {
    if (layer === 'body') {
      push('body_' + b + '_hairback', HAIRS[char.hair] || HAIRS[0]);
      push('body_' + b, SKINS[char.skin] || SKINS[1]);
      push('body_' + b + '_fx');
      push('body_' + b + '_hair', HAIRS[char.hair] || HAIRS[0]);
      continue;
    }
    const id = worn && worn[layer];
    if (id && WEAR[id]) { push(id, wearTint(id)); push(id + '_fx'); }
    if (layer === 'accessory' && watchId && LUX[watchId] && LUX[watchId].doll) { push(LUX[watchId].doll, LUX[watchId].tint); push(LUX[watchId].doll + '_fx'); }
  }
  return out;
}
const cache = new Map();
export function compose(char, worn, colors, watchId) {
  const L = layers(char, worn, colors, watchId);
  const key = L.map((l) => l.id + (l.tint || '')).join(',');
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = DOLL.w; c.height = DOLL.h;
  const x = c.getContext('2d');
  for (const l of L) { const im = tinted(l.id, l.tint); if (im) x.drawImage(im, 0, 0); }
  if (cache.size > 40) cache.clear();
  cache.set(key, c); return c;
}
// draw with feet pivot at (px, py); height in px
export function drawDoll(ctx, px, py, height, char, worn, colors, watchId) {
  const c = compose(char, worn, colors, watchId);
  const s = height / DOLL.h;
  ctx.drawImage(c, px - DOLL.pivot[0] * s, py - DOLL.pivot[1] * s, DOLL.w * s, DOLL.h * s);
}
// small preview of one wearable (cropped to its slot region), for shop/closet cards
const CROP = { top: [40, 228, 176, 172], bottom: [60, 356, 136, 136], shoes: [76, 440, 104, 62], accessory: [52, 86, 152, 220], glasses: [60, 150, 136, 60] };
export function wearThumb(id, colorIdx, size = 96) {
  const d = WEAR[id]; const r = CROP[d.slot];
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d');
  const s = Math.min(size / r[2], size / r[3]);
  const ox = (size - r[2] * s) / 2, oy = (size - r[3] * s) / 2;
  for (const lid of ['doll/' + id, 'doll/' + id + '_fx']) {
    const im = lid.endsWith('_fx') ? img(lid) : tinted(lid, d.palette[colorIdx || 0]);
    if (im) x.drawImage(im, r[0], r[1], r[2], r[3], ox, oy, r[2] * s, r[3] * s);
  }
  return c;
}
