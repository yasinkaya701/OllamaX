'use strict';
/**
 * plans/approval.js — Krevyx v3.25 Plan Onay Döngüsü (P-2)
 *
 * Bir planın adım adım onay/red yönetimini yürütür. Kullanıcı adımları tek
 * tek veya toplu olarak onaylar; plan-edit ile adımları plandan çıkarabilir,
 * yeni adım ekleyebilir ya da hedefini değiştirebilir.
 *
 * Durum makinesi:
 *   draft → awaiting_approval → (approved|cancelled)
 *   awaiting_approval içinde her adım: pending → approved|rejected|skipped
 *
 * API:
 *   createApprovalSession(plan)           → { ok, session }
 *   approveStep(sessionId, stepId)        → adım onayla
 *   rejectStep(sessionId, stepId, reason) → adım reddet
 *   bulkApprove(sessionId, { ids, all, skipHighRisk })
 *   planEdit(sessionId, edit)             → { op: remove|add|change, ... }
 *   pendingSteps(sessionId)               → onay bekleyen adımlar
 *   sessionState(sessionId)               → durum + ilerleme
 *   expireTimers()                        → testlerde zamanlayıcı temizliği
 *
 * Güvenlik: yüksek riskli adımlar (risk≥8) varsayılan olarak bekletilir;
 * `skipHighRisk: false` açıkça verilmelidir. Onay süre aşımı (default 15dk)
 * oturumu `expired` durumuna alır.
 */
const { planRiskScore } = require('./engine');

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

const sessions = new Map();
const timers = new Map();

function createApprovalSession(plan, opts = {}) {
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
    return { ok: false, error: 'Geçersiz plan' };
  }
  const { timeoutMs = DEFAULT_TIMEOUT_MS, now = () => Date.now() } = opts;
  const id = `aps-${now().toString(36)}-${sessions.size}`;
  const steps = plan.steps.map((s) => ({ ...s }));
  const session = {
    id,
    planId: plan.id || id,
    prompt: plan.prompt || '',
    cwd: plan.cwd || '',
    createdAt: now(),
    timeoutMs: Math.max(1000, timeoutMs),
    status: 'awaiting_approval', // awaiting_approval | approved | cancelled | expired
    steps,
    editLog: [],
    decidedAt: null,
  };
  sessions.set(id, session);
  const t = setTimeout(() => expireSession(id), session.timeoutMs);
  timers.set(id, t);
  return { ok: true, session: publicView(session) };
}

function getSession(id) {
  return sessions.get(id) || null;
}

function publicView(s) {
  return {
    id: s.id,
    planId: s.planId,
    prompt: s.prompt,
    cwd: s.cwd,
    createdAt: s.createdAt,
    status: s.status,
    steps: s.steps,
    editLog: s.editLog,
    decidedAt: s.decidedAt,
    riskScore: planRiskScore({ steps: s.steps }),
  };
}

function stepById(session, stepId) {
  return session.steps.find((s) => s.id === stepId) || null;
}

function approveStep(id, stepId) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status !== 'awaiting_approval') return { ok: false, error: `Oturum durumu uygun değil: ${s.status}` };
  const step = stepById(s, stepId);
  if (!step) return { ok: false, error: 'Adım bulunamadı' };
  if (step.blocked) return { ok: false, error: 'Bloklanmış adım onaylanamaz' };
  step.status = 'approved';
  return { ok: true, step };
}

function rejectStep(id, stepId, reason) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status !== 'awaiting_approval') return { ok: false, error: `Oturum durumu uygun değil: ${s.status}` };
  const step = stepById(s, stepId);
  if (!step) return { ok: false, error: 'Adım bulunamadı' };
  step.status = 'rejected';
  step.note = (typeof reason === 'string' ? reason : '').slice(0, 500);
  return { ok: true, step };
}

function skipStep(id, stepId) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  const step = stepById(s, stepId);
  if (!step) return { ok: false, error: 'Adım bulunamadı' };
  step.status = 'skipped';
  return { ok: true, step };
}

/**
 * Toplu onay. Seçenekler:
 *   ids: onaylanacak adım kimlikleri
 *   all: tüm onaylanabilir adımlar
 *   skipHighRisk: true ise risk≥8 adımlar bekletilir (varsayılan true)
 *   approveBlocked: bloklanmış adımlara izin verir (varsayılan false)
 */
function bulkApprove(id, opts = {}) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status !== 'awaiting_approval') return { ok: false, error: `Oturum durumu uygun değil: ${s.status}` };
  const { ids = [], all = false, skipHighRisk = true, approveBlocked = false, riskThreshold = 8 } = opts;
  const approved = [];
  const held = [];
  const blocked = [];
  const wanted = new Set(ids);
  s.steps.forEach((step) => {
    const selected = all || wanted.has(step.id);
    if (!selected) return;
    if (step.blocked && !approveBlocked) { blocked.push(step.id); return; }
    if (step.blocked) { step.status = 'approved'; approved.push(step.id); return; }
    if (skipHighRisk && (step.risk || 0) >= riskThreshold) {
      held.push(step.id);
      step.note = `${step.note ? step.note + ' · ' : ''}yüksek risk — bekletildi`;
      return;
    }
    step.status = 'approved';
    approved.push(step.id);
  });
  return { ok: true, approved, held, blocked };
}

/**
 * Plan düzenleme — onay öncesi adımları değiştir.
 * edit.op: remove | add | change
 *   remove { stepId }
 *   add    { afterId?, step }        — afterId boşsa sona eklenir
 *   change { stepId, patch }         — target/risk/note yaması
 */
function planEdit(id, edit) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status !== 'awaiting_approval') return { ok: false, error: `Oturum durumu uygun değil: ${s.status}` };
  if (!edit || !edit.op) return { ok: false, error: 'Edit işlemi gerekli' };

  if (edit.op === 'remove') {
    if (s.status !== 'awaiting_approval') return { ok: false, error: 'Durum uygun değil' };
    const idx = s.steps.findIndex((x) => x.id === edit.stepId);
    if (idx === -1) return { ok: false, error: 'Adım bulunamadı' };
    const removed = s.steps.splice(idx, 1)[0];
    s.editLog.push({ at: Date.now(), op: 'remove', stepId: removed.id, target: removed.target });
    if (!s.steps.length) cancelSession(id);
    return { ok: true, removed };
  }

  if (edit.op === 'add') {
    const step = edit.step;
    if (!step || !step.type || !step.target) return { ok: false, error: 'Adım tanımı eksik' };
    const safe = {
      id: `step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      type: step.type,
      target: String(step.target || ''),
      risk: typeof step.risk === 'number' ? Math.max(0, Math.min(10, step.risk)) : 3,
      blocked: Boolean(step.blocked),
      reason: '',
      status: 'pending',
      note: '',
    };
    if (edit.afterId) {
      const idx = s.steps.findIndex((x) => x.id === edit.afterId);
      if (idx === -1) return { ok: false, error: 'Önceki adım bulunamadı' };
      s.steps.splice(idx + 1, 0, safe);
    } else {
      s.steps.push(safe);
    }
    s.editLog.push({ at: Date.now(), op: 'add', stepId: safe.id, target: safe.target });
    return { ok: true, step: safe };
  }

  if (edit.op === 'change') {
    const step = stepById(s, edit.stepId);
    if (!step) return { ok: false, error: 'Adım bulunamadı' };
    const patch = edit.patch || {};
    if (typeof patch.target === 'string') step.target = patch.target.slice(0, 2000);
    if (typeof patch.risk === 'number') step.risk = Math.max(0, Math.min(10, patch.risk));
    if (typeof patch.note === 'string') step.note = patch.note.slice(0, 500);
    s.editLog.push({ at: Date.now(), op: 'change', stepId: step.id, patch: { target: step.target, risk: step.risk, note: step.note } });
    return { ok: true, step };
  }

  return { ok: false, error: `Bilinmeyen edit işlemi: ${edit.op}` };
}

function pendingSteps(id) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  return { ok: true, pending: s.steps.filter((x) => x.status === 'pending' || x.status === 'skipped') };
}

function sessionState(id) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  const counts = { pending: 0, approved: 0, rejected: 0, skipped: 0 };
  s.steps.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
  const allDecided = s.steps.every((x) => x.status !== 'pending');
  return {
    ok: true,
    state: {
      id: s.id,
      status: s.status,
      counts,
      total: s.steps.length,
      editable: allDecided && s.status === 'awaiting_approval',
      riskScore: planRiskScore({ steps: s.steps }),
    },
  };
}

function cancelSession(id) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status === 'approved' || s.status === 'cancelled') return { ok: false, error: `İptal edilemez: ${s.status}` };
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  s.status = 'cancelled';
  s.decidedAt = Date.now();
  return { ok: true };
}

function expireSession(id) {
  const s = getSession(id);
  if (!s) return;
  timers.delete(id);
  s.status = 'expired';
  s.decidedAt = Date.now();
}

function resolveSession(id) {
  const s = getSession(id);
  if (!s) return { ok: false, error: 'Oturum bulunamadı' };
  if (s.status !== 'awaiting_approval') return { ok: false, error: 'Oturum karara varmamış' };
  const pending = s.steps.some((x) => x.status === 'pending');
  if (pending) return { ok: false, error: 'Hâlâ onay bekleyen adım var' };
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  s.status = 'approved';
  s.decidedAt = Date.now();
  return { ok: true, plan: { id: s.planId, prompt: s.prompt, steps: s.steps, editLog: s.editLog } };
}

/* Test yardımcısı: oturum sayısını döndürür */
function testOnlyCount() {
  return sessions.size;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createApprovalSession,
  approveStep,
  rejectStep,
  skipStep,
  bulkApprove,
  planEdit,
  pendingSteps,
  sessionState,
  cancelSession,
  expireSession,
  resolveSession,
  testOnlyCount,
};
