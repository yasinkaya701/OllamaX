'use strict';

const { MissionStatus, TaskStatus } = require('../src/shared/v4/enums');
const {
  deriveMissionStatus,
  transitionMissionToward,
} = require('../src/main/v4/missions/mission-status');

function mission(status) {
  return { id: 'm1', status, updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('v4 mission aggregate status', () => {
  test('derives lifecycle from task graph', () => {
    expect(deriveMissionStatus([{ status: TaskStatus.READY }, { status: TaskStatus.PENDING }])).toBe(MissionStatus.READY);
    expect(deriveMissionStatus([{ status: TaskStatus.VERIFYING }, { status: TaskStatus.PENDING }])).toBe(MissionStatus.VERIFYING);
    expect(deriveMissionStatus([{ status: TaskStatus.COMPLETE }, { status: TaskStatus.COMPLETE }])).toBe(MissionStatus.COMPLETE);
    expect(deriveMissionStatus([{ status: TaskStatus.BLOCKED }, { status: TaskStatus.PENDING }])).toBe(MissionStatus.BLOCKED);
  });

  test('walks legal state-machine path from draft to complete', () => {
    const result = transitionMissionToward(mission(MissionStatus.DRAFT), MissionStatus.COMPLETE);
    expect(result.status).toBe(MissionStatus.COMPLETE);
  });
});
