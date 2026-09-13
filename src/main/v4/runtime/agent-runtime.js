'use strict';

const {
  createAgentRun,
  createToolCall,
  nowIso,
} = require('../../../shared/v4/contracts');
const {
  AgentRunStatus,
  EntityType,
  TaskStatus,
} = require('../../../shared/v4/enums');
const { ErrorCode, V4Error, asV4Error } = require('../../../shared/v4/errors');
const { transitionTask } = require('../missions/state-machine');
const { executeTool: defaultExecuteTool, ToolId } = require('../tools/tool-registry');

function summarizeToolResult(execution) {
  const result = execution && execution.result ? execution.result : {};
  return {
    ok: result.ok !== false && !result.error && !result.cancelled,
    cancelled: result.cancelled === true,
    error: result.error || null,
    code: result.code ?? null,
    timedOut: result.timedOut === true,
    outputTruncated: result.outputTruncated === true,
  };
}

function skillRuntimePolicy(task) {
  if (!task || !Array.isArray(task.inputs)) return null;
  const policy = task.inputs.find((item) => item && item.kind === 'skill-runtime');
  if (!policy) return null;
  return {
    skillId: policy.skillId || null,
    skillVersion: policy.skillVersion || null,
    allowedTools: Array.isArray(policy.allowedTools) ? policy.allowedTools.map(String) : [],
    writeScopes: Array.isArray(policy.writeScopes) ? policy.writeScopes.map(String) : [],
  };
}

function normalizeScope(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function pathWithinScopes(targetPath, writeScopes) {
  const target = normalizeScope(targetPath);
  if (!target) return false;
  const scopes = (writeScopes || []).map(normalizeScope).filter(Boolean);
  if (scopes.includes('*')) return true;
  return scopes.some((scope) => target === scope || target.startsWith(`${scope}/`));
}

function assertSkillStepAllowed(task, step) {
  const policy = skillRuntimePolicy(task);
  if (!policy) return true;
  if (!policy.allowedTools.includes(step.toolId)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill ${policy.skillId || 'unknown'} does not allow tool: ${step.toolId}`, {
      taskId: task.id,
      skillId: policy.skillId,
      skillVersion: policy.skillVersion,
      toolId: step.toolId,
    });
  }

  const paths = [];
  if ([ToolId.FS_WRITE, ToolId.FS_DELETE].includes(step.toolId) && step.args && step.args.path) {
    paths.push(step.args.path);
  }
  if (step.toolId === ToolId.GIT_STAGE && step.args && Array.isArray(step.args.paths)) {
    paths.push(...step.args.paths);
  }
  if (paths.length && !paths.every((item) => pathWithinScopes(item, policy.writeScopes))) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill ${policy.skillId || 'unknown'} write exceeds declared scope`, {
      taskId: task.id,
      toolId: step.toolId,
      paths,
      writeScopes: policy.writeScopes,
    });
  }
  return true;
}

function createAgentRuntime(options = {}) {
  const store = options.store;
  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.update !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createAgentRuntime requires a durable v4 store');
  }
  const journal = options.journal || null;
  const toolExecutor = options.toolExecutor || defaultExecuteTool;
  const active = new Map();

  function appendEvent(type, subjectType, subjectId, payload = {}) {
    if (!journal || typeof journal.append !== 'function') return null;
    return journal.append({ type, subjectType, subjectId, payload });
  }

  function getActiveRun(runId) {
    const entry = active.get(runId);
    if (!entry) return null;
    return {
      runId,
      taskId: entry.taskId,
      startedAt: entry.startedAt,
      cancelled: entry.controller.signal.aborted,
    };
  }

  function cancel(runId, reason = 'user-requested') {
    const entry = active.get(runId);
    if (!entry) return { ok: false, error: 'run_not_active', runId };
    if (!entry.controller.signal.aborted) entry.controller.abort(reason);
    appendEvent('agent-run.cancel-requested', 'agentRun', runId, { taskId: entry.taskId, reason });
    return { ok: true, runId, taskId: entry.taskId, reason };
  }

  async function runTask(input = {}) {
    const task = store.get(EntityType.TASK, input.taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${input.taskId}`);
    if (![TaskStatus.PENDING, TaskStatus.READY].includes(task.status)) {
      throw new V4Error(ErrorCode.STATE_TRANSITION_INVALID, `task is not runnable from ${task.status}`, {
        taskId: task.id,
        status: task.status,
      });
    }
    if (!input.rootPath) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runTask rootPath is required');
    if (!Array.isArray(input.steps)) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runTask steps must be an array');

    let runnableTask = task;
    if (runnableTask.status === TaskStatus.PENDING) {
      runnableTask = store.update(EntityType.TASK, task.id, (current) => transitionTask(current, TaskStatus.READY));
    }
    runnableTask = store.update(EntityType.TASK, task.id, (current) => transitionTask(current, TaskStatus.RUNNING));

    const controller = new AbortController();
    const run = createAgentRun({
      taskId: task.id,
      agentProfileId: input.agentProfileId || 'implementer',
      modelRoute: input.modelRoute || null,
      status: AgentRunStatus.RUNNING,
      startedAt: nowIso(),
      contextSnapshotId: input.contextSnapshotId || null,
      usage: {},
    });
    store.put(EntityType.AGENT_RUN, run);
    active.set(run.id, {
      taskId: task.id,
      controller,
      startedAt: run.startedAt,
    });
    appendEvent('agent-run.started', 'agentRun', run.id, {
      taskId: task.id,
      agentProfileId: run.agentProfileId,
      stepCount: input.steps.length,
    });

    const toolCalls = [];
    let failure = null;
    try {
      for (let index = 0; index < input.steps.length; index += 1) {
        if (controller.signal.aborted) break;
        const step = input.steps[index] || {};
        if (!step.toolId) {
          failure = new V4Error(ErrorCode.INVALID_ARGUMENT, `toolId missing at step ${index}`);
          break;
        }
        try {
          assertSkillStepAllowed(runnableTask, step);
        } catch (error) {
          failure = asV4Error(error, ErrorCode.VALIDATION_FAILED);
          appendEvent('tool-call.policy-denied', 'task', task.id, {
            taskId: task.id,
            toolId: step.toolId,
            index,
            error: { code: failure.code, message: failure.message },
          });
          break;
        }

        const startedAt = nowIso();
        const provisional = createToolCall({
          agentRunId: run.id,
          toolId: step.toolId,
          argumentsDigest: null,
          permissionDecision: null,
          startedAt,
          finishedAt: null,
          exitState: null,
          outputArtifactId: null,
        });
        store.put(EntityType.TOOL_CALL, provisional);
        appendEvent('tool-call.started', 'toolCall', provisional.id, {
          agentRunId: run.id,
          taskId: task.id,
          toolId: step.toolId,
          index,
        });

        try {
          let approval = step.approval || input.approval || null;
          if (typeof input.approvalProvider === 'function') {
            approval = await input.approvalProvider({
              runId: run.id,
              task: runnableTask,
              step,
              index,
              signal: controller.signal,
            });
          }
          const execution = await toolExecutor(step.toolId, step.args || {}, {
            rootPath: input.rootPath,
            cwd: step.cwd || input.cwd || '.',
            profile: input.permissionProfile,
            approval,
            signal: controller.signal,
            timeoutMs: step.timeoutMs || input.timeoutMs,
            maxOutputBytes: step.maxOutputBytes || input.maxOutputBytes,
          });
          const summary = summarizeToolResult(execution);
          const permissionDecision = execution.result && execution.result.permission
            ? execution.result.permission.decision || null
            : null;
          const completed = store.update(EntityType.TOOL_CALL, provisional.id, (current) => ({
            ...current,
            argumentsDigest: execution.argumentsDigest || null,
            permissionDecision,
            finishedAt: nowIso(),
            exitState: summary,
          }));
          toolCalls.push(completed);
          appendEvent('tool-call.finished', 'toolCall', provisional.id, {
            agentRunId: run.id,
            taskId: task.id,
            toolId: step.toolId,
            index,
            exitState: summary,
          });

          if (summary.cancelled || controller.signal.aborted) break;
          if (!summary.ok) {
            failure = new V4Error(ErrorCode.VALIDATION_FAILED, `tool step failed: ${step.toolId}`, {
              step: index,
              exitState: summary,
            });
            break;
          }
        } catch (error) {
          const normalized = asV4Error(error, ErrorCode.VALIDATION_FAILED);
          const completed = store.update(EntityType.TOOL_CALL, provisional.id, (current) => ({
            ...current,
            finishedAt: nowIso(),
            exitState: {
              ok: false,
              cancelled: controller.signal.aborted,
              error: normalized.message,
              code: normalized.code,
            },
          }));
          toolCalls.push(completed);
          appendEvent('tool-call.failed', 'toolCall', provisional.id, {
            agentRunId: run.id,
            taskId: task.id,
            toolId: step.toolId,
            index,
            error: { code: normalized.code, message: normalized.message },
          });
          if (!controller.signal.aborted) failure = normalized;
          break;
        }
      }

      const cancelled = controller.signal.aborted;
      const finalStatus = cancelled
        ? AgentRunStatus.CANCELLED
        : failure
          ? AgentRunStatus.FAILED
          : AgentRunStatus.COMPLETE;
      const resultSummary = cancelled
        ? `Cancelled after ${toolCalls.length}/${input.steps.length} tool calls.`
        : failure
          ? `Failed after ${toolCalls.length}/${input.steps.length} tool calls: ${failure.message}`
          : `Completed ${toolCalls.length}/${input.steps.length} tool calls; awaiting verification.`;

      const finalRun = store.update(EntityType.AGENT_RUN, run.id, (current) => ({
        ...current,
        status: finalStatus,
        finishedAt: nowIso(),
        resultSummary,
      }));

      if (cancelled) {
        store.update(EntityType.TASK, task.id, (current) => transitionTask(current, TaskStatus.CANCELLED));
      } else if (failure) {
        store.update(EntityType.TASK, task.id, (current) => transitionTask(current, TaskStatus.FAILED));
      } else {
        store.update(EntityType.TASK, task.id, (current) => transitionTask(current, TaskStatus.VERIFYING));
      }

      appendEvent(`agent-run.${finalStatus.toLowerCase()}`, 'agentRun', run.id, {
        taskId: task.id,
        resultSummary,
        toolCallIds: toolCalls.map((call) => call.id),
      });

      return {
        ok: finalStatus === AgentRunStatus.COMPLETE,
        cancelled,
        run: finalRun,
        task: store.get(EntityType.TASK, task.id),
        toolCalls,
        error: failure ? { code: failure.code, message: failure.message } : null,
      };
    } finally {
      active.delete(run.id);
    }
  }

  return {
    runTask,
    cancel,
    getActiveRun,
    listActiveRuns: () => Array.from(active.keys()).map(getActiveRun),
  };
}

module.exports = {
  summarizeToolResult,
  skillRuntimePolicy,
  pathWithinScopes,
  assertSkillStepAllowed,
  createAgentRuntime,
};
