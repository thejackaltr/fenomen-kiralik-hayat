// Loads the generated PNGs (public/assets/<dir>/<id>.png) and tints grayscale paper-doll layers at runtime.
import META from '../data/assets.json' with { type: 'json' };
export { META };
const imgs = new Map();
export function url(id) { return './assets/' + id + '.png'; }
export function loadAll() {
  return Promise.all(Object.keys(META.files).map((id) => new Promise((res) => {
    const im = new Image(); im.onload = () => { imgs.set(id, im); res(); }; im.onerror = () => res(); im.src = url(id);
  })));
}
export function img(id) { return imgs.get(id) || null; }
export function loaded() { return imgs.size; }
const tintCache = new Map();
// multiply a grayscale layer by a colour, keeping the layer's alpha
export function tinted(id, color) {
  const src = img(id); if (!src) return null;
  if (!color) return src;
  const k = id + '|' + color;
  if (tintCache.has(k)) return tintCache.get(k);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(src, 0, 0);
  tintCache.set(k, c); return c;
}
