'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { selectRunnableBatch } = require('../missions/scheduler');

function createMissionRunner(options = {}) {
  const store = options.store;
  const agentRuntime = options.agentRuntime;
  if (!store || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createMissionRunner requires a v4 store');
  }
  if (!agentRuntime || typeof agentRuntime.runTask !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createMissionRunner requires an agent runtime');
  }

  function missionTasks(missionId) {
    return store.list(EntityType.TASK).filter((task) => task.missionId === missionId);
  }

  async function runReadyBatch(input = {}) {
    if (!input.missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    if (typeof input.planForTask !== 'function') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'planForTask callback is required');
    }
    const tasks = missionTasks(input.missionId);
    const schedule = selectRunnableBatch(tasks, {
      maxParallel: input.maxParallel || 4,
      getWriteScopes: input.getWriteScopes,
    });

    const results = await Promise.all(schedule.selected.map(async (task) => {
      const plan = await input.planForTask(task);
      const steps = Array.isArray(plan) ? plan : (plan && Array.isArray(plan.steps) ? plan.steps : null);
      if (!steps) {
        throw new V4Error(ErrorCode.VALIDATION_FAILED, `planForTask did not return steps for ${task.id}`);
      }
      return agentRuntime.runTask({
        taskId: task.id,
        rootPath: input.rootPath,
        cwd: input.cwd,
        permissionProfile: input.permissionProfile,
        approval: input.approval,
        approvalProvider: input.approvalProvider,
        agentProfileId: input.agentProfileId,
        modelRoute: input.modelRoute,
        contextSnapshotId: input.contextSnapshotId,
        timeoutMs: input.timeoutMs,
        maxOutputBytes: input.maxOutputBytes,
        steps,
      });
    }));

    return {
      missionId: input.missionId,
      selectedTaskIds: schedule.selected.map((task) => task.id),
      deferred: schedule.deferred,
      results,
    };
  }

  function cancelMission(missionId, reason = 'mission-cancelled') {
    const taskIds = new Set(missionTasks(missionId).map((task) => task.id));
    const cancelled = [];
    for (const active of agentRuntime.listActiveRuns()) {
      if (!taskIds.has(active.taskId)) continue;
      const result = agentRuntime.cancel(active.runId, reason);
      if (result.ok) cancelled.push(result.runId);
    }
    return { ok: true, missionId, cancelledRunIds: cancelled };
  }

  return {
    missionTasks,
    runReadyBatch,
    cancelMission,
  };
}

module.exports = {
  createMissionRunner,
};
