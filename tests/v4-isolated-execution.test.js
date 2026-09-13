'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask } = require('../src/shared/v4/contracts');
const { EntityType, TaskStatus } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createV4ApplicationService } = require('../src/main/v4/ipc/application-service');
const { ToolId } = require('../src/main/v4/tools/tool-registry');

describe('v4 isolated execution root', () => {
  test('run and verification use the main-process mission root resolver', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-isolated-'));
    const source = path.join(root, 'source');
    const isolated = path.join(root, 'isolated');
    fs.mkdirSync(source);
    fs.mkdirSync(isolated);
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: source });
      const mission = createMission({ workspaceId: workspace.id, title: 'Fix', goal: 'Fix safely' });
      const task = createTask({
        missionId: mission.id,
        title: 'Implement',
        status: TaskStatus.READY,
        inputs: [{
          kind: 'skill-runtime',
          skillId: 'bug-fix',
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

      const purposes = [];
      const missionRunner = { runReadyBatch: jest.fn(async (input) => input) };
      const verificationEngine = { runTaskVerification: jest.fn(async (input) => input) };
      const service = createV4ApplicationService({
        store,
        missionRunner,
        verificationEngine,
        configReader: () => ({ features: { v4Workspace: true } }),
      });
      service.setExecutionRootResolver(async ({ mission: resolvedMission, workspace: resolvedWorkspace, purpose }) => {
        expect(resolvedMission.id).toBe(mission.id);
        expect(resolvedWorkspace.id).toBe(workspace.id);
        purposes.push(purpose);
        return isolated;
      });

      const run = await service.runReadyBatch({ missionId: mission.id });
      const verify = await service.verifyTask({ taskId: task.id });
      expect(run.rootPath).toBe(path.resolve(isolated));
      expect(verify.rootPath).toBe(path.resolve(isolated));
      expect(purposes).toEqual(['execution', 'verification']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
