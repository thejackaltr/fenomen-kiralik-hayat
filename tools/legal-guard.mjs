// Release guard: the telemetry "Ayrıntılar" text must be complete before a production build.
// The last item of tr.json telemetry.details (veri sorumlusu, alıcılar, haklar) is written after legal review;
// while it (or any other item) is empty, `npm run build` fails. Escape hatch for dev/test builds: ALLOW_EMPTY_LEGAL=1.
// The dev server (`npm run dev`) and the unit tests never run this check.
export const LEGAL_KEY = 'telemetry.details';

export function emptyLegalItems(tr) {
  const list = tr && tr.telemetry && tr.telemetry.details;
  if (!Array.isArray(list) || list.length === 0) return [0];
  return list.map((p, i) => (typeof p === 'string' && p.trim() ? -1 : i)).filter((i) => i >= 0);
}

export function checkLegal(tr, env = {}) {
  const empty = emptyLegalItems(tr);
  if (empty.length === 0) return { ok: true, skipped: false, empty };
  if (String(env.ALLOW_EMPTY_LEGAL || '') === '1') return { ok: false, skipped: true, empty };
  const n = (tr && tr.telemetry && Array.isArray(tr.telemetry.details)) ? tr.telemetry.details.length : 0;
  const which = empty.map((i) => (i === n - 1 ? `son madde #${i + 1} (veri sorumlusu, alıcılar, haklar)` : `madde #${i + 1}`)).join(', ');
  throw new Error(`[legal-guard] src/locales/tr.json ${LEGAL_KEY} boş: ${which}. Yasal metin yazılmadan yayın derlemesi yapılamaz. Geliştirme/test derlemesi için: ALLOW_EMPTY_LEGAL=1 npm run build`);
}

// v2.2: a build that turns login on (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY) must not ship the account text
// (tr.json account.privacy.details) with a lawyer placeholder like "[YURT DIŞI AKTARIM DAYANAĞI — …]" or an empty item.
// Builds without the cloud env (login hidden, e.g. GitHub Pages) are not affected. Same escape hatch: ALLOW_EMPTY_LEGAL=1.
export const ACCOUNT_LEGAL_KEY = 'account.privacy.details';
export function openAccountItems(tr) {
  const list = tr && tr.account && tr.account.privacy && tr.account.privacy.details;
  if (!Array.isArray(list) || list.length === 0) return [0];
  return list.map((p, i) => (typeof p === 'string' && p.trim() && !/\[[^\]]*\]/.test(p) ? -1 : i)).filter((i) => i >= 0);
}
export function checkAccountLegal(tr, env = {}) {
  const cloud = !!(String(env.VITE_SUPABASE_URL || '').trim() && String(env.VITE_SUPABASE_ANON_KEY || '').trim());
  if (!cloud) return { ok: true, skipped: false, open: [], cloud };
  const open = openAccountItems(tr);
  if (open.length === 0) return { ok: true, skipped: false, open, cloud };
  if (String(env.ALLOW_EMPTY_LEGAL || '') === '1') return { ok: false, skipped: true, open, cloud };
  throw new Error(`[legal-guard] src/locales/tr.json ${ACCOUNT_LEGAL_KEY}: madde #${open.map((i) => i + 1).join(', #')} boş ya da yer tutucu ([…]) içeriyor. Giriş açık (VITE_SUPABASE_URL) bir yayın derlemesi bu metin tamamlanmadan yapılamaz. Geliştirme/test derlemesi için: ALLOW_EMPTY_LEGAL=1`);
}

// Vite plugin: runs only for `vite build`
export function legalGuardPlugin(tr, env = process.env) {
  return {
    name: 'legal-guard',
    apply: 'build',
    buildStart() {
      const r = checkLegal(tr, env);   // throws -> build fails
      if (r.skipped) this.warn(`[legal-guard] ${LEGAL_KEY} içinde boş madde var (#${r.empty.map((i) => i + 1).join(', #')}); ALLOW_EMPTY_LEGAL=1 olduğu için derleme sürüyor. BU DERLEME YAYINLANMAMALI.`);
      const a = checkAccountLegal(tr, env);
      if (a.skipped) this.warn(`[legal-guard] ${ACCOUNT_LEGAL_KEY} içinde yer tutucu var (#${a.open.map((i) => i + 1).join(', #')}); ALLOW_EMPTY_LEGAL=1 olduğu için giriş açık derleme sürüyor. BU DERLEME YAYINLANMAMALI.`);
    }
  };
}
