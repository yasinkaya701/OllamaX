'use strict';
/**
 * agents-ext/task-queue.js — Krevyx v3.25 Görev Kuyruğu (Q-1)
 *
 * Asenkron görevleri sıraya koyar, eşzamanlılık limitine göre çalıştırır,
 * önceliklendirir, yeniden dener ve diskte kalıcı tutar (crash kurtarma).
 *
 * Görev durumu: queued → running → (succeeded | failed | retrying) → archived
 *
 * API:
 *   createQueue(name, opts)              → kuyruk
 *   queue.add(task)                      → { ok, taskId }
 *   queue.remove(taskId)
 *   queue.pause() / queue.resume()
 *   queue.cancel(taskId)
 *   queue.retry(taskId)
 *   queue.state()                        → durum + sayaçlar
 *   queue.peek(limit)                    → görev detayları
 *   queue.flush()                        → bitmişleri arşivle
 *   destroyQueue(name)
 *   loadQueues(opts)                     → diskten yükle (crash kurtarma)
 *
 * runner(task) async fonksiyonu opts.inject ile verilir; testler gerçek
 * iş yürütmeden akışı doğrular.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const VALID_STATUS = new Set(['queued', 'running', 'succeeded', 'failed', 'retrying', 'cancelled', 'archived']);
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const queues = new Map();

function dirFor(opts) {
  return opts.dir || path.join(os.homedir(), '.krevyx', 'queues');
}

function fileFor(name, opts) {
  return path.join(dirFor(opts), `${name}.json`);
}

function createQueue(name, opts = {}) {
  if (queues.has(name)) return { ok: false, error: 'Kuyruk zaten var' };
  if (typeof name !== 'string' || !name.trim()) return { ok: false, error: 'Kuyruk adı gerekli' };

  const concurrency = Math.max(1, Math.min(32, Number(opts.concurrency) || DEFAULT_CONCURRENCY));
  const maxRetries = Math.max(0, Math.min(10, Number(opts.maxRetries) || DEFAULT_MAX_RETRIES));
  const retryDelayMs = Math.max(0, Number(opts.retryDelayMs) || DEFAULT_RETRY_DELAY_MS);
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || DEFAULT_TIMEOUT_MS);
  const runner = typeof opts.runner === 'function' ? opts.runner : null;
  const fsMod = opts.fs || fs;
  const persist = opts.persist !== false;
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now();

  const tasks = new Map();
  let running = 0;
  let paused = false;
  let archived = [];
  let tickTimer = null;
  let destroyTimer = null;

  function persistState() {
    if (!persist) return;
    try {
      fsMod.mkdirSync(dirFor(opts), { recursive: true });
      fsMod.writeFileSync(
        fileFor(name, opts),
        JSON.stringify({
          name, concurrency, maxRetries, retryDelayMs, timeoutMs, paused,
          tasks: Array.from(tasks.values()),
          archived: archived.slice(-500),
          savedAt: clock(),
        }),
        'utf8',
      );
    } catch {
      /* sessiz — kalıcılık opsiyoneldir */
    }
  }

  function scheduleTick() {
    if (tickTimer) return;
    tickTimer = setTimeout(() => { tickTimer = null; void pump(); }, 100);
  }

  function setDone(task, status, output) {
    task.status = status;
    task.output = output === undefined ? task.output : output;
    task.finishedAt = clock();
    tasks.delete(task.id);
    archived.push({ ...task });
    if (archived.length > 2000) archived = archived.slice(-1000);
    persistState();
  }

  async function runOne(task) {
    running += 1;
    task.status = 'running';
    task.startedAt = clock();
    task.attempt = (task.attempt || 0) + 1;
    persistState();
    let result;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; }, timeoutMs);
    try {
      result = await runner(task);
      if (timedOut) {
        clearTimeout(timeout);
        if (task.attempt < maxRetries) {
          task.status = 'retrying';
          task.retryAt = clock() + retryDelayMs * task.attempt;
          tasks.set(task.id, task);
          scheduleTick();
          return;
        }
        setDone(task, 'failed', { error: 'Görev zaman aşımına uğradı' });
        return;
      }
    } catch (err) {
      if (!timedOut) clearTimeout(timeout);
      if (task.attempt < maxRetries) {
        task.status = 'retrying';
        task.retryAt = clock() + retryDelayMs * task.attempt;
        tasks.delete(task.id);
        tasks.set(task.id, task);
        scheduleTick();
        return;
      }
      setDone(task, 'failed', { error: String(err.message || err) });
      return;
    }
    clearTimeout(timeout);
    setDone(task, 'succeeded', result);
  }

  async function pump() {
    if (paused) return;
    while (running < concurrency && tasks.size) {
      let next = null;
      for (const t of tasks.values()) {
        if (t.status === 'queued' && (!t.retryAt || t.retryAt <= clock())) {
          if (!next || t.priority > next.priority || (t.priority === next.priority && t.createdAt < next.createdAt)) next = t;
        }
      }
      if (!next) break;
      tasks.delete(next.id);
      void runOne(next);
    }
  }

  const api = {
    name,
    get concurrency() { return concurrency; },
    add(task) {
      if (!task || typeof task !== 'object') return { ok: false, error: 'Görev tanımı gerekli' };
      const id = `task-${clock().toString(36)}-${tasks.size + archived.length}`;
      const entry = {
        id,
        type: typeof task.type === 'string' ? task.type : 'generic',
        priority: typeof task.priority === 'number' ? Math.max(-100, Math.min(100, task.priority)) : 0,
        payload: task.payload,
        status: 'queued',
        createdAt: clock(),
        attempt: 0,
        startedAt: null,
        finishedAt: null,
        retryAt: null,
        output: null,
      };
      tasks.set(id, entry);
      persistState();
      scheduleTick();
      return { ok: true, taskId: id };
    },
    remove(taskId) {
      const t = tasks.get(taskId);
      if (!t) return { ok: false, error: 'Görev bulunamadı' };
      if (t.status === 'running') return { ok: false, error: 'Çalışan görev kaldırılamaz; cancel kullanın' };
      tasks.delete(taskId);
      persistState();
      return { ok: true };
    },
    pause() { paused = true; persistState(); return { ok: true }; },
    resume() { paused = false; persistState(); scheduleTick(); return { ok: true }; },
    cancel(taskId) {
      const t = tasks.get(taskId);
      if (!t) return { ok: false, error: 'Görev bulunamadı' };
      t.status = 'cancelled';
      tasks.delete(taskId);
      archived.push({ ...t });
      persistState();
      return { ok: true };
    },
    retry(taskId) {
      const t = tasks.get(taskId) || archived.find((a) => a.id === taskId);
      if (!t) return { ok: false, error: 'Görev bulunamadı' };
      t.status = 'queued';
      t.attempt = 0;
      t.retryAt = null;
      t.output = null;
      archived = archived.filter((a) => a.id !== taskId);
      tasks.set(taskId, t);
      persistState();
      scheduleTick();
      return { ok: true };
    },
    state() {
      const counts = { queued: 0, running: 0, retrying: 0, succeeded: 0, failed: 0, cancelled: 0 };
      tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
      archived.forEach((t) => { if (VALID_STATUS.has(t.status)) counts[t.status] = (counts[t.status] || 0) + 1; });
      return {
        name, paused, concurrency, running,
        counts,
        total: tasks.size + archived.length,
      };
    },
    peek(limit) {
      const n = Math.max(1, Math.min(100, Number(limit) || 20));
      const all = Array.from(tasks.values()).concat(archived);
      all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return { ok: true, tasks: all.slice(0, n) };
    },
    flush() {
      const before = archived.length;
      archived = archived.filter((t) => t.status === 'queued' || t.status === 'running' || t.status === 'retrying');
      persistState();
      return { ok: true, removed: before - archived.length };
    },
    destroy() {
      if (tickTimer) { clearTimeout(tickTimer); tickTimer = null; }
      if (destroyTimer) { clearTimeout(destroyTimer); }
      tasks.clear();
      archived = [];
      queues.delete(name);
      if (persist) {
        try { fsMod.unlinkSync(fileFor(name, opts)); } catch { /* yok say */ }
      }
      return { ok: true };
    },
  };

  queues.set(name, api);

  /* Diskten geri yükleme (crash kurtarma) */
  if (persist) {
    try {
      const fp = fileFor(name, opts);
      if (fsMod.existsSync(fp)) {
        const data = JSON.parse(fsMod.readFileSync(fp, 'utf8'));
        if (Array.isArray(data.tasks)) {
          data.tasks.forEach((t) => {
            if (t.status === 'running') t.status = 'queued'; /* crash'te çalışanlar sıraya döner */
            if (t.status === 'retrying') { t.status = 'queued'; t.retryAt = null; }
            if (VALID_STATUS.has(t.status)) tasks.set(t.id, t);
          });
        }
        if (Array.isArray(data.archived)) archived = data.archived.slice(-500);
        scheduleTick();
      }
    } catch {
      /* bozuk dosya — temiz başla */
    }
  }

  return { ok: true, queue: api };
}

function getQueue(name) {
  return queues.get(name) || null;
}

function destroyQueue(name) {
  const q = queues.get(name);
  if (!q) return { ok: false, error: 'Kuyruk bulunamadı' };
  q.destroy();
  return { ok: true };
}

/**
 * Dizinindeki tüm *.json kuyruk dosyalarını geri yükler (uygulama açılışında).
 */
function loadQueues(opts = {}) {
  const fsMod = opts.fs || fs;
  const dir = dirFor(opts);
  const loaded = [];
  try {
    if (!fsMod.existsSync(dir)) return { ok: true, loaded };
    const files = fsMod.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const data = JSON.parse(fsMod.readFileSync(path.join(dir, f), 'utf8'));
        if (!data.name || queues.has(data.name)) continue;
        const res = createQueue(data.name, { ...opts, runner: null, persist: true });
        if (res.ok && Array.isArray(data.tasks)) {
          data.tasks.forEach((t) => {
            if (t.status === 'running') t.status = 'queued';
            if (t.status === 'retrying') { t.status = 'queued'; t.retryAt = null; }
            if (VALID_STATUS.has(t.status)) res.queue.tasks && res.queue.tasks.set && res.queue.tasks.set(t.id, t);
          });
        }
        loaded.push(data.name);
      } catch {
        /* tekil bozuk dosya diğerlerini etkilemez */
      }
    }
  } catch {
    return { ok: false, error: 'Kuyruk dizini okunamadı' };
  }
  return { ok: true, loaded };
}

function testOnlyClear() {
  queues.forEach((q) => q.destroy());
}

module.exports = {
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  createQueue,
  getQueue,
  destroyQueue,
  loadQueues,
  testOnlyClear,
};
