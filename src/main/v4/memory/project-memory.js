'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const MEMORY_SCHEMA_VERSION = 1;
const MEMORY_FILE_NAME = 'v4-memory.json';

const MemoryKind = Object.freeze({
  REPO_FACT: 'repo-fact',
  DECISION: 'decision',
  CONVENTION: 'convention',
  MISSION_OUTCOME: 'mission-outcome',
  USER_PREFERENCE: 'user-preference',
});

const MemoryStatus = Object.freeze({
  ACTIVE: 'ACTIVE',
  STALE: 'STALE',
  RETRACTED: 'RETRACTED',
});

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((token) => token.length >= 2)
    .slice(0, 128);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fingerprintRecord(input) {
  const payload = {
    workspaceId: input.workspaceId || null,
    kind: input.kind,
    content: normalizeText(input.content).toLowerCase(),
    scope: input.scope || 'workspace',
  };
  return crypto.createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function defaultState() {
  const now = nowIso();
  return {
    schemaVersion: MEMORY_SCHEMA_VERSION,
    revision: 0,
    records: {},
    meta: { createdAt: now, updatedAt: now },
  };
}

function validateKind(kind) {
  if (!Object.values(MemoryKind).includes(kind)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid memory kind: ${kind}`);
  }
}

function validateStatus(status) {
  if (!Object.values(MemoryStatus).includes(status)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid memory status: ${status}`);
  }
}

function makeRecord(input = {}) {
  validateKind(input.kind);
  const content = normalizeText(input.content);
  if (!content) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'memory content is required');
  if (!input.workspaceId || typeof input.workspaceId !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'memory workspaceId is required');
  }
  const now = input.createdAt || nowIso();
  const source = input.source && typeof input.source === 'object' ? clone(input.source) : null;
  return {
    id: input.id || `memory_${crypto.randomUUID()}`,
    workspaceId: input.workspaceId,
    kind: input.kind,
    content,
    scope: input.scope || 'workspace',
    tags: Array.isArray(input.tags) ? Array.from(new Set(input.tags.map((tag) => normalizeText(tag)).filter(Boolean))).slice(0, 32) : [],
    confidence: typeof input.confidence === 'number'
      ? Math.max(0, Math.min(1, input.confidence))
      : 1,
    source,
    sourceHash: input.sourceHash || null,
    status: input.status || MemoryStatus.ACTIVE,
    staleReason: input.staleReason || null,
    createdAt: now,
    updatedAt: input.updatedAt || now,
    lastUsedAt: input.lastUsedAt || null,
    fingerprint: input.fingerprint || null,
  };
}

function loadState(filePath) {
  if (!fs.existsSync(filePath)) return defaultState();
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!raw || typeof raw !== 'object') {
    throw new V4Error(ErrorCode.STORE_CORRUPTED, 'memory store root must be an object');
  }
  const version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > MEMORY_SCHEMA_VERSION) {
    throw new V4Error(ErrorCode.SCHEMA_UNSUPPORTED, `unsupported memory schema: ${version}`);
  }
  const next = defaultState();
  next.revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
  next.meta = raw.meta && typeof raw.meta === 'object' ? { ...next.meta, ...raw.meta } : next.meta;
  if (raw.records && typeof raw.records === 'object' && !Array.isArray(raw.records)) {
    for (const [id, record] of Object.entries(raw.records)) {
      if (!record || typeof record !== 'object') continue;
      try {
        validateKind(record.kind);
        validateStatus(record.status || MemoryStatus.ACTIVE);
        next.records[id] = { ...record, id };
      } catch {
        // Invalid historical records are ignored instead of poisoning the whole store.
      }
    }
  }
  return next;
}

function atomicWrite(filePath, backupPath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, backupPath);
    try {
      fs.renameSync(tempPath, filePath);
    } catch (error) {
      if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
      fs.renameSync(tempPath, filePath);
      if (!fs.existsSync(filePath)) throw error;
    }
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ }
    throw new V4Error(ErrorCode.STORE_WRITE_FAILED, 'failed to persist project memory', {
      cause: error && error.message ? error.message : String(error),
    });
  }
}

function scoreRecord(record, terms) {
  if (!terms.length) return 0;
  const contentTokens = new Set(tokenize(`${record.content} ${(record.tags || []).join(' ')} ${record.kind}`));
  let matches = 0;
  for (const term of terms) {
    if (contentTokens.has(term)) matches += 3;
    else if (record.content.toLowerCase().includes(term)) matches += 1;
  }
  const confidenceBoost = Math.max(0, Math.min(1, record.confidence || 0)) * 2;
  const kindBoost = record.kind === MemoryKind.DECISION || record.kind === MemoryKind.CONVENTION ? 0.5 : 0;
  return matches + confidenceBoost + kindBoost;
}

function createProjectMemory(options = {}) {
  const rootDir = options.rootDir;
  if (!rootDir || typeof rootDir !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createProjectMemory requires rootDir');
  }
  const filePath = path.join(rootDir, options.fileName || MEMORY_FILE_NAME);
  const backupPath = `${filePath}.bak`;
  let state;
  try {
    state = loadState(filePath);
  } catch (error) {
    if (fs.existsSync(backupPath)) {
      try {
        state = loadState(backupPath);
      } catch {
        throw error;
      }
    } else {
      throw error;
    }
  }
  if (!fs.existsSync(filePath)) atomicWrite(filePath, backupPath, state);

  function persist(next) {
    next.revision = state.revision + 1;
    next.meta = {
      ...next.meta,
      createdAt: next.meta && next.meta.createdAt ? next.meta.createdAt : state.meta.createdAt,
      updatedAt: nowIso(),
    };
    atomicWrite(filePath, backupPath, next);
    state = next;
  }

  function add(input) {
    const record = makeRecord(input);
    record.fingerprint = fingerprintRecord(record);
    const duplicate = Object.values(state.records).find((candidate) =>
      candidate.fingerprint === record.fingerprint && candidate.status !== MemoryStatus.RETRACTED,
    );
    if (duplicate) {
      const next = clone(state);
      const merged = {
        ...duplicate,
        tags: Array.from(new Set([...(duplicate.tags || []), ...(record.tags || [])])).slice(0, 32),
        confidence: Math.max(duplicate.confidence || 0, record.confidence || 0),
        source: record.source || duplicate.source || null,
        sourceHash: record.sourceHash || duplicate.sourceHash || null,
        status: MemoryStatus.ACTIVE,
        staleReason: null,
        updatedAt: nowIso(),
      };
      next.records[duplicate.id] = merged;
      persist(next);
      return { record: clone(merged), deduplicated: true };
    }
    const next = clone(state);
    next.records[record.id] = record;
    persist(next);
    return { record: clone(record), deduplicated: false };
  }

  function get(id) {
    const record = state.records[id];
    return record ? clone(record) : null;
  }

  function list(options = {}) {
    const includeInactive = options.includeInactive === true;
    return Object.values(state.records)
      .filter((record) => !options.workspaceId || record.workspaceId === options.workspaceId)
      .filter((record) => !options.kind || record.kind === options.kind)
      .filter((record) => includeInactive || record.status === MemoryStatus.ACTIVE)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .map(clone);
  }

  function search(query, options = {}) {
    const terms = tokenize(query);
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(50, options.limit)) : 8;
    const candidates = list({
      workspaceId: options.workspaceId,
      kind: options.kind,
      includeInactive: options.includeInactive === true,
    })
      .map((record) => ({ record, score: scoreRecord(record, terms) }))
      .filter((entry) => !terms.length || entry.score > 0)
      .sort((a, b) => b.score - a.score || String(b.record.updatedAt).localeCompare(String(a.record.updatedAt)))
      .slice(0, limit);

    if (options.touch !== false && candidates.length) {
      const next = clone(state);
      const touchedAt = nowIso();
      for (const entry of candidates) {
        if (next.records[entry.record.id]) next.records[entry.record.id].lastUsedAt = touchedAt;
      }
      persist(next);
    }
    return candidates.map((entry) => ({ ...clone(entry.record), score: entry.score }));
  }

  function setStatus(id, status, reason = null) {
    validateStatus(status);
    if (!state.records[id]) throw new V4Error(ErrorCode.NOT_FOUND, `memory record not found: ${id}`);
    const next = clone(state);
    next.records[id] = {
      ...next.records[id],
      status,
      staleReason: status === MemoryStatus.ACTIVE ? null : normalizeText(reason) || null,
      updatedAt: nowIso(),
    };
    persist(next);
    return clone(next.records[id]);
  }

  function markStale(id, reason) {
    return setStatus(id, MemoryStatus.STALE, reason || 'source changed');
  }

  function retract(id, reason) {
    return setStatus(id, MemoryStatus.RETRACTED, reason || 'retracted');
  }

  function invalidateBySource(sourceType, sourceId, reason) {
    const next = clone(state);
    let changed = 0;
    for (const record of Object.values(next.records)) {
      if (record.status !== MemoryStatus.ACTIVE) continue;
      const source = record.source || {};
      if (source.type === sourceType && source.id === sourceId) {
        record.status = MemoryStatus.STALE;
        record.staleReason = normalizeText(reason) || 'source changed';
        record.updatedAt = nowIso();
        changed += 1;
      }
    }
    if (changed) persist(next);
    return changed;
  }

  function invalidateHashMismatch(workspaceId, sourceHash, reason = 'repository inventory changed') {
    const next = clone(state);
    let changed = 0;
    for (const record of Object.values(next.records)) {
      if (record.workspaceId !== workspaceId || record.status !== MemoryStatus.ACTIVE) continue;
      if (!record.sourceHash || record.sourceHash === sourceHash) continue;
      if (record.kind !== MemoryKind.REPO_FACT && record.kind !== MemoryKind.CONVENTION) continue;
      record.status = MemoryStatus.STALE;
      record.staleReason = reason;
      record.updatedAt = nowIso();
      changed += 1;
    }
    if (changed) persist(next);
    return changed;
  }

  function snapshot() {
    return clone(state);
  }

  return {
    add,
    get,
    list,
    search,
    setStatus,
    markStale,
    retract,
    invalidateBySource,
    invalidateHashMismatch,
    snapshot,
    paths: Object.freeze({ filePath, backupPath }),
  };
}

module.exports = {
  MEMORY_SCHEMA_VERSION,
  MEMORY_FILE_NAME,
  MemoryKind,
  MemoryStatus,
  normalizeText,
  tokenize,
  fingerprintRecord,
  scoreRecord,
  createProjectMemory,
};
