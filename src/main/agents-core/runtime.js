'use strict';

/**
 * runtime.js — Krevyx v3.26 Ajan Çalışma Zamanı
 *
 * Kapsam:
 *   - Adım bazlı plan yürütme motoru (plans/engine.js plan yapısını kabul eder).
 *   - Adım yürütücü kayıt defteri (step runners): her adım türü bir yürütücüye bağlanır.
 *   - Canlı akış kanalı (event emitter tabanlı): adım başlangıç/bitiş/akış olayları.
 *   - Bütçe/karantina kontrolü: her adım öncesi onay döngüsü ve budget kapısı.
 *
 * Davranış:
 *   - createRuntime(opts) → { ok, runtime }; runtime.run(sessionId, plan) → akış;
 *     yürütme her adım öncesi approval.createApprovalSession ile bloklayabilir.
 *   - Adım yürütücüleri registerRunner(id, runner) ile kayıt edilir; registry yoksa
 *     adım 'unsupported' hatasıyla işaretlenir (yürütme durmaz, adım failed).
 *   - Runtime akışı `events` emitter'ı: 'step:start', 'step:end', 'step:stream',
 *     'session:start', 'session:end', 'approved', 'denied', 'error'.
 *   - Plan null/boş ise { ok: false } döndürülür; adımlar tek tek işlenir;
 *     'haltOnError' true ise ilk hata zinciri durdurur.
 *
 * Dönüş:
 *   - run() → { ok, sessionId, steps: [{id, type, status, duration_ms, output?, error?}], summary }
 *
 * Test:
 *   - testOnlyClear() ile tüm runtime'lar ve runner registry temizlenir.
 *   - Olaylar senkron değil; akış testi için emitter'a dinleyici bağlanır.
 *
 * @version 3.26.0
 */

const { EventEmitter } = require('events');
const crypto = require('crypto');

const MAX_STEPS = 1024;
const DEFAULT_TIMEOUT_MS = 300000;

const _runtimes = new Map();
const _runners = new Map();
const _sessions = new Map();

/** Kayıt defterine varsayılan adım yürütücüleri ekle */
function seedDefaultRunners(toolkit) {
  _runners.set('list_dir', async (step, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const target = step.target || step.args?.path || ctx.cwd || process.cwd();
    if (typeof fsMod.readdirSync !== 'function') {
      return { ok: false, error: 'Dosya sistemi erişimi yok' };
    }
    try {
      const entries = fsMod.readdirSync(target).slice(0, 500);
      return { ok: true, output: entries.join('\n'), items: entries.length };
    } catch (err) {
      return { ok: false, error: `Dizin okunamadı: ${err.message}` };
    }
  });
  _runners.set('read', async (step, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const target = step.target || step.args?.path || '';
    if (!target || typeof fsMod.readFileSync !== 'function') {
      return { ok: false, error: 'Dosya yolu eksik veya erişim yok' };
    }
    try {
      const content = fsMod.readFileSync(target, 'utf8');
      const max = step.args?.maxChars || 32768;
      return { ok: true, output: content.slice(0, max), truncated: content.length > max, chars: content.length };
    } catch (err) {
      return { ok: false, error: `Dosya okunamadı: ${err.message}` };
    }
  });
  _runners.set('write', async (step, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const target = step.target || step.args?.path || '';
    if (!target) return { ok: false, error: 'Dosya yolu eksik' };
    try {
      fsMod.mkdirSync(require('path').dirname(target), { recursive: true });
      fsMod.writeFileSync(target, step.content || step.args?.content || '', 'utf8');
      return { ok: true, output: `Yazıldı: ${target}` };
    } catch (err) {
      return { ok: false, error: `Dosya yazılamadı: ${err.message}` };
    }
  });
  _runners.set('edit', async (step, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const target = step.target || step.args?.path || '';
    const patch = step.patch || step.args?.patch || '';
    if (!target || !patch) return { ok: false, error: 'Hedef veya yama eksik' };
    const diffApply = ctx.diffApply;
    if (!diffApply) return { ok: false, error: 'Diff uygulama aracı yok' };
    try {
      const before = fsMod.readFileSync(target, 'utf8');
      const applied = diffApply.applyUnifiedDiff(before, patch, { fuzzy: true });
      if (!applied.ok) return { ok: false, error: `Yama uygulanamadı: ${applied.error || 'bilinmeyen'}` };
      fsMod.writeFileSync(target, applied.text, 'utf8');
      return { ok: true, output: `Yama uygulandı: ${target}`, hunks: applied.hunks || 0 };
    } catch (err) {
      return { ok: false, error: `Düzenleme başarısız: ${err.message}` };
    }
  });
  _runners.set('execute', async (step, ctx) => {
    const sandbox = ctx.sandbox;
    if (!sandbox) return { ok: false, error: 'Sandbox yürütücü yok; komut çalıştırılamaz' };
    const cmd = step.command || step.args?.command || step.content || '';
    if (!cmd) return { ok: false, error: 'Komut eksik' };
    return sandbox.run(cmd, { timeoutMs: step.args?.timeoutMs || ctx.timeoutMs || DEFAULT_TIMEOUT_MS });
  });
  _runners.set('review', async (step, ctx) => {
    const reviewer = ctx.reviewer;
    const target = step.target || step.args?.path || '';
    if (!reviewer) return { ok: false, error: 'İnceleyici yok' };
    return reviewer.review(target, step.args || {});
  });
  _runners.set('grep', async (step, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const pathMod = ctx.path || require('path');
    const target = step.target || step.args?.path || ctx.cwd || process.cwd();
    const pattern = step.pattern || step.args?.pattern || '';
    if (!pattern) return { ok: false, error: 'Arama deseni eksik' };
    try {
      let re;
      try { re = new RegExp(pattern, 'i'); } catch (e) { return { ok: false, error: `Geçersiz desen: ${pattern}` }; }
      const files = fsMod.readdirSync(target).filter((f) => /\.(js|ts|md|json|txt|py|sh|yml|yaml)$/.test(f)).slice(0, 200);
      const hits = [];
      for (const f of files) {
        try {
          const content = fsMod.readFileSync(pathMod.join(target, f), 'utf8');
          const lines = content.split('\n').map((l, i) => ({ line: i + 1, text: l })).filter((l) => re.test(l.text));
          if (lines.length) hits.push({ file: f, matches: lines.slice(0, 25) });
        } catch (e) { /* atla */ }
      }
      return { ok: true, output: hits.map((h) => `${h.file}: ${h.matches.length}`).join('\n') || '(eşleşme yok)', hits: hits.length };
    } catch (err) {
      return { ok: false, error: `Grep başarısız: ${err.message}` };
    }
  });
}

/**
 * Yeni bir runtime oluşturur. Her çağrı benzersiz bir runtime id üretir ve
 * çalışma zamanı durumlarını _runtimes haritasına kaydeder.
 */
function createRuntime(opts = {}) {
  const id = `rt-${crypto.randomBytes(6).toString('hex')}`;
  const emitter = new EventEmitter();
  emitter.setMaxListeners(256);
  const runtime = {
    id,
    cwd: opts.cwd || process.cwd(),
    timeoutMs: typeof opts.timeoutMs === 'number' ? Math.max(1000, opts.timeoutMs) : DEFAULT_TIMEOUT_MS,
    haltOnError: opts.haltOnError !== false,
    maxSteps: typeof opts.maxSteps === 'number' ? Math.min(MAX_STEPS, Math.max(1, opts.maxSteps)) : 256,
    approval: opts.approval || null,
    budget: opts.budget || null,
    toolkit: opts.toolkit || {},
    sandbox: opts.sandbox || null,
    fs: opts.fs || require('fs'),
    path: opts.path || require('path'),
    diffApply: opts.diffApply || null,
    reviewer: opts.reviewer || null,
    _events: emitter,
    _steps: new Map(),
    _aborted: false,
    _active: false,
  };
  _runtimes.set(id, runtime);
  return { ok: true, runtime };
}

function getRuntime(id) {
  return _runtimes.get(id) || null;
}

function registerRunner(type, fn) {
  if (!type || typeof fn !== 'function') return { ok: false, error: 'Yürütücü geçersiz' };
  _runners.set(type, fn);
  return { ok: true, type };
}

function getRunner(type) {
  return _runners.get(type) || null;
}

/** Planı yürütür; adım akışı emitter üzerinden bildirilir. */
async function run(runtime, plan) {
  if (!runtime || !_runtimes.has(runtime.id)) return { ok: false, error: 'Runtime bulunamadı' };
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    return { ok: false, error: 'Plan boş veya geçersiz' };
  }
  if (runtime._active) return { ok: false, error: 'Runtime meşgul; eş zamanlı yürütme desteklenmez' };
  runtime._active = true;
  runtime._aborted = false;
  const sessionId = `sess-${crypto.randomBytes(6).toString('hex')}`;
  runtime._sessionId = sessionId;
  const results = [];
  const startedAt = Date.now();
  runtime._events.emit('session:start', { sessionId, runtimeId: runtime.id, steps: plan.steps.length });
  try {
    for (let i = 0; i < plan.steps.length && !runtime._aborted; i += 1) {
      if (i >= runtime.maxSteps) {
        results.push({ id: `step-${i}`, type: 'halt', status: 'halted', error: `Adım limiti (${runtime.maxSteps}) aşıldı` });
        runtime._events.emit('step:end', { sessionId, step: results[results.length - 1] });
        break;
      }
      const step = plan.steps[i];
      const type = step.type || 'unknown';
      const stepId = `step-${i}`;
      const stepStarted = Date.now();
      runtime._events.emit('step:start', { sessionId, stepId, type, payload: step.payload || step });
      if (runtime.approval && step.requiresApproval !== false) {
        const verdict = await runtime.approval.request({ sessionId, stepId, type, payload: step.payload || step });
        if (!verdict || verdict.ok === false) {
          const rec = { id: stepId, type, status: 'denied', duration_ms: Date.now() - stepStarted, error: verdict?.error || 'Onay reddedildi' };
          results.push(rec);
          runtime._events.emit('denied', rec);
          runtime._events.emit('step:end', { sessionId, stepId, rec });
          if (runtime.haltOnError) { runtime._events.emit('session:end', { sessionId, halted: true }); break; }
          continue;
        }
        runtime._events.emit('approved', { sessionId, stepId });
      }
      const runner = getRunner(type);
      let rec;
      if (!runner) {
        rec = { id: stepId, type, status: 'failed', duration_ms: Date.now() - stepStarted, error: `Desteklenmeyen adım türü: ${type}` };
      } else {
        try {
          const res = await runner(step, {
            cwd: runtime.cwd,
            timeoutMs: runtime.timeoutMs,
            sandbox: runtime.sandbox,
            fs: runtime.fs,
            path: runtime.path,
            diffApply: runtime.diffApply,
            reviewer: runtime.reviewer,
            toolkit: runtime.toolkit,
          });
          if (res && res.ok) {
            rec = { id: stepId, type, status: 'succeeded', duration_ms: Date.now() - stepStarted, output: res.output || '', meta: res };
            runtime._events.emit('step:stream', { sessionId, stepId, data: res.output || '' });
          } else {
            rec = { id: stepId, type, status: 'failed', duration_ms: Date.now() - stepStarted, error: res?.error || 'Adım başarısız' };
          }
        } catch (err) {
          rec = { id: stepId, type, status: 'error', duration_ms: Date.now() - stepStarted, error: `Yürütme hatası: ${err.message}` };
        }
      }
      results.push(rec);
      runtime._steps.set(stepId, rec);
      runtime._events.emit('step:end', { sessionId, stepId, rec });
      if (rec.status !== 'succeeded' && runtime.haltOnError && type !== 'review') {
        runtime._events.emit('session:end', { sessionId, halted: true, failedStep: stepId });
        break;
      }
    }
  } finally {
    runtime._active = false;
  }
  const succeeded = results.filter((r) => r.status === 'succeeded').length;
  const summary = {
    sessionId,
    total: results.length,
    succeeded,
    failed: results.length - succeeded,
    duration_ms: Date.now() - startedAt,
    aborted: runtime._aborted,
  };
  runtime._events.emit('session:end', { sessionId, summary });
  return { ok: true, sessionId, runtimeId: runtime.id, steps: results, summary };
}

function abort(runtime) {
  if (!runtime || !_runtimes.has(runtime.id)) return { ok: false, error: 'Runtime bulunamadı' };
  runtime._aborted = true;
  return { ok: true };
}

function destroy(runtime) {
  if (!runtime) return { ok: false, error: 'Runtime yok' };
  const r = _runtimes.get(runtime.id);
  if (!r) return { ok: false, error: 'Runtime bulunamadı' };
  r._events.removeAllListeners();
  _runtimes.delete(runtime.id);
  return { ok: true };
}

function state(runtime) {
  if (!runtime) return { ok: false };
  const r = _runtimes.get(runtime.id);
  if (!r) return { ok: false };
  return {
    ok: true,
    id: r.id,
    active: r._active,
    aborted: r._aborted,
    steps: Array.from(r._steps.values()),
    cwd: r.cwd,
    timeoutMs: r.timeoutMs,
  };
}

/** Test ve süreçler arası durum temizliği; timer/holder bırakmaz. */
function testOnlyClear() {
  for (const r of _runtimes.values()) { r._events.removeAllListeners(); }
  _runtimes.clear();
  _sessions.clear();
  _runners.clear();
  return { ok: true };
}

module.exports = {
  createRuntime,
  getRuntime,
  registerRunner,
  getRunner,
  run,
  abort,
  destroy,
  state,
  seedDefaultRunners,
  testOnlyClear,
  MAX_STEPS,
  DEFAULT_TIMEOUT_MS,
};
