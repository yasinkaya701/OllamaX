'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { inspectRepository } = require('./repo-inspector');
const { buildContextPack } = require('./context-pack');

const DEFAULT_MEMORY_LIMIT = 8;
const DEFAULT_MEMORY_BYTES = 32 * 1024;

function boundMemory(records, options = {}) {
  const limit = Number.isInteger(options.limit) ? Math.max(0, Math.min(32, options.limit)) : DEFAULT_MEMORY_LIMIT;
  const maxBytes = Number.isInteger(options.maxBytes) ? Math.max(1024, options.maxBytes) : DEFAULT_MEMORY_BYTES;
  const output = [];
  let bytes = 0;
  for (const record of records || []) {
    if (output.length >= limit) break;
    const item = {
      id: record.id,
      kind: record.kind,
      content: record.content,
      confidence: record.confidence,
      source: record.source || null,
      sourceHash: record.sourceHash || null,
      updatedAt: record.updatedAt,
      score: record.score,
    };
    const size = Buffer.byteLength(JSON.stringify(item), 'utf8');
    if (bytes + size > maxBytes) continue;
    output.push(item);
    bytes += size;
  }
  return { records: output, totalBytes: bytes, limit, maxBytes };
}

function refreshWorkspaceContext(options = {}) {
  const rootPath = options.rootPath;
  const workspaceId = String(options.workspaceId || '').trim();
  if (!rootPath) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'rootPath is required');
  if (!workspaceId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'workspaceId is required');

  const previousInventory = options.previousInventory || null;
  const inventory = inspectRepository(rootPath, {
    previousInventory,
    maxFileBytes: options.maxFileBytes,
    maxFiles: options.maxFiles,
    extraPatterns: options.extraPatterns,
  });

  let invalidatedMemory = 0;
  if (
    options.memory &&
    previousInventory &&
    previousInventory.inventoryHash &&
    previousInventory.inventoryHash !== inventory.inventoryHash &&
    typeof options.memory.invalidateHashMismatch === 'function'
  ) {
    invalidatedMemory = options.memory.invalidateHashMismatch(workspaceId, inventory.inventoryHash);
  }

  const fileContext = buildContextPack(rootPath, inventory, {
    kind: options.kind || 'task',
    query: options.query,
    paths: options.paths,
    categories: options.categories,
    maxFiles: options.maxContextFiles,
    maxBytes: options.maxContextBytes,
  });

  let memoryContext = { records: [], totalBytes: 0, limit: 0, maxBytes: 0 };
  if (options.memory && typeof options.memory.search === 'function') {
    const records = options.memory.search(options.query || '', {
      workspaceId,
      limit: options.maxMemoryRecords || DEFAULT_MEMORY_LIMIT,
      touch: options.touchMemory !== false,
    });
    memoryContext = boundMemory(records, {
      limit: options.maxMemoryRecords,
      maxBytes: options.maxMemoryBytes,
    });
  }

  return {
    workspaceId,
    inventory,
    context: {
      ...fileContext,
      memory: memoryContext.records,
      memoryBytes: memoryContext.totalBytes,
    },
    invalidatedMemory,
  };
}

module.exports = {
  DEFAULT_MEMORY_LIMIT,
  DEFAULT_MEMORY_BYTES,
  boundMemory,
  refreshWorkspaceContext,
};
