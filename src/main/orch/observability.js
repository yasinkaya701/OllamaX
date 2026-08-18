'use strict';

/**
 * observability.js — Krevyx v3.26 Gözlemlenebilirlik (Metrik) Motoru
 *
 * Kapsam:
 *   - İstek/failure/maliyet/zamanlama metriklerinin pencere tabanlı toplanması.
 *   - Metrik tipleri: request, failure, cost, timing, token, step.
 *   - Pencere: windowMs (varsayılan 5 dk) dolunca eski örnekler otomatik budanır.
 *   - snapshot() → pencere özeti; percentile hesabı timing için.
 *
 * Davranış:
 *   - init({windowMs?, costWarnThreshold?}) → tekil yapılandırma.
 *   - record(type, value, labels?) → { ok }; timing türünde value ms olmalı.
 *   - snapshot(types?) → { ok, windowMs, metrics }.
 *   - alert() → maliyet eşik aşımı varsa { ok, fired, threshold, total }.
 *
 * Dönüş:
 *   - record → { ok, count } | { ok:false, error }
 *   - snapshot → { ok, windowMs, metrics:{[type]:{count, sum, avg, max, min, p95?}} }
 *
 * Test:
 *   - testOnlyClear() tüm metrikleri ve eşikleri sıfırlar.
 *
 * @version 3.26.0
 */

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_COST_WARN = 5;
const TYPES = new Set(['request', 'failure', 'cost', 'timing', 'token', 'step']);

let _windowMs = DEFAULT_WINDOW_MS;
let _costWarn = DEFAULT_COST_WARN;
const _samples = new Map(); // type → [{at, value, labels}]

function init(opts = {}) {
  _windowMs = typeof opts.windowMs === 'number' && opts.windowMs > 0 ? opts.windowMs : DEFAULT_WINDOW_MS;
  _costWarn = typeof opts.costWarnThreshold === 'number' && opts.costWarnThreshold >= 0 ? opts.costWarnThreshold : DEFAULT_COST_WARN;
  return { ok: true, windowMs: _windowMs, costWarnThreshold: _costWarn };
}

function purge(type) {
  const now = Date.now();
  const bucket = _samples.get(type) || [];
  const kept = bucket.filter((s) => now - s.at <= _windowMs);
  _samples.set(type, kept);
  return kept;
}

function record(type, value, labels = {}) {
  if (!TYPES.has(type)) return { ok: false, error: `Bilinmeyen metrik tipi: ${type}` };
  if (typeof value !== 'number' || !isFinite(value)) return { ok: false, error: 'Geçersiz değer' };
  if (labels && typeof labels !== 'object') return { ok: false, error: 'Etiketler geçersiz' };
  purge(type);
  const bucket = _samples.get(type) || [];
  bucket.push({ at: Date.now(), value, labels: { ...(labels || {}) } });
  _samples.set(type, bucket);
  return { ok: true, type, count: bucket.length };
}

function summarize(bucket) {
  if (!bucket.length) return null;
  const values = bucket.map((s) => s.value).sort((a, b) => a - b);
  const sum = values.reduce((s, v) => s + v, 0);
  const p95 = values[Math.min(values.length - 1, Math.max(0, Math.floor(values.length * 0.95)))];
  return {
    count: values.length,
    sum: Math.round(sum * 10000) / 10000,
    avg: Math.round((sum / values.length) * 10000) / 10000,
    min: values[0],
    max: values[values.length - 1],
    p95,
  };
}

function snapshot(types = []) {
  const wanted = types.length ? types.filter((t) => TYPES.has(t)) : Array.from(TYPES);
  const metrics = {};
  for (const type of wanted) {
    const summary = summarize(purge(type));
    if (summary) metrics[type] = summary;
  }
  return { ok: true, windowMs: _windowMs, metrics };
}

function alertThreshold() {
  const bucket = purge('cost');
  const total = bucket.reduce((s, x) => s + x.value, 0);
  const fired = total >= _costWarn && _costWarn > 0;
  return { ok: true, fired, threshold: _costWarn, total: Math.round(total * 10000) / 10000, samples: bucket.length };
}

function health() {
  const snap = snapshot();
  const failures = snap.metrics.failure ? snap.metrics.failure.count : 0;
  const requests = snap.metrics.request ? snap.metrics.request.count : 0;
  const errorRate = requests > 0 ? Math.round((failures / requests) * 10000) / 10000 : 0;
  return { ok: true, errorRate, requests, failures, windowMs: _windowMs };
}

function testOnlyClear() {
  _samples.clear();
  _windowMs = DEFAULT_WINDOW_MS;
  _costWarn = DEFAULT_COST_WARN;
  return { ok: true };
}

module.exports = {
  init,
  record,
  snapshot,
  alertThreshold,
  health,
  testOnlyClear,
  TYPES,
  DEFAULT_WINDOW_MS,
};
