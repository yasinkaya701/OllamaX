'use strict';

/**
 * vault-tasks.js — Krevyx v3.26 Kasa-Aware Ajan Görevleri
 *
 * Kapsam:
 *   - Ajan görevlerinin kasa (keyring vault) bağlamıyla yürütülmesi.
 *   - Görev tanımında istenen gizli anahtarların yürütme öncesi kasa doğrulaması.
 *   - Güvenli enjeksiyon: gizliler yalnızca süreç ortamına, çıktıda maskeleme.
 *   - Görev durum makinesi: queued → armed → running → done|failed|denied.
 *
 * Davranış:
 *   - createVaultTask(spec) → { ok, task }; spec { id?, name, prompt, secrets:[], timeoutMs? }.
 *   - arm(task, vaultApi) → kasa doğrulaması; eksik gizli varsa RED.
 *   - run(task, executor) → executor(prompt, envOverrides) çağrılır; çıktı maskeleme uygulanır.
 *   - maskOutput(text, secrets) gizli değerleri metinde '***' ile değiştirir.
 *
 * Dönüş:
 *   - arm → { ok, missing?, secretsReady }; run → { ok, output, masked }
 *
 * Test:
 *   - vaultApi inject edilebilir: { get(name) → {ok,value} }.
 *   - testOnlyClear() tüm görevleri temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const MAX_SECRETS_PER_TASK = 16;
const MAX_PROMPT_LENGTH = 65536;

const _tasks = new Map();

function createVaultTask(spec = {}) {
  if (!spec.prompt || typeof spec.prompt !== 'string') return { ok: false, error: 'Görev promptu gerekli' };
  const id = spec.id || `vt-${crypto.randomBytes(8).toString('hex')}`;
  const secrets = Array.isArray(spec.secrets)
    ? spec.secrets.filter((s) => typeof s === 'string' && s.length).slice(0, MAX_SECRETS_PER_TASK)
    : [];
  const task = {
    id,
    name: spec.name || id,
    prompt: spec.prompt.slice(0, MAX_PROMPT_LENGTH),
    secrets,
    status: 'created',
    timeoutMs: typeof spec.timeoutMs === 'number' ? Math.max(5000, Math.min(3600000, spec.timeoutMs)) : 300000,
    createdAt: Date.now(),
    maskedCount: 0,
  };
  _tasks.set(id, task);
  return { ok: true, task };
}

function getVaultTask(id) {
  return _tasks.get(id) || null;
}

/** Gizli değerleri çıktı metninde maskeler. */
function maskOutput(text, secretValues) {
  let masked = 0;
  let out = typeof text === 'string' ? text : '';
  for (const v of secretValues) {
    if (!v || typeof v !== 'string' || v.length < 4) continue;
    const escaped = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'g');
    const matches = out.match(re);
    if (matches) { masked += matches.length; out = out.replace(re, '***'); }
  }
  return { text: out, masked };
}

/** Kasa doğrulaması: istenen gizliler kasa API'sinde var mı? */
function arm(task, vaultApi) {
  if (!task || !_tasks.has(task.id)) return { ok: false, error: 'Görev bulunamadı' };
  if (!vaultApi || typeof vaultApi.get !== 'function') return { ok: false, error: 'Kasa API\'si gerekli' };
  const missing = [];
  const resolved = new Map();
  for (const name of task.secrets) {
    const r = vaultApi.get(name);
    if (!r || !r.ok) missing.push(name);
    else resolved.set(name, r.value);
  }
  if (missing.length) {
    task.status = 'failed';
    return { ok: false, error: `Eksik gizli anahtarlar: ${missing.join(', ')}`, missing };
  }
  task.status = 'armed';
  task._resolved = resolved;
  return { ok: true, secretsReady: resolved.size };
}

/** Görevi executor ile çalıştırır; ortam değişkenlerini enjekte edip çıktıyı maskeler. */
async function run(task, executor, opts = {}) {
  if (!task || !_tasks.has(task.id)) return { ok: false, error: 'Görev bulunamadı' };
  if (typeof executor !== 'function') return { ok: false, error: 'Executor gerekli' };
  if (task.status === 'failed' || task.status === 'denied') return { ok: false, error: `Görev durumu uygun değil: ${task.status}` };
  if (!task._resolved) {
    const ar = arm(task, opts.vaultApi);
    if (!ar.ok) return ar;
  }
  task.status = 'running';
  const envOverrides = {};
  task._resolved.forEach((v, name) => { envOverrides[`${name}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_')] = v; });
  const started = Date.now();
  let res;
  try {
    res = await Promise.resolve(executor(task.prompt, { env: envOverrides, timeoutMs: task.timeoutMs }));
  } catch (err) {
    task.status = 'failed';
    return { ok: false, error: `Yürütme hatası: ${err.message}`, duration_ms: Date.now() - started };
  }
  const secretValues = Array.from(task._resolved.values());
  const m = maskOutput(res && typeof res.output === 'string' ? res.output : JSON.stringify(res || ''), secretValues);
  task.maskedCount = m.masked;
  task.status = res && res.ok ? 'done' : 'failed';
  return { ok: !!(res && res.ok), output: m.text, masked: m.masked, duration_ms: Date.now() - started, error: res && !res.ok ? res.error : undefined };
}

function listVaultTasks() {
  return { ok: true, tasks: Array.from(_tasks.values()).map((t) => ({ id: t.id, name: t.name, status: t.status, secrets: t.secrets.length, createdAt: t.createdAt })) };
}

function destroy(id) {
  if (!_tasks.has(id)) return { ok: false, error: 'Görev bulunamadı' };
  const task = _tasks.get(id);
  task._resolved = null;
  _tasks.delete(id);
  return { ok: true };
}

function testOnlyClear() {
  _tasks.clear();
  return { ok: true };
}

module.exports = {
  createVaultTask,
  getVaultTask,
  arm,
  run,
  maskOutput,
  listVaultTasks,
  destroy,
  testOnlyClear,
  MAX_SECRETS_PER_TASK,
};
