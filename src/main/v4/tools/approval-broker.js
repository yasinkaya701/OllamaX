'use strict';

const crypto = require('crypto');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safePreview(input = {}) {
  const preview = {};
  if (input.path) preview.path = String(input.path).slice(0, 500);
  if (input.branchName) preview.branchName = String(input.branchName).slice(0, 200);
  if (input.message) preview.message = String(input.message).slice(0, 500);
  if (input.executable) preview.executable = String(input.executable).slice(0, 200);
  if (Array.isArray(input.args)) preview.args = input.args.slice(0, 12).map((arg) => String(arg).slice(0, 200));
  if (Array.isArray(input.paths)) preview.paths = input.paths.slice(0, 20).map((item) => String(item).slice(0, 500));
  return preview;
}

function createApprovalBroker(options = {}) {
  const journal = options.journal || null;
  const timeoutMs = Number.isInteger(options.timeoutMs)
    ? Math.max(1000, options.timeoutMs)
    : DEFAULT_APPROVAL_TIMEOUT_MS;
  const pending = new Map();

  function append(type, request, payload = {}) {
    if (!journal || typeof journal.append !== 'function') return;
    journal.append({
      type,
      subjectType: 'approvalRequest',
      subjectId: request.id,
      payload: {
        toolId: request.toolId,
        capability: request.capability,
        risk: request.risk,
        argumentsDigest: request.argumentsDigest,
        ...payload,
      },
    });
  }

  function listPending() {
    return Array.from(pending.values())
      .map((entry) => clone(entry.request))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  function settle(requestId, approved, metadata = {}) {
    const entry = pending.get(requestId);
    if (!entry) return { ok: false, error: 'approval_not_pending', requestId };
    pending.delete(requestId);
    clearTimeout(entry.timer);
    if (entry.abortCleanup) entry.abortCleanup();
    const decision = {
      approved: approved === true,
      requestId,
      decidedAt: new Date().toISOString(),
      actor: String(metadata.actor || 'user'),
      note: metadata.note ? String(metadata.note).slice(0, 1000) : null,
    };
    append(decision.approved ? 'approval.approved' : 'approval.denied', entry.request, decision);
    entry.resolve(decision);
    return { ok: true, decision };
  }

  function request(input = {}) {
    if (!input.toolId || !input.decision || input.decision.approvalRequired !== true) {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'approval request requires an approval-required permission decision');
    }
    const requestId = `approval_${crypto.randomUUID()}`;
    const requestRecord = {
      id: requestId,
      toolId: String(input.toolId),
      capability: input.decision.capability || null,
      risk: input.decision.risk || null,
      reason: input.decision.reason || 'Explicit approval required.',
      argumentsDigest: input.argumentsDigest || null,
      preview: safePreview(input.preview || {}),
      taskId: input.taskId || null,
      runId: input.runId || null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + timeoutMs).toISOString(),
    };

    return new Promise((resolve) => {
      const timer = setTimeout(() => settle(requestId, false, { actor: 'system', note: 'approval timeout' }), timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      let abortCleanup = null;
      if (input.signal) {
        const onAbort = () => settle(requestId, false, { actor: 'system', note: 'run cancelled' });
        if (input.signal.aborted) {
          clearTimeout(timer);
          resolve({ approved: false, requestId, actor: 'system', note: 'run cancelled' });
          return;
        }
        input.signal.addEventListener('abort', onAbort, { once: true });
        abortCleanup = () => input.signal.removeEventListener('abort', onAbort);
      }
      pending.set(requestId, { request: requestRecord, resolve, timer, abortCleanup });
      append('approval.requested', requestRecord, { preview: requestRecord.preview, expiresAt: requestRecord.expiresAt });
    });
  }

  function shutdown(reason = 'runtime shutdown') {
    for (const requestId of Array.from(pending.keys())) {
      settle(requestId, false, { actor: 'system', note: reason });
    }
  }

  return Object.freeze({
    request,
    listPending,
    resolve: (requestId, approved, metadata) => settle(requestId, approved, metadata),
    shutdown,
  });
}

module.exports = {
  DEFAULT_APPROVAL_TIMEOUT_MS,
  safePreview,
  createApprovalBroker,
};
