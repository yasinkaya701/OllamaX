'use strict';

const crypto = require('crypto');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const fsTools = require('./fs-tools');
const gitTools = require('./git-tools');
const { runShell } = require('./shell-runner');
const { Capability, Risk } = require('./policy-engine');

const ToolId = Object.freeze({
  FS_READ: 'fs.read',
  FS_LIST: 'fs.list',
  FS_WRITE: 'fs.write',
  FS_DELETE: 'fs.delete',
  SHELL_RUN: 'shell.run',
  GIT_STATUS: 'git.status',
  GIT_DIFF: 'git.diff',
  GIT_HEAD: 'git.head',
  GIT_BRANCH_CURRENT: 'git.branch.current',
  GIT_BRANCH_LIST: 'git.branch.list',
  GIT_BRANCH_CREATE: 'git.branch.create',
  GIT_STAGE: 'git.stage',
  GIT_COMMIT: 'git.commit',
});

const MANIFESTS = Object.freeze({
  [ToolId.FS_READ]: { id: ToolId.FS_READ, capability: Capability.FS_READ, risk: Risk.LOW, mutates: false },
  [ToolId.FS_LIST]: { id: ToolId.FS_LIST, capability: Capability.FS_READ, risk: Risk.LOW, mutates: false },
  [ToolId.FS_WRITE]: { id: ToolId.FS_WRITE, capability: Capability.FS_WRITE, risk: Risk.MEDIUM, mutates: true },
  [ToolId.FS_DELETE]: { id: ToolId.FS_DELETE, capability: Capability.FS_DELETE, risk: Risk.HIGH, mutates: true },
  [ToolId.SHELL_RUN]: { id: ToolId.SHELL_RUN, capability: Capability.SHELL_EXEC, risk: Risk.MEDIUM, mutates: true, dynamicCapability: true },
  [ToolId.GIT_STATUS]: { id: ToolId.GIT_STATUS, capability: Capability.GIT_READ, risk: Risk.LOW, mutates: false },
  [ToolId.GIT_DIFF]: { id: ToolId.GIT_DIFF, capability: Capability.GIT_READ, risk: Risk.LOW, mutates: false },
  [ToolId.GIT_HEAD]: { id: ToolId.GIT_HEAD, capability: Capability.GIT_READ, risk: Risk.LOW, mutates: false },
  [ToolId.GIT_BRANCH_CURRENT]: { id: ToolId.GIT_BRANCH_CURRENT, capability: Capability.GIT_READ, risk: Risk.LOW, mutates: false },
  [ToolId.GIT_BRANCH_LIST]: { id: ToolId.GIT_BRANCH_LIST, capability: Capability.GIT_READ, risk: Risk.LOW, mutates: false },
  [ToolId.GIT_BRANCH_CREATE]: { id: ToolId.GIT_BRANCH_CREATE, capability: Capability.GIT_WRITE, risk: Risk.HIGH, mutates: true },
  [ToolId.GIT_STAGE]: { id: ToolId.GIT_STAGE, capability: Capability.GIT_WRITE, risk: Risk.HIGH, mutates: true },
  [ToolId.GIT_COMMIT]: { id: ToolId.GIT_COMMIT, capability: Capability.GIT_WRITE, risk: Risk.HIGH, mutates: true },
});

function canonicalize(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Buffer.isBuffer(value)) return { $buffer: value.toString('base64') };
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return String(value);
}

function digestArguments(args) {
  const json = JSON.stringify(canonicalize(args || {}));
  return crypto.createHash('sha256').update(json).digest('hex');
}

function getManifest(toolId) {
  return MANIFESTS[toolId] || null;
}

function listTools() {
  return Object.values(MANIFESTS).map((manifest) => ({ ...manifest }));
}

function requireString(args, key) {
  if (!args || typeof args[key] !== 'string' || !args[key].trim()) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, `${key} is required`);
  }
}

function validateArgs(toolId, args = {}) {
  switch (toolId) {
    case ToolId.FS_READ:
    case ToolId.FS_LIST:
    case ToolId.FS_DELETE:
      requireString(args, 'path');
      break;
    case ToolId.FS_WRITE:
      requireString(args, 'path');
      if (typeof args.content !== 'string' && !Buffer.isBuffer(args.content)) {
        throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'content is required');
      }
      break;
    case ToolId.SHELL_RUN:
      requireString(args, 'executable');
      if (args.args !== undefined && !Array.isArray(args.args)) {
        throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'args must be an array');
      }
      break;
    case ToolId.GIT_DIFF:
      if (args.path !== undefined && typeof args.path !== 'string') {
        throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'path must be a string');
      }
      break;
    case ToolId.GIT_BRANCH_CREATE:
      requireString(args, 'branchName');
      break;
    case ToolId.GIT_STAGE:
      if (!Array.isArray(args.paths) || !args.paths.length) {
        throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'paths are required');
      }
      break;
    case ToolId.GIT_COMMIT:
      requireString(args, 'message');
      break;
    case ToolId.GIT_STATUS:
    case ToolId.GIT_HEAD:
    case ToolId.GIT_BRANCH_CURRENT:
    case ToolId.GIT_BRANCH_LIST:
      break;
    default:
      throw new V4Error(ErrorCode.NOT_FOUND, `unknown v4 tool: ${toolId}`);
  }
  return true;
}

async function executeTool(toolId, args = {}, context = {}) {
  const manifest = getManifest(toolId);
  if (!manifest) throw new V4Error(ErrorCode.NOT_FOUND, `unknown v4 tool: ${toolId}`);
  validateArgs(toolId, args);
  if (!context.rootPath) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'tool context rootPath is required');

  const common = {
    rootPath: context.rootPath,
    cwd: context.cwd || '.',
    profile: context.profile,
    approval: context.approval,
    forceApproval: context.forceApproval,
    signal: context.signal,
    timeoutMs: context.timeoutMs,
    maxOutputBytes: context.maxOutputBytes,
  };
  let result;
  switch (toolId) {
    case ToolId.FS_READ:
      result = fsTools.readFile({ ...common, ...args });
      break;
    case ToolId.FS_LIST:
      result = fsTools.listDirectory({ ...common, ...args });
      break;
    case ToolId.FS_WRITE:
      result = fsTools.writeFile({ ...common, ...args });
      break;
    case ToolId.FS_DELETE:
      result = fsTools.deleteFile({ ...common, ...args });
      break;
    case ToolId.SHELL_RUN:
      result = await runShell({ ...common, ...args });
      break;
    case ToolId.GIT_STATUS:
      result = await gitTools.status({ ...common, ...args });
      break;
    case ToolId.GIT_DIFF:
      result = await gitTools.diff({ ...common, ...args });
      break;
    case ToolId.GIT_HEAD:
      result = await gitTools.head({ ...common, ...args });
      break;
    case ToolId.GIT_BRANCH_CURRENT:
      result = await gitTools.currentBranch({ ...common, ...args });
      break;
    case ToolId.GIT_BRANCH_LIST:
      result = await gitTools.listBranches({ ...common, ...args });
      break;
    case ToolId.GIT_BRANCH_CREATE:
      result = await gitTools.createBranch({ ...common, ...args });
      break;
    case ToolId.GIT_STAGE:
      result = await gitTools.stagePaths({ ...common, ...args });
      break;
    case ToolId.GIT_COMMIT:
      result = await gitTools.commit({ ...common, ...args });
      break;
    default:
      throw new V4Error(ErrorCode.NOT_FOUND, `unknown v4 tool: ${toolId}`);
  }

  return {
    toolId,
    manifest,
    argumentsDigest: digestArguments(args),
    result,
  };
}

module.exports = {
  ToolId,
  MANIFESTS,
  canonicalize,
  digestArguments,
  getManifest,
  listTools,
  validateArgs,
  executeTool,
};
