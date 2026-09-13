'use strict';

const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { relativeWithin } = require('./ignore-rules');

const DEFAULT_MAX_CONTEXT_FILES = 24;
const DEFAULT_MAX_CONTEXT_BYTES = 256 * 1024;

function normalizeTerms(query) {
  return String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 32);
}

function queryBoost(file, terms) {
  if (!terms.length) return 0;
  const haystack = `${file.path} ${file.language || ''} ${file.category || ''}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) score += term.includes('/') || term.includes('.') ? 35 : 15;
  }
  return score;
}

function isProbablyBinary(buffer) {
  const length = Math.min(buffer.length, 4096);
  for (let index = 0; index < length; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function buildContextPack(rootPath, inventory, options = {}) {
  if (!inventory || !Array.isArray(inventory.files)) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'buildContextPack requires a repository inventory');
  }
  const resolvedRoot = path.resolve(rootPath || inventory.rootPath || '');
  const maxFiles = Number.isInteger(options.maxFiles) && options.maxFiles > 0
    ? options.maxFiles
    : DEFAULT_MAX_CONTEXT_FILES;
  const maxBytes = Number.isInteger(options.maxBytes) && options.maxBytes > 0
    ? options.maxBytes
    : DEFAULT_MAX_CONTEXT_BYTES;
  const terms = normalizeTerms(options.query);
  const explicit = new Set((options.paths || []).map((item) => String(item).replace(/\\/g, '/')));
  const categories = new Set(options.categories || []);

  const ranked = inventory.files
    .filter((file) => !explicit.size || explicit.has(file.path))
    .filter((file) => !categories.size || categories.has(file.category))
    .map((file) => ({ file, score: (file.relevance || 0) + queryBoost(file, terms) + (explicit.has(file.path) ? 1000 : 0) }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));

  const entries = [];
  const omitted = [];
  let totalBytes = 0;

  for (const rankedFile of ranked) {
    if (entries.length >= maxFiles) {
      omitted.push({ path: rankedFile.file.path, reason: 'file-budget' });
      continue;
    }
    if (totalBytes + rankedFile.file.size > maxBytes) {
      omitted.push({ path: rankedFile.file.path, reason: 'byte-budget' });
      continue;
    }

    const absolutePath = path.join(resolvedRoot, rankedFile.file.path);
    const relative = relativeWithin(resolvedRoot, absolutePath);
    if (relative == null || relative !== rankedFile.file.path) {
      omitted.push({ path: rankedFile.file.path, reason: 'path-boundary' });
      continue;
    }

    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch {
      omitted.push({ path: rankedFile.file.path, reason: 'missing' });
      continue;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) {
      omitted.push({ path: rankedFile.file.path, reason: 'not-regular-file' });
      continue;
    }

    let buffer;
    try {
      buffer = fs.readFileSync(absolutePath);
    } catch {
      omitted.push({ path: rankedFile.file.path, reason: 'unreadable' });
      continue;
    }
    if (isProbablyBinary(buffer)) {
      omitted.push({ path: rankedFile.file.path, reason: 'binary' });
      continue;
    }

    entries.push({
      path: rankedFile.file.path,
      hash: rankedFile.file.hash,
      language: rankedFile.file.language,
      category: rankedFile.file.category,
      size: buffer.length,
      content: buffer.toString('utf8'),
    });
    totalBytes += buffer.length;
  }

  return {
    id: `context:${inventory.inventoryHash || 'unknown'}:${options.kind || 'task'}`,
    kind: options.kind || 'task',
    query: options.query || null,
    sourceInventoryHash: inventory.inventoryHash || null,
    createdAt: new Date().toISOString(),
    limits: { maxFiles, maxBytes },
    totalFiles: entries.length,
    totalBytes,
    includedPaths: entries.map((entry) => entry.path),
    entries,
    omitted,
  };
}

module.exports = {
  DEFAULT_MAX_CONTEXT_FILES,
  DEFAULT_MAX_CONTEXT_BYTES,
  normalizeTerms,
  queryBoost,
  isProbablyBinary,
  buildContextPack,
};
