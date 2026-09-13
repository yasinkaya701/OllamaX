'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const hooks = require('../src/main/agents/agent-hooks');
const configStore = require('../src/main/config/config-store');
const {
  CURRENT_SCHEMA_VERSION,
  migrateConfig,
} = require('../src/main/config/config-migrations');
const {
  isFeatureEnabled,
  normalizeFeatures,
  withFeature,
} = require('../src/main/config/feature-flags');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err && err.code !== 'ESRCH';
  }
}

describe('v4 Wave 0 smoke', () => {
  test('current config schema and default-off flag are safe', () => {
    const cfg = configStore.defaultConfig();
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(cfg.schemaVersion).toBe(4);
    expect(normalizeFeatures(cfg).v4Workspace).toBe(false);
    expect(isFeatureEnabled(cfg, 'v4Workspace')).toBe(false);
  });

  test('feature flag only enables on explicit boolean true', () => {
    const base = { schemaVersion: 4 };
    const enabled = withFeature(base, 'v4Workspace', true);
    expect(isFeatureEnabled(enabled, 'v4Workspace')).toBe(true);
    expect(isFeatureEnabled(withFeature(enabled, 'v4Workspace', false), 'v4Workspace')).toBe(false);
  });

  test('legacy config migrates through v3 to current schema with v4 disabled', () => {
    const migrated = migrateConfig({
      settings: { theme: 'dark' },
      agents: [],
      workspaces: [],
      history: [],
    });
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.features.v4Workspace).toBe(false);
  });

  test('critical Wave 0 modules expose expected contracts', () => {
    expect(typeof hooks.runHooks).toBe('function');
    expect(typeof hooks.terminateProcessTree).toBe('function');
    expect(typeof configStore.readConfig).toBe('function');
    expect(typeof configStore.updateConfig).toBe('function');
  });
});

describe('v4 Wave 0 child-process teardown', () => {
  test('timed-out hook terminates descendant process on POSIX', async () => {
    if (process.platform === 'win32') return;

    const dir = tempDir('krevyx-v4-wave0-');
    const childPidFile = path.join(dir, 'child.pid');
    fs.writeFileSync(
      path.join(dir, 'krevyx-hooks.json'),
      JSON.stringify({
        'task-start': [`sleep 60 & echo $! > "${childPidFile}"; wait`],
      }),
    );

    try {
      const result = await hooks.runHooks(
        'task-start',
        { workingDir: dir, agentId: 'wave0-test', taskId: 'teardown' },
        { timeoutMs: 200 },
      );
      expect(result).toHaveLength(1);
      expect(result[0].ok).toBe(false);
      expect(fs.existsSync(childPidFile)).toBe(true);

      const pid = Number(fs.readFileSync(childPidFile, 'utf8').trim());
      expect(Number.isInteger(pid)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(processExists(pid)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 10000);
});
