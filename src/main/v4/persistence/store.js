'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error, asV4Error } = require('../../../shared/v4/errors');
const { assertEntity, isPlainObject } = require('../../../shared/v4/schemas');

const STORE_SCHEMA_VERSION = 1;
const STORE_FILE_NAME = 'v4-state.json';

const BUCKET_BY_TYPE = Object.freeze({
  [EntityType.WORKSPACE]: 'workspaces',
  [EntityType.MISSION]: 'missions',
  [EntityType.TASK]: 'tasks',
  [EntityType.AGENT_RUN]: 'agentRuns',
  [EntityType.TOOL_CALL]: 'toolCalls',
  [EntityType.ARTIFACT]: 'artifacts',
  [EntityType.EVIDENCE]: 'evidence',
  [EntityType.VERIFICATION_RUN]: 'verificationRuns',
});

const BUCKETS = Object.freeze(Object.values(BUCKET_BY_TYPE));

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultState() {
  const now = nowIso();
  const entities = {};
  for (const bucket of BUCKETS) entities[bucket] = {};
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    revision: 0,
    entities,
    meta: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

function migrateState(raw) {
  if (!isPlainObject(raw)) {
    throw new V4Error(ErrorCode.STORE_CORRUPTED, 'v4 state root must be an object');
  }
  const version = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 0;
  if (version > STORE_SCHEMA_VERSION) {
    throw new V4Error(
      ErrorCode.SCHEMA_UNSUPPORTED,
      `Unsupported v4 store schema: ${version}`,
      { supported: STORE_SCHEMA_VERSION, actual: version },
    );
  }

  const next = defaultState();
  next.schemaVersion = STORE_SCHEMA_VERSION;
  next.revision = Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0;
  if (isPlainObject(raw.meta)) {
    next.meta.createdAt = raw.meta.createdAt || next.meta.createdAt;
    next.meta.updatedAt = raw.meta.updatedAt || next.meta.updatedAt;
  }

  const sourceEntities = isPlainObject(raw.entities) ? raw.entities : raw;
  for (const bucket of BUCKETS) {
    if (isPlainObject(sourceEntities[bucket])) next.entities[bucket] = clone(sourceEntities[bucket]);
  }
  return next;
}

function parseStateFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return migrateState(JSON.parse(text));
}

function quarantineFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const quarantinePath = `${filePath}.corrupt-${suffix}`;
  fs.renameSync(filePath, quarantinePath);
  return quarantinePath;
}

function writeStateFile(statePath, backupPath, state, options = {}) {
  const dir = path.dirname(statePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${statePath}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    if (options.rotateBackup !== false && fs.existsSync(statePath)) {
      fs.copyFileSync(statePath, backupPath);
    }
    try {
      fs.renameSync(tempPath, statePath);
    } catch (error) {
      // Windows can refuse replace-on-rename. Fall back to a remove + rename
      // after the durable temp file has already been written.
      if (fs.existsSync(statePath)) fs.rmSync(statePath, { force: true });
      fs.renameSync(tempPath, statePath);
      if (!fs.existsSync(statePath)) throw error;
    }
  } catch (error) {
    try { fs.rmSync(tempPath, { force: true }); } catch (_) { /* best effort */ }
    throw new V4Error(ErrorCode.STORE_WRITE_FAILED, 'Failed to persist v4 state', {
      statePath,
      cause: error && error.message ? error.message : String(error),
    });
  }
}

function loadState(statePath, backupPath) {
  if (!fs.existsSync(statePath)) {
    return { state: defaultState(), recovery: null, quarantined: [] };
  }

  try {
    return { state: parseStateFile(statePath), recovery: null, quarantined: [] };
  } catch (primaryError) {
    const quarantined = [];
    const primaryQuarantine = quarantineFile(statePath);
    if (primaryQuarantine) quarantined.push(primaryQuarantine);

    if (fs.existsSync(backupPath)) {
      try {
        const recovered = parseStateFile(backupPath);
        writeStateFile(statePath, backupPath, recovered, { rotateBackup: false });
        return { state: recovered, recovery: 'backup', quarantined };
      } catch (backupError) {
        const backupQuarantine = quarantineFile(backupPath);
        if (backupQuarantine) quarantined.push(backupQuarantine);
        return {
          state: defaultState(),
          recovery: 'fresh',
          quarantined,
          recoveryError: asV4Error(backupError, ErrorCode.STORE_CORRUPTED),
        };
      }
    }

    return {
      state: defaultState(),
      recovery: 'fresh',
      quarantined,
      recoveryError: asV4Error(primaryError, ErrorCode.STORE_CORRUPTED),
    };
  }
}

function resolveBucket(type) {
  const bucket = BUCKET_BY_TYPE[type];
  if (!bucket) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, `Unknown v4 entity type: ${type}`, { type });
  }
  return bucket;
}

function createStore(options = {}) {
  const rootDir = options.rootDir;
  if (!rootDir || typeof rootDir !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createStore requires rootDir');
  }
  fs.mkdirSync(rootDir, { recursive: true });
  const fileName = options.fileName || STORE_FILE_NAME;
  const statePath = path.join(rootDir, fileName);
  const backupPath = `${statePath}.bak`;
  const loaded = loadState(statePath, backupPath);
  let state = loaded.state;

  if (!fs.existsSync(statePath)) writeStateFile(statePath, backupPath, state, { rotateBackup: false });

  function persist(nextState) {
    nextState.revision = state.revision + 1;
    nextState.meta = {
      ...nextState.meta,
      createdAt: nextState.meta && nextState.meta.createdAt ? nextState.meta.createdAt : state.meta.createdAt,
      updatedAt: nowIso(),
    };
    writeStateFile(statePath, backupPath, nextState);
    state = nextState;
  }

  function put(type, entity) {
    const bucket = resolveBucket(type);
    assertEntity(type, entity);
    const next = clone(state);
    next.entities[bucket][entity.id] = clone(entity);
    persist(next);
    return clone(entity);
  }

  function get(type, id) {
    const bucket = resolveBucket(type);
    const value = state.entities[bucket][id];
    return value ? clone(value) : null;
  }

  function list(type) {
    const bucket = resolveBucket(type);
    return Object.values(state.entities[bucket]).map(clone);
  }

  function update(type, id, updater) {
    const current = get(type, id);
    if (!current) {
      throw new V4Error(ErrorCode.NOT_FOUND, `${type} not found: ${id}`, { type, id });
    }
    const candidate = typeof updater === 'function'
      ? updater(clone(current))
      : { ...current, ...(updater || {}) };
    if (!candidate || typeof candidate !== 'object') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'update must produce an entity object');
    }
    candidate.id = current.id;
    return put(type, candidate);
  }

  function remove(type, id) {
    const bucket = resolveBucket(type);
    if (!state.entities[bucket][id]) return false;
    const next = clone(state);
    delete next.entities[bucket][id];
    persist(next);
    return true;
  }

  function snapshot() {
    return clone(state);
  }

  function reload() {
    const reloaded = loadState(statePath, backupPath);
    state = reloaded.state;
    return {
      state: snapshot(),
      recovery: reloaded.recovery,
      quarantined: clone(reloaded.quarantined || []),
    };
  }

  return {
    put,
    get,
    list,
    update,
    remove,
    snapshot,
    reload,
    paths: Object.freeze({ statePath, backupPath }),
    recovery: loaded.recovery,
    quarantined: clone(loaded.quarantined || []),
  };
}

module.exports = {
  STORE_SCHEMA_VERSION,
  STORE_FILE_NAME,
  BUCKET_BY_TYPE,
  defaultState,
  migrateState,
  createStore,
};
