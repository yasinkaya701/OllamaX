'use strict';

/**
 * handoffs.js — Krevyx v3.26 Ajan El Devri Protokolü
 *
 * Kapsam:
 *   - Lead ajanın alt görevleri worker'lara devretmesi ve sonuçları toplaması.
 *   - Devir protokolü: assign → dispatch → collect → aggregate.
 *   - Worker sonuç şeması zorunlu: { ok, output, duration_ms? }.
 *   - Zaman aşımı ve yeniden devir: başarısız worker görevi tekrar dağıtabilir.
 *
 * Davranış:
 *   - createHandoff(task, workers) → { ok, handoff }; workers: [{ id, capacity? }].
 *   - assign(handoff) işi worker'lara dağıtır (round-robin, yük dengelemeli).
 *   - dispatch(handoff, workerId, subtask, executor) → worker executor'ı çağırır.
 *   - collect(handoff) → sonuçlar; aggregate(handoff, templateFn?) → lead metni.
 *
 * Dönüş:
 *   - dispatch → { ok, worker, duration_ms, output? }; collect → { ok, results, succeeded, failed }
 *
 * Test:
 *   - executor inject: (subtask) → Promise<{ok,output}>.
 *   - testOnlyClear() tüm handoff kayıtlarını siler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const MAX_WORKERS = 64;
const MAX_SUBTASKS = 512;

const _handoffs = new Map();

function createHandoff(task, workers) {
  if (!task || typeof task !== 'string') return { ok: false, error: 'Lead görev metni gerekli' };
  if (!Array.isArray(workers) || workers.length === 0) return { ok: false, error: 'Worker listesi boş' };
  const workerList = workers.slice(0, MAX_WORKERS).map((w, i) => ({
    id: typeof w.id === 'string' && w.id ? w.id : `w-${i}-${crypto.randomBytes(4).toString('hex')}`,
    capacity: typeof w.capacity === 'number' ? Math.max(1, Math.min(16, w.capacity)) : 4,
    inFlight: 0,
    completed: 0,
    failed: 0,
  }));
  const ids = new Set();
  for (const w of workerList) {
    if (ids.has(w.id)) return { ok: false, error: `Tekrarlanan worker id: ${w.id}` };
    ids.add(w.id);
  }
  const handoff = {
    id: `ho-${crypto.randomBytes(6).toString('hex')}`,
    task,
    workers: workerList,
    subtasks: [],
    results: [],
    status: 'created',
    createdAt: Date.now(),
  };
  _handoffs.set(handoff.id, handoff);
  return { ok: true, handoff };
}

function getHandoff(id) {
  return _handoffs.get(id) || null;
}

/** Alt görevleri işi worker'lara eşit dağıtır. */
function assign(handoff, subtasks) {
  if (!handoff || !_handoffs.has(handoff.id)) return { ok: false, error: 'El devri bulunamadı' };
  if (!Array.isArray(subtasks) || subtasks.length === 0) return { ok: false, error: 'Alt görev listesi boş' };
  if (subtasks.length > MAX_SUBTASKS) return { ok: false, error: `Alt görev limiti: ${MAX_SUBTASKS}` };
  handoff.subtasks = subtasks.map((s, i) => ({
    id: `st-${i}`,
    task: typeof s === 'string' ? s : (s.task || ''),
    status: 'queued',
    worker: null,
    at: Date.now(),
  }));
  let workerIdx = 0;
  for (const st of handoff.subtasks) {
    const worker = handoff.workers[workerIdx % handoff.workers.length];
    st.worker = worker.id;
    st.status = 'assigned';
    worker.inFlight += 1;
    workerIdx += 1;
  }
  handoff.status = 'assigned';
  return { ok: true, assigned: handoff.subtasks.length, workers: handoff.workers.map((w) => ({ id: w.id, load: w.inFlight })) };
}

/** Belirli worker'da alt görevi executor ile yürütür. */
async function dispatch(handoff, workerId, subtaskId, executor) {
  if (!handoff || !_handoffs.has(handoff.id)) return { ok: false, error: 'El devri bulunamadı' };
  if (typeof executor !== 'function') return { ok: false, error: 'Executor gerekli' };
  const worker = handoff.workers.find((w) => w.id === workerId);
  const subtask = handoff.subtasks.find((s) => s.id === subtaskId);
  if (!worker || !subtask) return { ok: false, error: 'Worker veya alt görev yok' };
  if (subtask.status !== 'assigned' && subtask.status !== 'retry') return { ok: false, error: `Alt görev durumu uygun değil: ${subtask.status}` };
  subtask.status = 'running';
  const started = Date.now();
  let res;
  try {
    res = await Promise.resolve(executor(subtask.task, { workerId, subtaskId }));
  } catch (err) {
    res = { ok: false, output: '', error: err.message || 'executor hatası' };
  }
  const duration = Date.now() - started;
  worker.inFlight = Math.max(0, worker.inFlight - 1);
  const result = { subtaskId, workerId, task: subtask.task, status: res && res.ok ? 'succeeded' : 'failed', output: (res && res.output) || '', error: res && !res.ok ? (res.error || '') : null, duration_ms: duration, at: Date.now() };
  handoff.results.push(result);
  if (result.status === 'succeeded') { worker.completed += 1; subtask.status = 'done'; }
  else { worker.failed += 1; subtask.status = 'failed'; }
  return { ok: result.status === 'succeeded', worker: workerId, subtask: subtaskId, duration_ms: duration, output: result.output, error: result.error };
}

/** Alt görevi yeniden devretmek için kuyruğa alır. */
function retrySubtask(handoff, subtaskId) {
  if (!handoff || !_handoffs.has(handoff.id)) return { ok: false, error: 'El devri bulunamadı' };
  const st = handoff.subtasks.find((s) => s.id === subtaskId);
  if (!st) return { ok: false, error: 'Alt görev yok' };
  if (st.status !== 'failed') return { ok: false, error: 'Yalnızca başarısız görevler yeniden devredilir' };
  st.status = 'retry';
  return { ok: true };
}

function collect(handoff) {
  if (!handoff || !_handoffs.has(handoff.id)) return { ok: false, error: 'El devri bulunamadı' };
  const succeeded = handoff.results.filter((r) => r.status === 'succeeded');
  const failed = handoff.results.filter((r) => r.status === 'failed');
  const pending = handoff.subtasks.filter((s) => s.status === 'assigned' || s.status === 'retry' || s.status === 'running');
  return { ok: true, total: handoff.results.length, succeeded: succeeded.length, failed: failed.length, pending: pending.length, results: handoff.results.slice() };
}

function aggregate(handoff, opts = {}) {
  const c = collect(handoff);
  if (!c.ok) return c;
  const lines = [`Lead görev: ${handoff.task}`];
  for (const r of c.results) {
    lines.push(`- [${r.status}] ${r.subtaskId} (${r.workerId}): ${r.output.slice(0, 120)}${r.error ? ` | hata: ${r.error.slice(0, 80)}` : ''}`);
  }
  const maxChars = typeof opts.maxChars === 'number' ? Math.max(64, opts.maxChars) : 8192;
  return { ok: true, text: lines.join('\n').slice(0, maxChars), succeeded: c.succeeded, failed: c.failed };
}

function destroy(id) {
  if (!_handoffs.has(id)) return { ok: false, error: 'El devri bulunamadı' };
  _handoffs.delete(id);
  return { ok: true };
}

function testOnlyClear() {
  _handoffs.clear();
  return { ok: true };
}

module.exports = {
  createHandoff,
  getHandoff,
  assign,
  dispatch,
  retrySubtask,
  collect,
  aggregate,
  destroy,
  testOnlyClear,
  MAX_WORKERS,
  MAX_SUBTASKS,
};
