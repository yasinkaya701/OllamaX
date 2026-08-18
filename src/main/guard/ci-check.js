'use strict';

/**
 * ci-check.js — Krevyx v3.26 CI Kapı Kontrolü
 *
 * Kapsam:
 *   - Diff kapısına CI sonuçlarını bağlar: CI geçmeden değişiklik onaylanmaz.
 *   - CI kaynağı: GitHub Actions (token ile) veya yerel komut.
 *   - requireCi: policy ile 'approved|review|blocked' kararına CI koşulu eklenir.
 *   - Yerel simülasyon: CI raporu manuel beslenir (recordCi(runId, status, detail)).
 *
 * Davranış:
 *   - configure({ requireCi, source:'github|local' }) → ayar.
 *   - recordCi(runId, status) → durum kaydı; evaluate(runId) → CI koşulu kararı.
 *   - combineCi(decision, runId) → diff kararını CI koşuluyla günceller.
 *
 * Dönüş:
 *   - evaluate → { ok, passed, status, reason? }
 *   - combineCi → { ok, decision:'approved|review|blocked', reason? }
 *
 * Test:
 *   - testOnlyClear() kayıtları ve ayarları varsayılana döndürür.
 *
 * @version 3.26.0
 */

const _runs = new Map();
let _config = { requireCi: true, source: 'local' };

function configure(opts = {}) {
  if (opts.requireCi !== undefined) _config.requireCi = opts.requireCi === true;
  if (opts.source === 'github' || opts.source === 'local') _config.source = opts.source;
  return { ok: true, config: { ..._config } };
}

function recordCi(runId, status, detail = '') {
  if (!runId || typeof runId !== 'string') return { ok: false, error: 'Çalıştırma kimliği gerekli' };
  const valid = ['success', 'failure', 'cancelled', 'pending', 'error'];
  if (!valid.includes(status)) return { ok: false, error: 'Geçersiz durum; kabul edilenler: ' + valid.join(', ') };
  _runs.set(runId, { runId, status, detail, at: Date.now() });
  return { ok: true, runId, status };
}

function evaluate(runId) {
  if (!_config.requireCi) return { ok: true, passed: true };
  if (!runId || typeof runId !== 'string') return { ok: true, passed: false, status: 'pending', reason: 'CI çalıştırma kimliği yok' };
  const run = _runs.get(runId);
  if (!run) return { ok: true, passed: false, status: 'pending', reason: 'CI sonucu kayıtlı değil' };
  const passed = run.status === 'success';
  return { ok: true, passed, status: run.status, detail: run.detail, reason: passed ? undefined : `CI durumu: ${run.status}` };
}

function combineCi(diffDecision, runId) {
  if (!diffDecision || !['approved', 'review', 'blocked'].includes(diffDecision)) return { ok: false, error: 'Geçersiz diff kararı' };
  const ci = evaluate(runId);
  if (!ci.ok) return ci;
  if (diffDecision === 'blocked') return { ok: true, decision: 'blocked', reason: ci.reason || 'Diff kapısı tarafından engellendi' };
  if (ci.passed) return { ok: true, decision: diffDecision, reason: 'CI başarılı' };
  return { ok: true, decision: 'blocked', reason: ci.reason || 'CI bekleniyor/başarısız' };
}

function pendingCount() {
  const pending = Array.from(_runs.values()).filter((r) => r.status === 'pending' || r.status === 'error');
  return { ok: true, pending: pending.length, total: _runs.size };
}

function testOnlyClear() {
  _runs.clear();
  _config = { requireCi: true, source: 'local' };
  return { ok: true };
}

module.exports = {
  configure,
  recordCi,
  evaluate,
  combineCi,
  pendingCount,
  testOnlyClear,
};
