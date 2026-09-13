'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { toSerializable, serializeError } = require('../ipc/serializers');
const { summarizeMissionUsage } = require('./cost-attribution');
const { buildDiagnosticBundle } = require('./diagnostic-bundle');

const TASK_INSIGHTS_CHANNEL = 'ipc:4:insights:task';
const MISSION_COST_CHANNEL = 'ipc:4:insights:mission-cost';
const DIAGNOSTIC_CHANNEL = 'ipc:4:diagnostics:bundle';

function createRuntimeInsights(runtime, options = {}) {
  if (!runtime || !runtime.store || !runtime.service) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runtime insights require bootstrapped v4 runtime');
  }
  const store = runtime.store;
  const configReader = typeof options.configReader === 'function' ? options.configReader : () => ({});

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

  function missionCost(input = {}) {
    runtime.service.assertEnabled();
    const missionId = String(input.missionId || '').trim();
    if (!missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    return summarizeMissionUsage(store, missionId);
  }

  function diagnosticBundle(input = {}) {
    runtime.service.assertEnabled();
    const eventLimit = Number.isInteger(input.eventLimit) ? Math.min(500, Math.max(1, input.eventLimit)) : 100;
    return buildDiagnosticBundle({
      store,
      journal: runtime.journal,
      config: configReader() || {},
      appVersion: options.appVersion || null,
      eventLimit,
    });
  }

  return { taskInsights, missionCost, diagnosticBundle };
}

function registerRuntimeInsightsExtension(ipcMain, runtime, options = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'runtime insights require ipcMain.handle');
  }
  const insights = createRuntimeInsights(runtime, options);
  const handlers = [
    [TASK_INSIGHTS_CHANNEL, insights.taskInsights],
    [MISSION_COST_CHANNEL, insights.missionCost],
    [DIAGNOSTIC_CHANNEL, insights.diagnosticBundle],
  ];
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (_event, input = {}) => {
      try {
        return { ok: true, data: toSerializable(handler(input || {})) };
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    });
  }
  return { ...insights, channels: handlers.map(([channel]) => channel) };
}

module.exports = {
  TASK_INSIGHTS_CHANNEL,
  MISSION_COST_CHANNEL,
  DIAGNOSTIC_CHANNEL,
  createRuntimeInsights,
  registerRuntimeInsightsExtension,
};
