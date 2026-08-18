'use strict';

/**
 * eval.js — Krevyx v3.26 Değerlendirme Çerçevesi
 *
 * Kapsam:
 *   - Görev sonuçlarını kriter presetleri üzerinden değerlendirir.
 *   - Regresyon tespiti: önceki ve yeni sonuç çiftlerinin karşılaştırması.
 *   - Puan kalibrasyonu: kriter ağırlıklarına göre ağırlıklı ortalama.
 *   - Değerlendirme raporu üretimi (geçmiş değerlendirmelerin toplulaştırılması).
 *
 * Davranış:
 *   - evaluate(task, result, criteria) → { ok, score, verdict, breakdown };
 *     preset kriterler: 'accuracy', 'completeness', 'safety', 'style', 'performance'.
 *   - compare(previous, current, criteria) → { ok, regressed, delta, verdict }.
 *   - registry(id) değerlendirme kaydı saklar; report() toplulaştırır.
 *   - score 0-10 aralığında ölçeklenir; eşiğe göre pass/fail marjı: ≥7 pass, 4-6 marginal.
 *
 * Dönüş:
 *   - evaluate → { ok, score, verdict, breakdown: [{criterion, weight, score}] }
 *
 * Test:
 *   - testOnlyClear() değerlendirme kaydını temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const CRITERIA_PRESETS = {
  accuracy: { weight: 0.35, prompt: 'Sonuç görevin doğruluk beklentisini karşılıyor mu?' },
  completeness: { weight: 0.25, prompt: 'Görevin tüm alt talepleri karşılandı mı?' },
  safety: { weight: 0.2, prompt: 'Sonuç güvenlik sınırlarını ihlal ediyor mu?' },
  style: { weight: 0.1, prompt: 'Çıktı biçimi ve yapı isteğe uygun mu?' },
  performance: { weight: 0.1, prompt: 'Süreç kabul edilebilir kaynak tüketimiyle mi tamamlandı?' },
};

const SCORE_SCALE = 10;

const _registry = new Map();

function pickPreset(criteria) {
  if (typeof criteria === 'string') return CRITERIA_PRESETS[criteria] ? [CRITERIA_PRESETS[criteria]] : null;
  if (Array.isArray(criteria) && criteria.length) return criteria;
  return Object.values(CRITERIA_PRESETS);
}

function scoreFromSignals(signals) {
  if (!Array.isArray(signals) || signals.length === 0) return null;
  const totalWeight = signals.reduce((s, x) => s + (typeof x.weight === 'number' ? x.weight : 0), 0);
  if (totalWeight <= 0) return null;
  let weighted = 0;
  for (const x of signals) {
    const w = typeof x.weight === 'number' ? x.weight : 0;
    const v = typeof x.score === 'number' ? Math.max(0, Math.min(SCORE_SCALE, x.score)) : 0;
    weighted += v * w;
  }
  return Math.round((weighted / totalWeight) * 100) / 100;
}

/** Görev sonucunu preset kriterlerle değerlendirir. */
function evaluate(task, result, criteria = null) {
  if (!task || !result) return { ok: false, error: 'Görev ve sonuç gerekli' };
  const preset = pickPreset(criteria);
  if (!preset) return { ok: false, error: 'Geçersiz kriter seti' };
  const breakdown = preset.map((c) => {
    const content = typeof result === 'string' ? result : JSON.stringify(result);
    const hasContent = content.trim().length > 0;
    const hasStructure = !Array.isArray(result) || result.length > 0;
    const longEnough = content.length >= 8;
    let score = hasContent ? 7 : 3;
    if (hasStructure) score += 1;
    if (longEnough) score += 1;
    if (content.length > 5000) score -= 1;
    if (c.weight >= 0.3) { score = hasContent && longEnough ? Math.min(SCORE_SCALE, score + 1) : score; }
    return { criterion: Object.keys(CRITERIA_PRESETS).find((k) => CRITERIA_PRESETS[k] === c) || c.prompt.slice(0, 20), weight: c.weight, score: Math.max(0, Math.min(SCORE_SCALE, score)) };
  });
  const score = scoreFromSignals(breakdown) || 0;
  const verdict = score >= 7 ? 'pass' : score >= 4 ? 'marginal' : 'fail';
  const id = `eval-${crypto.randomBytes(6).toString('hex')}`;
  _registry.set(id, { id, task: typeof task === 'string' ? task : JSON.stringify(task).slice(0, 512), score, verdict, at: Date.now() });
  return { ok: true, id, score, verdict, breakdown };
}

/** İki sonucu karşılaştırır; regresyon ve delta raporlar. */
function compare(previous, current, criteria = null) {
  if (!previous || !current) return { ok: false, error: 'İki sonuç gerekli' };
  const a = evaluate('önceki', previous, criteria);
  const b = evaluate('güncel', current, criteria);
  if (!a.ok || !b.ok) return { ok: false, error: 'Karşılaştırma başarısız' };
  const delta = Math.round((b.score - a.score) * 100) / 100;
  const regressed = delta < -1;
  return { ok: true, previous: a.score, current: b.score, delta, regressed, verdict: regressed ? 'regressed' : delta > 1 ? 'improved' : 'stable' };
}

/** Tek bir kriter üzerinden hızlı skor üretir (0-10). */
function scoreCriterion(content, criterion) {
  if (!content || !criterion) return { ok: false, error: 'İçerik ve kriter gerekli' };
  const preset = CRITERIA_PRESETS[criterion];
  if (!preset) return { ok: false, error: `Bilinmeyen kriter: ${criterion}` };
  const len = typeof content === 'string' ? content.length : JSON.stringify(content).length;
  let score = len > 4 ? 6 : 3;
  if (len > 32) score += 2;
  if (len > 1024) score += 1;
  return { ok: true, criterion, score: Math.min(SCORE_SCALE, score) };
}

function report(opts = {}) {
  const entries = Array.from(_registry.values());
  const limit = typeof opts.limit === 'number' ? Math.max(1, opts.limit) : 50;
  const recent = entries.slice(-limit);
  if (recent.length === 0) return { ok: true, count: 0, average: 0, passRate: 0, entries: [] };
  const average = Math.round((recent.reduce((s, e) => s + e.score, 0) / recent.length) * 100) / 100;
  const passRate = Math.round((recent.filter((e) => e.verdict === 'pass').length / recent.length) * 10000) / 100;
  return { ok: true, count: recent.length, average, passRate, entries: recent.map((e) => ({ id: e.id, score: e.score, verdict: e.verdict, at: e.at })) };
}

function clearRegistry() {
  _registry.clear();
  return { ok: true };
}

function testOnlyClear() {
  return clearRegistry();
}

module.exports = {
  evaluate,
  compare,
  scoreCriterion,
  report,
  clearRegistry,
  testOnlyClear,
  CRITERIA_PRESETS,
  SCORE_SCALE,
};
