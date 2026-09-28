import { chromium } from 'playwright-core';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
await page.setContent('<html><body style="margin:0;background:#556"></body></html>');
await page.addScriptTag({ content: fs.readFileSync('tools/art/art.js', 'utf8') });
await page.evaluate(() => {
  const { files } = window.ART;
  const cv = document.createElement('canvas'); cv.width = 1400; cv.height = 1000; document.body.appendChild(cv); const x = cv.getContext('2d');
  const render = (f) => { const c = document.createElement('canvas'); c.width = f.w; c.height = f.h; f.draw(c.getContext('2d')); return c; };
  const tint = (id, col) => { const src = render(files[id]); if (!col) return src; const t = document.createElement('canvas'); t.width = src.width; t.height = src.height; const tc = t.getContext('2d'); tc.drawImage(src, 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = col; tc.fillRect(0, 0, t.width, t.height); tc.globalCompositeOperation = 'destination-in'; tc.drawImage(src, 0, 0); return t; };
  const outfits = [
    [['doll/body_m', '#e8b48a'], ['doll/body_m_fx'], ['doll/body_m_hair', '#3a2a20'], ['doll/bottom_jeans_01', '#4a6aa8'], ['doll/top_tshirt_01', '#f4f4f4'], ['doll/shoes_sneakers_01', '#ffffff']],
    [['doll/body_f_hairback', '#8a4a20'], ['doll/body_f', '#f2c8a8'], ['doll/body_f_fx'], ['doll/body_f_hair', '#8a4a20'], ['doll/bottom_skirt_01', '#d8483c'], ['doll/top_hoodie_01', '#7a3cff'], ['doll/shoes_boots_01', '#5a3a2a'], ['doll/acc_chain_01', '#f2c230'], ['doll/glasses_round_01', '#222']],
    [['doll/body_m', '#a8704a'], ['doll/body_m_fx'], ['doll/body_m_hair', '#111'], ['doll/bottom_suit_01', '#24242c'], ['doll/top_suit_01', '#24242c'], ['doll/top_suit_01_fx'], ['doll/shoes_loafers_01', '#151518'], ['doll/acc_watch_01', '#e8c060'], ['doll/acc_watch_01_fx'], ['doll/glasses_sun_01', '#f2c230'], ['doll/glasses_sun_01_fx']],
    [['doll/body_f_hairback', '#f2d26a'], ['doll/body_f', '#e8b48a'], ['doll/body_f_fx'], ['doll/body_f_hair', '#f2d26a'], ['doll/bottom_shorts_01', '#3a3a3a'], ['doll/top_suit_01', '#24242c'], ['doll/top_suit_01_fx'], ['doll/shoes_sneakers_01', '#ff6a1a'], ['doll/acc_cap_01', '#d8483c'], ['doll/acc_watch_02', '#c0c8d8'], ['doll/acc_watch_02_fx']],
  ];
  outfits.forEach((o, i) => o.forEach(([id, col]) => x.drawImage(tint(id, col), 10 + i * 260, 0)));
  let px = 1050, py = 10;
  const items = Object.keys(files).filter((k) => k.startsWith('items/'));
  items.forEach((id, i) => { const c = render(files[id]); const s = Math.min(110 / c.width, 90 / c.height); x.drawImage(c, 1050 + (i % 3) * 115, 10 + Math.floor(i / 3) * 95, c.width * s, c.height * s); });
  Object.keys(files).filter((k) => k.startsWith('bg/')).forEach((id, i) => x.drawImage(render(files[id]), 10 + i * 205, 530, 200, 112));
});
await page.screenshot({ path: 'screenshots/_art_preview.png' });
await browser.close();
