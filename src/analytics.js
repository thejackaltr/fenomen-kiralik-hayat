// Umami (self-hosted analiz.teserix.com), KVKK-gated. Event names only — never email, nickname, channel name or ids.
//
// CONSENT GATE (same preference keys as the v2.1 anonymous counter, src/telemetry.js KEYS on the v2.1 branch):
//   fenomen_tel_notice  set (any value) = the first-launch notice was answered ("Tamam" or "Kapat")
//   fenomen_tel         'off'           = "Kapat" on the notice, or stats turned off in Settings
// The Umami script is NOT in index.html. It is injected at runtime only when the notice has been answered AND the
// counter is not 'off' (and the build has the env config, and the host is not localhost). Before the notice nothing is
// loaded and events are dropped (not queued for later).
// Turning stats off stops Umami at once, even after the script has loaded:
//   - track() re-reads the preference on every call and does nothing when it is off;
//   - the tracker is loaded with data-before-send=<hook>; Umami calls that hook before EVERY request (incl. its own
//     automatic pageview) and the hook drops the request unless consent is still on;
//   - localStorage 'umami.disabled' (the tracker's built-in kill switch) is set while off and removed when back on.
// Privacy: cookieless tracker (no cookie, no install/device id is created or stored by this module), DNT respected
// (data-do-not-track), query string and hash never sent (data-exclude-search / data-exclude-hash: UTM tags and
// "#import=<save>" stay on the device).
//
// CONFIG: env only (Vite, build time). Missing VITE_UMAMI_SRC or VITE_UMAMI_WEBSITE_ID = analytics off entirely.
//   VITE_UMAMI_SRC          e.g. https://analiz.teserix.com/script.js
//   VITE_UMAMI_WEBSITE_ID   Umami website id for Fenomen
//   VITE_UMAMI_DOMAINS      comma list for data-domains (localhost never listed; also refused below)
// See .env.example, Dockerfile (build args) and .github/workflows/pages.yml (repository variables).

export const KEYS = { pref: 'fenomen_tel', notice: 'fenomen_tel_notice', umamiOff: 'umami.disabled' };
export const BEFORE_SEND = '__fenomenUmamiBeforeSend';
export const EVENTS = ['game_start', 'login_success', 'cloud_save', 'reset_or_prestige', 'share_click'];
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0)$/i;

function envConfig() {
  let env = {};
  try { env = import.meta.env || {}; } catch (e) { env = {}; }
  return { src: env.VITE_UMAMI_SRC || '', websiteId: env.VITE_UMAMI_WEBSITE_ID || '', domains: env.VITE_UMAMI_DOMAINS || '' };
}

export function createAnalytics({ win = typeof window !== 'undefined' ? window : null, doc = typeof document !== 'undefined' ? document : null,
  storage = null, cfg = envConfig() } = {}) {
  const store = storage || (() => { try { return win && win.localStorage; } catch (e) { return null; } })();
  const get = (k) => { try { return store ? store.getItem(k) : null; } catch (e) { return null; } };
  const set = (k, v) => { try { if (store) store.setItem(k, v); } catch (e) { /* ignore */ } };
  const del = (k) => { try { if (store) store.removeItem(k); } catch (e) { /* ignore */ } };
  const configured = () => !!(cfg && cfg.src && cfg.websiteId && /^https:\/\//.test(cfg.src));
  const localHost = () => { try { return LOCAL.test(win.location.hostname) || win.location.protocol === 'file:'; } catch (e) { return true; } };
  const recent = [];
  let script = null;

  const A = {
    cfg,
    // notice answered and stats not turned off (the v2.1 anon_stats preference)
    consent: () => !!get(KEYS.notice) && get(KEYS.pref) !== 'off',
    allowed: () => configured() && !localHost() && A.consent(),
    loaded: () => !!script,
    tracked: () => recent.slice(),
    // Call after the notice is answered / the Settings switch changes (v2.1 wiring); also runs on every track()
    // and on 'storage' events from other tabs. Returns whether Umami may run now.
    sync() {
      const ok = A.allowed();
      if (!ok) { if (get(KEYS.pref) === 'off') set(KEYS.umamiOff, '1'); return false; }
      if (get(KEYS.umamiOff)) del(KEYS.umamiOff);
      A.load();
      return true;
    },
    load() {
      if (script || !doc || !win || !A.allowed()) return script;
      win[BEFORE_SEND] = (type, payload) => (A.allowed() ? payload : null);
      const s = doc.createElement('script');
      s.defer = true;
      s.src = cfg.src;
      s.setAttribute('data-website-id', cfg.websiteId);
      if (cfg.domains) s.setAttribute('data-domains', cfg.domains);
      s.setAttribute('data-before-send', BEFORE_SEND);
      s.setAttribute('data-do-not-track', 'true');
      s.setAttribute('data-exclude-search', 'true');
      s.setAttribute('data-exclude-hash', 'true');
      s.setAttribute('data-test', 'umami-script');
      (doc.head || doc.body || doc.documentElement).appendChild(s);
      script = s;
      return s;
    },
    // event name only; no-op unless consent is on and the tracker is present. Never throws.
    track(name) {
      if (!EVENTS.includes(name)) return 'invalid';
      if (!A.sync()) return 'off';
      recent.push(name); if (recent.length > 50) recent.shift();
      const u = win && win.umami;
      if (u && typeof u.track === 'function') { try { u.track(name); } catch (e) { /* ignore */ } return 'sent'; }
      // tracker still loading: send once it is there (only if consent is still on then)
      if (script && !script.__fenomenQueued) {
        script.__fenomenQueued = [];
        script.addEventListener('load', () => { const q = script.__fenomenQueued.splice(0); if (A.allowed() && win.umami) for (const n of q) { try { win.umami.track(n); } catch (e) { /* ignore */ } } });
      }
      if (script && script.__fenomenQueued.length < 20) script.__fenomenQueued.push(name);
      return 'queued';
    }
  };
  if (win && win.addEventListener) win.addEventListener('storage', (e) => { if (!e || e.key === null || e.key === KEYS.pref || e.key === KEYS.notice) A.sync(); });
  return A;
}

let shared = null;
export function analytics() { if (!shared) shared = createAnalytics(); return shared; }
export function track(name) { try { return analytics().track(name); } catch (e) { return 'off'; } }
// v2.2 hooks: the account login and cloud save do not exist on this branch yet. Call these from those features when
// they land; nothing calls them today, so no login_success / cloud_save event is ever sent from this build.
export const trackLoginSuccess = () => track('login_success');
export const trackCloudSave = () => track('cloud_save');
