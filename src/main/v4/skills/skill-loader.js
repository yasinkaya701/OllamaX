'use strict';

const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const MAX_SKILL_FILE_BYTES = 256 * 1024;

function loadSkillDirectory(registry, directoryPath, options = {}) {
  if (!registry || typeof registry.register !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'skill loader requires a registry');
  }
  const root = path.resolve(directoryPath || '');
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new V4Error(ErrorCode.NOT_FOUND, `skill directory not found: ${root}`, { cause: error.message });
  }

  const maxBytes = Number.isInteger(options.maxFileBytes)
    ? Math.max(1024, options.maxFileBytes)
    : MAX_SKILL_FILE_BYTES;
  const loaded = [];
  const rejected = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.name.endsWith('.json')) continue;
    const filePath = path.join(root, entry.name);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      rejected.push({ file: entry.name, reason: 'not-regular-file' });
      continue;
    }
    try {
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        rejected.push({ file: entry.name, reason: 'not-regular-file' });
        continue;
      }
      if (stat.size > maxBytes) {
        rejected.push({ file: entry.name, reason: 'file-too-large', size: stat.size });
        continue;
      }
      const realRoot = fs.realpathSync(root);
      const realFile = fs.realpathSync(filePath);
      const relative = path.relative(realRoot, realFile);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        rejected.push({ file: entry.name, reason: 'path-boundary' });
        continue;
      }
      const parsed = JSON.parse(fs.readFileSync(realFile, 'utf8'));
      const manifest = registry.register(parsed, `file:${realFile}`);
      loaded.push({ id: manifest.id, version: manifest.version, file: entry.name });
    } catch (error) {
      rejected.push({
        file: entry.name,
        reason: error && error.code ? error.code : 'invalid-skill',
        message: error && error.message ? error.message : String(error),
      });
    }
  }

  return { loaded, rejected };
}

module.exports = {
  MAX_SKILL_FILE_BYTES,
  loadSkillDirectory,
};
