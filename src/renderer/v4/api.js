(function initV4Api(globalScope) {
  'use strict';

  const CHANNELS = Object.freeze({
    workspaceOpen: 'ipc:4:workspace:open',
    workspaceRefresh: 'ipc:4:workspace:refresh',
    workspaceList: 'ipc:4:workspace:list',
    skillList: 'ipc:4:skill:list',
    missionCreateFromSkill: 'ipc:4:mission:create-from-skill',
    missionList: 'ipc:4:mission:list',
    missionTasks: 'ipc:4:mission:tasks',
    missionRunReady: 'ipc:4:mission:run-ready',
    missionCancel: 'ipc:4:mission:cancel',
    worktreeCreate: 'ipc:4:worktree:create',
    worktreeInspect: 'ipc:4:worktree:inspect',
    worktreeRemove: 'ipc:4:worktree:remove',
    deliveryPrepare: 'ipc:4:delivery:prepare',
    missionCost: 'ipc:4:insights:mission-cost',
    diagnosticBundle: 'ipc:4:diagnostics:bundle',
    memorySearch: 'ipc:4:memory:search',
    memoryAdd: 'ipc:4:memory:add',
    verificationRun: 'ipc:4:verification:run',
  });

  class V4ApiError extends Error {
    constructor(error) {
      super((error && error.message) || 'Krevyx v4 IPC request failed');
      this.name = 'V4ApiError';
      this.code = (error && error.code) || 'V4_IPC_ERROR';
      this.details = error && error.details ? error.details : null;
    }
  }

  function createV4Api(bridge) {
    const ipc = bridge || (globalScope && globalScope.krevyxApi);
    if (!ipc || typeof ipc.invoke !== 'function') throw new Error('Krevyx IPC bridge is unavailable');

    async function invoke(channel, payload) {
      const response = await ipc.invoke(channel, payload || {});
      if (!response || response.ok !== true) throw new V4ApiError(response && response.error);
      return response.data;
    }

    return Object.freeze({
      channels: CHANNELS,
      workspaces: Object.freeze({
        open: (input) => invoke(CHANNELS.workspaceOpen, input),
        refresh: (input) => invoke(CHANNELS.workspaceRefresh, input),
        list: () => invoke(CHANNELS.workspaceList, {}),
      }),
      skills: Object.freeze({
        list: () => invoke(CHANNELS.skillList, {}),
      }),
      missions: Object.freeze({
        createFromSkill: (input) => invoke(CHANNELS.missionCreateFromSkill, input),
        list: (input) => invoke(CHANNELS.missionList, input),
        tasks: (input) => invoke(CHANNELS.missionTasks, input),
        runReady: (input) => invoke(CHANNELS.missionRunReady, input),
        cancel: (input) => invoke(CHANNELS.missionCancel, input),
      }),
      worktrees: Object.freeze({
        create: (input) => invoke(CHANNELS.worktreeCreate, input),
        inspect: (input) => invoke(CHANNELS.worktreeInspect, input),
        remove: (input) => invoke(CHANNELS.worktreeRemove, input),
      }),
      delivery: Object.freeze({
        prepare: (input) => invoke(CHANNELS.deliveryPrepare, input),
      }),
      insights: Object.freeze({
        missionCost: (input) => invoke(CHANNELS.missionCost, input),
        diagnostics: (input) => invoke(CHANNELS.diagnosticBundle, input),
      }),
      memory: Object.freeze({
        search: (input) => invoke(CHANNELS.memorySearch, input),
        add: (input) => invoke(CHANNELS.memoryAdd, input),
      }),
      verification: Object.freeze({
        run: (input) => invoke(CHANNELS.verificationRun, input),
      }),
    });
  }

  const exported = { CHANNELS, V4ApiError, createV4Api };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4Api = exported;
})(typeof window !== 'undefined' ? window : globalThis);
