'use strict';
/**
 * ipc-v325-handlers.js — Krevyx v3.25 IPC uç nokta kaydı
 *
 * v3.25 modüllerinin renderer tarafına açtığı uç noktaları `handler()`
 * yardımcısı üzerinden kaydeder. Ad alanı: plan-*, approval-*, grading-*,
 * diff-*, memory-*, queue-*, agentpool-*, chain-*, ctx-*, hooks-*,
 * trust-*, vault-*.
 *
 * main.js'te: require('./ipc-v325-handlers').registerIpcV325Handlers(mainWindow)
 */
const { ipcMain } = require('electron');
const path = require('path');
const os = require('os');

function load(mod) {
  try {
    return require(path.join(__dirname, mod));
  } catch {
    return null;
  }
}

let registered = false;

function handler(name, fn) {
  ipcMain.handle(`ipc:3:${name}`, async (event, ...args) => {
    const start = Date.now();
    try {
      const result = await fn(event, ...args);
      const ms = Date.now() - start;
      return result;
    } catch (err) {
      return { ok: false, error: String(err.message).slice(0, 200) };
    }
  });
}

function registerIpcV325Handlers(mainWindow) {
  if (registered) return { registered: false, reason: 'Zaten kayıtlı' };
  registered = true;

  /* ---- Yeniden Denetçi: plan engine ---- */
  const engine = load('./plans/engine');
  if (engine) {
    handler('plan-build', (_e, { prompt, cwd }) => engine.buildPlan(prompt, { cwd }));
    handler('plan-serialize', (_e, { plan }) => engine.serializePlan(plan));
    handler('plan-parse', (_e, { json }) => engine.parsePlan(json));
    handler('plan-diff', (_e, { a, b }) => ({ ok: true, diff: engine.planDiff(a, b) }));
    handler('plan-risk', (_e, { plan }) => ({ ok: true, score: engine.planRiskScore(plan) }));
    handler('plan-estimate', (_e, { prompt }) => ({ ok: true, steps: engine.estimateSteps(prompt) }));
  }

  /* ---- Onay döngüsü ---- */
  const approval = load('./plans/approval');
  if (approval) {
    handler('approval-create', (_e, { plan }) => approval.createApprovalSession(plan));
    handler('approval-approve', (_e, { sessionId, stepId }) => approval.approveStep(sessionId, stepId));
    handler('approval-reject', (_e, { sessionId, stepId, reason }) => approval.rejectStep(sessionId, stepId, reason));
    handler('approval-bulk', (_e, { sessionId, opts }) => approval.bulkApprove(sessionId, opts));
    handler('approval-edit', (_e, { sessionId, edit }) => approval.planEdit(sessionId, edit));
    handler('approval-pending', (_e, { sessionId }) => approval.pendingSteps(sessionId));
    handler('approval-state', (_e, { sessionId }) => approval.sessionState(sessionId));
    handler('approval-cancel', (_e, { sessionId }) => approval.cancelSession(sessionId));
    handler('approval-resolve', (_e, { sessionId }) => approval.resolveSession(sessionId));
  }

  /* ---- Grading ---- */
  const grading = load('./plans/grading');
  if (grading) {
    handler('plan-grade', (_e, { taskResult }) => grading.gradeTaskResult(taskResult));
  }

  /* ---- Diff uygulama / inceleme ---- */
  const diffApply = load('./plans/diff-apply');
  const diffReview = load('./plans/diff-review');
  if (diffApply) {
    handler('diff-apply-file', (_e, { filePath, diffText, strategy }) => diffApply.applyDiffToFile(filePath, diffText, { strategy }));
    handler('diff-validate', (_e, { diffText }) => diffApply.validateDiffIntegrity(diffText));
  }
  if (diffReview) {
    handler('diff-review-create', (_e, { diffText }) => diffReview.createReview(diffText));
    handler('diff-review-decide', (_e, { reviewId, hunkIdx, decision, reason }) => diffReview.decideHunk(reviewId, hunkIdx, decision, reason));
    handler('diff-review-bulk', (_e, { reviewId, opts }) => diffReview.bulkDecide(reviewId, opts));
    handler('diff-review-state', (_e, { reviewId }) => diffReview.reviewState(reviewId));
    handler('diff-review-export', (_e, { reviewId }) => diffReview.exportReview(reviewId));
    handler('diff-review-filtered', (_e, { reviewId }) => diffReview.filteredDiff(reviewId));
  }

  /* ---- Proje belleği ---- */
  const memory = load('./plans/project-memory');
  if (memory) {
    handler('memory-store-get', (_e, { project }) => memory.getMemoryStore(project));
    handler('memory-store-add', (_e, { project, entry }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.add(entry) : g;
    });
    handler('memory-store-remove', (_e, { project, id }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.remove(id) : g;
    });
    handler('memory-store-query', (_e, { project, text, limit }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.query(text, limit) : g;
    });
    handler('memory-store-inject', (_e, { project, budget }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.inject(budget) : g;
    });
    handler('memory-store-prune', (_e, { project }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.prune() : g;
    });
    handler('memory-store-info', (_e, { project }) => {
      const g = memory.getMemoryStore(project);
      return g.ok ? g.store.info() : g;
    });
    handler('kreyx-md-ensure', (_e, { projectDir }) => memory.ensureKreyxMd(projectDir));
  }

  /* ---- Görev kuyruğu ---- */
  const queue = load('./agents-ext/task-queue');
  if (queue) {
    handler('queue-create', (_e, { name, opts }) => queue.createQueue(name, opts));
    handler('queue-add', (_e, { name, task }) => {
      const q = queue.getQueue(name);
      return q ? q.add(task) : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-state', (_e, { name }) => {
      const q = queue.getQueue(name);
      return q ? q.state() : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-peek', (_e, { name, limit }) => {
      const q = queue.getQueue(name);
      return q ? q.peek(limit) : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-pause', (_e, { name }) => {
      const q = queue.getQueue(name);
      return q ? q.pause() : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-resume', (_e, { name }) => {
      const q = queue.getQueue(name);
      return q ? q.resume() : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-cancel', (_e, { name, taskId }) => {
      const q = queue.getQueue(name);
      return q ? q.cancel(taskId) : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-retry', (_e, { name, taskId }) => {
      const q = queue.getQueue(name);
      return q ? q.retry(taskId) : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-flush', (_e, { name }) => {
      const q = queue.getQueue(name);
      return q ? q.flush() : { ok: false, error: 'Kuyruk yok' };
    });
    handler('queue-destroy', (_e, { name }) => queue.destroyQueue(name));
    handler('queue-load-all', (_e, opts) => queue.loadQueues(opts));
  }

  /* ---- Çoklu ajan havuzu ---- */
  const multi = load('./agents-ext/multi-agent');
  if (multi) {
    handler('agentpool-create', (_e, opts) => multi.createPool(opts));
    handler('agentpool-register', (_e, { poolId, worker }) => {
      const p = multi.getPool(poolId);
      return p ? p.register(worker) : { ok: false, error: 'Havuz yok' };
    });
    handler('agentpool-distribute', (_e, { poolId, tasks, strategy }) => {
      const p = multi.getPool(poolId);
      return p ? p.distribute(tasks, strategy) : { ok: false, error: 'Havuz yok' };
    });
    handler('agentpool-state', (_e, { poolId }) => {
      const p = multi.getPool(poolId);
      return p ? p.state() : { ok: false, error: 'Havuz yok' };
    });
    handler('agentpool-destroy', (_e, { poolId }) => multi.destroyPool(poolId));
  }

  /* ---- Zincir görevler ---- */
  const chain = load('./agents-ext/chain-tasks');
  if (chain) {
    handler('chain-validate', (_e, { definitions }) => chain.validateChain(definitions));
    handler('chain-render', (_e, { template, ctx }) => ({ ok: true, rendered: chain.renderTemplate(template, ctx) }));
  }

  /* ---- Bağlam yöneticisi ---- */
  const ctx = load('./agents-ext/context-manager');
  if (ctx) {
    handler('ctx-create', (_e, opts) => ctx.createManager(opts));
    handler('ctx-add', (_e, { managerId, msg }) => {
      const m = ctx.getManager(managerId);
      return m ? m.add(msg) : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-trim', (_e, { managerId, targetBudget }) => {
      const m = ctx.getManager(managerId);
      return m ? m.trim(targetBudget) : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-budget', (_e, { managerId }) => {
      const m = ctx.getManager(managerId);
      return m ? m.budget() : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-save', (_e, { managerId }) => {
      const m = ctx.getManager(managerId);
      return m ? m.save() : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-load', (_e, { managerId, saveId }) => {
      const m = ctx.getManager(managerId);
      return m ? m.load(saveId) : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-state', (_e, { managerId }) => {
      const m = ctx.getManager(managerId);
      return m ? m.state() : { ok: false, error: 'Yönetici yok' };
    });
    handler('ctx-summarize', (_e, { chunks }) => ctx.summarizeChunks(chunks));
  }

  /* ---- Hook'lar ---- */
  const hooks = load('./agents-ext/hooks');
  if (hooks) {
    handler('hooks-register', (_e, { set }) => hooks.registerHookSet(set));
    handler('hooks-emit', async (_e, { event, payload }) => hooks.emit(event, { payload }));
    handler('hooks-log', (_e, { filter }) => ({ ok: true, entries: hooks.hookEventLog(filter) }));
    handler('hooks-parse', (_e, { text }) => hooks.parseHooksText(text));
  }

  /* ---- Güven: release doğrulama ---- */
  const release = load('./trust/release-check');
  if (release) {
    handler('trust-parse-checksums', (_e, { text }) => release.parseChecksums(text));
    handler('trust-build-asset-url', (_e, { releaseData, platform }) => release.buildAssetUrl(releaseData, platform));
    handler('trust-verify-file', (_e, { bufferB64, expected, algorithm }) => {
      const buf = Buffer.from(bufferB64, 'base64');
      return release.verifyChecksum(buf, expected, algorithm);
    });
  }

  /* ---- Güven: audit chain v2 ---- */
  const auditV2 = load('./trust/audit-chain-v2');
  const chains = new Map();
  if (auditV2) {
    handler('audit2-open', (_e, { filePath }) => {
      const ch = auditV2.createChain(filePath);
      ch.load();
      chains.set(ch.path, ch);
      return { ok: true, path: ch.path };
    });
    handler('audit2-append', (_e, { filePath, actor, action, detail }) => {
      const ch = chains.get(filePath) || auditV2.createChain(filePath);
      chains.set(ch.path, ch);
      return ch.append(actor, action, detail);
    });
    handler('audit2-verify', (_e, { filePath }) => {
      const ch = chains.get(filePath) || auditV2.createChain(filePath);
      return ch.verify();
    });
    handler('audit2-query', (_e, { filePath, opts }) => {
      const ch = chains.get(filePath) || auditV2.createChain(filePath);
      return ch.query(opts);
    });
    handler('audit2-export', (_e, { filePath, format }) => {
      const ch = chains.get(filePath) || auditV2.createChain(filePath);
      return ch.export(format);
    });
  }

  /* ---- Güven: gizli tarama ---- */
  const secrets = load('./trust/secrets-audit');
  if (secrets) {
    handler('secrets-scan-text', (_e, { text }) => secrets.scanText(text));
    handler('secrets-scan-diff', (_e, { diffText }) => secrets.scanDiff(diffText));
    handler('secrets-scan-env', (_e) => secrets.scanEnv(process.env));
    handler('secrets-summarize', (_e, { findings }) => secrets.summarize(findings));
  }

  /* ---- Kasa yönetimi ---- */
  const vault = load('./trust/vault-mgmt');
  if (vault) {
    handler('vault-export', (_e, { passphrase, entries }) => vault.exportVault({ passphrase, entries }));
    handler('vault-entropy', (_e, { entries }) => vault.entropyReport(entries));
    handler('vault-rotate', (_e, { encrypted, oldPass, newPass }) => vault.rotateKey(encrypted, oldPass, newPass));
  }

  return { registered: true, total: ipcMain.eventNames().length };
}

function testOnlyReset() {
  registered = false;
}

module.exports = { registerIpcV325Handlers, testOnlyReset };
