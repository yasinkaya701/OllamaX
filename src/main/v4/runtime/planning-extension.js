'use strict';

const configStore = require('../../config/config-store');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { refreshWorkspaceContext } = require('../workspace/workspace-context');
const { createTaskPlanner } = require('./task-planner');
const { createOllamaPlannerInvoker } = require('../models/ollama-planner-invoker');
const { toSerializable, serializeError } = require('../ipc/serializers');

const TASK_PLAN_CHANNEL = 'ipc:4:task:plan';

function createPlanningExtension(options = {}) {
  const runtime = options.runtime;
  const configReader = options.configReader || (() => configStore.readConfig());
  if (!runtime || !runtime.store || !runtime.service) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'planning extension requires bootstrapped v4 runtime');
  }

  const modelInvoker = options.modelInvoker || createOllamaPlannerInvoker({ configReader });
  const planner = options.planner || createTaskPlanner({
    store: runtime.store,
    journal: runtime.journal,
    modelInvoker,
  });

  async function planTask(input = {}) {
    runtime.service.assertEnabled();
    const taskId = String(input.taskId || '').trim();
    if (!taskId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'taskId is required');
    const task = runtime.store.get(EntityType.TASK, taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${taskId}`);
    const mission = runtime.store.get(EntityType.MISSION, task.missionId);
    if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${task.missionId}`);
    const workspace = runtime.store.get(EntityType.WORKSPACE, mission.workspaceId);
    if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${mission.workspaceId}`);

    const planningRoot = typeof runtime.service.resolveExecutionRoot === 'function'
      ? await runtime.service.resolveExecutionRoot(mission, workspace, 'planning')
      : workspace.rootPath;
    const refreshed = refreshWorkspaceContext({
      rootPath: planningRoot,
      workspaceId: workspace.id,
      memory: runtime.memory,
      previousInventory: null,
      kind: 'planner',
      query: `${task.title} ${task.description || ''}`,
      maxContextFiles: 20,
      maxContextBytes: 192 * 1024,
      maxMemoryRecords: 8,
      maxMemoryBytes: 32 * 1024,
    });

    const result = await planner.planTask({
      taskId,
      contextPack: refreshed.context,
      replace: input.replace === true,
    });
    return {
      ...result,
      context: {
        executionRoot: planningRoot,
        sourceInventoryHash: refreshed.inventory.inventoryHash,
        includedPaths: refreshed.context.includedPaths || [],
        memoryRecordIds: (refreshed.context.memory || []).map((item) => item.id),
      },
    };
  }

  return { planner, modelInvoker, planTask };
}

function registerPlanningExtension(ipcMain, options = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'planning extension requires ipcMain.handle');
  }
  const extension = createPlanningExtension(options);
  ipcMain.handle(TASK_PLAN_CHANNEL, async (_event, input = {}) => {
    try {
      return { ok: true, data: toSerializable(await extension.planTask(input || {})) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  });
  return { ...extension, channel: TASK_PLAN_CHANNEL };
}

module.exports = {
  TASK_PLAN_CHANNEL,
  createPlanningExtension,
  registerPlanningExtension,
};
