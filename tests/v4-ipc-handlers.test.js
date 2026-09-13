'use strict';

const { CHANNELS, registerV4IpcHandlers } = require('../src/main/v4/ipc/handlers');

describe('v4 IPC handlers', () => {
  test('registers only ipc:4 channels and serializes success/errors', async () => {
    const handlers = new Map();
    const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
    const service = {
      openWorkspace: (input) => ({ id: 'ws-1', name: input.name }),
      refreshWorkspace: () => ({ refreshed: true }),
      listWorkspaces: () => [],
      listSkills: () => [],
      createMissionFromSkill: () => ({ mission: { id: 'm-1' } }),
      listMissions: () => [],
      missionTasks: () => [],
      runReadyBatch: async () => ({ results: [] }),
      cancelMission: () => ({ ok: true }),
      memorySearch: () => [],
      memoryAdd: () => { throw new Error('memory failed'); },
      verifyTask: async () => ({ ok: true }),
    };

    const registered = registerV4IpcHandlers(ipcMain, service);
    expect(registered.channels).toHaveLength(Object.keys(CHANNELS).length);
    expect(registered.channels.every((channel) => channel.startsWith('ipc:4:'))).toBe(true);

    const opened = await handlers.get(CHANNELS.WORKSPACE_OPEN)(null, { name: 'Fixture' });
    expect(opened).toEqual({ ok: true, data: { id: 'ws-1', name: 'Fixture' } });

    const failed = await handlers.get(CHANNELS.MEMORY_ADD)(null, {});
    expect(failed.ok).toBe(false);
    expect(failed.error.message).toBe('memory failed');
  });
});
