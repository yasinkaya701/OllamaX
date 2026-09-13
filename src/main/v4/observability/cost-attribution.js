'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

function finite(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function emptyUsage() {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
}

function addUsage(target, source) {
  const promptTokens = finite(source && source.promptTokens);
  const completionTokens = finite(source && source.completionTokens);
  target.promptTokens += promptTokens;
  target.completionTokens += completionTokens;
  target.totalTokens += promptTokens + completionTokens;
  target.costUsd += finite(source && source.costUsd);
  return target;
}

function taskPlannerUsage(task) {
  const runtime = Array.isArray(task && task.inputs)
    ? task.inputs.find((item) => item && item.kind === 'skill-runtime')
    : null;
  return runtime && runtime.planner && runtime.planner.usage || null;
}

function summarizeMissionUsage(store, missionId) {
  if (!store || typeof store.get !== 'function' || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'cost attribution requires durable store');
  }
  const mission = store.get(EntityType.MISSION, missionId);
  if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${missionId}`);
  const tasks = store.list(EntityType.TASK).filter((task) => task.missionId === mission.id);
  const taskIds = new Set(tasks.map((task) => task.id));
  const runs = store.list(EntityType.AGENT_RUN).filter((run) => taskIds.has(run.taskId));
  const planner = emptyUsage();
  const agents = emptyUsage();
  for (const task of tasks) addUsage(planner, taskPlannerUsage(task));
  for (const run of runs) addUsage(agents, run.usage || null);
  const total = emptyUsage();
  addUsage(total, planner);
  addUsage(total, agents);
  return {
    missionId: mission.id,
    workspaceId: mission.workspaceId,
    taskCount: tasks.length,
    agentRunCount: runs.length,
    planner,
    agents,
    total,
  };
}

function summarizeWorkspaceUsage(store, workspaceId) {
  const missions = store.list(EntityType.MISSION).filter((mission) => mission.workspaceId === workspaceId);
  const total = emptyUsage();
  const missionSummaries = missions.map((mission) => summarizeMissionUsage(store, mission.id));
  for (const summary of missionSummaries) addUsage(total, summary.total);
  return { workspaceId, missionCount: missions.length, total, missions: missionSummaries };
}

module.exports = {
  finite,
  emptyUsage,
  addUsage,
  taskPlannerUsage,
  summarizeMissionUsage,
  summarizeWorkspaceUsage,
};
