'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

describe('v4 IPC bridge bootstrap', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadBridge(enabled, root) {
    const handlers = new Map();
    jest.doMock('electron', () => ({
      ipcMain: {
        handle: (channel, handler) => handlers.set(channel, handler),
        eventNames: () => [],
        listeners: () => [],
      },
      app: { getPath: () => root },
    }));
    jest.doMock('../src/main/config/config-store', () => ({
      readConfig: () => ({ features: { v4Workspace: enabled } }),
    }));
    const bridge = require('../src/main/ipc-bridge');
    return { bridge, handlers };
  }

  test('disabled feature registers no ipc:4 handlers and creates no v4 directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-bridge-off-'));
    try {
      const { bridge, handlers } = loadBridge(false, root);
      bridge.registerIpcBridge();
      expect(Array.from(handlers.keys()).some((channel) => channel.startsWith('ipc:4:'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'Krevyx', 'v4'))).toBe(false);
      expect(bridge.getV4Runtime()).toEqual({ enabled: false, reason: 'feature-disabled' });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('enabled feature registers the explicit ipc:4 handler surface', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-bridge-on-'));
    try {
      const { bridge, handlers } = loadBridge(true, root);
      bridge.registerIpcBridge();
      const v4Channels = Array.from(handlers.keys()).filter((channel) => channel.startsWith('ipc:4:'));
      expect(v4Channels.length).toBeGreaterThanOrEqual(10);
      expect(v4Channels).toContain('ipc:4:workspace:open');
      expect(v4Channels).toContain('ipc:4:verification:run');
      expect(bridge.getV4Runtime().enabled).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
