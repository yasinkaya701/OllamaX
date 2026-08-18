'use strict';
/**
 * plans/grading.js — Krevyx v3.25 Görev Derecelendirme ve Revizyon Döngüsü (P-3)
 *
 * Bir görevin çıktısını kalite kurallarına göre puanlar ve gerekirse
 * revizyon döngüsü (plan→execute→grade→revise) yürütür. LLM'siz, kural
 * tabanlı değerlendirme; opsiyonel LLM puanlayıcı inject edilebilir.
 *
 * Kural seti (her kural +1 ile -3 arası katkı verir; taban 5.0):
 *   + boş çıktı, tek karakter çıktı, şablon kalıntısı        → düşürür
 *   + hedef dosya değişiklikleri gerçekleşmiş mi              → yükseltir
 *   + shell komutu sıfır exit kodu döndü mü                   → yükseltir
 *   + hata/ayrık iz (stderr) içeriği                          → düşürür
 *   + süre aşımı, kesinti                                       → düşürür
 *
 * API:
 *   gradeTaskResult(taskResult, opts)   → { score 0..10, reasons[], verdict }
 *   runRevisionLoop(opts)               → maxN döngülü plan→execute→grade
 *   parseVerdict(score)                 → pass | marginal | fail
 *
 * taskResult şekli:
 *   { prompt, steps:[{type,target,status,output,exitCode}], durationMs, outputs:{...} }
 */

const DEFAULT_RULES = [
  { name: 'empty-output', apply: (r) => {
      const out = String(r.outputs?.final || '').trim();
      if (!out) return { delta: -3, reason: 'Çıktı boş' };
      return { delta: 0 };
    } },
  { name: 'trivial-output', apply: (r) => {
      const out = String(r.outputs?.final || '').trim();
      if (out && out.length < 3 && r.steps?.length) return { delta: -2, reason: 'Çıktı önemsiz kısa' };
      return { delta: 0 };
    } },
  { name: 'template-residue', apply: (r) => {
      const out = String(r.outputs?.final || '') + String(r.outputs?.stdout || '');
      if (/\$\{\w+\}|\{\{.*\}\}|TODO|FIXME|<PLACEHOLDER/i.test(out)) {
        return { delta: -1.5, reason: 'Şablon kalıntısı tespit edildi' };
      }
      return { delta: 0 };
    } },
  { name: 'steps-finished', apply: (r) => {
      if (!r.steps || !r.steps.length) return { delta: -1, reason: 'Adım kaydı yok' };
      const done = r.steps.filter((s) => s.status === 'done').length;
      const failed = r.steps.filter((s) => s.status === 'failed').length;
      if (failed) return { delta: -2, reason: `${failed} adım başarısız` };
      if (done === r.steps.length) return { delta: +1.5, reason: 'Tüm adımlar tamamlandı' };
      return { delta: 0 };
    } },
  { name: 'shell-exit-code', apply: (r) => {
      if (!r.steps?.length) return { delta: 0 };
      const shells = r.steps.filter((s) => s.type === 'run_shell');
      if (!shells.length) return { delta: 0 };
      const bad = shells.filter((s) => typeof s.exitCode === 'number' && s.exitCode !== 0);
      if (bad.length) return { delta: -1.5, reason: `${bad.length} kabuk komutu hata koduyla bitti` };
      return { delta: +1, reason: 'Kabuk komutları temiz bitti' };
    } },
  { name: 'stderr-noise', apply: (r) => {
      const err = String(r.outputs?.stderr || '');
      const errLines = err.split('\n').filter((l) => /\berror|fail|exception|traceback\b/i.test(l)).length;
      if (errLines > 5) return { delta: -1.5, reason: `Stderr'de ${errLines} hata satırı` };
      if (errLines > 0) return { delta: -0.5, reason: `Stderr'de ${errLines} uyarı/hata satırı` };
      return { delta: 0 };
    } },
  { name: 'duration-sane', apply: (r) => {
      if (!r.durationMs) return { delta: 0 };
      const budget = (r.budgetMs || 300000);
      const ratio = r.durationMs / budget;
      if (ratio > 0.9) return { delta: -1, reason: 'Süre bütçesinin %90\'ından fazlası harcandı' };
      return { delta: 0 };
    } },
];

const RULES_BY_NAME = new Map(DEFAULT_RULES.map((r) => [r.name, r]));

function gradeTaskResult(taskResult, opts = {}) {
  if (!taskResult || typeof taskResult !== 'object') {
    return { ok: false, error: 'Görev sonucu gerekli' };
  }
  const { rules = DEFAULT_RULES, base = 5.0, maxScore = 10, minScore = 0 } = opts;
  let score = base;
  const reasons = [];
  for (const rule of rules) {
    let delta = 0;
    let reason = '';
    try {
      const res = rule.apply(taskResult);
      delta = typeof res?.delta === 'number' ? res.delta : 0;
      reason = typeof res?.reason === 'string' ? res.reason : '';
    } catch {
      delta = 0;
    }
    if (delta !== 0) reasons.push({ rule: rule.name, delta, reason });
    score += delta;
  }
  score = Math.max(minScore, Math.min(maxScore, Math.round(score * 10) / 10));
  return {
    ok: true,
    score,
    reasons,
    verdict: parseVerdict(score),
  };
}

function parseVerdict(score) {
  if (typeof score !== 'number' || Number.isNaN(score)) return 'fail';
  if (score >= 7) return 'pass';
  if (score >= 4.5) return 'marginal';
  return 'fail';
}

function buildRevisionPrompt(prev, score, reasons) {
  const why = reasons.map((r) => `${r.rule}: ${r.reason} (${r.delta > 0 ? '+' : ''}${r.delta})`).join('\n');
  return `Önceki çıktı ${score}/10 aldı ve "fail" olarak değerlendirildi. Gerekçeler:\n${why}\n\nAynı görevi revize ederek tekrar uygula. Gerekçelerde belirtilen sorunları gider.`;
}

/**
 * Revizyon döngüsü. executor ve grader inject edilebilir.
 * opts: { prompt, executor, grader, maxRounds, minScore, initialPlan }
 * executor(taskPrompt) → Promise<taskResult>
 * grader(result) → { score, verdict }
 */
async function runRevisionLoop(opts = {}) {
  const {
    prompt,
    executor = async () => ({ ok: false, error: 'executor inject edilmedi' }),
    grader = gradeTaskResult,
    maxRounds = 3,
    minScore = 7,
    sleep = (ms) => new Promise((res) => setTimeout(res, ms)),
  } = opts;
  if (typeof prompt !== 'string' || !prompt.trim()) return { ok: false, error: 'Prompt gerekli' };
  const rounds = Math.max(1, Math.min(10, maxRounds));
  const history = [];
  let currentPrompt = prompt;

  for (let i = 0; i < rounds; i += 1) {
    let result;
    try {
      result = await executor(currentPrompt);
    } catch (err) {
      history.push({ round: i + 1, status: 'executor-error', error: String(err.message) });
      return { ok: true, final: { score: 0, verdict: 'fail' }, history, rounds: i + 1, aborted: true };
    }
    if (!result || !result.ok) {
      history.push({ round: i + 1, status: 'failed', error: result?.error || 'bilinmeyen' });
      return { ok: true, final: { score: 0, verdict: 'fail' }, history, rounds: i + 1, aborted: true };
    }
    const graded = grader(result);
    history.push({ round: i + 1, score: graded.score || 0, verdict: graded.verdict || 'fail', reasons: graded.reasons || [] });
    if (graded.verdict === 'pass' || (typeof graded.score === 'number' && graded.score >= minScore)) {
      return { ok: true, final: { score: graded.score, verdict: graded.verdict }, history, rounds: i + 1 };
    }
    if (i + 1 < rounds) {
      currentPrompt = buildRevisionPrompt(result, graded.score, graded.reasons || []);
      if (sleep && opts.pauseMs) await sleep(opts.pauseMs);
    }
  }
  const last = history[history.length - 1] || {};
  return { ok: true, final: { score: last.score || 0, verdict: last.verdict || 'fail' }, history, rounds, aborted: false };
}

module.exports = {
  DEFAULT_RULES,
  RULES_BY_NAME,
  gradeTaskResult,
  parseVerdict,
  buildRevisionPrompt,
  runRevisionLoop,
};
