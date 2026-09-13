'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTask } = require('../src/shared/v4/contracts');
const { EntityType, TaskStatus } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createAgentRuntime } = require('../src/main/v4/runtime/agent-runtime');
const { ToolId } = require('../src/main/v4/tools/tool-registry');

function createSkillTask(overrides = {}) {
  return createTask({
    missionId: 'mission-policy',
    title: 'Scoped task',
    status: TaskStatus.READY,
    inputs: [{
      kind: 'skill-runtime',
      skillId: 'bounded-skill',
      skillVersion: '1.0.0',
      allowedTools: [ToolId.FS_WRITE],
      writeScopes: ['src'],
      toolPlan: [],
      verificationGates: [],
    }],
    ...overrides,
  });
}

describe('v4 skill runtime policy', () => {
  test('undeclared tool is rejected before executor invocation', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-policy-'));
    try {
      const store = createStore({ rootDir: root });
      const task = createSkillTask();
      store.put(EntityType.TASK, task);
      const executor = jest.fn(async () => ({ result: { ok: true }, argumentsDigest: 'digest' }));
      const runtime = createAgentRuntime({ store, toolExecutor: executor });
      const result = await runtime.runTask({
        taskId: task.id,
        rootPath: root,
        steps: [{ toolId: ToolId.SHELL_RUN, args: { executable: 'node', args: [] } }],
      });
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/does not allow tool/);
      expect(executor).not.toHaveBeenCalled();
      expect(store.get(EntityType.TASK, task.id).status).toBe(TaskStatus.FAILED);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('file mutation outside declared write scope is rejected before execution', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-scope-'));
    try {
      const store = createStore({ rootDir: root });
      const task = createSkillTask();
      store.put(EntityType.TASK, task);
      const executor = jest.fn(async () => ({ result: { ok: true }, argumentsDigest: 'digest' }));
      const runtime = createAgentRuntime({ store, toolExecutor: executor });
      const result = await runtime.runTask({
        taskId: task.id,
        rootPath: root,
        steps: [{ toolId: ToolId.FS_WRITE, args: { path: 'docs/out.md', content: 'x' } }],
      });
      expect(result.ok).toBe(false);
      expect(result.error.message).toMatch(/exceeds declared scope/);
      expect(executor).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('declared tool inside write scope reaches the executor', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-scope-ok-'));
    try {
      const store = createStore({ rootDir: root });
      const task = createSkillTask();
      store.put(EntityType.TASK, task);
      const executor = jest.fn(async () => ({ result: { ok: true }, argumentsDigest: 'digest' }));
      const runtime = createAgentRuntime({ store, toolExecutor: executor });
      const result = await runtime.runTask({
        taskId: task.id,
        rootPath: root,
        steps: [{ toolId: ToolId.FS_WRITE, args: { path: 'src/out.js', content: 'x' } }],
      });
      expect(result.ok).toBe(true);
      expect(executor).toHaveBeenCalledTimes(1);
      expect(store.get(EntityType.TASK, task.id).status).toBe(TaskStatus.VERIFYING);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
