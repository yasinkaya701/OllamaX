'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask, createAgentRun, createVerificationRun, createEvidence } = require('../src/shared/v4/contracts');
const { EntityType } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createDeliveryService } = require('../src/main/v4/tools/delivery-service');

describe('v4 delivery service', () => {
  test('builds review artifact from isolated delivery and durable evidence', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-delivery-'));
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
      const mission = createMission({ workspaceId: workspace.id, title: 'Fix fixture', goal: 'ship fix' });
      const task = createTask({ missionId: mission.id, title: 'Implement' });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);
      store.put(EntityType.AGENT_RUN, createAgentRun({ taskId: task.id }));
      store.put(EntityType.VERIFICATION_RUN, createVerificationRun({ subjectId: task.id, status: 'PASSED' }));
      store.put(EntityType.EVIDENCE, createEvidence({ subjectType: 'task', subjectId: task.id, hash: 'e'.repeat(64) }));

      const service = createDeliveryService({
        store,
        inspectWorktree: async () => ({
          exists: true,
          baseSha: 'a'.repeat(40),
          headSha: 'b'.repeat(40),
          hasChanges: true,
          dirty: false,
          changedFiles: ['src/fix.js'],
          diffStat: '1 file changed, 3 insertions(+)',
          diffHash: 'c'.repeat(64),
          diffTruncated: false,
        }),
      });
      const result = await service.prepareMission({ missionId: mission.id });
      expect(result.delivery.changedFiles).toEqual(['src/fix.js']);
      expect(result.evidence.agentRunCount).toBe(1);
      expect(result.evidence.verificationPassed).toBe(1);
      expect(result.pullRequestArtifact.body).toContain('src/fix.js');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
