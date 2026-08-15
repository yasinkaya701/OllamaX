'use strict';

/**
 * code-agent-bridge.js — Anahtarsız, lokal kod ajanı köprüsü
 *
 * Kurulu kod ajanı CLI'larını (Claude Code, Codex, Antigravity)
 * child_process.spawn ile doğrudan çalıştırır; API anahtarı gerektirmez.
 *
 * Akış:
 *   1. ipc:3:code-agent-run { agentId, task, chain } alır
 *   2. Ajan CLI komutunu spawn eder, stdout satır satır yakalanır
 *   3. Her anlamlı satır bir adım (step) olarak akıya düşer
 *   4. Zincir modunda görev "handoff" prompt'u ile zenginleştirilir
 *
 * Ajan bulunamazsa { ok: false, error, missing: true } döner;
 * renderer otomatik olarak simülasyon moduna geçer.
 */

const { spawn } = require('child_process');

const AGENT_PROFILES = {
  'claude-code': {
    label: 'Claude Code',
    detect: ['claude', 'claude-code'],
    buildCmd: (task) => ['claude', ['-p', task, '--output-format', 'stream-json']],
    labeler: (line) => {
      // Claude Code stream-json satırları JSON; düz modda regex ile etiketlenir
      const l = line.trim();
      if (/^(\[plan\]|\[keşif\]|\[düzenle\]|\[patch\]|Yapılıyor|Tamamlandı)/i.test(l)) return 'plan';
      if (/^(test|jest|commit|PR)/i.test(l)) return 'plan';
      return 'plan';
    },
  },
  codex: {
    label: 'Codex',
    detect: ['codex'],
    buildCmd: (task) => ['codex', ['prompt', '--stdin'], task],
    labeler: () => 'plan',
  },
  antigravity: {
    label: 'Antigravity',
    detect: ['antigravity', 'gemini-cli'],
    buildCmd: (task) => ['antigravity', ['--prompt', task]],
    labeler: (line) => (/inceleme|review|öneri/i.test(line) ? 'plan' : 'plan'),
  },
};

function findExecutable(profile) {
  for (const name of profile.detect) {
    try {
      const args = process.platform === 'win32' ? [name] : ['-v', name];
      // Basit kontrol: komut spawn edilebiliyor mu
      const p = spawn(process.platform === 'win32' ? name : 'command', args, { shell: false, stdio: 'ignore' });
      return new Promise((resolve) => {
        p.on('error', () => resolve(null));
        p.on('spawn', () => resolve(name));
        const t = setTimeout(() => {
          p.kill();
          resolve(null);
        }, 2000);
        p.on('exit', (code) => {
          clearTimeout(t);
          // spawn gerçekleşti = executable PATH'te (kod 127 değilse)
          resolve(code === 127 ? null : name);
        });
      });
    } catch {
      continue;
    }
  }
  return null;
}

function sanitizeTask(task, chain) {
  if (!chain) return task;
  return `${task} [HANDOFF] zincir görevi: önceki ajan çıktısını işleyip ilerlet.`;
}

function runCli(profile, task, timeoutMs = 120000) {
  const args = profile.buildCmd(task);
  const [cmd, cmdArgs] = [args[0], args.slice(1)];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, cmdArgs, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return resolve({ ok: false, error: String(err.message).slice(0, 200), missing: true });
    }

    const steps = [];
    let buffer = '';
    const pushStep = (text) => {
      const t = text.trim();
      if (!t) return;
      steps.push({ text: t.slice(0, 500), kind: profile.labeler(t) });
    };

    const finish = (result) => {
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      finish({ ok: true, steps, truncated: true });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(pushStep);
    });
    child.stderr.on('data', (chunk) => {
      const lines = String(chunk).split('\n');
      lines.forEach((l) => {
        if (l.trim()) pushStep(l);
      });
    });

    child.on('error', (err) => {
      finish({ ok: false, error: String(err.message).slice(0, 200), missing: true });
    });
    child.on('exit', (code) => {
      if (buffer) pushStep(buffer);
      finish({ ok: true, steps, exitCode: code });
    });
  });
}

async function detectAgents() {
  const result = {};
  const entries = Object.entries(AGENT_PROFILES);
  const checks = entries.map(async ([id, profile]) => {
    const exe = await findExecutable(profile);
    result[id] = { label: profile.label, executable: exe, connected: Boolean(exe) };
  });
  await Promise.all(checks);
  return result;
}

async function runCodeAgent(agentId, task, chain) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return { ok: false, error: 'Bilinmeyen ajan: ' + agentId };

  const exe = await findExecutable(profile);
  if (!exe) {
    return { ok: false, error: `${profile.label} kurulu değil — PATH'te "${profile.detect[0]}" bulunamadı.`, missing: true };
  }

  const finalTask = sanitizeTask(task, chain);
  return runCli(profile, finalTask);
}

module.exports = { runCodeAgent, detectAgents, AGENT_PROFILES };
