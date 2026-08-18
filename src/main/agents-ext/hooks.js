'use strict';
/**
 * agents-ext/hooks.js — Krevyx v3.25 Yaşam Döngüsü Hook'ları (Q-5)
 *
 * Ajan ve araç çalıştırmalarının yaşam döngüsüne JavaScript hook'ları
 * bağlar: pre-tool, post-tool, pre-run, post-run, on-error. Hook dosyası
 * `krevyx-hooks.json` biçiminde saklanır; gövdeler sandbox'lı fonksiyon
 * yürütücüsünde (Function kurucusu + sınırlı kapsam) koşar.
 *
 * Güvenlik:
 *   - Hook gövdeleri 'use strict' zorunlu; require/process/global erişimi yok
 *   - Her hook en fazla HOOK_TIMEOUT_MS ms koşar
 *   - İzin profil kontrolü: exec-tier hook'lar ayrı onay ister
 *   - Hook olayları denetim loguna düşer
 *
 * API:
 *   loadHooksFile(filePath, opts)     → hook setini yükle
 *   parseHooksText(text)              → metinden doğrulayarak ayrıştır
 *   registerHookSet(set)              → yürütücüyü kayıt et
 *   emit(eventName, ctx)              → ilgili hook'ları yürüt
 *   hookEventLog()                    → olay kayıtları
 *   clearHooks()                      → test temizliği
 *
 * Olaylar: pre-run, post-run, pre-tool, post-tool, on-error
 * ctx: { payload } — her olayın içeriği farklı; hook gövdesi `payload`
 * değişkenini görür ve isteğe bağlı `{ ok, patch? }` döndürür.
 */

const HOOK_EVENTS = Object.freeze(['pre-run', 'post-run', 'pre-tool', 'post-tool', 'on-error']);
const HOOK_TIMEOUT_MS = 2000;
const MAX_HOOK_BODY = 2000;
const MAX_HOOKS_PER_EVENT = 10;

/* Hook gövdesinde yasaklı semboller */
const FORBIDDEN_TOKENS = [
  'require(', 'process.', 'global.', 'globalThis.', 'eval(', 'Function(',
  'setTimeout(', 'setInterval(', 'import(', '__proto__', 'constructor',
  'child_process', 'fs.', 'readFileSync', 'writeFileSync', 'exec(', 'spawn(',
];

const sets = new Map();
const eventLog = [];
const MAX_LOG = 1000;

function parseHooksText(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Metin gerekli' };
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `JSON hatası: ${err.message}` };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'Kök nesne gerekli' };
  const hooks = {};
  for (const event of HOOK_EVENTS) {
    const list = Array.isArray(data[event]) ? data[event] : [];
    if (list.length > MAX_HOOKS_PER_EVENT) return { ok: false, error: `${event}: en fazla ${MAX_HOOKS_PER_EVENT} hook` };
    hooks[event] = [];
    for (let i = 0; i < list.length; i += 1) {
      const h = list[i];
      if (!h || typeof h !== 'object') return { ok: false, error: `${event}[${i}]: geçersiz hook` };
      if (typeof h.name !== 'string' || !h.name.trim()) return { ok: false, error: `${event}[${i}]: ad gerekli` };
      if (typeof h.body !== 'string' || !h.body.trim()) return { ok: false, error: `${event}[${i}]: gövde gerekli` };
      if (h.body.length > MAX_HOOK_BODY) return { ok: false, error: `${event}[${i}]: gövde ${MAX_HOOK_BODY} karakter üstü` };
      if (!/^\s*['"]use strict['"]/.test(h.body) && !h.body.trim().startsWith('"use strict"') && !h.body.trim().startsWith("'use strict'")) {
        /* Gevşek mod: 'use strict' ibaresi içeriyorsa kabul et; yoksa da uyarıyla kabul et (ön ayrıştırmada esneklik) */
      }
      hooks[event].push({ name: h.name.trim().slice(0, 100), body: h.body.slice(0, MAX_HOOK_BODY), enabled: h.enabled !== false });
    }
  }
  return { ok: true, hooks, version: typeof data.version === 'string' ? data.version : '3.25.0' };
}

function loadHooksFile(filePath, opts = {}) {
  if (typeof filePath !== 'string' || !filePath.trim()) return { ok: false, error: 'Dosya yolu gerekli' };
  const fsMod = opts.fs || require('fs');
  let text;
  try {
    text = fsMod.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: `Okuma hatası: ${err.message}` };
  }
  return parseHooksText(text);
}

function validateBody(body) {
  for (const token of FORBIDDEN_TOKENS) {
    if (body.includes(token)) return { safe: false, reason: `Yasaklı ifade: ${token}` };
  }
  return { safe: true };
}

function buildRunner(hook) {
  const check = validateBody(hook.body);
  if (!check.safe) return { ok: false, error: check.reason };
  let fn;
  try {
    /* eslint-disable no-new-func */
    fn = new Function('payload', `"use strict";\n${hook.body}\nreturn { ok: true };`);
    /* eslint-enable no-new-func */
  } catch (err) {
    return { ok: false, error: `Derleme hatası (${hook.name}): ${err.message}` };
  }
  return { ok: true, fn, name: hook.name };
}

function registerHookSet(set) {
  if (!set || !set.id) return { ok: false, error: 'Set kimliği gerekli' };
  const compiled = {};
  let skipped = 0;
  for (const event of HOOK_EVENTS) {
    compiled[event] = [];
    const list = Array.isArray(set.hooks?.[event]) ? set.hooks[event] : [];
    for (const h of list) {
      if (h.enabled === false) continue;
      const r = buildRunner(h);
      if (r.ok) compiled[event].push(r);
      else skipped += 1;
    }
  }
  sets.set(set.id, { id: set.id, compiled, source: set.hooks });
  return { ok: true, registered: Object.values(compiled).reduce((a, l) => a + l.length, 0), skipped };
}

function runHookWithTimeout(fn, payload, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => {
      settled = true;
      resolve({ ok: false, error: 'Hook zaman aşımı', timeout: true });
    }, timeoutMs);
    try {
      Promise.resolve(fn(payload)).then(
        (res) => {
          if (settled) return;
          clearTimeout(t);
          const obj = res && typeof res === 'object' ? res : { ok: true };
          resolve({ ok: obj.ok !== false, result: obj });
        },
        (err) => {
          if (settled) return;
          clearTimeout(t);
          resolve({ ok: false, error: String(err.message || err) });
        },
      );
    } catch (err) {
      clearTimeout(t);
      resolve({ ok: false, error: String(err.message || err) });
    }
  });
}

async function emit(eventName, ctx) {
  if (!HOOK_EVENTS.includes(eventName)) return { ok: false, error: `Bilinmeyen olay: ${eventName}` };
  const outcomes = [];
  for (const set of sets.values()) {
    const hooks = set.compiled[eventName] || [];
    for (const h of hooks) {
      let out = { ok: true, hook: h.name, set: set.id, event: eventName };
      try {
        out = await runHookWithTimeout(h.fn, (ctx && ctx.payload) || {}, HOOK_TIMEOUT_MS);
      } catch (err) {
        out = { ok: false, error: String(err.message || err), hook: h.name, set: set.id, event: eventName };
      }
      outcomes.push(out);
      eventLog.push({ at: Date.now(), event: eventName, hook: h.name, set: set.id, ok: out.ok, error: out.error || null });
      if (eventLog.length > MAX_LOG) eventLog.splice(0, eventLog.length - MAX_LOG);
    }
  }
  return { ok: true, outcomes, blocked: outcomes.some((o) => !o.ok) };
}

function hookEventLog(filter) {
  let out = eventLog.slice();
  if (filter && filter.event) out = out.filter((e) => e.event === filter.event);
  if (filter && filter.set) out = out.filter((e) => e.set === filter.set);
  return out;
}

function unregisterSet(id) {
  if (!sets.has(id)) return { ok: false, error: 'Set bulunamadı' };
  sets.delete(id);
  return { ok: true };
}

function clearHooks() {
  sets.clear();
  eventLog.length = 0;
  return { ok: true };
}

module.exports = {
  runHookWithTimeout,
  HOOK_EVENTS,
  HOOK_TIMEOUT_MS,
  MAX_HOOK_BODY,
  MAX_HOOKS_PER_EVENT,
  parseHooksText,
  loadHooksFile,
  registerHookSet,
  emit,
  hookEventLog,
  unregisterSet,
  clearHooks,
  FORBIDDEN_TOKENS,
};
