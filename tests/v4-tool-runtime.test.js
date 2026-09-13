'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ErrorCode } = require('../src/shared/v4/errors');
const {
  PermissionProfile,
  Decision,
  Capability,
  evaluatePermission,
} = require('../src/main/v4/tools/policy-engine');
const {
  isSecretLike,
  secureWorkspacePath,
} = require('../src/main/v4/tools/path-guard');
const {
  sha256,
  readFile,
  writeFile,
  deleteFile,
} = require('../src/main/v4/tools/fs-tools');
const {
  classifyShellOperation,
  buildSafeEnv,
  runShell,
} = require('../src/main/v4/tools/shell-runner');
const gitTools = require('../src/main/v4/tools/git-tools');
const {
  ToolId,
  executeTool,
  listTools,
} = require('../src/main/v4/tools/tool-registry');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`Expected ${code}`);
}

async function expectCodeAsync(fn, code) {
  try {
    await fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`Expected ${code}`);
}

describe('v4 permission profiles', () => {
  test('observe is read-only and developer still needs approval for destructive classes', () => {
    expect(evaluatePermission({
      profile: PermissionProfile.OBSERVE,
      capability: Capability.FS_READ,
    }).decision).toBe(Decision.ALLOW);

    expect(evaluatePermission({
      profile: PermissionProfile.OBSERVE,
      capability: Capability.FS_WRITE,
    }).decision).toBe(Decision.DENY);

    expect(evaluatePermission({
      profile: PermissionProfile.DEVELOPER,
      capability: Capability.FS_DELETE,
    }).decision).toBe(Decision.REQUIRE_APPROVAL);

    expect(evaluatePermission({
      profile: PermissionProfile.TRUSTED_AUTOMATION,
      capability: Capability.DESTRUCTIVE,
    }).decision).toBe(Decision.REQUIRE_APPROVAL);
  });

  test('secret enumeration is denied even to trusted automation by default', () => {
    expect(evaluatePermission({
      profile: PermissionProfile.TRUSTED_AUTOMATION,
      capability: Capability.SECRET_READ,
    }).decision).toBe(Decision.DENY);
  });
});

describe('v4 workspace path guard', () => {
  test('rejects traversal, secret-like files and escaping symlinks', () => {
    const root = tempDir('krevyx-v4-path-');
    const outside = tempDir('krevyx-v4-outside-');
    try {
      fs.writeFileSync(path.join(root, 'safe.txt'), 'safe');
      fs.writeFileSync(path.join(root, '.env'), 'SECRET=x');
      fs.writeFileSync(path.join(outside, 'outside.txt'), 'outside');
      expectCode(() => secureWorkspacePath(root, '../outside.txt'), ErrorCode.VALIDATION_FAILED);
      expectCode(() => secureWorkspacePath(root, '.env'), ErrorCode.VALIDATION_FAILED);
      expect(isSecretLike('nested/id_rsa')).toBe(true);

      try {
        fs.symlinkSync(outside, path.join(root, 'escape'));
        expectCode(() => secureWorkspacePath(root, 'escape/outside.txt'), ErrorCode.VALIDATION_FAILED);
      } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('v4 filesystem tools', () => {
  test('create succeeds, overwrite is optimistic-concurrency protected, delete requires approval', () => {
    const root = tempDir('krevyx-v4-fs-');
    try {
      const created = writeFile({
        rootPath: root,
        path: 'src/file.txt',
        content: 'one',
        profile: PermissionProfile.EDIT,
      });
      expect(created.created).toBe(true);
      expect(created.hash).toBe(sha256(Buffer.from('one')));

      const read = readFile({ rootPath: root, path: 'src/file.txt', profile: PermissionProfile.OBSERVE });
      expect(read.content).toBe('one');

      expectCode(() => writeFile({
        rootPath: root,
        path: 'src/file.txt',
        content: 'blind',
        profile: PermissionProfile.EDIT,
      }), ErrorCode.VALIDATION_FAILED);

      expectCode(() => writeFile({
        rootPath: root,
        path: 'src/file.txt',
        content: 'stale',
        expectedHash: '0'.repeat(64),
        profile: PermissionProfile.EDIT,
      }), ErrorCode.VALIDATION_FAILED);

      const updated = writeFile({
        rootPath: root,
        path: 'src/file.txt',
        content: 'two',
        expectedHash: read.hash,
        profile: PermissionProfile.EDIT,
      });
      expect(updated.previousHash).toBe(read.hash);

      expectCode(() => deleteFile({
        rootPath: root,
        path: 'src/file.txt',
        profile: PermissionProfile.DEVELOPER,
      }), ErrorCode.VALIDATION_FAILED);

      expect(deleteFile({
        rootPath: root,
        path: 'src/file.txt',
        expectedHash: updated.hash,
        profile: PermissionProfile.DEVELOPER,
        approval: { approved: true },
      }).deleted).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('v4 shell runner', () => {
  test('classification and environment policy fail closed for secrets/network/destructive commands', () => {
    expect(classifyShellOperation('pwd', []).capability).toBe(Capability.SHELL_READONLY);
    expect(classifyShellOperation('curl', ['https://example.com']).capability).toBe(Capability.NETWORK);
    expect(classifyShellOperation('rm', ['-rf', 'x']).capability).toBe(Capability.DESTRUCTIVE);
    expect(classifyShellOperation('printenv', []).capability).toBe(Capability.SECRET_READ);

    process.env.KREVYX_TEST_SECRET = 'never-copy-me';
    const env = buildSafeEnv({ KREVYX_TEST_SECRET: 'also-never-copy' });
    expect(env.KREVYX_TEST_SECRET).toBeUndefined();
    delete process.env.KREVYX_TEST_SECRET;
  });

  test('read-only command runs for observe; general execution needs developer; output and timeout are bounded', async () => {
    const root = tempDir('krevyx-v4-shell-');
    try {
      const pwd = await runShell({ rootPath: root, executable: 'pwd', profile: PermissionProfile.OBSERVE });
      expect(pwd.ok).toBe(true);

      await expectCodeAsync(() => runShell({
        rootPath: root,
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("ok")'],
        profile: PermissionProfile.OBSERVE,
      }), ErrorCode.VALIDATION_FAILED);

      const capped = await runShell({
        rootPath: root,
        executable: process.execPath,
        args: ['-e', 'process.stdout.write("x".repeat(10000))'],
        profile: PermissionProfile.DEVELOPER,
        maxOutputBytes: 1024,
      });
      expect(capped.ok).toBe(true);
      expect(capped.outputTruncated).toBe(true);
      expect(Buffer.byteLength(capped.stdout)).toBe(1024);

      const timed = await runShell({
        rootPath: root,
        executable: process.execPath,
        args: ['-e', 'setInterval(() => {}, 1000)'],
        profile: PermissionProfile.DEVELOPER,
        timeoutMs: 150,
      });
      expect(timed.ok).toBe(false);
      expect(timed.timedOut).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('v4 git tools and registry', () => {
  test('git reads are observe-safe while state changes require explicit developer approval', async () => {
    const root = tempDir('krevyx-v4-git-');
    try {
      execFileSync('git', ['init'], { cwd: root, stdio: 'ignore' });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
      execFileSync('git', ['config', 'user.name', 'Krevyx Test'], { cwd: root });
      fs.writeFileSync(path.join(root, 'README.md'), '# repo\n');
      execFileSync('git', ['add', 'README.md'], { cwd: root });
      execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });

      const status = await gitTools.status({ rootPath: root, profile: PermissionProfile.OBSERVE });
      expect(status.ok).toBe(true);

      await expectCodeAsync(() => gitTools.createBranch({
        rootPath: root,
        branchName: 'feature/test',
        profile: PermissionProfile.DEVELOPER,
      }), ErrorCode.VALIDATION_FAILED);

      const branch = await gitTools.createBranch({
        rootPath: root,
        branchName: 'feature/test',
        profile: PermissionProfile.DEVELOPER,
        approval: { approved: true },
      });
      expect(branch.ok).toBe(true);

      fs.writeFileSync(path.join(root, 'README.md'), '# changed\n');
      const staged = await gitTools.stagePaths({
        rootPath: root,
        paths: ['README.md'],
        profile: PermissionProfile.DEVELOPER,
        approval: { approved: true },
      });
      expect(staged.ok).toBe(true);

      const committed = await gitTools.commit({
        rootPath: root,
        message: 'test: guarded commit',
        profile: PermissionProfile.DEVELOPER,
        approval: { approved: true },
      });
      expect(committed.ok).toBe(true);

      expect(listTools().some((tool) => tool.id === ToolId.GIT_COMMIT)).toBe(true);
      const viaRegistry = await executeTool(ToolId.GIT_STATUS, {}, {
        rootPath: root,
        profile: PermissionProfile.OBSERVE,
      });
      expect(viaRegistry.toolId).toBe(ToolId.GIT_STATUS);
      expect(viaRegistry.argumentsDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(viaRegistry.result.ok).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
