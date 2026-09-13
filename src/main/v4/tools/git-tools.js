'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const {
  Capability,
  Risk,
  evaluatePermission,
  assertApproved,
} = require('./policy-engine');
const { secureWorkspacePath } = require('./path-guard');
const { runShell } = require('./shell-runner');

const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,160}$/;

function permissionFor(options, capability, risk) {
  const decision = evaluatePermission({
    profile: options.profile,
    capability,
    risk,
    forceApproval: options.forceApproval === true,
  });
  assertApproved(decision, options.approval);
  return decision;
}

async function runGitRead(options, args) {
  const permission = permissionFor(options, Capability.GIT_READ, Risk.LOW);
  const result = await runShell({
    rootPath: options.rootPath,
    cwd: options.cwd || '.',
    executable: 'git',
    args,
    profile: options.profile,
    timeoutMs: options.timeoutMs || 30000,
    maxOutputBytes: options.maxOutputBytes,
  });
  return { ...result, permission };
}

async function runGitWrite(options, args) {
  const permission = permissionFor(options, Capability.GIT_WRITE, Risk.HIGH);
  const result = await runShell({
    rootPath: options.rootPath,
    cwd: options.cwd || '.',
    executable: 'git',
    args,
    profile: options.profile,
    approval: options.approval,
    timeoutMs: options.timeoutMs || 60000,
    maxOutputBytes: options.maxOutputBytes,
  });
  return { ...result, permission };
}

async function status(options = {}) {
  return runGitRead(options, ['status', '--porcelain=v1', '--branch']);
}

async function diff(options = {}) {
  const args = ['diff', '--no-ext-diff'];
  if (options.staged) args.push('--cached');
  if (options.path) {
    const resolved = secureWorkspacePath(options.rootPath, options.path, { allowSecrets: false });
    args.push('--', resolved.relative);
  }
  return runGitRead(options, args);
}

async function head(options = {}) {
  return runGitRead(options, ['rev-parse', 'HEAD']);
}

async function currentBranch(options = {}) {
  return runGitRead(options, ['branch', '--show-current']);
}

async function listBranches(options = {}) {
  return runGitRead(options, ['branch', '--format=%(refname:short)']);
}

function validateBranchName(branchName) {
  const value = String(branchName || '').trim();
  if (!value || !SAFE_BRANCH_PATTERN.test(value) || value.includes('..') || value.startsWith('/') || value.endsWith('/')) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid branch name: ${branchName}`);
  }
  return value;
}

async function createBranch(options = {}) {
  const branch = validateBranchName(options.branchName);
  return runGitWrite(options, ['switch', '-c', branch]);
}

async function stagePaths(options = {}) {
  if (!Array.isArray(options.paths) || options.paths.length === 0) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'stagePaths requires at least one workspace path');
  }
  const paths = options.paths.map((item) => secureWorkspacePath(options.rootPath, item, {
    allowSecrets: false,
    allowMissingLeaf: true,
  }).relative);
  return runGitWrite(options, ['add', '--', ...paths]);
}

async function commit(options = {}) {
  const message = String(options.message || '').trim();
  if (!message || message.length > 500) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'commit message must be between 1 and 500 characters');
  }
  return runGitWrite(options, ['commit', '-m', message]);
}

module.exports = {
  SAFE_BRANCH_PATTERN,
  validateBranchName,
  status,
  diff,
  head,
  currentBranch,
  listBranches,
  createBranch,
  stagePaths,
  commit,
};
