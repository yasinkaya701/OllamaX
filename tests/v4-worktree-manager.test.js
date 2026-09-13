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
  test('creates detached worktree, fingerprints untracked content and refuses dirty removal', async () => {
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
      expect(clean.baseSha).toBe(baseSha);
      expect(clean.hasChanges).toBe(false);
      expect(clean.dirty).toBe(false);

      const changedPath = path.join(created.path, 'changed.txt');
      fs.writeFileSync(changedPath, 'dirty-one\n', 'utf8');
      const dirty = await inspectManagedWorktree({ sandboxRoot, id: 'mission-123' });
      expect(dirty.dirty).toBe(true);
      expect(dirty.hasChanges).toBe(true);
      expect(dirty.changedFiles).toContain('changed.txt');
      expect(dirty.untrackedManifest).toHaveLength(1);
      expect(dirty.untrackedManifest[0].hash).toMatch(/^[a-f0-9]{64}$/);
      expect(dirty.diffHash).toMatch(/^[a-f0-9]{64}$/);

      fs.writeFileSync(changedPath, 'dirty-two\n', 'utf8');
      const changedAgain = await inspectManagedWorktree({ sandboxRoot, id: 'mission-123' });
      expect(changedAgain.diffHash).not.toBe(dirty.diffHash);
      expect(changedAgain.untrackedManifest[0].hash).not.toBe(dirty.untrackedManifest[0].hash);

      await expect(removeManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-123' }))
        .rejects.toThrow(/mission changes/);

      fs.unlinkSync(changedPath);
      const removed = await removeManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-123' });
      expect(removed.removed).toBe(true);
      expect(fs.existsSync(created.path)).toBe(false);
    } finally {
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup best effort */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('refuses removal after mission changes were committed in detached worktree', async () => {
    const root = createRepo();
    const sandboxRoot = path.join(root, '.test-worktrees');
    try {
      const created = await createManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-commit' });
      git(created.path, ['config', 'user.email', 'test@krevyx.local']);
      git(created.path, ['config', 'user.name', 'Krevyx Test']);
      fs.writeFileSync(path.join(created.path, 'README.md'), '# changed\n', 'utf8');
      git(created.path, ['add', 'README.md']);
      git(created.path, ['commit', '-m', 'mission change']);

      const inspected = await inspectManagedWorktree({ sandboxRoot, id: 'mission-commit' });
      expect(inspected.dirty).toBe(false);
      expect(inspected.hasChanges).toBe(true);
      expect(inspected.headSha).not.toBe(inspected.baseSha);
      expect(inspected.changedFiles).toContain('README.md');
      expect(inspected.diffPreview).toContain('# changed');
      await expect(removeManagedWorktree({ rootPath: root, sandboxRoot, id: 'mission-commit' }))
        .rejects.toThrow(/mission changes/);
    } finally {
      try { git(root, ['worktree', 'remove', '--force', path.join(sandboxRoot, 'mission-commit')]); } catch { /* cleanup */ }
      try { git(root, ['worktree', 'prune']); } catch { /* cleanup */ }
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
