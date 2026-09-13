'use strict';

/**
 * code-agent-bridge.js v2 — Krevyx v3.19: gerçek süreç düzeyinde kod ajanı köprüsü
 *
 * Kurulu kod ajanı CLI'larını (Claude Code, Codex, Antigravity/gemini-cli)
 * child_process.spawn ile doğrudan çalıştırır; API anahtarı gerektirmez.
 */

const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const AGENT_PROFILES = {
  'claude-code': {
    label: 'Claude Code',
    detect: ['claude'],
    buildCmd: (task, opts) => {
      const args = ['-p', task, '--output-format', 'stream-json', '--verbose'];
      if (opts && opts.resume) args.push('--resume');
      return args;
    },
    parser: 'stream-json',
    cwdFrom: 'workspace',
  },
  codex: {
    label: 'Codex',
    detect: ['codex'],
    buildCmd: () => ['exec', '--skip-git-repo-check'],
    parser: 'lines',
    stdin: true,
    cwdFrom: 'workspace',
  },
  antigravity: {
    label: 'Antigravity',
    detect: ['antigravity', 'gemini'],
    buildCmd: (task, opts) => {
      if (opts && opts.executable === 'gemini') return ['-p', task];
      return ['--prompt', task];
    },
    parser: 'lines',
    cwdFrom: 'workspace',
  },
};

const cwdRegistry = new Map();
const liveProcesses = new Map();
const lifecycleIntervals = new Map();

function unrefTimer(timer) {
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

function clearLifecycleInterval(agentId) {
  const interval = lifecycleIntervals.get(agentId);
  if (!interval) return false;
  clearInterval(interval);
  lifecycleIntervals.delete(agentId);
  return true;
}

function win() {
  const wins = BrowserWindow.getAllWindows();
  return wins.length > 0 ? wins[0] : null;
}

function emitStep(agentId, kind, text, seq) {
  const w = win();
  if (w && !w.isDestroyed()) {
    try {
      w.webContents.send('ipc:3:code-agent:step', { agentId, kind, text, seq, t: Date.now() });
    } catch {
      /* pencere kapanmış olabilir */
    }
  }
}

function emitDone(agentId, result) {
  const w = win();
  if (w && !w.isDestroyed()) {
    try {
      w.webContents.send('ipc:3:code-agent:done', { agentId, result });
    } catch {
      /* noop */
    }
  }
}

function findExecutable(profile) {
  const isWin = process.platform === 'win32';
  const probes = profile.detect.map(
    (name) => new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      try {
        const args = isWin ? [name] : ['-c', `command -v ${name}`];
        const p = spawn(isWin ? name : 'sh', args, { shell: false, stdio: 'ignore' });
        p.on('error', () => finish(null));
        const timer = unrefTimer(setTimeout(() => {
          try { p.kill(); } catch { /* noop */ }
          finish(null);
        }, 2000));
        p.on('exit', (code) => {
          clearTimeout(timer);
          finish(code === 0 ? name : null);
        });
      } catch {
        finish(null);
      }
    })
  );
  return Promise.all(probes).then((results) => results.find((r) => r != null) || null);
}

function parseStreamJsonLine(raw) {
  if (raw == null) return null;
  const line = String(raw).trim();
  if (!line || line[0] !== '{') return null;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || !parsed.type) return null;
  switch (parsed.type) {
    case 'assistant': {
      const content = parsed.message && Array.isArray(parsed.message.content)
        ? parsed.message.content
        : [];
      const texts = content
        .filter((item) => item && item.type === 'text')
        .map((item) => String(item.text || '').trim())
        .filter(Boolean);
      if (texts.length === 0) return null;
      return { kind: 'plan', text: texts.join(' ') };
    }
    case 'tool_use': {
      const name = (parsed.tool_input && parsed.tool_input.command) || parsed.tool_name || 'araç';
      return { kind: 'araç', text: `araç: ${String(name).slice(0, 120)}` };
    }
    case 'result': {
      const summary = parsed.result && typeof parsed.result === 'object' && parsed.result.type === 'text' && parsed.result.content
        ? String(parsed.result.content).slice(0, 400)
        : null;
      return { kind: 'sonuç', text: summary || 'sonuç alındı' };
    }
    case 'system': {
      const text = parsed.subtype === 'init' && parsed.text ? String(parsed.text).slice(0, 200) : '';
      return text ? { kind: 'plan', text } : null;
    }
    default:
      return null;
  }
}

function parseLineTag(line, profileId) {
  const text = line.trim();
  if (profileId === 'antigravity' && /inceleme|review|öneri/i.test(text)) return 'plan';
  if (profileId === 'claude-code' && /^(\[plan\]|\[keşif\]|\[düzenle\]|\[patch\]|Yapılıyor|Tamamlandı)/i.test(text)) return 'plan';
  if (/^(test|jest|commit|PR)/i.test(text)) return 'plan';
  if (/Hata|error|failed|başarısız/i.test(text)) return 'sonuç';
  return 'plan';
}

const MAX_TASK_BYTES = 32 * 1024;
function sanitizeTask(task, chain) {
  let text = task == null ? '' : String(task);
  text = text.replace(/\0/g, '').replace(/\uFFFD/g, '');
  text = Array.from(text).filter((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  }).join('');
  text = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  text = text.slice(0, MAX_TASK_BYTES);
  if (!text) text = 'yok';
  if (!chain) return text;
  return `${text} [HANDOFF] zincir görevi: önceki ajan çıktısını işleyip ilerlet.`;
}

function resolveCwd(agentId, opts) {
  const fs = require('fs');
  const raw = opts && opts.workingDir ? opts.workingDir : cwdRegistry.get(agentId) || process.cwd();
  try {
    const stat = fs.statSync(raw);
    if (stat.isDirectory()) {
      if (opts && opts.workingDir) cwdRegistry.set(agentId, raw);
      return raw;
    }
  } catch {
    /* güvenli dizine düş */
  }
  const safe = process.cwd();
  if (opts && opts.workingDir) cwdRegistry.set(agentId, safe);
  return safe;
}

function runCli(profile, profileId, task, timeoutMs, opts) {
  const args = profile.buildCmd(task, opts);
  const cwd = resolveCwd(profileId, opts);
  const exe = opts && opts.executable ? String(opts.executable) : profile.detect[0];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, {
        shell: false,
        stdio: profile.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, ...((opts && opts.env) || {}) },
      });
    } catch (err) {
      resolve({ ok: false, error: String(err.message).slice(0, 200), missing: true });
      return;
    }

    liveProcesses.set(profileId, { child, killed: false });

    let finished = false;
    const steps = [];
    let buffer = '';
    let seq = 0;

    const push = (text, kind) => {
      try {
        const value = String(text || '').trim();
        if (!value) return;
        seq += 1;
        const entry = { text: value.slice(0, 500), kind: kind || 'plan' };
        steps.push(entry);
        emitStep(profileId, entry.kind, entry.text, seq);
      } catch {
        /* parser/emit hatası akışı durdurmaz */
      }
    };

    let timer;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      liveProcesses.delete(profileId);
      try { emitDone(profileId, result); } catch { /* noop */ }
      resolve(result);
    };

    timer = unrefTimer(setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch {
        /* noop */
      }
      finish({ ok: true, steps, truncated: true });
    }, timeoutMs));

    const safeData = (parser) => (chunk) => {
      try {
        buffer += String(chunk);
        if (buffer.length > 2 * 1024 * 1024) buffer = buffer.slice(-1024 * 1024);
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach((raw) => {
          if (parser === 'stream-json') {
            const parsed = parseStreamJsonLine(raw);
            if (parsed) push(parsed.text, parsed.kind);
          } else if (raw.trim()) {
            push(raw, parseLineTag(raw, profileId));
          }
        });
      } catch {
        /* bozuk veri akışı durdurmaz */
      }
    };

    child.stdout.on('data', safeData(profile.parser));
    child.stderr.on('data', safeData(profile.parser));
    child.on('error', (err) => finish({ ok: false, error: String(err && err.message).slice(0, 200), missing: true }));
    child.on('exit', (code) => {
      if (buffer && profile.parser !== 'stream-json') push(buffer, parseLineTag(buffer, profileId));
      finish({ ok: true, steps, exitCode: code });
    });

    if (profile.stdin) {
      try {
        if (child.stdin && !child.stdin.destroyed) {
          child.stdin.write(task + '\n');
          child.stdin.end();
        }
      } catch {
        /* erken ölen süreçte stdin yazısı atlanır */
      }
    }
  });
}

async function stopAgent(agentId) {
  const entry = liveProcesses.get(agentId);
  clearLifecycleInterval(agentId);
  if (!entry || entry.killed) return { ok: true, stopped: false, reason: 'çalışan süreç yok' };
  entry.killed = true;
  try {
    if (entry.child && !entry.child.killed) entry.child.kill('SIGTERM');
  } catch (err) {
    return { ok: false, error: String(err && err.message).slice(0, 200) };
  }
  unrefTimer(setTimeout(() => {
    try {
      if (entry.child && !entry.child.killed) entry.child.kill('SIGKILL');
    } catch {
      /* noop */
    }
  }, 1500));
  return { ok: true, stopped: true };
}

async function detectAgents() {
  const result = {};
  const checks = Object.entries(AGENT_PROFILES).map(async ([id, profile]) => {
    const exe = await findExecutable(profile);
    result[id] = {
      label: profile.label,
      executable: exe,
      connected: Boolean(exe),
      parser: profile.parser,
      workingDir: cwdRegistry.get(id) || null,
    };
  });
  await Promise.all(checks);
  return result;
}

function attachMemoryContext(profileId, task, workingDir) {
  try {
    const mem = require('./project-memory');
    const { task: next, memoryFiles } = mem.attachMemory(task, workingDir);
    if (memoryFiles && memoryFiles.length) {
      emitStep(profileId, 'plan', `hafıza iliştirildi: ${memoryFiles.map((file) => path.basename(file)).join(', ')}`, 0);
    }
    return next;
  } catch {
    return task;
  }
}

async function runLifecycleHooks(profileId, hookType, ctx) {
  try {
    const hooks = require('./agent-hooks');
    const results = await hooks.runHooks(hookType, ctx || {});
    if (!results || !results.length) return [];
    const lines = results
      .filter((result) => result && result.cmd)
      .map((result) => `[${result.ok ? 'OK' : 'HATA'}] ${result.cmd}`)
      .join(' | ');
    if (lines) emitStep(profileId, 'plan', `kanca (${hookType}): ${lines.slice(0, 400)}`, 0);

    if (hookType === 'task-start' && ctx && ctx.workingDir) {
      clearLifecycleInterval(profileId);
      const interval = unrefTimer(setInterval(() => {
        const entry = liveProcesses.get(profileId);
        if (!entry) {
          clearLifecycleInterval(profileId);
          return;
        }
        runLifecycleHooks(profileId, 'step', {
          agentId: profileId,
          workingDir: ctx.workingDir,
          stepCount: entry.stepsCount || 0,
        });
      }, 5 * 60 * 1000));
      lifecycleIntervals.set(profileId, interval);
    } else if (hookType === 'task-done' || hookType === 'task-fail') {
      clearLifecycleInterval(profileId);
    }
    return results;
  } catch {
    return [];
  }
}

async function runCodeAgent(agentId, task, chain) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return { ok: false, error: 'Bilinmeyen ajan: ' + agentId };

  await stopAgent(agentId);

  const exe = await findExecutable(profile);
  if (!exe) {
    return { ok: false, error: `${profile.label} kurulu değil — PATH'te "${profile.detect[0]}" bulunamadı.`, missing: true };
  }

  const opts = {
    resume: agentId === 'claude-code',
    executable: exe,
  };

  const workingDir = resolveCwd(agentId, opts);
  const finalTask = sanitizeTask(attachMemoryContext(agentId, String(task || ''), workingDir), chain);

  await runLifecycleHooks(agentId, 'task-start', { agentId, workingDir, stepCount: 0 });

  const result = await runCli(profile, agentId, finalTask, 300000, opts);

  await runLifecycleHooks(agentId, result && result.ok ? 'task-done' : 'task-fail', {
    agentId,
    workingDir,
    stepCount: result && Array.isArray(result.steps) ? result.steps.length : 0,
  });

  try {
    const grading = require('./grade-task');
    const diff = require('./diff-review');
    if (result && result.ok && cwdRegistry.get(agentId)) {
      const review = diff.buildDiffReview(cwdRegistry.get(agentId));
      if (review && review.ok) result.diffReview = review.summary;
    }
    const gradeOpts = (opts && opts.grade) || {};
    if (gradeOpts && gradeOpts.provider) {
      const remediationBudget = gradeOpts.maxRetry === 0 ? 0 : 1;
      for (let attempt = 0; attempt <= remediationBudget; attempt += 1) {
        const grade = await grading.gradeTask({
          provider: gradeOpts.provider,
          apiKey: gradeOpts.apiKey,
          task: finalTask,
          steps: (result && result.steps) || [],
          ok: Boolean(result && result.ok),
        });
        if (grade) result.grading = grade;

        const issueTexts = grade && Array.isArray(grade.issues)
          ? grade.issues
            .map((issue) => (typeof issue === 'string' ? issue : (issue.text || issue.message || JSON.stringify(issue) || '')))
            .filter(Boolean)
            .slice(0, 5)
          : [];

        const remediationNeeded = attempt < remediationBudget
          && grade
          && Array.isArray(grade.issues)
          && grade.issues.length > 0
          && (grade.score || 0) < 80;
        if (!remediationNeeded) break;

        const retryTask = sanitizeTask(
          String(task || '') + '\n\n[DÜZELTME DÖNGÜSÜ] Görevin çıktısı değerlendirme modelinden şu sorunlarla döndü. Bu sorunları düzelt ve görevi tamamla: ' + issueTexts.join('; '),
          chain
        );
        emitStep(agentId, 'plan', `Grading: sorun bulundu (${grade.issues.length} adet), düzeltme turu ${attempt + 1}/${remediationBudget + 1}`, 0);
        const retryResult = await runCli(profile, agentId, retryTask, 300000, opts);
        if (retryResult) {
          result.steps = (result.steps || []).concat(retryResult.steps || []);
          result.remediation = { attempts: attempt + 1, gradeBefore: grade ? grade.score : null };
        }
      }
    }
  } catch {
    /* değerlendirmenin hatası ana sonucu etkilemez */
  } finally {
    clearLifecycleInterval(agentId);
  }

  return result;
}

async function runAgentPlan(agentId, task) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return { ok: false, error: 'Bilinmeyen ajan: ' + agentId };

  const exe = await findExecutable(profile);
  if (!exe) return { ok: false, error: `${profile.label} kurulu değil`, missing: true };

  const planPrompt = sanitizeTask(
    String(task || '') + ' Bu görev için adım adım bir plan çıkar: hangi araçlar kullanılacak, hangi dosyalara dokunulacak, hangi riskler var. YALNIZCA plan yap — hiçbir değişiklik uygulamak yok. [PLAN MODU]',
    null
  );

  const runPromise = runCli(profile, agentId, planPrompt, 120000, {
    executable: exe,
    resume: false,
  });

  let planTimer;
  const timed = new Promise((resolve) => {
    planTimer = unrefTimer(setTimeout(() => resolve(null), 45000));
  });
  const race = await Promise.race([runPromise, timed]);
  clearTimeout(planTimer);
  if (race === null) await stopAgent(agentId);
  const base = race || { ok: true, steps: [], planMode: true };
  base.planMode = true;
  return base;
}

module.exports = {
  runCodeAgent,
  runAgentPlan,
  detectAgents,
  stopAgent,
  runCli,
  resolveCwd,
  sanitizeTask,
  AGENT_PROFILES,
  parseStreamJsonLine,
  parseLineTag,
  cwdRegistry,
  liveProcesses,
  lifecycleIntervals,
  clearLifecycleInterval,
  unrefTimer,
};
