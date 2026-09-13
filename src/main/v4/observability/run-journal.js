'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const JOURNAL_FILE_NAME = 'v4-run-journal.ndjson';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseLines(text) {
  const entries = [];
  const invalid = [];
  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (!entry || typeof entry !== 'object') throw new Error('entry is not an object');
      entries.push(entry);
    } catch (error) {
      invalid.push({
        line: index + 1,
        error: error && error.message ? error.message : String(error),
      });
    }
  }
  return { entries, invalid };
}

function createRunJournal(options = {}) {
  const rootDir = options.rootDir;
  if (!rootDir || typeof rootDir !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'createRunJournal requires rootDir');
  }
  fs.mkdirSync(rootDir, { recursive: true });
  const filePath = path.join(rootDir, options.fileName || JOURNAL_FILE_NAME);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf8');

  function readAll(readOptions = {}) {
    const parsed = parseLines(fs.readFileSync(filePath, 'utf8'));
    const limit = Number.isInteger(readOptions.limit) && readOptions.limit > 0
      ? readOptions.limit
      : null;
    const entries = limit ? parsed.entries.slice(-limit) : parsed.entries;
    return { entries: clone(entries), invalid: clone(parsed.invalid) };
  }

  let nextSequence = 1;
  const initial = readAll();
  for (const entry of initial.entries) {
    if (Number.isInteger(entry.sequence) && entry.sequence >= nextSequence) {
      nextSequence = entry.sequence + 1;
    }
  }

  function append(input = {}) {
    if (!input.type || typeof input.type !== 'string') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'journal event type is required');
    }
    const entry = {
      id: input.id || `event_${crypto.randomUUID()}`,
      sequence: nextSequence,
      type: input.type,
      subjectType: input.subjectType || null,
      subjectId: input.subjectId || null,
      payload: clone(input.payload || {}),
      createdAt: input.createdAt || new Date().toISOString(),
    };
    nextSequence += 1;
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return clone(entry);
  }

  function replay(reducer, initialValue) {
    if (typeof reducer !== 'function') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'replay requires a reducer function');
    }
    const { entries, invalid } = readAll();
    const value = entries.reduce((acc, entry) => reducer(acc, clone(entry)), initialValue);
    return { value, invalid };
  }

  return {
    append,
    readAll,
    replay,
    filePath,
  };
}

module.exports = {
  JOURNAL_FILE_NAME,
  parseLines,
  createRunJournal,
};
