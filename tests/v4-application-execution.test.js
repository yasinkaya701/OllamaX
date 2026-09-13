'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask } = require('../src/shared/v4/contracts');
const { EntityType, TaskStatus } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createV4ApplicationService } = require('../src/main/v4/ipc/application-service');
const { PermissionProfile } = require('../src/main/v4/tools/policy-engine');
const { ToolId } = require('../src/main/v4/tools/tool-registry');

describe('v4 application execution boundary', () => {
  test('run-ready derives root and plan from durable task state and ignores renderer approval', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-app-exec-'));
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
      const mission = createMission({ workspaceId: workspace.id, title: 'Audit', goal: 'Audit repository' });
      const task = createTask({
        missionId: mission.id,
        title: 'Inspect',
        status: TaskStatus.READY,
        inputs: [{
          kind: 'skill-runtime',
          skillId: 'repo-audit',
          skillVersion: '1.0.0',
          allowedTools: [ToolId.GIT_STATUS],
          toolPlan: [{ toolId: ToolId.GIT_STATUS, args: {} }],
          writeScopes: [],
          verificationGates: [{ id: 'clean', type: 'git-clean', required: true }],
        }],
      });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);

      const missionRunner = { runReadyBatch: jest.fn(async (input) => input) };
      const verificationEngine = { runTaskVerification: jest.fn(async (input) => input) };
      const service = createV4ApplicationService({
        store,
        missionRunner,
        verificationEngine,
        configReader: () => ({ features: { v4Workspace: true } }),
      });

      const run = await service.runReadyBatch({
        missionId: mission.id,
        rootPath: '/attacker/root',
        approval: { approved: true },
        permissionProfile: PermissionProfile.TRUSTED_AUTOMATION,
      });
      expect(run.rootPath).toBe(root);
      expect(run.approval).toBeNull();
      expect(run.approvalProvider).toBeNull();
      expect(run.planForTask(task)).toEqual([{ toolId: ToolId.GIT_STATUS, args: {} }]);
      expect(run.getWriteScopes(task)).toEqual([]);

      const verify = await service.verifyTask({
        taskId: task.id,
        rootPath: '/attacker/root',
        gates: [{ type: 'command', executable: 'sh' }],
      });
      expect(verify.rootPath).toBe(root);
      expect(verify.gates).toEqual([{ id: 'clean', type: 'git-clean', required: true }]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('tasks without a durable tool plan fail closed', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-no-plan-'));
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
      const mission = createMission({ workspaceId: workspace.id, title: 'Fix', goal: 'Fix bug' });
      const task = createTask({
        missionId: mission.id,
        title: 'Implement',
        status: TaskStatus.READY,
        inputs: [{ kind: 'skill-runtime', skillId: 'bug-fix', skillVersion: '1.0.0', allowedTools: [ToolId.FS_WRITE], toolPlan: [], writeScopes: ['src'], verificationGates: [] }],
      });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);
      const missionRunner = { runReadyBatch: jest.fn(async (input) => input.planForTask(task)) };
      const service = createV4ApplicationService({
        store,
        missionRunner,
        configReader: () => ({ features: { v4Workspace: true } }),
      });
      await expect(service.runReadyBatch({ missionId: mission.id })).rejects.toThrow(/planner-generated steps/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
