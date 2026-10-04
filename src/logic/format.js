// Locale-aware number/money/time formatting via Intl. Beyond Intl's compact range (>= 1e15) we continue with
// the locale's own extended suffixes (fmt.bigSuffixes in the locale JSON), then scientific notation.
import { locale, t, raw } from './i18n.js';

const cache = new Map();
function nf(opts) {
  const k = locale() + JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, new Intl.NumberFormat(locale(), opts));
  return cache.get(k);
}
export function fmt(n) {
  if (typeof n !== 'number' || n !== n) return nf({}).format(0);
  if (!isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 10) return nf({ maximumFractionDigits: 1 }).format(Math.trunc(n * 10) / 10);
  if (a < 1000) return nf({ maximumFractionDigits: 0 }).format(Math.trunc(n));
  if (a < 1e15) return nf({ notation: 'compact', maximumFractionDigits: a < 1e4 ? 1 : 2 }).format(n);
  const suf = raw('fmt.bigSuffixes');
  const i = Math.floor(Math.log10(a) / 3) - 5;          // 1e15 -> 0
  if (Array.isArray(suf) && i < suf.length) return t('fmt.bigPattern', { v: nf({ maximumFractionDigits: 2 }).format(n / Math.pow(10, 15 + 3 * i)), s: suf[i] });
  return nf({ notation: 'scientific', maximumFractionDigits: 2 }).format(n);
}
export function fmtInt(n) { return nf({ maximumFractionDigits: 0 }).format(Math.trunc(n)); }
export function pct(x) { return nf({ style: 'percent', maximumFractionDigits: 0 }).format(x); }
// fictional in-game currency with a neutral symbol (template in the locale file, e.g. "{v} ¤")
export function money(n) { return t('fmt.money', { v: fmt(n) }); }
export function fmtDuration(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const H = (x) => t('fmt.hours', { n: fmtInt(x) }), M = (x) => t('fmt.minutes', { n: fmtInt(x) }), S = (x) => t('fmt.seconds', { n: fmtInt(x) });
  if (h) return m ? t('fmt.pair', { a: H(h), b: M(m) }) : H(h);
  if (m) return s && m < 10 ? t('fmt.pair', { a: M(m), b: S(s) }) : M(m);
  return S(s);
}
// date + time of a timestamp (e.g. "last played"); tr -> Intl.DateTimeFormat('tr-TR'). null -> fallback text.
export function fmtDate(ts) {
  if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return t('import.dateUnknown');
  const loc = locale() === 'tr' ? 'tr-TR' : locale();
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}
// plain calendar date with a short month, no time and no relative wording: tr -> "28 Eyl 2026" (import conflict choice).
// Some ICU versions abbreviate as "Eyl." -> the trailing period of the month is dropped. null/0/NaN -> fallback text.
export function fmtDay(ts) {
  if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return t('import.dateUnknown');
  const loc = locale() === 'tr' ? 'tr-TR' : locale();
  const parts = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(new Date(ts));
  return parts.map((p) => (p.type === 'month' ? p.value.replace(/\.$/, '') : p.value)).join('');
}
// v2.2 cloud choice "{d}": short date and time, e.g. tr "28 Eyl 19:40" (no relative wording: there is no text for it).
// null/0/NaN -> the given fallback key.
export function fmtStamp(ts, fallbackKey = 'sync.conflict.dateUnknown') {
  if (typeof ts !== 'number' || !isFinite(ts) || ts <= 0) return t(fallbackKey);
  const loc = locale() === 'tr' ? 'tr-TR' : locale();
  const parts = new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts));
  const g = (k) => (parts.find((p) => p.type === k) || {}).value || '';
  return g('day') + ' ' + g('month').replace(/\.$/, '') + ' ' + g('hour') + ':' + g('minute');
}
// "Buluta kaydedildi · {t}": hh:mm
export function fmtClock(ts) {
  const loc = locale() === 'tr' ? 'tr-TR' : locale();
  return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
}
