'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask, createAgentRun, createVerificationRun, createEvidence } = require('../src/shared/v4/contracts');
const { EntityType } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createDeliveryService } = require('../src/main/v4/tools/delivery-service');
const { inspectRepository } = require('../src/main/v4/workspace/repo-inspector');

describe('v4 delivery service', () => {
  test('accepts verification only for the current isolated repository hash', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-delivery-'));
    const repo = path.join(root, 'repo');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'fix.js'), 'module.exports = 1;\n', 'utf8');
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: repo });
      const mission = createMission({ workspaceId: workspace.id, title: 'Fix fixture', goal: 'ship fix' });
      const task = createTask({ missionId: mission.id, title: 'Implement' });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);
      store.put(EntityType.AGENT_RUN, createAgentRun({ taskId: task.id }));
      const verifiedHash = inspectRepository(repo).inventoryHash;
      store.put(EntityType.VERIFICATION_RUN, createVerificationRun({
        subjectId: task.id,
        subjectHash: verifiedHash,
        status: 'PASSED',
      }));
      store.put(EntityType.EVIDENCE, createEvidence({ subjectType: 'task', subjectId: task.id, hash: 'e'.repeat(64) }));

      const service = createDeliveryService({
        store,
        inspectWorktree: async () => ({
          exists: true,
          path: repo,
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

      const current = await service.prepareMission({ missionId: mission.id });
      expect(current.delivery.changedFiles).toEqual(['src/fix.js']);
      expect(current.evidence.agentRunCount).toBe(1);
      expect(current.evidence.verificationPassed).toBe(1);
      expect(current.evidence.verificationStale).toBe(0);
      expect(current.pullRequestArtifact.body).toContain('src/fix.js');

      fs.writeFileSync(path.join(repo, 'src', 'fix.js'), 'module.exports = 2;\n', 'utf8');
      const stale = await service.prepareMission({ missionId: mission.id });
      expect(stale.evidence.verificationPassed).toBe(0);
      expect(stale.evidence.verificationStale).toBe(1);
      expect(stale.evidence.currentInventoryHash).not.toBe(verifiedHash);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
