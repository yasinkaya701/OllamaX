'use strict';

/**
 * sandbox.js — Krevyx v3.26 Yürütme İzolasyonu
 *
 * Kapsam:
 *   - Komut allowlist'i: yalnızca izin verilen çalıştırılabilirler çalışır.
 *   - Dizin kısıtı: tüm yürütmeler path prefix (chroot-benzeri) ile doğrulanır.
 *   - Çocuk proses limiti: eş zamanlı spawn sayısı ve toplam sayacı.
 *   - Zaman aşımı + bellek/çocuk temizleme (orphan kill).
 *
 * Davranış:
 *   - createSandbox(opts) → { ok, sandbox }; sandbox.run(cmd, opts) → Promise.
 *   - cmd ilk token olarak ayrıştırılır; allowlist'te yoksa REDDEDİLİR (ok:false).
 *   - cwd, pathPrefix dışındaysa REDDEDİLİR. '--help' gibi tehlike sinyalleri
 *     tehlike listesine göre işaretlenir (yine de allowlist temellidir).
 *   - Her sandbox kendi sayacını taşır; destroy ile temizlenir.
 *
 * Dönüş:
 *   - run → { ok, stdout, stderr, code, duration_ms } | { ok:false, error }
 *
 * Test:
 *   - testOnlyClear() tüm sandbox'ları kaldırır.
 *
 * @version 3.26.0
 */

const { execFile } = require('child_process');
const pathMod = require('path');
const os = require('os');
const crypto = require('crypto');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_SPAWNS = 512;
const DEFAULT_CONCURRENCY = 4;

/** Varsayılan komut allowlist'i (platform-bağımsız temel küme) */
const DEFAULT_ALLOWLIST = [
  'ls', 'dir', 'cat', 'type', 'head', 'tail', 'wc', 'echo', 'printf',
  'grep', 'find', 'whoami', 'uname', 'pwd', 'cd', 'node', 'pnpm', 'npm',
  'git', 'jq', 'sed', 'awk', 'sort', 'uniq', 'tr', 'cut', 'diff', 'patch',
  'mkdir', 'touch', 'cp', 'mv', 'rm', 'tree', 'date', 'stat',
];

/** Ekstra tehlike sinyalleri: allowlist'e eklenmemiş komutlarda bile içerik taraması */
const DANGER_SIGNALS = [
  'rm -rf /', 'rm -rf ~', 'format', 'mkfs', 'dd if=', 'curl | sh', 'bash <(', 'sh <(',
  ':(){ :|:& };:', '> /dev/sda', 'chmod -R 777 /', 'eval(', '`', '$(',
];

const _sandboxes = new Map();
const _children = new Map();

function normalizeCommand(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { base: '', args: [], danger: ['boş komut'] };
  const signals = DANGER_SIGNALS.filter((s) => trimmed.includes(s));
  const parts = trimmed.split(/\s+/);
  const base = parts[0].split('/').pop().replace(/^[.*]/, '');
  return { base, args: parts.slice(1), danger: signals };
}

function resolveBinary(base) {
  if (process.platform === 'win32') {
    const candidates = [`${base}.exe`, `${base}.cmd`, `${base}.bat`, base];
    for (const c of candidates) {
      try { return require('fs').existsSync(pathMod.join(process.env.ProgramFiles || 'C:\\Program Files', c)) ? c : c; } catch (e) { /* devam */ }
    }
    return base;
  }
  return base;
}

/** Yeni sandbox; kendi sayacı ve allowlist kopyasıyla izole edilir. */
function createSandbox(opts = {}) {
  const id = `sb-${crypto.randomBytes(6).toString('hex')}`;
  const pathPrefix = opts.pathPrefix ? pathMod.resolve(opts.pathPrefix) : null;
  const allowlist = Array.isArray(opts.allowlist) && opts.allowlist.length ? opts.allowlist.slice() : DEFAULT_ALLOWLIST.slice();
  const sandbox = {
    id,
    cwd: opts.cwd || process.cwd(),
    pathPrefix,
    allowlist,
    timeoutMs: typeof opts.timeoutMs === 'number' ? Math.max(1000, opts.timeoutMs) : DEFAULT_TIMEOUT_MS,
    maxSpawns: typeof opts.maxSpawns === 'number' ? Math.max(1, opts.maxSpawns) : DEFAULT_MAX_SPAWNS,
    concurrency: typeof opts.concurrency === 'number' ? Math.max(1, opts.concurrency) : DEFAULT_CONCURRENCY,
    spawnCount: 0,
    activeSpawns: 0,
    destroyed: false,
  };
  _sandboxes.set(id, sandbox);
  return { ok: true, sandbox };
}

function getSandbox(id) {
  return _sandboxes.get(id) || null;
}

function assertConfined(sandbox, dir) {
  if (!sandbox.pathPrefix) return { ok: true };
  const resolved = pathMod.resolve(dir || sandbox.cwd);
  const rel = pathMod.relative(sandbox.pathPrefix, resolved);
  if (rel.startsWith('..') || pathMod.isAbsolute(rel)) {
    return { ok: false, error: `Dizin kısıtı ihlali: ${dir}` };
  }
  return { ok: true };
}

function run(sandbox, cmd, opts = {}) {
  return new Promise((resolve) => {
    if (!sandbox || !_sandboxes.has(sandbox.id)) return resolve({ ok: false, error: 'Sandbox bulunamadı' });
    if (sandbox.destroyed) return resolve({ ok: false, error: 'Sandbox kapandı' });
    const { base, args, danger } = normalizeCommand(cmd);
    const allowlistMatch = sandbox.allowlist.some((a) => a === base || a.startsWith(`${base}.`));
    if (!allowlistMatch) {
      return resolve({ ok: false, error: `Komut allowlist dışında: ${base}`, danger });
    }
    const cwd = pathMod.resolve(opts.cwd || sandbox.cwd);
    const confined = assertConfined(sandbox, cwd);
    if (!confined.ok) return resolve(confined);
    if (sandbox.spawnCount >= sandbox.maxSpawns) {
      return resolve({ ok: false, error: `Spawn limiti aşıldı: ${sandbox.maxSpawns}` });
    }
    if (sandbox.activeSpawns >= sandbox.concurrency) {
      return resolve({ ok: false, error: 'Eş zamanlılık limiti dolu; bekleyin' });
    }
    const timeoutMs = typeof opts.timeoutMs === 'number' ? Math.max(1000, opts.timeoutMs) : sandbox.timeoutMs;
    const started = Date.now();
    const bin = resolveBinary(base);
    const child = execFile(bin, args, { cwd, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      sandbox.activeSpawns -= 1;
      _children.delete(childId);
      const code = err && err.code !== null && err.code !== undefined ? (typeof err.code === 'number' ? err.code : 1) : 0;
      const killed = !!(err && (err.killed || err.signal));
      const result = {
        ok: !err || code === 0,
        stdout: (stdout || '').toString('utf8'),
        stderr: (stderr || '').toString('utf8'),
        code,
        killed,
        duration_ms: Date.now() - started,
        danger: danger.length ? danger : undefined,
      };
      if (killed) result.error = 'Proses zaman aşımında sonlandırıldı';
      if (err && !killed && !result.ok) result.error = err.message || result.stderr || 'Komut başarısız';
      resolve(result);
    });
    const childId = crypto.randomBytes(4).toString('hex');
    _children.set(childId, { sandboxId: sandbox.id, child, startedAt: Date.now() });
    sandbox.activeSpawns += 1;
    sandbox.spawnCount += 1;
    const guard = setTimeout(() => {
      if (_children.has(childId)) {
        try { child.kill('SIGKILL'); } catch (e) { /* zaten ölü */ }
      }
    }, timeoutMs + 2000);
    child.on('exit', () => clearTimeout(guard));
    child.on('error', () => clearTimeout(guard));
  });
}

function killAll(sandbox) {
  if (!sandbox || !_sandboxes.has(sandbox.id)) return { ok: false, error: 'Sandbox bulunamadı' };
  let killed = 0;
  for (const [id, entry] of Array.from(_children.entries())) {
    if (entry.sandboxId === sandbox.id) {
      try { entry.child.kill('SIGKILL'); } catch (e) { /* atla */ }
      _children.delete(id);
      killed += 1;
    }
  }
  sandbox.activeSpawns = 0;
  return { ok: true, killed };
}

function destroy(sandbox) {
  if (!sandbox) return { ok: false, error: 'Sandbox yok' };
  const s = _sandboxes.get(sandbox.id);
  if (!s) return { ok: false, error: 'Sandbox bulunamadı' };
  killAll(s);
  s.destroyed = true;
  _sandboxes.delete(sandbox.id);
  return { ok: true };
}

function state(sandbox) {
  if (!sandbox || !_sandboxes.has(sandbox.id)) return { ok: false };
  return {
    ok: true,
    id: sandbox.id,
    cwd: sandbox.cwd,
    pathPrefix: sandbox.pathPrefix,
    allowlistSize: sandbox.allowlist.length,
    spawnCount: sandbox.spawnCount,
    activeSpawns: sandbox.activeSpawns,
    destroyed: sandbox.destroyed,
  };
}

function testOnlyClear() {
  for (const s of _sandboxes.values()) { killAll(s); s.destroyed = true; }
  _sandboxes.clear();
  _children.clear();
  return { ok: true };
}

module.exports = {
  createSandbox,
  getSandbox,
  run,
  killAll,
  destroy,
  state,
  normalizeCommand,
  assertConfined,
  DEFAULT_ALLOWLIST,
  DANGER_SIGNALS,
  DEFAULT_TIMEOUT_MS,
  testOnlyClear,
};
