'use strict';

const {
  inferPackageManager,
  buildSkillInput,
} = require('../src/renderer/v4/execution-controls');

describe('v4 renderer execution helpers', () => {
  test('infers pnpm from inventory', () => {
    expect(inferPackageManager({ inventory: { files: [{ path: 'pnpm-lock.yaml' }] } })).toBe('pnpm');
  });

  test('builds required built-in skill inputs', () => {
    const skill = { inputKeys: ['problem', 'packageManager', 'testScript', 'lintScript'] };
    const state = { inventory: { files: [{ path: 'pnpm-lock.yaml' }] } };
    expect(buildSkillInput(skill, 'startup crash', state)).toEqual({
      problem: 'startup crash',
      packageManager: 'pnpm',
      testScript: 'test:ci',
      lintScript: 'lint',
    });
  });
});
