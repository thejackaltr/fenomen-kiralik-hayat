// Share card in "video kapağı" style (vertical 1080x1920 for Reels/TikTok stories). All text drawn at runtime.
import { h } from './dom.js';
import { t } from '../logic/i18n.js';
import { fmt } from '../logic/format.js';
import { CFG } from '../logic/config.js';
import { drawScene, drawTitle, wrap, FONT } from '../render/scene.js';
import { drawDoll } from '../render/doll.js';

export function gameUrl(loc = location) { return loc.origin + loc.pathname.replace(/index\.html$/, ''); }
export function shareUrl(loc = location) { return gameUrl(loc) + '?' + CFG.share.utm; }
function prettyUrl(loc = location) { return gameUrl(loc).replace(/^https?:\/\//, '').replace(/\/$/, ''); }

export function composeCover(state, spec, video, loc = location) {
  const W = 1080, H = 1920;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2a0f3f'); g.addColorStop(0.55, '#5a1a6a'); g.addColorStop(1, '#ff3fa4');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // app name
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#ffd35a'; x.font = '800 54px ' + FONT; x.fillText(t('app.name'), W / 2, 120);
  // the video frame with thumbnail title
  const vx = 40, vy = 190, vw = W - 80, vh = Math.round(vw * 9 / 16);
  const v = document.createElement('canvas'); v.width = vw; v.height = vh;
  drawScene(v.getContext('2d'), vw, vh, Object.assign({}, spec, { title: null }));
  drawTitle(v.getContext('2d'), vw, vh, t('video.titles.' + video.titleId), { size: 0.1 });
  x.save(); x.shadowColor = 'rgba(0,0,0,0.5)'; x.shadowBlur = 40; x.fillStyle = '#000'; x.fillRect(vx, vy, vw, vh); x.restore();
  x.drawImage(v, vx, vy);
  // play button + progress bar
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.beginPath(); x.arc(vx + vw / 2, vy + vh / 2, 70, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.moveTo(vx + vw / 2 - 22, vy + vh / 2 - 36); x.lineTo(vx + vw / 2 + 38, vy + vh / 2); x.lineTo(vx + vw / 2 - 22, vy + vh / 2 + 36); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(vx, vy + vh - 10, vw, 10); x.fillStyle = '#ff2a3a'; x.fillRect(vx, vy + vh - 10, vw * 0.62, 10);
  // channel + stats
  x.textAlign = 'left'; x.fillStyle = '#ffffff'; x.font = '800 56px ' + FONT;
  const name = state.char.channel || t('creator.channelDefault');
  x.fillText(name, 60, vy + vh + 100);
  x.fillStyle = '#f3d6ff'; x.font = '600 40px ' + FONT;
  x.fillText(t('share.caption', { f: fmt(Math.floor(state.followers)), v: fmt(video.views || 0) }), 60, vy + vh + 160);
  // big character portrait
  const dh = 900;
  x.save(); x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 30;
  drawDoll(x, W * 0.7, H - 190, dh, spec.char, spec.worn, spec.colors, (spec.show || []).find((id) => /^watch_/.test(id)));
  x.restore();
  // CTA + url
  x.fillStyle = '#ffffff'; x.font = '900 72px ' + FONT; x.textAlign = 'left';
  const lines = wrap(x, t('share.cta'), W * 0.5);
  lines.forEach((ln, i) => x.fillText(ln, 60, H - 520 + i * 84));
  x.fillStyle = '#ffd35a'; x.font = '700 38px ' + FONT;
  x.fillText(prettyUrl(loc), 60, H - 110);
  return c;
}
function toBlob(canvas) { return new Promise((res) => canvas.toBlob((b) => res(b), 'image/png')); }
export async function copyText(text) {
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function download(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export function openShare(ui, state, spec, video) {
  const canvas = composeCover(state, spec, video);
  const url = shareUrl();
  const text = t('share.text', { f: fmt(Math.floor(state.followers)) });
  const dataUrl = canvas.toDataURL('image/png');
  window.__lastShare = { url, text, width: canvas.width, height: canvas.height };   // for tests
  ui.showModal((box, close) => {
    box.append(h('h2', { text: t('share.title') }), h('img', { class: 'share-img', src: dataUrl, alt: t('share.title'), 'data-test': 'share-img' }));
    const row = h('div', { class: 'col' });
    if (navigator.share) row.append(h('button', { class: 'btn primary big', 'data-test': 'share-native', onclick: async () => {
      try {
        const blob = await toBlob(canvas);
        const file = blob && typeof File !== 'undefined' ? new File([blob], 'fenomen.png', { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: t('meta.title'), text: text + ' ' + url });
        else await navigator.share({ title: t('meta.title'), text, url });
      } catch (e) { if (!e || e.name !== 'AbortError') ui.toast(t('share.fail')); }
    } }, t('share.native')));
    row.append(
      h('button', { class: 'btn big' + (navigator.share ? '' : ' primary'), 'data-test': 'share-download', onclick: async () => { const b = await toBlob(canvas); if (b) download(b, 'fenomen.png'); ui.toast(t('share.downloaded'), 'ok'); } }, t('share.download')),
      h('button', { class: 'btn big', 'data-test': 'share-copy', onclick: async () => { const ok = await copyText(text + ' ' + url); ui.toast(ok ? t('share.copied') : url, ok ? 'ok' : ''); } }, t('share.copy')),
      h('button', { class: 'btn ghost', onclick: close }, t('share.close')));
    box.append(row);
  }, { cls: 'share' });
}
