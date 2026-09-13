'use strict';

const { createVerificationRun, nowIso } = require('../../../shared/v4/contracts');
const { EntityType, TaskStatus, VerificationStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { transitionTask } = require('../missions/state-machine');
const { createEvidenceService } = require('./evidence-service');
const { createGateRunner } = require('./gates');

function createVerificationEngine(options = {}) {
  const store = options.store;
  const journal = options.journal || null;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.update !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createVerificationEngine requires a v4 store');
  }
  const evidenceService = options.evidenceService || createEvidenceService({ store, journal });
  const gateRunner = options.gateRunner || createGateRunner({ toolExecutor: options.toolExecutor });
  const active = new Map();

  function appendEvent(type, subjectType, subjectId, payload = {}) {
    if (!journal || typeof journal.append !== 'function') return null;
    return journal.append({ type, subjectType, subjectId, payload });
  }

  function cancel(verificationRunId, reason = 'user-requested') {
    const entry = active.get(verificationRunId);
    if (!entry) return { ok: false, error: 'verification_not_active', verificationRunId };
    if (!entry.controller.signal.aborted) entry.controller.abort(reason);
    appendEvent('verification.cancel-requested', 'verificationRun', verificationRunId, {
      taskId: entry.taskId,
      reason,
    });
    return { ok: true, verificationRunId, taskId: entry.taskId };
  }

  async function runTaskVerification(input = {}) {
    const task = store.get(EntityType.TASK, input.taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${input.taskId}`);
    if (task.status !== TaskStatus.VERIFYING) {
      throw new V4Error(ErrorCode.STATE_TRANSITION_INVALID, `task must be VERIFYING before verification: ${task.status}`, {
        taskId: task.id,
        status: task.status,
      });
    }
    if (!input.rootPath) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'verification rootPath is required');
    if (!Array.isArray(input.gates) || input.gates.length === 0) {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'at least one verification gate is required');
    }

    const verification = createVerificationRun({
      subjectId: task.id,
      gates: input.gates,
      status: VerificationStatus.RUNNING,
      startedAt: nowIso(),
      finishedAt: null,
      evidenceIds: [],
    });
    store.put(EntityType.VERIFICATION_RUN, verification);
    const controller = new AbortController();
    active.set(verification.id, { taskId: task.id, controller });
    appendEvent('verification.started', 'verificationRun', verification.id, {
      taskId: task.id,
      gateCount: input.gates.length,
    });

    const gateResults = [];
    const evidenceIds = [];
    try {
      for (let index = 0; index < input.gates.length; index += 1) {
        if (controller.signal.aborted) break;
        const result = await gateRunner.run(input.gates[index], {
          rootPath: input.rootPath,
          cwd: input.cwd || '.',
          permissionProfile: input.permissionProfile,
          signal: controller.signal,
          timeoutMs: input.timeoutMs,
          maxOutputBytes: input.maxOutputBytes,
        }, index);
        gateResults.push(result);
        const recorded = evidenceService.record({
          subjectType: 'task',
          subjectId: task.id,
          kind: result.evidenceKind,
          summary: result.summary,
          payload: {
            verificationRunId: verification.id,
            gateId: result.gate.id,
            gateType: result.gate.type,
            required: result.gate.required,
            passed: result.passed,
            result: result.payload,
          },
        });
        evidenceIds.push(recorded.evidence.id);
        appendEvent('verification.gate-finished', 'verificationRun', verification.id, {
          taskId: task.id,
          gateId: result.gate.id,
          passed: result.passed,
          required: result.gate.required,
          evidenceId: recorded.evidence.id,
        });
        if (input.stopOnRequiredFailure === true && result.gate.required && !result.passed) break;
      }

      const cancelled = controller.signal.aborted;
      const requiredFailures = gateResults.filter((result) => result.gate.required && !result.passed);
      const status = cancelled
        ? VerificationStatus.CANCELLED
        : requiredFailures.length
          ? VerificationStatus.FAILED
          : VerificationStatus.PASSED;
      const finalVerification = store.update(EntityType.VERIFICATION_RUN, verification.id, (current) => ({
        ...current,
        status,
        finishedAt: nowIso(),
        evidenceIds,
      }));

      let finalTask = store.get(EntityType.TASK, task.id);
      if (!cancelled) {
        finalTask = store.update(EntityType.TASK, task.id, (current) => transitionTask(
          current,
          requiredFailures.length ? TaskStatus.BLOCKED : TaskStatus.COMPLETE,
        ));
      }

      appendEvent(`verification.${status.toLowerCase()}`, 'verificationRun', verification.id, {
        taskId: task.id,
        evidenceIds,
        failedGateIds: requiredFailures.map((result) => result.gate.id),
      });

      return {
        ok: status === VerificationStatus.PASSED,
        cancelled,
        verification: finalVerification,
        task: finalTask,
        gateResults,
        evidenceIds,
        requiredFailures: requiredFailures.map((result) => result.gate.id),
      };
    } finally {
      active.delete(verification.id);
    }
  }

  return {
    runTaskVerification,
    cancel,
    listActive: () => Array.from(active.entries()).map(([verificationRunId, entry]) => ({
      verificationRunId,
      taskId: entry.taskId,
      cancelled: entry.controller.signal.aborted,
    })),
    evidenceService,
  };
}

module.exports = {
  createVerificationEngine,
};
