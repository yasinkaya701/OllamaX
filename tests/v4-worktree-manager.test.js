'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  createManagedWorktree,
  inspectManagedWorktree,
  removeManagedWorktree,
} = require('../src/main/v4/tools/worktree-manager');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-worktree-'));
  git(root, ['init']);
  git(root, ['config', 'user.email', 'test@krevyx.local']);
  git(root, ['config', 'user.name', 'Krevyx Test']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n', 'utf8');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-m', 'fixture']);
  return root;
}

describe('v4 managed worktree isolation', () => {
  test('creates detached worktree and refuses to remove it while dirty', async () => {
    const root = createRepo();
    const sandboxRoot = path.join(root, '.test-worktrees');
    try {
      const baseSha = git(root, ['rev-parse', 'HEAD']);
      const created = await createManagedWorktree({
        rootPath: root,
        sandboxRoot,
        id: 'mission-123',
      });
      expect(created.detached).toBe(true);
      expect(created.baseSha).toBe(baseSha);
      expect(created.headSha).toBe(baseSha);
      expect(created.path.startsWith(sandboxRoot)).toBe(true);

      const clean = await inspectManagedWorktree({ sandboxRoot, id: 'mission-123' });
      expect(clean.exists).toBe(true);
      expect(clean.dirty).toBe(false);

      fs.writeFileSync(path.join(created.path, 'changed.txt'), 'dirty\n', 'utf8');
      const dirty = await inspectManagedWorktree({ sandboxRoot, id: 'mission-123' });
      expect(dirty.dirty).toBe(true);
      await expect(removeManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-123' }))
        .rejects.toThrow(/dirty managed worktree/);

      fs.unlinkSync(path.join(created.path, 'changed.txt'));
      const removed = await removeManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-123' });
      expect(removed.removed).toBe(true);
      expect(fs.existsSync(created.path)).toBe(false);
    } finally {
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup best effort */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
