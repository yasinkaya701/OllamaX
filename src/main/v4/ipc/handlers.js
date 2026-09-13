'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { toSerializable, serializeError } = require('./serializers');

const CHANNELS = Object.freeze({
  WORKSPACE_OPEN: 'ipc:4:workspace:open',
  WORKSPACE_REFRESH: 'ipc:4:workspace:refresh',
  WORKSPACE_LIST: 'ipc:4:workspace:list',
  SKILL_LIST: 'ipc:4:skill:list',
  MISSION_CREATE_FROM_SKILL: 'ipc:4:mission:create-from-skill',
  MISSION_LIST: 'ipc:4:mission:list',
  MISSION_TASKS: 'ipc:4:mission:tasks',
  MISSION_RUN_READY: 'ipc:4:mission:run-ready',
  MISSION_CANCEL: 'ipc:4:mission:cancel',
  MEMORY_SEARCH: 'ipc:4:memory:search',
  MEMORY_ADD: 'ipc:4:memory:add',
  VERIFICATION_RUN: 'ipc:4:verification:run',
  APPROVAL_LIST: 'ipc:4:approval:list',
  APPROVAL_RESOLVE: 'ipc:4:approval:resolve',
});

function wrap(handler) {
  return async (_event, input = {}) => {
    try {
      const data = await handler(input || {});
      return { ok: true, data: toSerializable(data) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  };
}

function registerV4IpcHandlers(ipcMain, service, options = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'registerV4IpcHandlers requires ipcMain.handle');
  }
  if (!service) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'registerV4IpcHandlers requires application service');
  const approvalBroker = options.approvalBroker || null;

  function requireApprovalBroker() {
    service.assertEnabled();
    if (!approvalBroker) throw new V4Error(ErrorCode.NOT_FOUND, 'approval broker is unavailable');
    return approvalBroker;
  }

  const registrations = [
    [CHANNELS.WORKSPACE_OPEN, (input) => service.openWorkspace(input)],
    [CHANNELS.WORKSPACE_REFRESH, (input) => service.refreshWorkspace(input)],
    [CHANNELS.WORKSPACE_LIST, () => service.listWorkspaces()],
    [CHANNELS.SKILL_LIST, () => service.listSkills()],
    [CHANNELS.MISSION_CREATE_FROM_SKILL, (input) => service.createMissionFromSkill(input)],
    [CHANNELS.MISSION_LIST, (input) => service.listMissions(input)],
    [CHANNELS.MISSION_TASKS, (input) => service.missionTasks(input)],
    [CHANNELS.MISSION_RUN_READY, (input) => service.runReadyBatch(input)],
    [CHANNELS.MISSION_CANCEL, (input) => service.cancelMission(input)],
    [CHANNELS.MEMORY_SEARCH, (input) => service.memorySearch(input)],
    [CHANNELS.MEMORY_ADD, (input) => service.memoryAdd(input)],
    [CHANNELS.VERIFICATION_RUN, (input) => service.verifyTask(input)],
    [CHANNELS.APPROVAL_LIST, () => requireApprovalBroker().listPending()],
    [CHANNELS.APPROVAL_RESOLVE, (input) => {
      if (!input.requestId || typeof input.requestId !== 'string') {
        throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'approval requestId is required');
      }
      return requireApprovalBroker().resolve(input.requestId, input.approved === true, {
        actor: 'user',
        note: input.note || null,
      });
    }],
  ];

  for (const [channel, handler] of registrations) ipcMain.handle(channel, wrap(handler));
  return { channels: registrations.map(([channel]) => channel) };
}

module.exports = {
  CHANNELS,
  wrap,
  registerV4IpcHandlers,
};
