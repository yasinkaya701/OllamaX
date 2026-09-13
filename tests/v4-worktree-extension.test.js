'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { EntityType } = require('../src/shared/v4/enums');
const { createWorkspace, createMission } = require('../src/shared/v4/contracts');
const { createWorktreeExtension } = require('../src/main/v4/tools/worktree-extension');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-worktree-ext-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@krevyx.local']);
  git(root, ['config', 'user.name', 'Krevyx Test']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n', 'utf8');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'fixture']);
  return root;
}

describe('v4 mission worktree extension', () => {
  test('lazily creates one isolated root for concurrent mission resolution', async () => {
    const root = createRepo();
    const sandboxRoot = path.join(root, '.extension-worktrees');
    const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
    const mission = createMission({ workspaceId: workspace.id, title: 'Fix', goal: 'Fix safely' });
    const entities = new Map([
      [`${EntityType.WORKSPACE}:${workspace.id}`, workspace],
      [`${EntityType.MISSION}:${mission.id}`, mission],
    ]);
    let resolver = null;
    const journal = { append: jest.fn() };
    const runtime = {
      store: { get: (type, id) => entities.get(`${type}:${id}`) || null },
      journal,
      service: {
        assertEnabled: () => true,
        setExecutionRootResolver: (fn) => { resolver = fn; },
      },
    };

    try {
      const extension = createWorktreeExtension({ runtime, sandboxRoot });
      expect(extension.installIsolation()).toBe(true);
      expect(typeof resolver).toBe('function');
      const [planningRoot, executionRoot] = await Promise.all([
        resolver({ mission, workspace, purpose: 'planning' }),
        resolver({ mission, workspace, purpose: 'execution' }),
      ]);
      expect(planningRoot).toBe(executionRoot);
      expect(fs.existsSync(planningRoot)).toBe(true);
      expect(git(planningRoot, ['rev-parse', 'HEAD'])).toBe(git(root, ['rev-parse', 'HEAD']));
      expect(journal.append.mock.calls.filter(([event]) => event.type === 'worktree.created')).toHaveLength(1);

      const inspected = await extension.inspect({ missionId: mission.id });
      expect(inspected.exists).toBe(true);
      expect(inspected.dirty).toBe(false);
      const removed = await extension.remove({ missionId: mission.id });
      expect(removed.removed).toBe(true);
    } finally {
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup best effort */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
