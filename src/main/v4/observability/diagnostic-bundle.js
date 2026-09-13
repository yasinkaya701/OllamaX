'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const SECRET_KEY = /(secret|token|password|passphrase|authorization|cookie|api[_-]?key|private[_-]?key)/i;
const PATH_KEY = /(path|root|cwd|directory|dir)$/i;
const SECRET_VALUE = /(Bearer\s+[A-Za-z0-9._~+/-]+=*|sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,})/g;

function redact(value, key = '') {
  if (SECRET_KEY.test(key)) return '<redacted>';
  if (PATH_KEY.test(key) && typeof value === 'string') return '<path>';
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [childKey, childValue] of Object.entries(value)) out[childKey] = redact(childValue, childKey);
    return out;
  }
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '<redacted>');
  return value;
}

function buildDiagnosticBundle(options = {}) {
  const store = options.store;
  const journal = options.journal;
  if (!store || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'diagnostic bundle requires durable store');
  }
  const entityCounts = {};
  for (const type of Object.values(EntityType)) {
    try { entityCounts[type] = store.list(type).length; } catch { entityCounts[type] = 0; }
  }
  const journalData = journal && typeof journal.readAll === 'function'
    ? journal.readAll({ limit: Number.isInteger(options.eventLimit) ? Math.max(1, options.eventLimit) : 100 })
    : { entries: [], invalid: [] };
  const config = options.config && typeof options.config === 'object' ? options.config : {};
  return {
    schema: 'krevyx-v4-diagnostic/1',
    generatedAt: new Date().toISOString(),
    appVersion: options.appVersion || null,
    runtime: {
      featureEnabled: config.features && config.features.v4Workspace === true,
      configSchemaVersion: config.schemaVersion || null,
      entityCounts,
      invalidJournalLines: (journalData.invalid || []).length,
    },
    recentEvents: (journalData.entries || []).map((entry) => ({
      sequence: entry.sequence,
      type: entry.type,
      subjectType: entry.subjectType,
      subjectId: entry.subjectId,
      createdAt: entry.createdAt,
      payload: redact(entry.payload || {}),
    })),
  };
}

module.exports = {
  SECRET_KEY,
  PATH_KEY,
  SECRET_VALUE,
  redact,
  buildDiagnosticBundle,
};
