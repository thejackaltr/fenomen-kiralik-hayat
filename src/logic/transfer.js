// Save transfer: export/import file, copyable code and the one-click move to the new address (#import=<data>).
// Pure logic + storage helpers only (no DOM), so it runs in node:test as well as in the browser.
//
// Envelope (same shape for the file, the code and the URL fragment):
//   { format: 'fenomen-save', version: 1, exportedAt: <ms>, checksum: <fnv1a hex of JSON.stringify(save)>,
//     save: <the save object as stored under fenomen_save_v1>, sent: [<telemetry dedupe keys>], tel: 'on'|'off'|null,
//     notice: <bool, counter notice already answered> }
// Encoded form (code / fragment): 'z' + base64url(deflate-raw(JSON))  — or 'j' + base64url(JSON) when the browser has
// no CompressionStream (old Safari); the decoder accepts both.
import { CFG } from './config.js';
import { deserialize, SAVE_KEY } from './save.js';

export const FORMAT = 'fenomen-save';
export const ENVELOPE_VERSION = 1;
export const BACKUP_KEY = 'fenomen_save_backup';      // { at, source, save: <raw string> } — the save you did not pick
export const MIGRATED_KEY = 'fenomen_migrated_at';    // old address: set when the save was sent to the new address
export const IMPORT_PREFIX = '#import=';

const isNum = (x) => typeof x === 'number' && isFinite(x);
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isStr = (x) => typeof x === 'string';

// 32-bit FNV-1a over UTF-16 code units -> 8 hex chars (corruption check, not a security feature)
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
export const checksumOf = (save) => fnv1a(JSON.stringify(save));

// Schema check of a stored save (v1 or v2): required fields + types. deserialize() then clamps/cleans values.
export function validateSave(o) {
  if (!isObj(o)) return false;
  if (!Number.isInteger(o.v) || o.v < 1 || o.v > CFG.saveVersion) return false;
  if (typeof o.created !== 'boolean' || !isNum(o.startedAt) || !(o.lastSeen === undefined || isNum(o.lastSeen))) return false;
  if (!isNum(o.money) || !isNum(o.followers) || !isNum(o.trust) || o.money < 0 || o.followers < 0) return false;
  if (!(o.path === null || isStr(o.path))) return false;
  const c = o.char; if (!isObj(c) || !isStr(c.body) || !isNum(c.skin) || !isNum(c.hair) || !isStr(c.channel)) return false;
  const w = o.wear; if (!isObj(w) || !Array.isArray(w.owned) || !isObj(w.worn)) return false;
  for (const k of ['items', 'equip', 'staff', 'stats']) if (!isObj(o[k])) return false;
  if (o.videos !== undefined && !Array.isArray(o.videos)) return false;
  if (o.v >= 2) { const m = o.meta; if (!isObj(m) || !isNum(m.fame) || !Array.isArray(m.unlocks) || !Array.isArray(m.achievements) || !isNum(m.sales)) return false; }
  return true;
}

export function buildEnvelope(save, extra = {}, now = Date.now()) {
  return { format: FORMAT, version: ENVELOPE_VERSION, exportedAt: now, checksum: checksumOf(save), save,
    sent: Array.isArray(extra.sent) ? extra.sent.slice() : [], tel: extra.tel === 'on' || extra.tel === 'off' ? extra.tel : null, notice: !!extra.notice };
}
// -> { ok: true, env } | { ok: false, reason }
export function checkEnvelope(env) {
  if (!isObj(env) || env.format !== FORMAT) return { ok: false, reason: 'format' };
  if (!Number.isInteger(env.version) || env.version < 1 || env.version > ENVELOPE_VERSION) return { ok: false, reason: 'version' };
  if (!validateSave(env.save)) return { ok: false, reason: 'schema' };
  if (env.checksum !== checksumOf(env.save)) return { ok: false, reason: 'checksum' };
  if (env.sent !== undefined && !(Array.isArray(env.sent) && env.sent.length <= 200 && env.sent.every((k) => isStr(k) && /^[A-Za-z0-9_]{1,40}$/.test(k)))) return { ok: false, reason: 'sent' };
  if (env.tel !== undefined && env.tel !== null && env.tel !== 'on' && env.tel !== 'off') return { ok: false, reason: 'tel' };
  if (!deserialize(env.save)) return { ok: false, reason: 'load' };
  return { ok: true, env: Object.assign({ sent: [], tel: null, notice: false }, env) };
}

// ---------- base64url + (de)compression ----------
export function toB64url(bytes) {
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64url(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('b64');
  const b = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const hasStreams = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function';
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
export async function encodeEnvelope(env, { compress = true } = {}) {
  const bytes = new TextEncoder().encode(JSON.stringify(env));
  if (compress && hasStreams()) return 'z' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  return 'j' + toB64url(bytes);
}
// throws on anything that is not a well-formed encoded envelope (callers show import.fail / saveFile.importBad)
export async function decodeEnvelope(data) {
  const s = String(data || '').trim(); const kind = s[0];
  let bytes = fromB64url(s.slice(1));
  if (kind === 'z') { if (!hasStreams()) throw new Error('nostream'); bytes = await pipe(bytes, new DecompressionStream('deflate-raw')); }
  else if (kind !== 'j') throw new Error('kind');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
// decode + schema check in one go -> { ok, env?, reason? } (never throws)
export async function readCode(data) {
  try { return checkEnvelope(await decodeEnvelope(data)); } catch (e) { return { ok: false, reason: 'decode' }; }
}
export function readFileText(text) {
  try { return checkEnvelope(JSON.parse(text)); } catch (e) { return { ok: false, reason: 'json' }; }
}

// ---------- URL fragment ----------
export function fragmentData(hash) { return typeof hash === 'string' && hash.startsWith(IMPORT_PREFIX) ? hash.slice(IMPORT_PREFIX.length) : null; }
// remove "#import=..." without a reload or a new history entry
export function clearFragment(win) { try { win.history.replaceState(win.history.state, '', win.location.pathname + win.location.search); } catch (e) { /* ignore */ } }
// fragment for the move redirect, or null when it is too long (caller shows "Kaydı indir" only)
export async function moveFragment(env, maxChars) {
  const data = await encodeEnvelope(env);
  return data.length <= maxChars ? IMPORT_PREFIX + data : null;
}

// ---------- saves in storage ----------
export function readRawSave(storage) { try { return storage.getItem(SAVE_KEY); } catch (e) { return null; } }
export function parseRaw(raw) { try { const o = JSON.parse(raw); return isObj(o) ? o : null; } catch (e) { return null; } }
// "non-empty" = a character exists or anything permanent (Şöhret, sales, tree) was earned
export function isEmptySave(o) {
  if (!isObj(o)) return true;
  const m = isObj(o.meta) ? o.meta : {};
  return !o.created && !(m.sales > 0) && !(m.fame > 0) && !(Array.isArray(m.unlocks) && m.unlocks.length);
}
// last played = lastSeen (every save writes it; v1 saves have it too). null when missing -> UI fallback text.
export function summary(o) {
  return { followers: isObj(o) && isNum(o.followers) ? Math.floor(o.followers) : 0, lastPlayed: isObj(o) && isNum(o.lastSeen) && o.lastSeen > 0 ? o.lastSeen : null };
}
// Backup = ONE slot (fenomen_save_backup). It is never overwritten silently: writeBackup() refuses an occupied slot
// unless the caller passes overwrite=true, which the UI only does after the player chose "Mevcut yedeği indir" or
// "Yedeği sil ve devam et" (src/ui/savefile.js guardBackup).
export class BackupOccupiedError extends Error { constructor() { super('backup slot occupied'); this.name = 'BackupOccupiedError'; } }
export function hasBackup(storage) { try { return !!storage.getItem(BACKUP_KEY); } catch (e) { return false; } }
export function clearBackup(storage) { try { storage.removeItem(BACKUP_KEY); } catch (e) { /* ignore */ } }
export function writeBackup(storage, raw, source, now = Date.now(), overwrite = false) {
  if (!raw) return false;
  if (!overwrite && hasBackup(storage)) throw new BackupOccupiedError();
  try { storage.setItem(BACKUP_KEY, JSON.stringify({ at: now, source, save: raw })); return true; } catch (e) { return false; }
}
export function readBackup(storage) { try { return JSON.parse(storage.getItem(BACKUP_KEY)); } catch (e) { return null; } }
// what applyImport would put in the backup slot (raw string) — null when nothing (empty/identical local save)
export function backupCandidate(storage, env, keep = 'import') {
  const cur = readRawSave(storage), incoming = JSON.stringify(env.save);
  if (keep === 'current') return incoming;
  return cur && cur !== incoming && !isEmptySave(parseRaw(cur)) ? cur : null;
}
// true = this import would overwrite an existing backup -> the UI must ask first
export function backupConflict(storage, env, keep = 'import') { return hasBackup(storage) && backupCandidate(storage, env, keep) !== null; }
// Put an imported (already checked) envelope in place. keep: 'import' (default) | 'current'.
// The save that is not kept goes to BACKUP_KEY (an empty local save is not worth a backup). Throws
// BackupOccupiedError — before changing anything — if that would overwrite a backup and opts.overwriteBackup is not set.
export function applyImport(storage, env, keep = 'import', source = 'import', now = Date.now(), opts = {}) {
  const incoming = JSON.stringify(env.save), bak = backupCandidate(storage, env, keep);
  if (bak !== null && !opts.overwriteBackup && hasBackup(storage)) throw new BackupOccupiedError();
  if (bak !== null) writeBackup(storage, bak, source + (keep === 'current' ? ':unpicked-import' : ':replaced-local'), now, true);
  if (keep === 'current') return false;
  try { storage.setItem(SAVE_KEY, incoming); return true; } catch (e) { return false; }
}
