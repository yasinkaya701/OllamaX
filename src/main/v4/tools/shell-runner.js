'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const {
  Capability,
  Risk,
  evaluatePermission,
  assertApproved,
} = require('./policy-engine');
const { secureWorkspacePath } = require('./path-guard');

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

const READONLY_EXECUTABLES = new Set([
  'pwd', 'ls', 'dir', 'cat', 'head', 'tail', 'wc', 'grep', 'find', 'stat',
  'sort', 'uniq', 'cut', 'tr', 'diff', 'tree', 'whoami', 'uname', 'date',
]);
const NETWORK_EXECUTABLES = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync']);
const DESTRUCTIVE_EXECUTABLES = new Set([
  'rm', 'rmdir', 'mkfs', 'dd', 'shutdown', 'reboot', 'poweroff', 'diskpart', 'format',
]);
const SECRET_ENUM_EXECUTABLES = new Set(['env', 'printenv', 'set']);
const GIT_READ_SUBCOMMANDS = new Set([
  'status', 'diff', 'show', 'log', 'branch', 'rev-parse', 'ls-files', 'ls-tree',
  'remote', 'tag', 'describe', 'blame', 'grep', 'cat-file', 'for-each-ref',
]);

const SAFE_ENV_KEYS = new Set([
  'PATH', 'HOME', 'USER', 'USERNAME', 'TMPDIR', 'TMP', 'TEMP', 'SHELL',
  'SystemRoot', 'ComSpec', 'PATHEXT', 'LANG', 'LC_ALL', 'TERM', 'CI',
]);

function baseName(executable) {
  return path.basename(String(executable || '')).replace(/\.(?:exe|cmd|bat)$/i, '').toLowerCase();
}

function classifyShellOperation(executable, args = []) {
  const base = baseName(executable);
  const normalizedArgs = Array.isArray(args) ? args.map((arg) => String(arg)) : [];
  if (!base) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'shell executable is required');

  if (SECRET_ENUM_EXECUTABLES.has(base)) {
    return { capability: Capability.SECRET_READ, risk: Risk.CRITICAL, reason: 'environment enumeration may expose secrets' };
  }
  if (DESTRUCTIVE_EXECUTABLES.has(base)) {
    return { capability: Capability.DESTRUCTIVE, risk: Risk.CRITICAL, reason: 'destructive executable' };
  }
  if (NETWORK_EXECUTABLES.has(base)) {
    return { capability: Capability.NETWORK, risk: Risk.HIGH, reason: 'network-capable executable' };
  }
  if (base === 'git') {
    const subcommand = (normalizedArgs.find((arg) => !arg.startsWith('-')) || '').toLowerCase();
    if (GIT_READ_SUBCOMMANDS.has(subcommand)) {
      return { capability: Capability.SHELL_READONLY, risk: Risk.LOW, reason: `read-only git ${subcommand}` };
    }
    return { capability: Capability.SHELL_EXEC, risk: Risk.MEDIUM, reason: `state-changing or unknown git ${subcommand || 'command'}` };
  }
  if (READONLY_EXECUTABLES.has(base)) {
    return { capability: Capability.SHELL_READONLY, risk: Risk.LOW, reason: 'read-only executable' };
  }
  return { capability: Capability.SHELL_EXEC, risk: Risk.MEDIUM, reason: 'general executable' };
}

function buildSafeEnv(extraEnv = {}) {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(extraEnv || {})) {
    if (!SAFE_ENV_KEYS.has(key)) continue;
    if (value == null) continue;
    env[key] = String(value);
  }
  return env;
}

function killProcessTree(child, signal = 'SIGKILL') {
  if (!child || !child.pid) return false;
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch {
      // Child may already have exited; direct kill is the fallback.
    }
  }
  try {
    child.kill(signal);
    return true;
  } catch {
    return false;
  }
}

function appendCapped(state, chunk, limit) {
  if (state.truncated) return;
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
  const remaining = Math.max(0, limit - state.bytes);
  if (buffer.length <= remaining) {
    state.parts.push(buffer);
    state.bytes += buffer.length;
    return;
  }
  if (remaining > 0) state.parts.push(buffer.subarray(0, remaining));
  state.bytes = limit;
  state.truncated = true;
}

function bufferStateToString(state) {
  return Buffer.concat(state.parts).toString('utf8');
}

function cancelledResult(executable, args, cwd, permission, classification) {
  return {
    ok: false,
    cancelled: true,
    executable: baseName(executable),
    args,
    cwd,
    stdout: '',
    stderr: '',
    outputTruncated: false,
    code: null,
    signal: null,
    timedOut: false,
    durationMs: 0,
    permission,
    classification,
  };
}

function runShell(options = {}) {
  const rootPath = options.rootPath;
  const executable = String(options.executable || '').trim();
  const args = Array.isArray(options.args) ? options.args.map((arg) => String(arg)) : [];
  if (!rootPath) return Promise.reject(new V4Error(ErrorCode.INVALID_ARGUMENT, 'shell rootPath is required'));
  if (!executable) return Promise.reject(new V4Error(ErrorCode.INVALID_ARGUMENT, 'shell executable is required'));

  const classification = classifyShellOperation(executable, args);
  const permission = evaluatePermission({
    profile: options.profile,
    capability: classification.capability,
    risk: classification.risk,
    forceApproval: options.forceApproval === true,
  });
  assertApproved(permission, options.approval);

  const cwdResolved = secureWorkspacePath(rootPath, options.cwd || '.', {
    allowRoot: true,
    allowSecrets: false,
  });
  if (options.signal && options.signal.aborted) {
    return Promise.resolve(cancelledResult(executable, args, cwdResolved.relative, permission, classification));
  }

  const timeoutMs = Number.isInteger(options.timeoutMs)
    ? Math.max(100, options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = Number.isInteger(options.maxOutputBytes)
    ? Math.max(1024, options.maxOutputBytes)
    : DEFAULT_MAX_OUTPUT_BYTES;

  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const stdout = { parts: [], bytes: 0, truncated: false };
    const stderr = { parts: [], bytes: 0, truncated: false };
    let timedOut = false;
    let cancelled = false;
    let settled = false;
    let timeout = null;

    const child = spawn(executable, args, {
      cwd: cwdResolved.target,
      env: buildSafeEnv(options.env),
      shell: false,
      detached: process.platform !== 'win32',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onAbort = () => {
      cancelled = true;
      killProcessTree(child, 'SIGKILL');
    };

    const finish = (error, code, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      const result = {
        ok: !error && code === 0 && !timedOut && !cancelled,
        cancelled,
        executable: baseName(executable),
        args,
        cwd: cwdResolved.relative,
        stdout: bufferStateToString(stdout),
        stderr: bufferStateToString(stderr),
        outputTruncated: stdout.truncated || stderr.truncated,
        code: typeof code === 'number' ? code : null,
        signal: signal || null,
        timedOut,
        durationMs: Date.now() - startedAt,
        permission,
        classification,
      };
      if (error) result.error = error.message || String(error);
      resolve(result);
    };

    child.stdout.on('data', (chunk) => appendCapped(stdout, chunk, maxOutputBytes));
    child.stderr.on('data', (chunk) => appendCapped(stderr, chunk, maxOutputBytes));
    child.on('error', (error) => finish(error, null, null));
    child.on('close', (code, signal) => finish(null, code, signal));

    timeout = setTimeout(() => {
      timedOut = true;
      killProcessTree(child, 'SIGKILL');
    }, timeoutMs);
    if (typeof timeout.unref === 'function') timeout.unref();

    if (options.signal) options.signal.addEventListener('abort', onAbort, { once: true });

    if (!child.pid) {
      if (timeout) clearTimeout(timeout);
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      settled = true;
      reject(new V4Error(ErrorCode.INVALID_ARGUMENT, `failed to spawn executable: ${executable}`));
    }
  });
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_OUTPUT_BYTES,
  READONLY_EXECUTABLES,
  NETWORK_EXECUTABLES,
  DESTRUCTIVE_EXECUTABLES,
  SECRET_ENUM_EXECUTABLES,
  GIT_READ_SUBCOMMANDS,
  SAFE_ENV_KEYS,
  baseName,
  classifyShellOperation,
  buildSafeEnv,
  killProcessTree,
  appendCapped,
  cancelledResult,
  runShell,
};
