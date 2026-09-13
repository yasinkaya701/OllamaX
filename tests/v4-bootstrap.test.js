'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { bootstrapV4Runtime } = require('../src/main/v4/bootstrap');

describe('v4 runtime bootstrap', () => {
  test('feature-disabled bootstrap does not create runtime state', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-bootstrap-off-'));
    const rootDir = path.join(parent, 'state');
    try {
      const result = bootstrapV4Runtime({
        rootDir,
        configReader: () => ({ features: { v4Workspace: false } }),
      });
      expect(result).toEqual({ enabled: false, reason: 'feature-disabled' });
      expect(fs.existsSync(rootDir)).toBe(false);
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  test('enabled bootstrap creates one runtime stack and registers ipc:4 handlers', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-bootstrap-on-'));
    const channels = new Map();
    try {
      const result = bootstrapV4Runtime({
        rootDir,
        configReader: () => ({ features: { v4Workspace: true } }),
        ipcMain: { handle: (channel, handler) => channels.set(channel, handler) },
      });
      expect(result.enabled).toBe(true);
      expect(result.service).toBeTruthy();
      expect(result.skillRegistry.list().length).toBeGreaterThanOrEqual(3);
      expect(Array.from(channels.keys()).every((channel) => channel.startsWith('ipc:4:'))).toBe(true);
      expect(fs.existsSync(path.join(rootDir, 'v4-state.json'))).toBe(true);
      expect(fs.existsSync(path.join(rootDir, 'v4-memory.json'))).toBe(true);
      expect(fs.existsSync(path.join(rootDir, 'v4-run-journal.ndjson'))).toBe(true);
    } finally {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });
});
