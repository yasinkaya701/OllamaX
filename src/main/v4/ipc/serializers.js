'use strict';

const { ErrorCode, V4Error, asV4Error } = require('../../../shared/v4/errors');
const { assertEntity } = require('../../../shared/v4/schemas');

function toSerializable(value, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) {
    throw new V4Error(ErrorCode.SERIALIZATION_FAILED, 'Circular value cannot cross the v4 IPC boundary');
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => toSerializable(item, seen)).filter((item) => item !== undefined);
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const serialized = toSerializable(item, seen);
      if (serialized !== undefined) out[key] = serialized;
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

function serializeEntity(type, entity) {
  assertEntity(type, entity);
  return toSerializable(entity);
}

function serializeError(error) {
  const normalized = asV4Error(error);
  return {
    name: normalized.name,
    code: normalized.code,
    message: normalized.message,
    details: toSerializable(normalized.details),
  };
}

module.exports = {
  toSerializable,
  serializeEntity,
  serializeError,
};
