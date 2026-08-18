'use strict';
/**
 * agents-ext/chain-tasks.js — Krevyx v3.25 Zincir Görevler (Q-3)
 *
 * Tanımlı görev dizisini sırayla çalıştırır; her görevin çıktısı bir
 * sonraki görevin girdi şablonuna enjekte edilir. Paralel-fan-in desteği
 * vardır: belirli adımlar grup çalışır, sonuçları birleştiriciye girer.
 *
 * Zincir tanımı:
 *   [ { id, task, template?, parallel? }, ... ]
 *   template: çıktı yerleştirme şablonu. "{{prev}}" önceki çıktıyla,
 *   "{{results:id}}" parallel grubun çıktısıyla değişir.
 *
 * API:
 *   runChain(definitions, opts)  → { ok, results, final }
 *   renderTemplate(template, ctx) → şablon genişletme
 *   validateChain(definitions)    → tanım doğrulaması
 *
 * executor(id, prompt) inject edilir; iptal sinyalinde (cancel()) kalan
 * adımlar skipped işaretlenir.
 */

const VALID_TEMPLATE_VAR = /\{\{(prev|results:[a-zA-Z0-9_-]+)\}\}/g;

function validateChain(definitions) {
  if (!Array.isArray(definitions) || !definitions.length) {
    return { ok: false, error: 'Zincir tanımı boş' };
  }
  const ids = new Set();
  for (let i = 0; i < definitions.length; i += 1) {
    const d = definitions[i];
    if (!d || typeof d.id !== 'string' || !d.id.trim()) return { ok: false, error: `Adım ${i}: kimlik gerekli` };
    if (ids.has(d.id)) return { ok: false, error: `Tekrar eden kimlik: ${d.id}` };
    if (typeof d.task !== 'string' || !d.task.trim()) return { ok: false, error: `Adım ${d.id}: görev metni gerekli` };
    if (d.template && typeof d.template !== 'string') return { ok: false, error: `Adım ${d.id}: şablon string olmalı` };
    ids.add(d.id);
  }
  const parallelIds = new Set(definitions.filter((d) => d.parallel).map((d) => d.id));
  const badRefs = definitions.some((d) => {
    if (!d.template) return false;
    const refs = (d.template.match(VALID_TEMPLATE_VAR) || []).map((m) => m.slice(2, -2));
    return refs.some((ref) => {
      if (ref === 'prev') return false;
      const target = ref.slice('results:'.length);
      return !ids.has(target);
    });
  });
  if (badRefs) return { ok: false, error: 'Şablonda tanımsız sonuç referansı' };
  return { ok: true, steps: definitions.length, parallel: parallelIds.size };
}

function renderTemplate(template, ctx) {
  if (typeof template !== 'string') return '';
  return template.replace(VALID_TEMPLATE_VAR, (match, ref) => {
    if (ref === 'prev') return typeof ctx.prev === 'string' ? ctx.prev : '';
    const rid = ref.slice('results:'.length);
    const grp = ctx.results && ctx.results[rid];
    if (Array.isArray(grp)) return grp.map((g) => (typeof g === 'string' ? g : JSON.stringify(g))).join('\n---\n');
    return typeof grp !== 'undefined' ? String(grp) : '';
  });
}

async function runChain(definitions, opts = {}) {
  const v = validateChain(definitions);
  if (!v.ok) return { ok: false, error: v.error };
  const { executor = null, cancelToken = null, maxParallel = 4, timeoutMs = 600000 } = opts;
  if (typeof executor !== 'function') return { ok: false, error: 'executor fonksiyonu gerekli' };
  const resultsById = {};
  const results = [];
  let lastOutput = '';
  const cancelled = { value: false };
  if (cancelToken && typeof cancelToken.cancel === 'function') {
    cancelToken.cancel(() => { cancelled.value = true; });
  }

  function runOne(d, prompt) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        resolve({ ok: false, error: `Adım ${d.id} zaman aşımı`, id: d.id });
      }, timeoutMs);
      Promise.resolve(executor(d.id, prompt)).then(
        (res) => { clearTimeout(t); resolve(res && res.ok ? { ok: true, id: d.id, output: typeof res.output === 'string' ? res.output : JSON.stringify(res.output || {}) } : { ok: false, error: res?.error || 'bilinmeyen', id: d.id }); },
        (err) => { clearTimeout(t); resolve({ ok: false, error: String(err.message || err), id: d.id }); },
      );
    });
  }

  /* Adımları tekil ve parallel gruplara böl */
  let i = 0;
  while (i < definitions.length) {
    if (cancelled.value) break;
    const d = definitions[i];
    if (!d.parallel) {
      const prompt = d.template ? renderTemplate(d.template, { prev: lastOutput, results: resultsById }) : d.task;
      const res = await runOne(d, prompt);
      results.push(res);
      resultsById[d.id] = res.ok ? res.output : null;
      lastOutput = res.ok ? res.output : '';
      i += 1;
    } else {
      /* Parallel grup: ardışık tüm parallel adımları birlikte çalıştır */
      const group = [];
      while (i < definitions.length && definitions[i].parallel) {
        group.push(definitions[i]);
        i += 1;
      }
      const ids = group.map((g) => g.id);
      const work = group.map(async (g) => {
        const ctx = {
          prev: lastOutput,
          results: ids.reduce((acc, gid) => {
            if (resultsById[gid]) acc[`results:${gid}`] = resultsById[gid];
            return acc;
          }, {}),
        };
        const prompt = g.template ? renderTemplate(g.template, ctx) : g.task;
        return runOne(g, prompt);
      });
      const batch = await Promise.all(work);
      batch.forEach((r) => {
        results.push(r);
        if (r.ok) resultsById[r.id] = r.output;
      });
      lastOutput = batch.filter((r) => r.ok).map((r) => r.output).join('\n---\n');
      i += group.length;
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (cancelled.value) {
    return { ok: true, results, final: null, cancelled: true };
  }
  if (failed.length) {
    return { ok: false, error: `${failed.length} adım başarısız`, results, final: null };
  }
  return { ok: true, results, final: lastOutput };
}

function createCancelToken() {
  let listeners = [];
  return {
    cancel(fn) { listeners.push(fn); },
    fire() { listeners.forEach((fn) => fn()); listeners = []; },
  };
}

module.exports = {
  runChain,
  validateChain,
  renderTemplate,
  createCancelToken,
};
