'use strict';

const { MissionStatus, TaskStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const MISSION_TRANSITIONS = new Map([
  [MissionStatus.DRAFT, new Set([MissionStatus.PLANNING, MissionStatus.CANCELLED])],
  [MissionStatus.PLANNING, new Set([MissionStatus.READY, MissionStatus.BLOCKED, MissionStatus.FAILED, MissionStatus.CANCELLED])],
  [MissionStatus.READY, new Set([MissionStatus.RUNNING, MissionStatus.BLOCKED, MissionStatus.CANCELLED])],
  [MissionStatus.RUNNING, new Set([MissionStatus.BLOCKED, MissionStatus.VERIFYING, MissionStatus.FAILED, MissionStatus.CANCELLED])],
  [MissionStatus.BLOCKED, new Set([MissionStatus.READY, MissionStatus.RUNNING, MissionStatus.FAILED, MissionStatus.CANCELLED])],
  [MissionStatus.VERIFYING, new Set([MissionStatus.COMPLETE, MissionStatus.RUNNING, MissionStatus.BLOCKED, MissionStatus.FAILED, MissionStatus.CANCELLED])],
  [MissionStatus.COMPLETE, new Set()],
  [MissionStatus.FAILED, new Set()],
  [MissionStatus.CANCELLED, new Set()],
]);

const TASK_TRANSITIONS = new Map([
  [TaskStatus.PENDING, new Set([TaskStatus.READY, TaskStatus.BLOCKED, TaskStatus.CANCELLED])],
  [TaskStatus.READY, new Set([TaskStatus.RUNNING, TaskStatus.BLOCKED, TaskStatus.CANCELLED])],
  [TaskStatus.RUNNING, new Set([TaskStatus.BLOCKED, TaskStatus.VERIFYING, TaskStatus.FAILED, TaskStatus.CANCELLED])],
  [TaskStatus.BLOCKED, new Set([TaskStatus.READY, TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELLED])],
  [TaskStatus.VERIFYING, new Set([TaskStatus.COMPLETE, TaskStatus.RUNNING, TaskStatus.BLOCKED, TaskStatus.FAILED, TaskStatus.CANCELLED])],
  [TaskStatus.COMPLETE, new Set()],
  [TaskStatus.FAILED, new Set()],
  [TaskStatus.CANCELLED, new Set()],
]);

function assertKnownState(table, state, subject) {
  if (!table.has(state)) {
    throw new V4Error(ErrorCode.STATE_TRANSITION_INVALID, `Unknown ${subject} state: ${state}`, {
      subject,
      state,
    });
  }
}

function canTransition(table, from, to) {
  if (from === to) return true;
  const targets = table.get(from);
  return Boolean(targets && targets.has(to));
}

function transition(table, subject, entity, to, metadata = {}) {
  if (!entity || typeof entity !== 'object') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, `${subject} entity is required`);
  }
  assertKnownState(table, entity.status, subject);
  assertKnownState(table, to, subject);
  if (!canTransition(table, entity.status, to)) {
    throw new V4Error(
      ErrorCode.STATE_TRANSITION_INVALID,
      `Illegal ${subject} transition: ${entity.status} -> ${to}`,
      { subject, id: entity.id || null, from: entity.status, to },
    );
  }
  if (entity.status === to) return { ...entity };
  const next = { ...entity, status: to };
  if (subject === 'mission') next.updatedAt = metadata.at || new Date().toISOString();
  return next;
}

function canTransitionMission(from, to) {
  return canTransition(MISSION_TRANSITIONS, from, to);
}

function canTransitionTask(from, to) {
  return canTransition(TASK_TRANSITIONS, from, to);
}

function transitionMission(mission, to, metadata) {
  return transition(MISSION_TRANSITIONS, 'mission', mission, to, metadata);
}

function transitionTask(task, to, metadata) {
  return transition(TASK_TRANSITIONS, 'task', task, to, metadata);
}

module.exports = {
  MISSION_TRANSITIONS,
  TASK_TRANSITIONS,
  canTransitionMission,
  canTransitionTask,
  transitionMission,
  transitionTask,
};
