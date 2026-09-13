'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createMission,
  createTask,
} = require('../src/shared/v4/contracts');
const {
  AgentRunStatus,
  EntityType,
  TaskStatus,
} = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createRunJournal } = require('../src/main/v4/observability/run-journal');
const { createAgentRuntime } = require('../src/main/v4/runtime/agent-runtime');
const { createMissionRunner } = require('../src/main/v4/runtime/mission-runner');
const { PermissionProfile } = require('../src/main/v4/tools/policy-engine');
const { ToolId } = require('../src/main/v4/tools/tool-registry');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function fixture(root) {
  const stateDir = path.join(root, '.state');
  const store = createStore({ rootDir: stateDir });
  const journal = createRunJournal({ rootDir: stateDir });
  const runtime = createAgentRuntime({ store, journal });
  return { store, journal, runtime };
}

function putTask(store, input = {}) {
  const task = createTask({
    missionId: input.missionId || 'mission_fixture',
    title: input.title || 'Task',
    dependencies: input.dependencies || [],
    id: input.id,
  });
  if (input.writeScopes) task.writeScopes = input.writeScopes;
  store.put(EntityType.TASK, task);
  return task;
}

describe('v4 agent runtime', () => {
  test('successful implementation persists AgentRun/ToolCall and moves task only to VERIFYING', async () => {
    const root = tempDir('krevyx-v4-agent-success-');
    try {
      const { store, journal, runtime } = fixture(root);
      const task = putTask(store, { id: 'task_success' });
      const result = await runtime.runTask({
        taskId: task.id,
        rootPath: root,
        permissionProfile: PermissionProfile.EDIT,
        steps: [
          { toolId: ToolId.FS_WRITE, args: { path: 'src/result.txt', content: 'implemented' } },
        ],
      });

      expect(result.ok).toBe(true);
      expect(result.run.status).toBe(AgentRunStatus.COMPLETE);
      expect(result.task.status).toBe(TaskStatus.VERIFYING);
      expect(fs.readFileSync(path.join(root, 'src/result.txt'), 'utf8')).toBe('implemented');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].argumentsDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.toolCalls[0].permissionDecision).toBe('allow');
      expect(store.list(EntityType.AGENT_RUN)).toHaveLength(1);
      expect(store.list(EntityType.TOOL_CALL)).toHaveLength(1);

      const events = journal.readAll().entries.map((entry) => entry.type);
      expect(events).toEqual(expect.arrayContaining([
        'agent-run.started',
        'tool-call.started',
        'tool-call.finished',
        'agent-run.complete',
      ]));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('approval denial fails the run without deleting the target', async () => {
    const root = tempDir('krevyx-v4-agent-deny-');
    try {
      const { store, runtime } = fixture(root);
      fs.writeFileSync(path.join(root, 'keep.txt'), 'keep');
      const task = putTask(store, { id: 'task_deny' });
      const result = await runtime.runTask({
        taskId: task.id,
        rootPath: root,
        permissionProfile: PermissionProfile.DEVELOPER,
        steps: [
          { toolId: ToolId.FS_DELETE, args: { path: 'keep.txt' } },
        ],
      });

      expect(result.ok).toBe(false);
      expect(result.run.status).toBe(AgentRunStatus.FAILED);
      expect(result.task.status).toBe(TaskStatus.FAILED);
      expect(result.error).toEqual(expect.objectContaining({ code: 'V4_VALIDATION_FAILED' }));
      expect(fs.existsSync(path.join(root, 'keep.txt'))).toBe(true);
      expect(result.toolCalls[0].exitState.ok).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('cancel propagates through AbortSignal and terminates the active shell process', async () => {
    const root = tempDir('krevyx-v4-agent-cancel-');
    try {
      const { store, runtime } = fixture(root);
      const task = putTask(store, { id: 'task_cancel' });
      const started = Date.now();
      const promise = runtime.runTask({
        taskId: task.id,
        rootPath: root,
        permissionProfile: PermissionProfile.DEVELOPER,
        timeoutMs: 10000,
        steps: [
          {
            toolId: ToolId.SHELL_RUN,
            args: { executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] },
          },
        ],
      });

      const active = runtime.listActiveRuns();
      expect(active).toHaveLength(1);
      expect(runtime.cancel(active[0].runId, 'test-cancel').ok).toBe(true);
      const result = await promise;

      expect(result.cancelled).toBe(true);
      expect(result.run.status).toBe(AgentRunStatus.CANCELLED);
      expect(result.task.status).toBe(TaskStatus.CANCELLED);
      expect(Date.now() - started).toBeLessThan(3000);
      expect(runtime.listActiveRuns()).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('v4 mission runner', () => {
  test('scheduler runs independent ready tasks in one bounded parallel batch', async () => {
    const root = tempDir('krevyx-v4-mission-runner-');
    try {
      const { store, runtime } = fixture(root);
      const mission = createMission({ id: 'mission_parallel', title: 'Parallel', goal: 'Run independent tasks' });
      store.put(EntityType.MISSION, mission);
      putTask(store, { id: 'task_a', missionId: mission.id, writeScopes: ['src/a'] });
      putTask(store, { id: 'task_b', missionId: mission.id, writeScopes: ['src/b'] });

      const missionRunner = createMissionRunner({ store, agentRuntime: runtime });
      const batch = await missionRunner.runReadyBatch({
        missionId: mission.id,
        rootPath: root,
        permissionProfile: PermissionProfile.OBSERVE,
        maxParallel: 2,
        planForTask: () => ([{ toolId: ToolId.FS_LIST, args: { path: '.' } }]),
      });

      expect(new Set(batch.selectedTaskIds)).toEqual(new Set(['task_a', 'task_b']));
      expect(batch.results).toHaveLength(2);
      expect(batch.results.every((result) => result.ok)).toBe(true);
      expect(store.get(EntityType.TASK, 'task_a').status).toBe(TaskStatus.VERIFYING);
      expect(store.get(EntityType.TASK, 'task_b').status).toBe(TaskStatus.VERIFYING);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
