'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const DEFAULT_TIMEOUT_MS = 30000;
const DIFF_PREVIEW_BYTES = 64 * 1024;

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
    timer.unref?.();
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

function metadataPath(sandboxRoot, worktreeId) {
  const root = path.resolve(sandboxRoot);
  return path.join(root, '.krevyx-meta', `${safeId(worktreeId)}.json`);
}

function writeMetadata(sandboxRoot, metadata) {
  const filePath = metadataPath(sandboxRoot, metadata.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  return filePath;
}

function readMetadata(sandboxRoot, worktreeId) {
  const filePath = metadataPath(sandboxRoot, worktreeId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && parsed.id === safeId(worktreeId) ? parsed : null;
  } catch {
    return null;
  }
}

function parseChangedFiles(statusText, nameStatusText) {
  const files = new Set();
  for (const line of String(nameStatusText || '').split(/\r?\n/).filter(Boolean)) {
    const parts = line.split('\t').filter(Boolean);
    for (const item of parts.slice(1)) files.add(item.trim());
  }
  for (const line of String(statusText || '').split(/\r?\n/).filter(Boolean)) {
    if (!line.startsWith('?? ')) continue;
    files.add(line.slice(3).trim());
  }
  return Array.from(files).filter(Boolean).sort();
}

function parseUntrackedFiles(statusText) {
  return String(statusText || '').split(/\r?\n/)
    .filter((line) => line.startsWith('?? '))
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .sort();
}

function safeChangedPath(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  const relative = path.relative(resolvedRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `changed path escapes worktree: ${relativePath}`);
  }
  return target;
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function buildUntrackedManifest(root, statusText) {
  const manifest = [];
  for (const relativePath of parseUntrackedFiles(statusText)) {
    const filePath = safeChangedPath(root, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) {
      manifest.push({
        path: relativePath,
        kind: 'symlink',
        size: 0,
        hash: crypto.createHash('sha256').update(`symlink:${fs.readlinkSync(filePath)}`).digest('hex'),
      });
      continue;
    }
    if (!stat.isFile()) {
      manifest.push({ path: relativePath, kind: 'other', size: stat.size, hash: null });
      continue;
    }
    manifest.push({ path: relativePath, kind: 'file', size: stat.size, hash: await hashFile(filePath) });
  }
  return manifest;
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
  const createdAt = new Date().toISOString();
  writeMetadata(sandboxRoot, { id, rootPath, path: target, baseRef, baseSha, createdAt });
  return {
    id,
    rootPath,
    path: target,
    baseRef,
    baseSha,
    headSha,
    detached: true,
    createdAt,
  };
}

async function inspectManagedWorktree(input = {}) {
  const id = safeId(input.id);
  const target = targetPath(input.sandboxRoot, id);
  const metadata = readMetadata(input.sandboxRoot, id);
  if (!fs.existsSync(target)) return { exists: false, id, path: target, baseSha: metadata && metadata.baseSha || null };
  const headSha = (await runGit(target, ['rev-parse', 'HEAD'])).stdout.trim();
  const status = (await runGit(target, ['status', '--porcelain', '--untracked-files=all'])).stdout;
  const baseSha = metadata && metadata.baseSha ? metadata.baseSha : headSha;
  const nameStatus = (await runGit(target, ['diff', '--name-status', baseSha, '--', '.'])).stdout;
  const diffStat = (await runGit(target, ['diff', '--stat', baseSha, '--', '.'])).stdout.trim();
  const diff = (await runGit(target, ['diff', '--no-ext-diff', '--unified=2', baseSha, '--', '.'])).stdout;
  const changedFiles = parseChangedFiles(status, nameStatus);
  const untrackedManifest = await buildUntrackedManifest(target, status);
  const workingTreeDirty = Boolean(status.trim());
  const hasChanges = workingTreeDirty || headSha !== baseSha;
  const fingerprint = JSON.stringify({ baseSha, headSha, trackedDiff: diff, untracked: untrackedManifest });
  return {
    exists: true,
    id,
    path: target,
    baseSha,
    headSha,
    hasChanges,
    dirty: workingTreeDirty,
    status: status.split(/\r?\n/).filter(Boolean).slice(0, 200),
    changedFiles,
    untrackedManifest,
    diffStat,
    diffHash: crypto.createHash('sha256').update(fingerprint).digest('hex'),
    diffPreview: diff.slice(0, DIFF_PREVIEW_BYTES),
    diffTruncated: Buffer.byteLength(diff) > DIFF_PREVIEW_BYTES,
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
  if (current.hasChanges) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'refusing to remove managed worktree with mission changes', {
      id: current.id,
      baseSha: current.baseSha,
      headSha: current.headSha,
      changedFiles: current.changedFiles,
      status: current.status,
    });
  }
  await runGit(rootPath, ['worktree', 'remove', current.path], { timeoutMs: input.timeoutMs });
  const metaPath = metadataPath(sandboxRoot, current.id);
  try { fs.unlinkSync(metaPath); } catch { /* metadata cleanup is best effort */ }
  return { removed: true, id: current.id, path: current.path };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DIFF_PREVIEW_BYTES,
  safeId,
  runGit,
  targetPath,
  metadataPath,
  readMetadata,
  parseChangedFiles,
  parseUntrackedFiles,
  safeChangedPath,
  hashFile,
  buildUntrackedManifest,
  assertGitRepository,
  createManagedWorktree,
  inspectManagedWorktree,
  removeManagedWorktree,
};
