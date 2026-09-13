'use strict';

const ErrorCode = Object.freeze({
  INVALID_ARGUMENT: 'V4_INVALID_ARGUMENT',
  VALIDATION_FAILED: 'V4_VALIDATION_FAILED',
  NOT_FOUND: 'V4_NOT_FOUND',
  STATE_TRANSITION_INVALID: 'V4_STATE_TRANSITION_INVALID',
  STORE_CORRUPTED: 'V4_STORE_CORRUPTED',
  STORE_WRITE_FAILED: 'V4_STORE_WRITE_FAILED',
  SCHEMA_UNSUPPORTED: 'V4_SCHEMA_UNSUPPORTED',
  SERIALIZATION_FAILED: 'V4_SERIALIZATION_FAILED',
});

class V4Error extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'V4Error';
    this.code = code || ErrorCode.INVALID_ARGUMENT;
    this.details = details || null;
  }
}

function asV4Error(error, fallbackCode = ErrorCode.INVALID_ARGUMENT) {
  if (error instanceof V4Error) return error;
  const message = error && error.message ? error.message : String(error || 'Unknown v4 error');
  return new V4Error(fallbackCode, message);
}

module.exports = {
  ErrorCode,
  V4Error,
  asV4Error,
};
