'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { Capability, Risk, evaluatePermission, assertApproved } = require('./policy-engine');
const { secureWorkspacePath } = require('./path-guard');

const DEFAULT_MAX_READ_BYTES = 2 * 1024 * 1024;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

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

function readFile(options = {}) {
  const permission = permissionFor(options, Capability.FS_READ, Risk.LOW);
  const resolved = secureWorkspacePath(options.rootPath, options.path, { allowSecrets: false });
  const stat = fs.statSync(resolved.target);
  if (!stat.isFile()) throw new V4Error(ErrorCode.VALIDATION_FAILED, `not a regular file: ${resolved.relative}`);
  const maxBytes = Number.isInteger(options.maxBytes) ? Math.max(1, options.maxBytes) : DEFAULT_MAX_READ_BYTES;
  if (stat.size > maxBytes) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `file exceeds read limit: ${resolved.relative}`, {
      size: stat.size,
      maxBytes,
    });
  }
  const buffer = fs.readFileSync(resolved.target);
  if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `binary file requires an explicit binary tool: ${resolved.relative}`);
  }
  return {
    path: resolved.relative,
    content: buffer.toString(options.encoding || 'utf8'),
    size: buffer.length,
    hash: sha256(buffer),
    permission,
  };
}

function listDirectory(options = {}) {
  const permission = permissionFor(options, Capability.FS_READ, Risk.LOW);
  const resolved = secureWorkspacePath(options.rootPath, options.path || '.', {
    allowRoot: true,
    allowSecrets: false,
  });
  const stat = fs.statSync(resolved.target);
  if (!stat.isDirectory()) throw new V4Error(ErrorCode.VALIDATION_FAILED, `not a directory: ${resolved.relative}`);
  const entries = fs.readdirSync(resolved.target, { withFileTypes: true })
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : entry.isSymbolicLink() ? 'symlink' : 'other',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { path: resolved.relative, entries, permission };
}

function atomicReplace(target, buffer) {
  const dir = path.dirname(target);
  const temp = path.join(dir, `.${path.basename(target)}.krevyx-${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(temp, buffer);
  try {
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      if (process.platform === 'win32' && fs.existsSync(target)) {
        fs.rmSync(target, { force: true });
        fs.renameSync(temp, target);
      } else {
        throw error;
      }
    } finally {
      if (fs.existsSync(temp)) fs.rmSync(temp, { force: true });
    }
  }
}

function writeFile(options = {}) {
  const permission = permissionFor(options, Capability.FS_WRITE, Risk.MEDIUM);
  if (typeof options.content !== 'string' && !Buffer.isBuffer(options.content)) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'writeFile content must be string or Buffer');
  }
  const resolved = secureWorkspacePath(options.rootPath, options.path, {
    allowSecrets: false,
    allowMissingLeaf: true,
  });
  const exists = fs.existsSync(resolved.target);
  let previousHash = null;
  if (exists) {
    const stat = fs.lstatSync(resolved.target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `write target must be a regular file: ${resolved.relative}`);
    }
    const previous = fs.readFileSync(resolved.target);
    previousHash = sha256(previous);
    if (typeof options.expectedHash !== 'string' || !options.expectedHash) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `expectedHash is required when overwriting: ${resolved.relative}`, {
        currentHash: previousHash,
      });
    }
    if (options.expectedHash !== previousHash) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `stale write rejected: ${resolved.relative}`, {
        expectedHash: options.expectedHash,
        currentHash: previousHash,
      });
    }
  } else if (options.expectedHash) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `expectedHash supplied for a new file: ${resolved.relative}`);
  }

  fs.mkdirSync(path.dirname(resolved.target), { recursive: true });
  secureWorkspacePath(options.rootPath, path.dirname(resolved.relative) || '.', {
    allowRoot: true,
    allowSecrets: false,
    allowMissingLeaf: true,
  });
  const buffer = Buffer.isBuffer(options.content) ? options.content : Buffer.from(options.content, options.encoding || 'utf8');
  atomicReplace(resolved.target, buffer);
  return {
    path: resolved.relative,
    created: !exists,
    previousHash,
    hash: sha256(buffer),
    size: buffer.length,
    permission,
  };
}

function deleteFile(options = {}) {
  const permission = permissionFor(options, Capability.FS_DELETE, Risk.HIGH);
  const resolved = secureWorkspacePath(options.rootPath, options.path, { allowSecrets: false });
  const stat = fs.lstatSync(resolved.target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `delete target must be a regular file: ${resolved.relative}`);
  }
  const current = fs.readFileSync(resolved.target);
  const currentHash = sha256(current);
  if (options.expectedHash && options.expectedHash !== currentHash) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `stale delete rejected: ${resolved.relative}`, {
      expectedHash: options.expectedHash,
      currentHash,
    });
  }
  fs.unlinkSync(resolved.target);
  return { path: resolved.relative, deleted: true, hash: currentHash, permission };
}

module.exports = {
  DEFAULT_MAX_READ_BYTES,
  sha256,
  readFile,
  listDirectory,
  writeFile,
  deleteFile,
};
