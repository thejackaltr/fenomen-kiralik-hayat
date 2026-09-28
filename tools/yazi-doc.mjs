// Regenerates docs/YAZI_METINLER.md from src/locales/tr.json (sections = key groups to review).
import fs from 'node:fs';
const tr = JSON.parse(fs.readFileSync('src/locales/tr.json', 'utf8'));
const get = (k) => k.split('.').reduce((o, p) => (o ? o[p] : undefined), tr);
const L = ['# Fenomen: Kiralık Hayat — Yazı için metinler', '', 'Kaynak: `src/locales/tr.json` (bu dosya `node tools/yazi-doc.mjs` ile üretilir). Düzenleme doğrudan tr.json üzerinden yapılır.', ''];
const flat = (prefix, v, out) => { if (typeof v === 'string') out.push([prefix, v]); else if (Array.isArray(v)) out.push([prefix, v.join(' / ')]); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) flat(prefix + '.' + k, x, out); return out; };
const SECTIONS = JSON.parse(fs.readFileSync('tools/yazi-sections.json', 'utf8'));
for (const [title, keys, note] of SECTIONS) {
  L.push('## ' + title, ''); if (note) L.push(note, '');
  for (const k of keys) for (const [kk, v] of flat(k, get(k), [])) L.push('- `' + kk + '`: ' + v);
  L.push('');
}
fs.writeFileSync('docs/YAZI_METINLER.md', L.join('\n'));
console.log('docs/YAZI_METINLER.md', L.length, 'lines');
