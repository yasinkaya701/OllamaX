'use strict';

const path = require('path');

const HARD_EXCLUDED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  '.yarn',
  '.cache',
  '.next',
  '.nuxt',
  '.turbo',
  'coverage',
  'dist',
  'out',
  'build',
  'target',
  '__pycache__',
]);

const SENSITIVE_BASENAME_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /^(?:credentials|secrets?)(?:\.[^.]+)?$/i,
  /\.(?:pem|p12|pfx|key|keystore)$/i,
];

const SENSITIVE_SEGMENTS = new Set(['.ssh', '.aws', '.gnupg']);

function normalizeRelative(input) {
  return String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function escapeRegex(text) {
  return text.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globBodyToRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return out;
}

function compilePattern(raw) {
  let text = String(raw || '').trim();
  if (!text || text.startsWith('#')) return null;
  const negated = text.startsWith('!');
  if (negated) text = text.slice(1);
  if (!text) return null;

  const directoryOnly = text.endsWith('/');
  if (directoryOnly) text = text.slice(0, -1);
  const anchored = text.startsWith('/');
  if (anchored) text = text.slice(1);
  const normalized = normalizeRelative(text);
  if (!normalized) return null;

  const hasSlash = normalized.includes('/');
  const body = globBodyToRegex(normalized);
  let source;
  if (anchored || hasSlash) source = `^${body}${directoryOnly ? '(?:/.*)?' : '$'}`;
  else source = `(?:^|/)${body}${directoryOnly ? '(?:/.*)?$' : '$'}`;

  return { negated, regex: new RegExp(source), raw };
}

function parseGitignore(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(compilePattern)
    .filter(Boolean);
}

function hardExclusion(relativePath) {
  const normalized = normalizeRelative(relativePath);
  const segments = normalized.split('/').filter(Boolean);
  const basename = segments[segments.length - 1] || '';

  if (segments.some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment))) {
    return { ignored: true, reason: 'hard-excluded-directory' };
  }
  if (segments.some((segment) => SENSITIVE_SEGMENTS.has(segment))) {
    return { ignored: true, reason: 'sensitive-directory' };
  }
  if (SENSITIVE_BASENAME_PATTERNS.some((regex) => regex.test(basename))) {
    return { ignored: true, reason: 'sensitive-file' };
  }
  return { ignored: false, reason: null };
}

function createIgnoreMatcher(options = {}) {
  const patterns = [
    ...parseGitignore(options.gitignoreText || ''),
    ...parseGitignore((options.extraPatterns || []).join('\n')),
  ];

  function explain(relativePath) {
    const normalized = normalizeRelative(relativePath);
    const hard = hardExclusion(normalized);
    if (hard.ignored) return hard;

    let ignored = false;
    let matched = null;
    for (const pattern of patterns) {
      if (pattern.regex.test(normalized)) {
        ignored = !pattern.negated;
        matched = String(pattern.raw || '').trim();
      }
    }
    return {
      ignored,
      reason: ignored ? 'gitignore' : null,
      pattern: matched,
    };
  }

  return {
    explain,
    shouldIgnore(relativePath) {
      return explain(relativePath).ignored;
    },
  };
}

function relativeWithin(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  if (!relative || relative === '.') return '';
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return normalizeRelative(relative);
}

module.exports = {
  HARD_EXCLUDED_SEGMENTS,
  SENSITIVE_BASENAME_PATTERNS,
  normalizeRelative,
  parseGitignore,
  hardExclusion,
  createIgnoreMatcher,
  relativeWithin,
};
