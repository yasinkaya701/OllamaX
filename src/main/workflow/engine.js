/**
 * workflow/engine.js — Ajan iş akışı motoru (F2.6)
 *
 * YAML/JSON adım zinciri: her adım bir ajan çağrısıdır; önceki adımın
 * çıktısı {{step_n.output}} ve {{user_message}} değişkenleriyle kullanılır.
 *
 * Şema:
 *   { name, steps: [{ agent (id), provider, model, input }] }
 *
 * Çalıştırma: renderer ipc:3:workflow-run gönderir; motor adımları sırayla
 * yürütür, her adımın çıktısını sonraki adımın input değişkenlerine bağlar.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const configStore = require('../config/config-store');

const MAX_STEPS = 20;
const VAR_RE = /\{\{(step_(\d+)\.output|user_message)\}\}/g;

/**
 * Basit YAML ayrıştırıcı (yalnızca steps dizisi için; tam YAML kütüphanesi
 * olmadan, satır bazlı parsing). Karmaşık dokümanlar JSON olarak verilir.
 */
function parseSimpleYaml(text) {
  const wf = { name: '', steps: [] };
  if (!text || typeof text !== 'string') return wf;
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/#[^"']*$/, '').trimRight();
    if (!line.trim()) continue;
    const nameMatch = line.match(/^name:\s*"?([^"'\n]+)"?/);
    if (nameMatch) {
      wf.name = nameMatch[1].trim();
      continue;
    }
    if (line.trim() === 'steps:') continue;
    const stepStart = line.match(/^\s*-\s+agent:\s*(\S+)/);
    if (stepStart) {
      current = { agent: stepStart[1] };
      wf.steps.push(current);
      continue;
    }
    if (current) {
      const kv = line.match(/^\s*(\w+):\s*"?([^"'\n]+)"?/);
      if (kv) current[kv[1]] = kv[2].trim();
    }
  }
  return wf;
}

function parseWorkflow(source) {
  if (typeof source === 'object' && source !== null) return source;
  const text = typeof source === 'string' ? source : '';
  const t = text.trim();
  if (t.startsWith('{')) {
    try {
      return JSON.parse(t);
    } catch {
      return { name: '', steps: [] };
    }
  }
  return parseSimpleYaml(text);
}

function validateWorkflow(wf) {
  if (!wf || !Array.isArray(wf.steps)) return { ok: false, error: 'Geçersiz workflow: steps dizisi eksik.' };
  if (wf.steps.length === 0) return { ok: false, error: 'Workflow boş.' };
  if (wf.steps.length > MAX_STEPS) return { ok: false, error: `En fazla ${MAX_STEPS} adım.` };
  for (let i = 0; i < wf.steps.length; i += 1) {
    const s = wf.steps[i];
    if (!s || typeof s.agent !== 'string' || !s.agent.trim()) {
      return { ok: false, error: `Adım ${i + 1}: ajan kimliği eksik.` };
    }
  }
  return { ok: true };
}

/**
 * Değişken bağlamayı uygular: {{step_1.output}}, {{user_message}}
 */
function interpolate(input, vars) {
  return input.replace(VAR_RE, (match, full, idx) => {
    if (full === 'user_message') return vars.userMessage || '';
    const n = Number(idx);
    if (vars.steps && vars.steps[n - 1] !== undefined) return String(vars.steps[n - 1] || '');
    return '';
  });
}

function findAgentById(agents, agentId) {
  if (!Array.isArray(agents)) return null;
  return agents.find((a) => a && String(a.id) === String(agentId)) || null;
}

/**
 * Workflow'u çalıştırır. runFn: (agentDef, input) => Promise<string>
 * (ana ajan akışını çağıran fonksiyon; loop.js tarafından verilir)
 */
async function runWorkflow(wf, { userMessage, agents, runFn }) {
  const v = validateWorkflow(wf);
  if (!v.ok) return { ok: false, error: v.error, outputs: [] };

  const vars = { userMessage: typeof userMessage === 'string' ? userMessage : '', steps: [] };
  const outputs = [];

  for (let i = 0; i < wf.steps.length; i += 1) {
    const step = wf.steps[i];
    const agent = findAgentById(agents, step.agent) || { id: step.agent, name: step.agent };
    const input = interpolate(typeof step.input === 'string' ? step.input : userMessage, vars);
    let out = '';
    try {
      out = await runFn(agent, input);
    } catch (err) {
      out = `[HATA] Adım ${i + 1} başarısız: ${err?.message || err}`;
    }
    vars.steps[i] = out;
    outputs.push({ step: i + 1, agent: step.agent, input: input.slice(0, 500), output: out });
  }

  return { ok: true, outputs, final: outputs[outputs.length - 1]?.output || '' };
}

/**
 * Persistence: userData/ollamax/workflows/*.json (ve .yaml okunur)
 */
function workflowsDir() {
  return path.join(configStore.ollamaxRoot(), 'workflows');
}

function loadWorkflows() {
  try {
    const dir = workflowsDir();
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'));
    return files
      .map((f) => {
        try {
          const body = fs.readFileSync(path.join(dir, f), 'utf8');
          const wf = parseWorkflow(body);
          wf.id = f.replace(/\.(json|ya?ml)$/, '');
          wf.file = f;
          return wf;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function saveWorkflow(id, wf) {
  try {
    const dir = workflowsDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = String(id).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64);
    if (!safe) return { ok: false, error: 'Geçersiz kimlik.' };
    fs.writeFileSync(path.join(dir, `${safe}.json`), JSON.stringify(wf, null, 2), 'utf8');
    return { ok: true, id: safe };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function deleteWorkflow(id) {
  try {
    const safe = String(id).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64);
    fs.unlinkSync(path.join(workflowsDir(), `${safe}.json`));
    return { ok: true };
  } catch {
    return { ok: false, error: 'Workflow bulunamadı.' };
  }
}

module.exports = {
  parseWorkflow,
  validateWorkflow,
  interpolate,
  runWorkflow,
  loadWorkflows,
  saveWorkflow,
  deleteWorkflow,
  MAX_STEPS,
};
