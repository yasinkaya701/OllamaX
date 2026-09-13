'use strict';

const { EntityType, MissionStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { reconcileMission, transitionMissionToward } = require('../missions/mission-status');

function createReconciledMissionRunner(options = {}) {
  const store = options.store;
  const baseRunner = options.baseRunner;
  if (!store || typeof store.get !== 'function' || typeof store.update !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'reconciled mission runner requires store');
  }
  if (!baseRunner || typeof baseRunner.runReadyBatch !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'reconciled mission runner requires base runner');
  }

  async function runReadyBatch(input = {}) {
    if (!input.missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    const before = reconcileMission(store, input.missionId);
    if (![MissionStatus.COMPLETE, MissionStatus.FAILED, MissionStatus.CANCELLED].includes(before.status)) {
      store.update(EntityType.MISSION, input.missionId, (current) => transitionMissionToward(current, MissionStatus.RUNNING));
    }
    try {
      const result = await baseRunner.runReadyBatch(input);
      return {
        ...result,
        mission: reconcileMission(store, input.missionId),
      };
    } finally {
      try { reconcileMission(store, input.missionId); } catch { /* preserve original execution error */ }
    }
  }

  function cancelMission(missionId, reason) {
    const result = baseRunner.cancelMission(missionId, reason);
    try { result.mission = reconcileMission(store, missionId); } catch { /* best effort */ }
    return result;
  }

  return {
    missionTasks: (...args) => baseRunner.missionTasks(...args),
    runReadyBatch,
    cancelMission,
  };
}

module.exports = {
  createReconciledMissionRunner,
};
