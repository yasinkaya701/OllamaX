'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { createIgnoreMatcher, normalizeRelative } = require('./ignore-rules');

const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;
const DEFAULT_MAX_FILES = 20000;

const LANGUAGE_BY_EXTENSION = Object.freeze({
  '.js': 'JavaScript',
  '.cjs': 'JavaScript',
  '.mjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.h': 'C/C++ Header',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.sh': 'Shell',
  '.bash': 'Shell',
  '.zsh': 'Shell',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sql': 'SQL',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
});

const MANIFEST_NAMES = new Set([
  'package.json', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
  'pyproject.toml', 'requirements.txt', 'Pipfile', 'poetry.lock',
  'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock', 'pom.xml', 'build.gradle',
]);

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function languageHint(relativePath) {
  return LANGUAGE_BY_EXTENSION[path.extname(relativePath).toLowerCase()] || null;
}

function classifyFile(relativePath) {
  const normalized = normalizeRelative(relativePath);
  const basename = path.posix.basename(normalized);
  const lower = normalized.toLowerCase();
  if (MANIFEST_NAMES.has(basename)) return 'manifest';
  if (lower.startsWith('.github/workflows/') || lower.includes('/.github/workflows/')) return 'workflow';
  if (/(^|\/)(?:test|tests|__tests__)(\/|$)/i.test(normalized) || /(?:\.test|\.spec)\.[^.]+$/i.test(normalized)) return 'test';
  if (lower === 'readme.md' || lower.startsWith('docs/') || lower.includes('/docs/')) return 'docs';
  if (/(^|\/)(?:src|lib|app|server|client)(\/|$)/i.test(normalized)) return 'source';
  if (/\.(?:json|ya?ml|toml|ini|config\.js|config\.cjs)$/i.test(normalized)) return 'config';
  return 'other';
}

function relevanceScore(file) {
  const base = {
    manifest: 100,
    workflow: 90,
    source: 80,
    test: 70,
    config: 65,
    docs: 50,
    other: 20,
  }[file.category] || 20;
  const depthPenalty = Math.min(20, file.path.split('/').length - 1);
  const sizePenalty = file.size > 250000 ? 10 : file.size > 100000 ? 5 : 0;
  return Math.max(0, base - depthPenalty - sizePenalty);
}

function readGitMetadata(rootPath) {
  const gitPath = path.join(rootPath, '.git');
  let stat;
  try {
    stat = fs.statSync(gitPath);
  } catch (_) {
    return { isGitRepository: false, activeBranch: null, head: null };
  }
  if (!stat.isDirectory()) return { isGitRepository: true, activeBranch: null, head: null };

  try {
    const head = fs.readFileSync(path.join(gitPath, 'HEAD'), 'utf8').trim();
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5).trim();
      return {
        isGitRepository: true,
        activeBranch: ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref,
        head: ref,
      };
    }
    return { isGitRepository: true, activeBranch: null, head };
  } catch (_) {
    return { isGitRepository: true, activeBranch: null, head: null };
  }
}

function readGitignore(rootPath) {
  try {
    return fs.readFileSync(path.join(rootPath, '.gitignore'), 'utf8');
  } catch (_) {
    return '';
  }
}

function inspectRepository(rootPath, options = {}) {
  const resolvedRoot = path.resolve(rootPath || '');
  let rootStat;
  try {
    rootStat = fs.statSync(resolvedRoot);
  } catch (_) {
    throw new V4Error(ErrorCode.NOT_FOUND, `Workspace root not found: ${resolvedRoot}`);
  }
  if (!rootStat.isDirectory()) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, `Workspace root is not a directory: ${resolvedRoot}`);
  }

  const maxFileBytes = Number.isInteger(options.maxFileBytes) && options.maxFileBytes > 0
    ? options.maxFileBytes
    : DEFAULT_MAX_FILE_BYTES;
  const maxFiles = Number.isInteger(options.maxFiles) && options.maxFiles > 0
    ? options.maxFiles
    : DEFAULT_MAX_FILES;
  const matcher = createIgnoreMatcher({
    gitignoreText: readGitignore(resolvedRoot),
    extraPatterns: options.extraPatterns || [],
  });

  const files = [];
  const excluded = [];
  let visitedFiles = 0;

  function walk(currentPath) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true });
    } catch (error) {
      excluded.push({
        path: normalizeRelative(path.relative(resolvedRoot, currentPath)),
        reason: 'unreadable-directory',
        error: error && error.code ? error.code : 'read-error',
      });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = normalizeRelative(path.relative(resolvedRoot, absolutePath));
      const ignored = matcher.explain(relativePath);
      if (ignored.ignored) {
        excluded.push({ path: relativePath, reason: ignored.reason, pattern: ignored.pattern || null });
        continue;
      }
      if (entry.isSymbolicLink()) {
        excluded.push({ path: relativePath, reason: 'symlink' });
        continue;
      }
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;

      visitedFiles += 1;
      let stat;
      try {
        stat = fs.statSync(absolutePath);
      } catch (error) {
        excluded.push({ path: relativePath, reason: 'unreadable-file', error: error && error.code ? error.code : 'stat-error' });
        continue;
      }
      if (stat.size > maxFileBytes) {
        excluded.push({ path: relativePath, reason: 'file-too-large', size: stat.size });
        continue;
      }

      let buffer;
      try {
        buffer = fs.readFileSync(absolutePath);
      } catch (error) {
        excluded.push({ path: relativePath, reason: 'unreadable-file', error: error && error.code ? error.code : 'read-error' });
        continue;
      }

      const file = {
        path: relativePath,
        size: stat.size,
        mtimeMs: Math.trunc(stat.mtimeMs),
        hash: sha256Buffer(buffer),
        language: languageHint(relativePath),
        category: classifyFile(relativePath),
      };
      file.relevance = relevanceScore(file);
      files.push(file);
    }
  }

  walk(resolvedRoot);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const inventoryHash = sha256Buffer(Buffer.from(files.map((file) => `${file.path}:${file.size}:${file.hash}`).join('\n')));
  const categoryCounts = {};
  const languageCounts = {};
  for (const file of files) {
    categoryCounts[file.category] = (categoryCounts[file.category] || 0) + 1;
    if (file.language) languageCounts[file.language] = (languageCounts[file.language] || 0) + 1;
  }

  const byRelevance = files.slice().sort((a, b) => b.relevance - a.relevance || a.path.localeCompare(b.path));
  const structure = {
    manifests: files.filter((file) => file.category === 'manifest').map((file) => file.path),
    tests: files.filter((file) => file.category === 'test').map((file) => file.path),
    workflows: files.filter((file) => file.category === 'workflow').map((file) => file.path),
    docs: files.filter((file) => file.category === 'docs').map((file) => file.path),
    topRelevant: byRelevance.slice(0, 50).map((file) => file.path),
  };

  return {
    rootPath: resolvedRoot,
    generatedAt: new Date().toISOString(),
    inventoryHash,
    files,
    excluded,
    stats: {
      includedFiles: files.length,
      visitedFiles,
      excludedEntries: excluded.length,
      truncated: files.length >= maxFiles,
      maxFiles,
      maxFileBytes,
      categoryCounts,
      languageCounts,
    },
    repositoryMetadata: readGitMetadata(resolvedRoot),
    structure,
  };
}

function diffInventories(previous, next) {
  const before = new Map(((previous && previous.files) || []).map((file) => [file.path, file]));
  const after = new Map(((next && next.files) || []).map((file) => [file.path, file]));
  const added = [];
  const changed = [];
  const removed = [];
  const unchanged = [];

  for (const [filePath, file] of after.entries()) {
    const prior = before.get(filePath);
    if (!prior) added.push(filePath);
    else if (prior.hash !== file.hash || prior.size !== file.size) changed.push(filePath);
    else unchanged.push(filePath);
  }
  for (const filePath of before.keys()) {
    if (!after.has(filePath)) removed.push(filePath);
  }

  return { added, changed, removed, unchanged };
}

module.exports = {
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_FILES,
  LANGUAGE_BY_EXTENSION,
  languageHint,
  classifyFile,
  relevanceScore,
  readGitMetadata,
  inspectRepository,
  diffInventories,
};
