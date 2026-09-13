'use strict';

const crypto = require('crypto');
const { createEvidence } = require('../../../shared/v4/contracts');
const { EntityType, EvidenceKind } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

function canonicalize(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return String(value);
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(payload))).digest('hex');
}

function createEvidenceService(options = {}) {
  const store = options.store;
  const journal = options.journal || null;
  if (!store || typeof store.put !== 'function' || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createEvidenceService requires a v4 store');
  }

  function record(input = {}) {
    if (!input.subjectType || !input.subjectId) {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'evidence subjectType and subjectId are required');
    }
    const kind = input.kind || EvidenceKind.COMMAND_RESULT;
    if (!Object.values(EvidenceKind).includes(kind)) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `unsupported evidence kind: ${kind}`);
    }
    const payload = input.payload || {};
    const evidence = createEvidence({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      kind,
      sourceArtifactId: input.sourceArtifactId || null,
      summary: input.summary || null,
      hash: input.hash || hashPayload({
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        kind,
        summary: input.summary || null,
        payload,
      }),
      createdAt: input.createdAt,
    });
    store.put(EntityType.EVIDENCE, evidence);
    if (journal && typeof journal.append === 'function') {
      journal.append({
        type: 'evidence.recorded',
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: {
          evidenceId: evidence.id,
          kind: evidence.kind,
          hash: evidence.hash,
          summary: evidence.summary,
        },
      });
    }
    return { evidence, payload };
  }

  function listFor(subjectType, subjectId) {
    return store.list(EntityType.EVIDENCE)
      .filter((entry) => entry.subjectType === subjectType && entry.subjectId === subjectId)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
  }

  return { record, listFor };
}

module.exports = {
  canonicalize,
  hashPayload,
  createEvidenceService,
};
