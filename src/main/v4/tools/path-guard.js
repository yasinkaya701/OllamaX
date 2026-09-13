'use strict';

const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const SECRET_BASENAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^(?:credentials|secrets?)(?:\.[^.]+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:pem|p12|pfx|key|keystore)$/i,
];
const SECRET_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg']);

function normalizeRoot(rootPath) {
  if (!rootPath || typeof rootPath !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'workspace root is required');
  }
  return path.resolve(rootPath);
}

function relativeInside(rootPath, targetPath) {
  const root = normalizeRoot(rootPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(root, target);
  if (relative === '') return '';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return relative.replace(/\\/g, '/');
}

function isSecretLike(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] || '';
  return segments.some((segment) => SECRET_SEGMENTS.has(segment))
    || SECRET_BASENAME_PATTERNS.some((pattern) => pattern.test(basename));
}

function resolveWorkspacePath(rootPath, inputPath, options = {}) {
  const root = normalizeRoot(rootPath);
  const raw = String(inputPath || '').trim();
  if (!raw) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'workspace-relative path is required');
  const target = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(root, raw);
  const relative = relativeInside(root, target);
  if (relative == null) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `path escapes workspace: ${raw}`, { root, inputPath: raw });
  }
  if (options.allowRoot !== true && relative === '') {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'workspace root itself is not a valid file target');
  }
  if (options.allowSecrets !== true && isSecretLike(relative)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `secret-like path is protected: ${relative}`, {
      relativePath: relative,
      protected: true,
    });
  }
  return { root, target, relative };
}

function assertNoSymlinkEscape(rootPath, targetPath, options = {}) {
  const root = normalizeRoot(rootPath);
  const allowMissingLeaf = options.allowMissingLeaf === true;
  const relative = relativeInside(root, targetPath);
  if (relative == null) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'target is outside workspace');
  }
  if (!relative) return true;

  const parts = relative.split('/').filter(Boolean);
  let cursor = root;
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    if (!fs.existsSync(cursor)) {
      if (allowMissingLeaf) return true;
      throw new V4Error(ErrorCode.NOT_FOUND, `path does not exist: ${relative}`);
    }
    const stat = fs.lstatSync(cursor);
    if (!stat.isSymbolicLink()) continue;
    const real = fs.realpathSync(cursor);
    if (relativeInside(root, real) == null) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `symlink escapes workspace: ${relative}`, {
        symlink: cursor,
        resolved: real,
      });
    }
  }
  return true;
}

function secureWorkspacePath(rootPath, inputPath, options = {}) {
  const resolved = resolveWorkspacePath(rootPath, inputPath, options);
  assertNoSymlinkEscape(rootPath, resolved.target, {
    allowMissingLeaf: options.allowMissingLeaf === true,
  });
  return resolved;
}

module.exports = {
  SECRET_BASENAME_PATTERNS,
  SECRET_SEGMENTS,
  normalizeRoot,
  relativeInside,
  isSecretLike,
  resolveWorkspacePath,
  assertNoSymlinkEscape,
  secureWorkspacePath,
};
