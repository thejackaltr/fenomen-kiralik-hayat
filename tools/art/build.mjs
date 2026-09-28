// Renders tools/art/art.js in headless Chrome and writes one PNG per asset ID into public/assets/<dir>/<id>.png,
// src/data/assets.json (sizes + pivots) and the PWA icons. Usage: npm run art   (CHROME=/path/to/chrome to override)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exe = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'tools/art/art.js'), 'utf8') });
const out = await page.evaluate(() => {
  const { files, DOLL } = window.ART;
  const res = {}, meta = { doll: DOLL, files: {} };
  const render = (f) => { const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; f.draw(c.getContext('2d')); return c; };
  for (const [id, f] of Object.entries(files)) { res[id] = render(f).toDataURL('image/png'); meta.files[id] = { w: f.w, h: f.h, pivot: f.pivot }; }
  function icon(size, maskable) {
    const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, size, size); g.addColorStop(0, '#ff3fa4'); g.addColorStop(1, '#7a3cff'); x.fillStyle = g; x.fillRect(0, 0, size, size);
    const s = size / 512 * (maskable ? 0.8 : 1);
    x.save(); x.translate(size / 2, size / 2); x.scale(s, s);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.arc(0, 0, 200, 0, Math.PI * 2); x.fill();
    const layers = [['doll/body_m', '#e8b48a'], ['doll/body_m_fx'], ['doll/body_m_hair', '#3a2a20'], ['doll/bottom_suit_01', '#2a2a34'], ['doll/top_suit_01', '#2a2a34'], ['doll/top_suit_01_fx'], ['doll/shoes_loafers_01', '#1a1a1e'], ['doll/glasses_sun_01', '#f2c230'], ['doll/glasses_sun_01_fx']];
    x.translate(-128 * 0.9, -290 * 0.9); x.scale(0.9, 0.9);
    for (const [id, tint] of layers) {
      const src = render(files[id]);
      if (tint) { const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const tc = t.getContext('2d'); tc.drawImage(src, 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = tint; tc.fillRect(0, 0, t.width, t.height); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(src, 0, 0); x.drawImage(t, 0, 0); }
      else x.drawImage(src, 0, 0);
    }
    x.restore();
    return c.toDataURL('image/png');
  }
  return { res, meta, icons: { 'icon-192.png': icon(192), 'icon-512.png': icon(512), 'icon-maskable-512.png': icon(512, true), 'apple-touch-icon.png': icon(180) } };
});
await browser.close();
const b64 = (d) => Buffer.from(d.split(',')[1], 'base64');
let bytes = 0;
for (const [id, d] of Object.entries(out.res)) { const p = path.join(root, 'public/assets', id + '.png'); fs.mkdirSync(path.dirname(p), { recursive: true }); const b = b64(d); bytes += b.length; fs.writeFileSync(p, b); }
fs.writeFileSync(path.join(root, 'src/data/assets.json'), JSON.stringify(out.meta, null, 1) + '\n');
for (const [n, d] of Object.entries(out.icons)) fs.writeFileSync(path.join(root, 'public/icons', n), b64(d));
console.log('assets:', Object.keys(out.res).length, 'bytes:', bytes);
