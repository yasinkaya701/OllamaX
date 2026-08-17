/* Diff Review — v3.21
 * Cursor BugBot / Claude /review öncül özelliğinin Krevyx'e yerli uyarlanması.
 * Kod ajanı görevi bittiğinde çalışma dizini git repo'sundan değişiklik özetini çıkarır.
 */
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const MAX_STAT_LINES = 40;
const MAX_CHARS = 8000;

/**
 * Çalışma dizininin git repo kökünü bulur.
 * @param {string} dir
 * @returns {string|null}
 */
function findGitRoot(dir) {
  if (!dir) return null;
  let cur = dir;
  for (let i = 0; i < 20; i++) {
    try {
      if (require('fs').existsSync(path.join(cur, '.git'))) return cur;
    } catch (_) { /* noop */ }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/**
 * Repo'daki son değişikliklerin özetini çıkarır.
 * @param {string} workingDir
 * @returns {{ ok: boolean, gitRoot: string|null, summary: string, stats: string, error: string|null }}
 */
function buildDiffReview(workingDir) {
  const gitRoot = findGitRoot(workingDir);
  const empty = { ok: false, gitRoot: null, summary: '', stats: '', error: null };

  if (!gitRoot) {
    empty.error = 'git repo bulunamadı';
    return empty;
  }

  const opts = { cwd: gitRoot, encoding: 'utf8', timeout: 20000 };

  const stat = spawnSync('git', ['diff', '--stat', '--cached'], opts);
  if (stat.error || stat.status !== 0) {
    return Object.assign(empty, { gitRoot, error: stat.error ? stat.error.message : `git status ${stat.status}` });
  }

  const staged = (stat.stdout || '').trim();

  /* işlenmemiş dosyaları da yakala: ajanlar sıklıkla yeni dosya oluşturur;
     `git diff` untracked dosyaları dışarıda bırakır, ls-files ile istatistik
     benzeri bir liste üretilir */
  const others = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], opts);
  const untrackedLines = ((others && !others.error && others.status === 0) ? (others.stdout || '') : '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(0, MAX_STAT_LINES)
    .map((f) => ` ${f}`)
    .join('\n');

  const parts = [staged, untrackedLines].filter((s) => s);
  if (!parts.length) {
    return Object.assign(empty, { gitRoot, error: 'değişiklik yok' });
  }
  const stats = parts.join('\n').split('\n').slice(0, MAX_STAT_LINES).join('\n');

  const log = spawnSync(
    'git',
    ['log', '--oneline', '-5', '--no-merges'],
    opts
  );
  const logLines = (log.stdout || '').trim().split('\n').slice(0, 5).join('\n');
  const summary = [
    `## Diff Review — ${new Date().toISOString()}`,
    `Repo: ${gitRoot}`,
    '',
    '### Dosya değişiklikleri (--stat)',
    stats,
    '',
    '### Son commitler',
    logLines || '(commit yok)',
  ].join('\n').slice(0, MAX_CHARS);

  return { ok: true, gitRoot, summary, stats, error: null };
}

module.exports = { buildDiffReview, findGitRoot };
