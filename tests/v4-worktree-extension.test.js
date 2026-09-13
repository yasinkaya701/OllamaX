'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { EntityType } = require('../src/shared/v4/enums');
const { createWorkspace, createMission } = require('../src/shared/v4/contracts');
const {
  MAX_DIFF_PREVIEW_BYTES,
  createWorktreeExtension,
} = require('../src/main/v4/tools/worktree-extension');

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

function fixtureRuntime(root) {
  const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
  const mission = createMission({ workspaceId: workspace.id, title: 'Fix', goal: 'Fix safely' });
  const entities = new Map([
    [`${EntityType.WORKSPACE}:${workspace.id}`, workspace],
    [`${EntityType.MISSION}:${mission.id}`, mission],
  ]);
  let resolver = null;
  const journal = { append: jest.fn() };
  return {
    workspace,
    mission,
    journal,
    getResolver: () => resolver,
    runtime: {
      store: { get: (type, id) => entities.get(`${type}:${id}`) || null },
      journal,
      service: {
        assertEnabled: () => true,
        setExecutionRootResolver: (fn) => { resolver = fn; },
      },
    },
  };
}

describe('v4 mission worktree extension', () => {
  test('lazily creates one isolated root for concurrent mission resolution', async () => {
    const root = createRepo();
    const sandboxRoot = path.join(root, '.extension-worktrees');
    const fixture = fixtureRuntime(root);

    try {
      const extension = createWorktreeExtension({ runtime: fixture.runtime, sandboxRoot });
      expect(extension.installIsolation()).toBe(true);
      const resolver = fixture.getResolver();
      expect(typeof resolver).toBe('function');
      const [planningRoot, executionRoot] = await Promise.all([
        resolver({ mission: fixture.mission, workspace: fixture.workspace, purpose: 'planning' }),
        resolver({ mission: fixture.mission, workspace: fixture.workspace, purpose: 'execution' }),
      ]);
      expect(planningRoot).toBe(executionRoot);
      expect(fs.existsSync(planningRoot)).toBe(true);
      expect(git(planningRoot, ['rev-parse', 'HEAD'])).toBe(git(root, ['rev-parse', 'HEAD']));
      expect(fixture.journal.append.mock.calls.filter(([event]) => event.type === 'worktree.created')).toHaveLength(1);

      const inspected = await extension.inspect({ missionId: fixture.mission.id });
      expect(inspected.exists).toBe(true);
      expect(inspected.dirty).toBe(false);
      const removed = await extension.remove({ missionId: fixture.mission.id });
      expect(removed.removed).toBe(true);
    } finally {
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup best effort */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('reviews committed, dirty and untracked isolation changes without leaking untracked content', async () => {
    const root = createRepo();
    const sandboxRoot = path.join(root, '.review-worktrees');
    const fixture = fixtureRuntime(root);

    try {
      const extension = createWorktreeExtension({ runtime: fixture.runtime, sandboxRoot });
      extension.installIsolation();
      const isolatedRoot = await fixture.getResolver()({ mission: fixture.mission, workspace: fixture.workspace, purpose: 'planning' });

      fs.writeFileSync(path.join(isolatedRoot, 'README.md'), '# committed change\n', 'utf8');
      git(isolatedRoot, ['add', 'README.md']);
      git(isolatedRoot, ['commit', '-m', 'isolated commit']);
      fs.writeFileSync(path.join(isolatedRoot, 'README.md'), '# committed change\n# dirty change\n', 'utf8');
      fs.writeFileSync(path.join(isolatedRoot, 'private-untracked.txt'), 'do-not-leak-this-content\n', 'utf8');

      const review = await extension.review({ missionId: fixture.mission.id });
      expect(review.exists).toBe(true);
      expect(review.aheadCommits).toBe(1);
      expect(review.dirty).toBe(true);
      expect(review.changedFiles).toContain('README.md');
      expect(review.changedFiles).toContain('private-untracked.txt');
      expect(review.untrackedFiles).toEqual(['private-untracked.txt']);
      expect(review.diffPreview).toContain('committed change');
      expect(review.diffPreview).toContain('dirty change');
      expect(review.diffPreview).not.toContain('do-not-leak-this-content');
      expect(Buffer.byteLength(review.diffPreview, 'utf8')).toBeLessThanOrEqual(MAX_DIFF_PREVIEW_BYTES);
      expect(review.baseSha).toBe(git(root, ['rev-parse', 'HEAD']));
      expect(review.headSha).toBe(git(isolatedRoot, ['rev-parse', 'HEAD']));
    } finally {
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup best effort */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
