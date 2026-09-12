/* Agent Hooks — v3.21
 * Claude Code hooks öncül özelliğinin Krevyx'e yerli uyarlanması.
 * krevyx-hooks.json içinde görev yaşam döngüsü olaylarına shell komutları bağlanır.
 * Olaylar: task-start, task-done, task-fail, step (adım sayısı eşiği aşılınca).
 * Başarısız hook görevi öldürmez; audit kaydı olarak SARIF'a düşer.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const HOOKS_FILE = 'krevyx-hooks.json';
const VALID_EVENTS = new Set(['task-start', 'task-done', 'task-fail', 'step']);
const MAX_HOOKS = 8;
const HOOK_TIMEOUT_MS = 30000;

/**
 * Shell hook'ları alt süreçler başlatabilir (`sh -c "sleep 60"` gibi). Yalnızca
 * shell PID'sini öldürmek torun süreci yetim bırakır ve test/app kapanışını
 * engeller. POSIX'te ayrı process group açıp tüm grubu sonlandırırız; Windows'ta
 * child.kill fallback'i mevcut davranışı korur.
 */
function terminateProcessTree(proc, signal = 'SIGKILL') {
  if (!proc || !proc.pid) return false;
  if (process.platform !== 'win32') {
    try {
      process.kill(-proc.pid, signal);
      return true;
    } catch {
      /* process group çoktan kapanmış olabilir; child fallback'ine düş */
    }
  }
  try {
    if (!proc.killed) proc.kill(signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * krevyx-hooks.json yükler (çalışma dizini → üst dizinler → ev dizini).
 * @param {string} [workingDir]
 * @returns {{ events: Object<string, string[]>, source: string|null }}
 */
function loadHooks(workingDir) {
  const candidates = [];
  if (workingDir) candidates.push(path.join(workingDir, HOOKS_FILE));
  if (workingDir) {
    let dir = path.dirname(workingDir);
    while (dir !== workingDir) {
      candidates.push(path.join(dir, HOOKS_FILE));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  candidates.push(path.join(require('os').homedir(), HOOKS_FILE));

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') continue;
      const events = {};
      for (const [event, cmds] of Object.entries(parsed)) {
        if (!VALID_EVENTS.has(event)) continue;
        const list = (Array.isArray(cmds) ? cmds : [cmds]).filter(
          (c) => typeof c === 'string' && c.trim().length > 0
        ).slice(0, MAX_HOOKS);
        if (list.length) events[event] = list;
      }
      if (Object.keys(events).length) return { events, source: file };
    } catch (_) {
      /* bozuk dosya: sessizce atla, audit'e düşmez */
    }
  }
  return { events: {}, source: null };
}

/**
 * Belirtilen olaydaki hook'ları sırayla çalıştırır. Başarısız olan görevi etkilemez.
 * @param {string} event
 * @param {Object} ctx - { workingDir, taskId, agentId, stepCount }
 * @param {Object} [opts] - { timeoutMs }
 * @returns {Promise<Array<{ cmd: string, ok: boolean, exit: number|null, error: string|null }>>}
 */
async function runHooks(event, ctx, opts) {
  if (!VALID_EVENTS.has(event)) return [];
  const { events } = loadHooks(ctx && ctx.workingDir);
  const cmds = events[event];
  if (!cmds || !cmds.length) return [];

  const results = [];
  const timeoutMs = (opts && opts.timeoutMs) || HOOK_TIMEOUT_MS;
  const env = Object.assign({}, process.env, {
    KREYX_EVENT: event,
    KREYX_TASK_ID: (ctx && ctx.taskId) || '',
    KREYX_AGENT: (ctx && ctx.agentId) || '',
    KREYX_STEPS: String((ctx && ctx.stepCount) || 0),
  });

  for (const cmd of cmds) {
    const res = { cmd, ok: false, exit: null, error: null };
    try {
      const proc = spawn('sh', ['-c', cmd], {
        cwd: ctx && ctx.workingDir,
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
        detached: process.platform !== 'win32',
      });
      const timer = setTimeout(() => {
        terminateProcessTree(proc, 'SIGKILL');
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      const code = await new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };
        proc.on('error', (e) => {
          res.error = e && e.message ? e.message : String(e);
          finish(null);
        });
        proc.on('exit', (c) => finish(c));
      });
      clearTimeout(timer);
      res.exit = code;
      res.ok = code === 0;
      if (!res.ok && res.error == null) res.error = `exit ${code}`;
    } catch (e) {
      res.error = e && e.message ? e.message : String(e);
    }
    results.push(res);
  }
  return results;
}

module.exports = {
  loadHooks,
  runHooks,
  terminateProcessTree,
  VALID_EVENTS,
  HOOKS_FILE,
  HOOK_TIMEOUT_MS,
};
