'use strict';

/**
 * budget-engine.js — Krevyx v3.26 Bütçe Motoru
 *
 * Kapsam:
 *   - Kredi, token ve USD harcama bütçelerinin takibi.
 *   - Bütçe tipleri: daily (günlük), perTask (görev başı), global (toplam).
 *   - Harcama kaydı: addSpend(budget, amount, opts) → kalan ve uyarı durumu.
 *   - Eşik uyarıları: %75 uyarı, %90 kritik, %100 hard stop.
 *
 * Davranış:
 *   - createBudget(spec) → { ok, budget }; spec { id?, type:'daily|perTask|global', limit, windowMs? }.
 *   - addSpend(budget, amountUsd, tokenDelta?) → { ok, remaining, alert? }.
 *   - quota(budget) → mevcut dönem kalanı ve tüketim oranı.
 *   - Günlük bütçeler pencere dolunca otomatik sıfırlanır.
 *
 * Dönüş:
 *   - addSpend → { ok, remaining, alert:'none|warn|critical|stopped', stopped }
 *
 * Test:
 *   - addSpend negative amount reddedilir; limit üstü harcama stopped döner.
 *   - testOnlyClear() tüm bütçeleri temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const TYPES = new Set(['daily', 'perTask', 'global']);
const WARN_THRESHOLD = 0.75;
const CRITICAL_THRESHOLD = 0.9;

const _budgets = new Map();

function createBudget(spec = {}) {
  const id = spec.id || `bud-${crypto.randomBytes(6).toString('hex')}`;
  const type = TYPES.has(spec.type) ? spec.type : 'perTask';
  const limit = typeof spec.limit === 'number' && spec.limit > 0 ? spec.limit : 10;
  const budget = {
    id,
    type,
    limit,
    spent: 0,
    tokenSpent: 0,
    startedAt: Date.now(),
    windowMs: type === 'daily' ? 24 * 3600 * 1000 : Infinity,
    stopped: false,
    alerts: [],
    transactions: [],
  };
  _budgets.set(id, budget);
  return { ok: true, budget };
}

function getBudget(id) {
  return _budgets.get(id) || null;
}

function refreshWindow(budget) {
  if (budget.windowMs !== Infinity && Date.now() - budget.startedAt > budget.windowMs) {
    budget.spent = 0;
    budget.tokenSpent = 0;
    budget.startedAt = Date.now();
    budget.stopped = false;
    budget.alerts = [];
    budget.transactions = [];
  }
}

function addSpend(budget, amountUsd, opts = {}) {
  if (!budget || !_budgets.has(budget.id)) return { ok: false, error: 'Bütçe bulunamadı' };
  if (typeof amountUsd !== 'number' || amountUsd < 0) return { ok: false, error: 'Geçersiz harcama tutarı' };
  refreshWindow(budget);
  if (budget.stopped) return { ok: false, error: 'Bütçe durduruldu; harcama yapılamaz', stopped: true };
  const tx = { at: Date.now(), amount: amountUsd, tokens: typeof opts.tokenDelta === 'number' ? opts.tokenDelta : 0 };
  budget.transactions.push(tx);
  budget.spent += amountUsd;
  if (tx.tokens) budget.tokenSpent += tx.tokens;
  const remaining = Math.max(0, Math.round((budget.limit - budget.spent) * 10000) / 10000);
  const ratio = budget.spent / budget.limit;
  let alert = 'none';
  if (ratio >= 1) { budget.stopped = true; alert = 'stopped'; budget.alerts.push({ level: 'stopped', at: tx.at }); }
  else if (ratio >= CRITICAL_THRESHOLD) { alert = 'critical'; if (!budget.alerts.some((a) => a.level === 'critical')) budget.alerts.push({ level: 'critical', at: tx.at }); }
  else if (ratio >= WARN_THRESHOLD) { alert = 'warn'; if (!budget.alerts.some((a) => a.level === 'warn')) budget.alerts.push({ level: 'warn', at: tx.at }); }
  return { ok: !budget.stopped, remaining, alert, stopped: budget.stopped, ratio: Math.round(ratio * 10000) / 10000, tokens: budget.tokenSpent };
}

function quota(budget) {
  if (!budget || !_budgets.has(budget.id)) return { ok: false, error: 'Bütçe bulunamadı' };
  refreshWindow(budget);
  const remaining = Math.max(0, Math.round((budget.limit - budget.spent) * 10000) / 10000);
  return { ok: true, limit: budget.limit, spent: budget.spent, remaining, ratio: Math.round((budget.spent / budget.limit) * 10000) / 10000, stopped: budget.stopped, type: budget.type, tokens: budget.tokenSpent };
}

function reset(budget) {
  if (!budget || !_budgets.has(budget.id)) return { ok: false, error: 'Bütçe bulunamadı' };
  budget.spent = 0;
  budget.tokenSpent = 0;
  budget.startedAt = Date.now();
  budget.stopped = false;
  budget.alerts = [];
  budget.transactions = [];
  return { ok: true };
}

function destroy(id) {
  if (!_budgets.has(id)) return { ok: false, error: 'Bütçe bulunamadı' };
  _budgets.delete(id);
  return { ok: true };
}

function testOnlyClear() {
  _budgets.clear();
  return { ok: true };
}

module.exports = {
  createBudget,
  getBudget,
  addSpend,
  quota,
  reset,
  destroy,
  testOnlyClear,
  TYPES,
  WARN_THRESHOLD,
  CRITICAL_THRESHOLD,
};
