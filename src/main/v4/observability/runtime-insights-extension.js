'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { toSerializable, serializeError } = require('../ipc/serializers');

const TASK_INSIGHTS_CHANNEL = 'ipc:4:insights:task';

function createRuntimeInsights(runtime) {
  if (!runtime || !runtime.store || !runtime.service) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runtime insights require bootstrapped v4 runtime');
  }
  const store = runtime.store;

  function taskInsights(input = {}) {
    runtime.service.assertEnabled();
    const taskId = String(input.taskId || '').trim();
    if (!taskId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'taskId is required');
    const task = store.get(EntityType.TASK, taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${taskId}`);

    const evidence = store.list(EntityType.EVIDENCE)
      .filter((item) => item.subjectType === 'task' && item.subjectId === taskId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const verifications = store.list(EntityType.VERIFICATION_RUN)
      .filter((item) => item.subjectId === taskId)
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
    const runs = store.list(EntityType.AGENT_RUN)
      .filter((item) => item.taskId === taskId)
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')))
      .map((run) => ({
        ...run,
        toolCalls: store.list(EntityType.TOOL_CALL)
          .filter((call) => call.agentRunId === run.id)
          .sort((a, b) => String(a.startedAt || '').localeCompare(String(b.startedAt || '')))
          .map((call) => ({
            id: call.id,
            toolId: call.toolId,
            argumentsDigest: call.argumentsDigest,
            permissionDecision: call.permissionDecision,
            startedAt: call.startedAt,
            finishedAt: call.finishedAt,
            exitState: call.exitState,
          })),
      }));

    const subjectIds = new Set([taskId, ...runs.map((run) => run.id), ...runs.flatMap((run) => run.toolCalls.map((call) => call.id))]);
    const journal = runtime.journal && typeof runtime.journal.readAll === 'function'
      ? runtime.journal.readAll({ limit: 250 }).entries
        .filter((entry) => subjectIds.has(entry.subjectId) || entry.payload && entry.payload.taskId === taskId)
        .slice(-50)
        .reverse()
        .map((entry) => ({
          id: entry.id,
          sequence: entry.sequence,
          type: entry.type,
          subjectType: entry.subjectType,
          subjectId: entry.subjectId,
          createdAt: entry.createdAt,
        }))
      : [];

    return { task, evidence, verifications, runs, journal };
  }

  return { taskInsights };
}

function registerRuntimeInsightsExtension(ipcMain, runtime) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runtime insights require ipcMain.handle');
  }
  const insights = createRuntimeInsights(runtime);
  ipcMain.handle(TASK_INSIGHTS_CHANNEL, async (_event, input = {}) => {
    try {
      return { ok: true, data: toSerializable(insights.taskInsights(input || {})) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  });
  return { ...insights, channel: TASK_INSIGHTS_CHANNEL };
}

module.exports = {
  TASK_INSIGHTS_CHANNEL,
  createRuntimeInsights,
  registerRuntimeInsightsExtension,
};
