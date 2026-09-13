'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { createIgnoreMatcher } = require('../src/main/v4/workspace/ignore-rules');
const { inspectRepository, diffInventories } = require('../src/main/v4/workspace/repo-inspector');
const { buildContextPack } = require('../src/main/v4/workspace/context-pack');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

function createFixtureRepo() {
  const root = tempDir('krevyx-v4-repo-');
  write(root, '.git/HEAD', 'ref: refs/heads/main\n');
  write(root, '.gitignore', '*.tmp\n!important.tmp\n!secrets.pem\n');
  write(root, 'package.json', '{"name":"fixture","main":"src/index.js"}\n');
  write(root, 'README.md', '# Fixture\n');
  write(root, 'src/index.js', 'module.exports = function hello() { return "hello"; };\n');
  write(root, 'tests/index.test.js', 'test("ok", () => expect(true).toBe(true));\n');
  write(root, '.env', 'API_KEY=do-not-index\n');
  write(root, 'secrets.pem', 'PRIVATE KEY MATERIAL\n');
  write(root, 'node_modules/pkg/index.js', 'module.exports = 1;\n');
  write(root, 'dist/bundle.js', 'compiled();\n');
  write(root, 'ignored.tmp', 'ignore me\n');
  write(root, 'important.tmp', 'keep me\n');
  write(root, 'large.txt', 'x'.repeat(400));
  write(root, 'binary.bin', Buffer.from([0, 1, 2, 3, 4]));
  try {
    fs.symlinkSync(path.join(root, 'src/index.js'), path.join(root, 'linked.js'));
  } catch (_) {
    // Some platforms do not permit symlink creation in unprivileged tests.
  }
  return root;
}

describe('v4 ignore rules', () => {
  test('gitignore negation works but cannot override hard secret exclusions', () => {
    const matcher = createIgnoreMatcher({
      gitignoreText: '*.tmp\n!important.tmp\n!secrets.pem\n',
    });
    expect(matcher.shouldIgnore('ignored.tmp')).toBe(true);
    expect(matcher.shouldIgnore('important.tmp')).toBe(false);
    expect(matcher.shouldIgnore('secrets.pem')).toBe(true);
    expect(matcher.shouldIgnore('.env.local')).toBe(true);
    expect(matcher.shouldIgnore('node_modules/pkg/index.js')).toBe(true);
    expect(matcher.shouldIgnore('.git/config')).toBe(true);
  });
});

describe('v4 repository inventory', () => {
  test('inventory is read-only, bounded and excludes sensitive/build/dependency paths', () => {
    const root = createFixtureRepo();
    try {
      const inventory = inspectRepository(root, { maxFileBytes: 128 });
      const included = new Set(inventory.files.map((file) => file.path));
      expect(included).toContain('package.json');
      expect(included).toContain('src/index.js');
      expect(included).toContain('tests/index.test.js');
      expect(included).toContain('important.tmp');
      expect(included).not.toContain('.env');
      expect(included).not.toContain('secrets.pem');
      expect(included).not.toContain('node_modules/pkg/index.js');
      expect(included).not.toContain('dist/bundle.js');
      expect(included).not.toContain('ignored.tmp');
      expect(included).not.toContain('large.txt');
      expect(inventory.repositoryMetadata.activeBranch).toBe('main');
      expect(inventory.structure.manifests).toContain('package.json');
      expect(inventory.structure.tests).toContain('tests/index.test.js');
      expect(inventory.stats.hashedFiles).toBe(inventory.files.length);
      expect(inventory.stats.reusedHashes).toBe(0);
      expect(inventory.inventoryHash).toMatch(/^[a-f0-9]{64}$/);
      expect(inventory.excluded.some((entry) => entry.reason === 'file-too-large')).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('refresh reuses unchanged hashes and reports only the changed file', () => {
    const root = createFixtureRepo();
    try {
      const first = inspectRepository(root, { maxFileBytes: 128 });
      write(root, 'src/index.js', 'module.exports = function hello() { return "hello v4 changed"; };\n');
      const second = inspectRepository(root, { maxFileBytes: 128, previousInventory: first });
      const diff = diffInventories(first, second);

      expect(diff.changed).toEqual(['src/index.js']);
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
      expect(second.stats.hashedFiles).toBe(1);
      expect(second.stats.reusedHashes).toBe(second.files.length - 1);
      expect(second.inventoryHash).not.toBe(first.inventoryHash);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('v4 context packs', () => {
  test('context pack is inspectable and obeys explicit file and byte budgets', () => {
    const root = createFixtureRepo();
    try {
      const inventory = inspectRepository(root, { maxFileBytes: 128 });
      const pack = buildContextPack(root, inventory, {
        kind: 'task',
        paths: ['src/index.js'],
        maxFiles: 1,
        maxBytes: 128,
      });
      expect(pack.totalFiles).toBe(1);
      expect(pack.includedPaths).toEqual(['src/index.js']);
      expect(pack.entries[0].content).toContain('hello');
      expect(pack.sourceInventoryHash).toBe(inventory.inventoryHash);
      expect(pack.totalBytes).toBeLessThanOrEqual(128);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('binary content is omitted even when explicitly requested', () => {
    const root = createFixtureRepo();
    try {
      const inventory = inspectRepository(root, { maxFileBytes: 128 });
      const pack = buildContextPack(root, inventory, {
        paths: ['binary.bin'],
        maxFiles: 1,
        maxBytes: 128,
      });
      expect(pack.entries).toEqual([]);
      expect(pack.omitted).toEqual([expect.objectContaining({ path: 'binary.bin', reason: 'binary' })]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
