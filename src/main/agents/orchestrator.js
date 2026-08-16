'use strict';

/**
 * orchestrator.js — Lider-ajan orkestra altyapısı (anahtarsız, lokal)
 *
 * Sorumluluklar:
 *   1. Ajan kayıt defteri: kurulu lokal ajanları keşfeder (PATH, MCP, Ollama socket)
 *   2. Evrensel dispatcher: hangi taşıma ile konuşulacağını (spawn-cli /
 *      stdin-stream / mcp / ollama-http) soyutlar; hepsi aynı run() arayüzünü verir
 *   3. Zincir handoff protokolü: lider ajanın çıktısını standart JSON'a çevirip
 *      bir sonraki ajanın görev prompt'una enjekte eder
 *
 * Ajan örnekleri: Claude Code (şef), Codex CLI, Antigravity, yerel Ollama,
 * Terminal (kabuk), Dosya sistemi (sandbox'lı okuma/yazma).
 */

const { spawn } = require('child_process');
const http = require('http');

/* ------------------------------------------------------------------ */
/* 1) Ajan kayıt defteri                                               */
/* ------------------------------------------------------------------ */

const REGISTRY = {
  'claude-code': {
    label: 'Claude Code',
    kind: 'cli',
    transports: [
      { type: 'spawn', cmd: 'claude', args: (t) => ['-p', t, '--output-format', 'stream-json'], timeout: 300000 },
      { type: 'spawn', cmd: 'claude', args: (t) => ['-p', t], timeout: 300000 },
    ],
  },
  codex: {
    label: 'Codex',
    kind: 'cli',
    transports: [
      { type: 'spawn', cmd: 'codex', args: () => ['prompt'], stdin: true, timeout: 300000 },
    ],
  },
  antigravity: {
    label: 'Antigravity',
    kind: 'cli',
    transports: [
      { type: 'spawn', cmd: 'antigravity', args: (t) => ['--prompt', t], timeout: 300000 },
      { type: 'spawn', cmd: 'gemini', args: (t) => ['-p', t], timeout: 300000 },
    ],
  },
  ollama: {
    label: 'Ollama (Yerel)',
    kind: 'http',
    transports: [
      { type: 'ollama-http', host: 'http://127.0.0.1:11434', timeout: 240000 },
    ],
  },
  shell: {
    label: 'Terminal (Shell)',
    kind: 'cli',
    transports: [
      { type: 'spawn', cmd: process.platform === 'win32' ? 'cmd' : 'sh', args: () => [process.platform === 'win32' ? '/c' : '-c'], stdin: true, timeout: 120000 },
    ],
  },
};

const _cache = new Map(); // agentId -> { label, kind, transport, executable }

function probeSpawn(cmd) {
  return new Promise((resolve) => {
    try {
      const args = process.platform === 'win32' ? [cmd] : ['--version'];
      const p = spawn(process.platform === 'win32' ? cmd : 'command', args, { shell: false, stdio: 'ignore' });
      const timer = setTimeout(() => {
        try { p.kill(); } catch { /* noop */ }
      }, 2500);
      p.on('error', () => { clearTimeout(timer); resolve(false); });
      p.on('spawn', () => { clearTimeout(timer); });
      p.on('exit', (code) => { clearTimeout(timer); resolve(code !== 127); });
    } catch {
      resolve(false);
    }
  });
}

async function discoverAgent(agentId) {
  const reg = REGISTRY[agentId];
  if (!reg) return null;

  if (reg.kind === 'http') {
    // Ollama HTTP probe
    return new Promise((resolve) => {
      const tr = reg.transports[0];
      const url = `${tr.host}/api/tags`;
      const req = http.get(url, { timeout: 2500 }, (res) => {
        resolve({ label: reg.label, kind: 'http', transport: tr, executable: 'ollama', reachable: res.statusCode === 200 });
      });
      req.on('error', () => resolve({ label: reg.label, kind: 'http', transport: tr, executable: 'ollama', reachable: false }));
      req.on('timeout', () => { req.destroy(); resolve({ label: reg.label, kind: 'http', transport: tr, executable: 'ollama', reachable: false }); });
    });
  }

  let chosen = null;
  for (const tr of reg.transports) {
    if (tr.type !== 'spawn') continue;
    const ok = await probeSpawn(tr.cmd);
    if (ok) { chosen = tr; break; }
  }
  return { label: reg.label, kind: reg.kind, transport: chosen, executable: chosen ? chosen.cmd : null, reachable: Boolean(chosen) };
}

async function discoverAll() {
  const ids = Object.keys(REGISTRY);
  const results = await Promise.all(ids.map(discoverAgent));
  const out = {};
  ids.forEach((id, i) => { out[id] = results[i]; });
  return out;
}

/* ------------------------------------------------------------------ */
/* 2) Evrensel dispatcher: run(agentId, task, opts)                    */
/* ------------------------------------------------------------------ */

function runHttpOllama(tr, model, task) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: model || 'llama3.2:1b', prompt: task, stream: false });
    const url = new URL(`${tr.host}/api/generate`);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: tr.timeout }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          resolve({ ok: true, steps: [{ text: (j.response || '').trim(), kind: 'plan' }] });
        } catch {
          resolve({ ok: false, error: 'Ollama yanıtı ayrıştırılamadı' });
        }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: String(e.message).slice(0, 200) }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'zaman aşımı' }); });
    req.write(body);
    req.end();
  });
}

function runSpawnStream(tr, task) {
  return new Promise((resolve) => {
    let child;
    try {
      const args = typeof tr.args === 'function' ? tr.args(task) : (tr.args || []);
      child = spawn(tr.cmd, args, { shell: false, stdio: tr.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      return resolve({ ok: false, error: String(err.message).slice(0, 200), missing: true });
    }

    const steps = [];
    let buffer = '';
    const push = (text) => {
      const t = text.trim();
      if (!t) return;
      steps.push({ text: t.slice(0, 500), kind: 'plan' });
    };
    const finish = (res) => { clearTimeout(timer); resolve(res); };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* noop */ }
      finish({ ok: true, steps, truncated: true });
    }, tr.timeout);

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(push);
    });
    child.stderr.on('data', (chunk) => String(chunk).split('\n').forEach(push));
    child.on('error', (err) => finish({ ok: false, error: String(err.message).slice(0, 200), missing: true }));
    child.on('exit', () => {
      if (buffer) push(buffer);
      finish({ ok: true, steps, exitCode: child.exitCode });
    });

    if (tr.stdin) {
      child.stdin.write(task + '\n');
      child.stdin.end();
    }
  });
}

async function runAgent(agentId, task, opts = {}) {
  const reg = REGISTRY[agentId];
  if (!reg) return { ok: false, error: 'Bilinmeyen ajan: ' + agentId };

  let info = _cache.get(agentId);
  if (!info) {
    info = await discoverAgent(agentId);
    _cache.set(agentId, info);
  }
  if (!info || !info.reachable || !info.transport) {
    return { ok: false, error: `${info ? info.label : agentId} erişilebilir değil — kurulu CLI/MCP bulunamadı.`, missing: true };
  }

  const tr = info.transport;
  const payload = applyHandoff(task, opts.chain);

  if (tr.type === 'ollama-http') {
    return runHttpOllama(tr, opts.model);
  }
  return runSpawnStream(tr, payload);
}

/* ------------------------------------------------------------------ */
/* 3) Zincir handoff protokolü                                         */
/* ------------------------------------------------------------------ */

function normalizeOutput(runResult) {
  const steps = (runResult && Array.isArray(runResult.steps) ? runResult.steps : []).slice(-8);
  return steps.map((s) => (typeof s === 'string' ? s : s.text)).filter(Boolean);
}

function normalizeFullOutput(runResult) {
  /* V3.16: tam çıktı forwarding için ham adımları birleştir */
  const steps = runResult && Array.isArray(runResult.steps) ? runResult.steps : [];
  const joined = steps.map((s) => (typeof s === 'string' ? s : s.text)).filter(Boolean).join('\n');
  return joined.slice(0, 8000);
}

function applyHandoff(task, chain) {
  if (!chain) return task;
  const ctx = chain.context || [];
  if (!Array.isArray(ctx) || ctx.length === 0) return task;
  const history = ctx.map((c) => `- ${c.agent}: ${c.text}`).join('\n');
  const head = chain.headAgent ? ` [ŞEF: ${chain.headAgent}]` : '';
  return `[ZİNCİR HANDOFF]${head}\nÖnceki ajan çıktıları:\n${history}\n\nDevam görevi: ${task}`;
}

function applyHandoffForward(task, opts) {
  /* V3.16 (F3-2): prompt forwarding — önceki ajanın TAM çıktısı bir sonraki
     ajanın görevine enjekte edilir; şef (head-agent) çıktısı ayrı bloklanır */
  const ctx = opts && opts.context ? opts.context : [];
  if (!Array.isArray(ctx) || ctx.length === 0) return task;
  const blocks = ctx
    .map((c) => {
      const tag = c.head ? `${c.agent} [ŞEF]` : c.agent;
      return `=== ${tag} ===\n${c.fullText || c.text}\n=== son ===`;
    })
    .join('\n\n');
  return `[ZİNCİR FORWARD]\nÖnceki ajanların tam çıktıları:\n${blocks}\n\nYeni görev: ${task}`;
}

async function runChain(order, rootTask, opts = {}) {
  const forward = Boolean(opts && opts.forwardPrompt);
  const headAgent = (opts && typeof opts.headAgent === 'string' && order.includes(opts.headAgent)) ? opts.headAgent : order[0];
  const results = [];
  const context = [];
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i];
    const payload = forward
      ? applyHandoffForward(rootTask, { context, headAgent })
      : rootTask;
    const res = await runAgent(id, payload, { chain: forward ? null : (i === 0 ? null : { context, headAgent }) });
    results.push({ agent: id, result: res });
    context.push({
      agent: REGISTRY[id] ? REGISTRY[id].label : id,
      text: normalizeOutput(res).join(' | ').slice(0, 400),
      fullText: normalizeFullOutput(res),
      head: id === headAgent,
    });
    if (res && !res.ok) break; // zincir, bir ajan hata verince durur
  }
  return { ok: results.every((r) => r.result && r.result.ok), steps: results, forwardPrompt: forward, headAgent };
}

module.exports = { REGISTRY, discoverAgent, discoverAll, runAgent, runChain, applyHandoff, applyHandoffForward, normalizeOutput, normalizeFullOutput, _cache };
