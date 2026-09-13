'use strict';

const { EntityType, MissionStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { reconcileMission, transitionMissionToward } = require('../missions/mission-status');

const INSTALLED = Symbol.for('krevyx.v4.lifecycle-extension');

function missionIdForTask(store, taskId) {
  const task = store.get(EntityType.TASK, taskId);
  if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${taskId}`);
  return task.missionId;
}

function installLifecycleExtension(runtime) {
  if (!runtime || !runtime.store || !runtime.service) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'lifecycle extension requires bootstrapped v4 runtime');
  }
  const service = runtime.service;
  if (service[INSTALLED]) return service;
  const store = runtime.store;

  const originalRunReadyBatch = service.runReadyBatch.bind(service);
  const originalVerifyTask = service.verifyTask.bind(service);
  const originalCancelMission = service.cancelMission.bind(service);

  service.runReadyBatch = async (input = {}) => {
    const missionId = String(input.missionId || '').trim();
    if (!missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    const current = reconcileMission(store, missionId);
    if (![MissionStatus.COMPLETE, MissionStatus.FAILED, MissionStatus.CANCELLED].includes(current.status)) {
      store.update(EntityType.MISSION, missionId, (mission) => transitionMissionToward(mission, MissionStatus.RUNNING));
    }
    try {
      const result = await originalRunReadyBatch(input);
      return { ...result, mission: reconcileMission(store, missionId) };
    } finally {
      try { reconcileMission(store, missionId); } catch { /* preserve original error */ }
    }
  };

  service.verifyTask = async (input = {}) => {
    const missionId = missionIdForTask(store, input.taskId);
    try {
      const result = await originalVerifyTask(input);
      return { ...result, mission: reconcileMission(store, missionId) };
    } finally {
      try { reconcileMission(store, missionId); } catch { /* preserve original error */ }
    }
  };

  service.cancelMission = (input = {}) => {
    const result = originalCancelMission(input);
    const missionId = String(input.missionId || '').trim();
    if (missionId) {
      try { result.mission = reconcileMission(store, missionId); } catch { /* asynchronous cancellation may still be settling */ }
    }
    return result;
  };

  Object.defineProperty(service, INSTALLED, { value: true, enumerable: false });
  return service;
}

module.exports = {
  INSTALLED,
  missionIdForTask,
  installLifecycleExtension,
};
