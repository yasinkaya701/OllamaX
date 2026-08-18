'use strict';
/**
 * plans/diff-review.js — Krevyx v3.25 Hunk Seviyesinde Diff İnceleme (P-5)
 *
 * Bir diff'in hunk'larını inceleme nesnesine dönüştürür; her hunk için
 * durum (bekliyor / onaylandı / reddedildi) ve gerekçe tutulur. Toplu
 * seçim, toplu gerekçe ve inceleme raporunun diff-formatında dışa
 * aktarımı desteklenir.
 *
 * API:
 *   createReview(diffText, opts)        → { ok, review }
 *   decideHunk(reviewId, hunkIdx, decision, reason)
 *   bulkDecide(reviewId, { indices, decision, reason })
 *   reviewState(reviewId)               → durum özeti + ilerleme
 *   exportReview(reportPath|'sarif')    → inceleme raporunu SARIF'e çevir
 *   listReviews()                       → mevcut incelemeler
 *
 * SARIF export'u verify-audit --sarif moduyla uyumlu seviye 2 uyarılar
 * üretir: reddedilen hunk'lar "error", bekleyenler "warning".
 */
const { parseUnifiedDiff, reverseHunk } = require('./diff-apply');

const reviews = new Map();
const VALID_DECISIONS = new Set(['approved', 'rejected', 'pending']);

function createReview(diffText, opts = {}) {
  if (typeof diffText !== 'string' || !diffText.trim()) return { ok: false, error: 'Diff metni gerekli' };
  const parsed = parseUnifiedDiff(diffText);
  if (!parsed.ok) return parsed;
  const id = `review-${Date.now().toString(36)}-${reviews.size}`;
  const hunks = parsed.hunks.map((h, idx) => ({
    index: idx,
    oldStart: h.oldStart,
    newStart: h.newStart,
    context: h.lines.filter((l) => l.kind === ' ').map((l) => l.body),
    additions: h.lines.filter((l) => l.kind === '+').map((l) => l.body),
    removals: h.lines.filter((l) => l.kind === '-').map((l) => l.body),
    decision: 'pending',
    reason: '',
    decidedAt: null,
  }));
  const review = {
    id,
    createdAt: typeof opts.now === 'function' ? opts.now() : new Date().toISOString(),
    diffText: diffText.slice(0, 500000),
    warnings: parsed.warnings || [],
    hunks,
    exporter: opts.exporter || null,
  };
  reviews.set(id, review);
  return { ok: true, review: publicView(review) };
}

function publicView(r) {
  return {
    id: r.id,
    createdAt: r.createdAt,
    warnings: r.warnings,
    hunks: r.hunks.map((h) => ({ ...h })),
  };
}

function getReview(id) {
  return reviews.get(id) || null;
}

function decideHunk(id, hunkIdx, decision, reason) {
  const r = getReview(id);
  if (!r) return { ok: false, error: 'İnceleme bulunamadı' };
  if (!VALID_DECISIONS.has(decision)) return { ok: false, error: `Geçersiz karar: ${decision}` };
  if (!Number.isInteger(hunkIdx) || hunkIdx < 0 || hunkIdx >= r.hunks.length) {
    return { ok: false, error: 'Geçersiz hunk indeksi' };
  }
  const hunk = r.hunks[hunkIdx];
  hunk.decision = decision;
  hunk.reason = typeof reason === 'string' ? reason.slice(0, 500) : '';
  hunk.decidedAt = Date.now();
  return { ok: true, hunk };
}

function bulkDecide(id, opts = {}) {
  const r = getReview(id);
  if (!r) return { ok: false, error: 'İnceleme bulunamadı' };
  const { indices = [], all = false, decision = 'approved', reason = '' } = opts;
  if (!VALID_DECISIONS.has(decision)) return { ok: false, error: `Geçersiz karar: ${decision}` };
  const wanted = new Set(Array.isArray(indices) ? indices : []);
  const decided = [];
  r.hunks.forEach((h, idx) => {
    if (all || wanted.has(idx)) {
      h.decision = decision;
      h.reason = typeof reason === 'string' ? reason.slice(0, 500) : '';
      h.decidedAt = Date.now();
      decided.push(idx);
    }
  });
  return { ok: true, decided };
}

function reviewState(id) {
  const r = getReview(id);
  if (!r) return { ok: false, error: 'İnceleme bulunamadı' };
  const counts = { pending: 0, approved: 0, rejected: 0 };
  r.hunks.forEach((h) => { counts[h.decision] += 1; });
  return {
    ok: true,
    state: {
      id: r.id,
      total: r.hunks.length,
      counts,
      complete: counts.pending === 0,
      hasRejections: counts.rejected > 0,
    },
  };
}

/**
 * Reddedilen hunk'ları diff'ten çıkarıp uygulanabilir hale getirir.
 */
function filteredDiff(id) {
  const r = getReview(id);
  if (!r) return { ok: false, error: 'İnceleme bulunamadı' };
  const kept = r.hunks
    .filter((h) => h.decision === 'approved')
    .map((h) => {
      const lines = [
        ...h.context.map((l) => ` ${l}`),
        ...h.removals.map((l) => `-${l}`),
        ...h.additions.map((l) => `+${l}`),
      ];
      return `@@ -${h.oldStart},${h.context.length + h.removals.length} +${h.newStart},${h.context.length + h.additions.length} @@\n${lines.join('\n')}`;
    });
  return { ok: true, diff: kept.join('\n\n'), appliedCount: kept.length, skippedCount: r.hunks.length - kept.length };
}

/**
 * İnceleme raporunu SARIF 2.1.0'a çevirir. Reddedilenler error,
 * bekleyenler warning seviyesidir.
 */
function exportReview(id) {
  const r = getReview(id);
  if (!r) return { ok: false, error: 'İnceleme bulunamadı' };
  const results = [];
  r.hunks.forEach((h, idx) => {
    if (h.decision === 'pending') {
      results.push({
        ruleId: 'diff-hunk-pending',
        level: 'warning',
        message: { text: `Hunk ${idx} inceleme bekliyor${h.reason ? `: ${h.reason}` : ''}` },
        locations: [{ physicalLocation: { region: { startLine: h.oldStart || 1 } } }],
      });
    } else if (h.decision === 'rejected') {
      results.push({
        ruleId: 'diff-hunk-rejected',
        level: 'error',
        message: { text: `Hunk ${idx} reddedildi: ${h.reason || 'gerekçe yok'}` },
        locations: [{ physicalLocation: { region: { startLine: h.oldStart || 1 } } }],
      });
    }
  });
  return {
    ok: true,
    sarif: {
      version: '2.1.0',
      $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json',
      runs: [{
        tool: { driver: { name: 'Krevyx Diff Review', version: '3.25.0' } },
        results,
      }],
    },
  };
}

function listReviews() {
  const out = [];
  reviews.forEach((r) => out.push(publicView(r)));
  return out;
}

/* Test: review sayısını sıfırlar */
function testOnlyClear() {
  reviews.clear();
}

module.exports = {
  createReview,
  decideHunk,
  bulkDecide,
  reviewState,
  filteredDiff,
  exportReview,
  listReviews,
  testOnlyClear,
};
