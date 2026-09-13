'use strict';

const { MissionStatus, TaskStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { transitionMission } = require('./state-machine');

function deriveMissionStatus(tasks = []) {
  if (!Array.isArray(tasks) || !tasks.length) return MissionStatus.DRAFT;
  const statuses = tasks.map((task) => task.status);
  if (statuses.every((status) => status === TaskStatus.COMPLETE)) return MissionStatus.COMPLETE;
  if (statuses.every((status) => status === TaskStatus.CANCELLED)) return MissionStatus.CANCELLED;
  if (statuses.includes(TaskStatus.FAILED)) return MissionStatus.FAILED;
  if (statuses.includes(TaskStatus.BLOCKED)) return MissionStatus.BLOCKED;
  if (statuses.includes(TaskStatus.RUNNING)) return MissionStatus.RUNNING;
  if (statuses.includes(TaskStatus.VERIFYING)) return MissionStatus.VERIFYING;
  if (statuses.includes(TaskStatus.COMPLETE)) return MissionStatus.RUNNING;
  if (statuses.includes(TaskStatus.READY)) return MissionStatus.READY;
  return MissionStatus.PLANNING;
}

const PATHS = Object.freeze({
  [`${MissionStatus.DRAFT}:${MissionStatus.PLANNING}`]: [MissionStatus.PLANNING],
  [`${MissionStatus.DRAFT}:${MissionStatus.READY}`]: [MissionStatus.PLANNING, MissionStatus.READY],
  [`${MissionStatus.DRAFT}:${MissionStatus.RUNNING}`]: [MissionStatus.PLANNING, MissionStatus.READY, MissionStatus.RUNNING],
  [`${MissionStatus.DRAFT}:${MissionStatus.VERIFYING}`]: [MissionStatus.PLANNING, MissionStatus.READY, MissionStatus.RUNNING, MissionStatus.VERIFYING],
  [`${MissionStatus.DRAFT}:${MissionStatus.COMPLETE}`]: [MissionStatus.PLANNING, MissionStatus.READY, MissionStatus.RUNNING, MissionStatus.VERIFYING, MissionStatus.COMPLETE],
  [`${MissionStatus.PLANNING}:${MissionStatus.RUNNING}`]: [MissionStatus.READY, MissionStatus.RUNNING],
  [`${MissionStatus.PLANNING}:${MissionStatus.VERIFYING}`]: [MissionStatus.READY, MissionStatus.RUNNING, MissionStatus.VERIFYING],
  [`${MissionStatus.PLANNING}:${MissionStatus.COMPLETE}`]: [MissionStatus.READY, MissionStatus.RUNNING, MissionStatus.VERIFYING, MissionStatus.COMPLETE],
  [`${MissionStatus.READY}:${MissionStatus.VERIFYING}`]: [MissionStatus.RUNNING, MissionStatus.VERIFYING],
  [`${MissionStatus.READY}:${MissionStatus.COMPLETE}`]: [MissionStatus.RUNNING, MissionStatus.VERIFYING, MissionStatus.COMPLETE],
  [`${MissionStatus.BLOCKED}:${MissionStatus.VERIFYING}`]: [MissionStatus.RUNNING, MissionStatus.VERIFYING],
  [`${MissionStatus.BLOCKED}:${MissionStatus.COMPLETE}`]: [MissionStatus.RUNNING, MissionStatus.VERIFYING, MissionStatus.COMPLETE],
  [`${MissionStatus.RUNNING}:${MissionStatus.COMPLETE}`]: [MissionStatus.VERIFYING, MissionStatus.COMPLETE],
});

function transitionMissionToward(mission, target) {
  if (!mission) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'mission is required');
  if (mission.status === target) return { ...mission };
  const direct = (() => {
    try { return transitionMission(mission, target); } catch { return null; }
  })();
  if (direct) return direct;
  const path = PATHS[`${mission.status}:${target}`];
  if (!path) {
    throw new V4Error(ErrorCode.STATE_TRANSITION_INVALID, `Cannot reconcile mission ${mission.status} -> ${target}`, {
      missionId: mission.id,
      from: mission.status,
      to: target,
    });
  }
  return path.reduce((current, status) => transitionMission(current, status), mission);
}

function reconcileMission(store, missionId) {
  const mission = store.get('mission', missionId);
  if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${missionId}`);
  const tasks = store.list('task').filter((task) => task.missionId === missionId);
  const target = deriveMissionStatus(tasks);
  if (mission.status === target) return mission;
  return store.update('mission', missionId, (current) => transitionMissionToward(current, target));
}

module.exports = {
  deriveMissionStatus,
  transitionMissionToward,
  reconcileMission,
};
