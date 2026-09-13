'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const DEFAULT_TIMEOUT_MS = 30000;

function safeId(value) {
  const normalized = String(value || '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96);
  if (!normalized) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'managed worktree id is required');
  return normalized;
}

function runGit(rootPath, args, options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: rootPath,
      shell: false,
      windowsHide: true,
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        USERPROFILE: process.env.USERPROFILE || '',
        SystemRoot: process.env.SystemRoot || '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const cap = 1024 * 1024;
    child.stdout.on('data', (chunk) => { if (stdout.length < cap) stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { if (stderr.length < cap) stderr += chunk.toString(); });
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new V4Error(ErrorCode.VALIDATION_FAILED, `git failed to start: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new V4Error(ErrorCode.VALIDATION_FAILED, `git ${args[0]} failed`, {
          code,
          stderr: stderr.trim().slice(0, 2000),
        }));
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function targetPath(sandboxRoot, worktreeId) {
  const root = path.resolve(sandboxRoot);
  const target = path.resolve(root, safeId(worktreeId));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'managed worktree target escapes sandbox root');
  }
  return target;
}

async function assertGitRepository(rootPath) {
  const result = await runGit(rootPath, ['rev-parse', '--show-toplevel']);
  const topLevel = path.resolve(result.stdout.trim());
  if (topLevel !== path.resolve(rootPath)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'workspace root must be the git repository top level', {
      rootPath: path.resolve(rootPath),
      topLevel,
    });
  }
  return topLevel;
}

async function createManagedWorktree(input = {}) {
  const rootPath = path.resolve(String(input.rootPath || ''));
  const sandboxRoot = path.resolve(String(input.sandboxRoot || ''));
  if (!input.rootPath || !input.sandboxRoot) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'rootPath and sandboxRoot are required');
  }
  await assertGitRepository(rootPath);
  fs.mkdirSync(sandboxRoot, { recursive: true });
  const id = safeId(input.id);
  const target = targetPath(sandboxRoot, id);
  if (fs.existsSync(target)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `managed worktree already exists: ${id}`);
  }
  const baseRef = String(input.baseRef || 'HEAD').trim();
  if (!baseRef || baseRef.startsWith('-') || /[\r\n\0]/.test(baseRef)) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'invalid worktree baseRef');
  }
  const baseSha = (await runGit(rootPath, ['rev-parse', '--verify', `${baseRef}^{commit}`])).stdout.trim();
  await runGit(rootPath, ['worktree', 'add', '--detach', target, baseSha], { timeoutMs: input.timeoutMs });
  const headSha = (await runGit(target, ['rev-parse', 'HEAD'])).stdout.trim();
  return {
    id,
    rootPath,
    path: target,
    baseRef,
    baseSha,
    headSha,
    detached: true,
    createdAt: new Date().toISOString(),
  };
}

async function inspectManagedWorktree(input = {}) {
  const target = targetPath(input.sandboxRoot, input.id);
  if (!fs.existsSync(target)) return { exists: false, id: safeId(input.id), path: target };
  const headSha = (await runGit(target, ['rev-parse', 'HEAD'])).stdout.trim();
  const status = (await runGit(target, ['status', '--porcelain'])).stdout;
  return {
    exists: true,
    id: safeId(input.id),
    path: target,
    headSha,
    dirty: Boolean(status.trim()),
    status: status.split(/\r?\n/).filter(Boolean).slice(0, 200),
  };
}

async function removeManagedWorktree(input = {}) {
  const rootPath = path.resolve(String(input.rootPath || ''));
  const sandboxRoot = path.resolve(String(input.sandboxRoot || ''));
  if (!input.rootPath || !input.sandboxRoot) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'rootPath and sandboxRoot are required');
  }
  await assertGitRepository(rootPath);
  const current = await inspectManagedWorktree({ sandboxRoot, id: input.id });
  if (!current.exists) return { removed: false, reason: 'not-found', ...current };
  if (current.dirty) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'refusing to remove dirty managed worktree', {
      id: current.id,
      status: current.status,
    });
  }
  await runGit(rootPath, ['worktree', 'remove', current.path], { timeoutMs: input.timeoutMs });
  return { removed: true, id: current.id, path: current.path };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  safeId,
  runGit,
  targetPath,
  assertGitRepository,
  createManagedWorktree,
  inspectManagedWorktree,
  removeManagedWorktree,
};
