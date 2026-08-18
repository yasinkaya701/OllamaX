'use strict';
/**
 * agents-ext/multi-agent.js — Krevyx v3.25 Çoklu Ajan Orkestrasyonu (Q-2)
 *
 * Lead + worker havuzu: bir şef görevi worker'lara dağıtır, sonuçları
 * toplar ve birleştirir. Worker kapasitesine göre dağıtım yapılır;
 * meşgul worker'a görev verilmez, kuyruğa düşer.
 *
 * API:
 *   createPool(opts)                        → { ok, pool }
 *   pool.register(worker)                   → worker kaydı
 *   pool.distribute(tasks, strategy)        → atama planı
 *   pool.dispatch(workerId, task)           → tek görev gönder
 *   pool.runLead(leadPrompt, workerTasks)   → lead ajan + fan-out
 *   pool.state()
 *   testOnlyClear()
 *
 * Worker arayüzü: { id, label, run(taskPayload) → Promise<result>, busy() }
 * Testlerde `run` ve `busy` inject edilebilir.
 */

const pools = new Map();
let poolSeq = 0;

function createPool(opts = {}) {
  const id = `pool-${Date.now().toString(36)}-${(poolSeq += 1)}`;
  const workers = new Map();
  const inbox = [];
  const results = [];
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now();

  const api = {
    id,
    register(worker) {
      if (!worker || typeof worker.id !== 'string') return { ok: false, error: 'Worker kimliği gerekli' };
      const w = {
        id: worker.id,
        label: worker.label || worker.id,
        capacity: Math.max(1, Math.min(16, Number(worker.capacity) || 1)),
        inFlight: 0,
        completed: 0,
        failed: 0,
        run: typeof worker.run === 'function' ? worker.run : async () => ({ ok: false, error: 'worker.run tanımlı değil' }),
        busy: typeof worker.busy === 'function' ? worker.busy : function () { return this.inFlight >= this.capacity; },
        registeredAt: clock(),
      };
      workers.set(w.id, w);
      return { ok: true, worker: { id: w.id, label: w.label, capacity: w.capacity } };
    },
    unregister(workerId) {
      const w = workers.get(workerId);
      if (!w) return { ok: false, error: 'Worker bulunamadı' };
      if (w.inFlight > 0) return { ok: false, error: 'Meşgul worker kaldırılamaz' };
      workers.delete(workerId);
      return { ok: true };
    },
    /**
     * Görevleri worker'lara dağıtma planı üretir (çalıştırmaz).
     * strategy: round-robin | capacity | all (her worker'a kopya — broadcast)
     */
    distribute(tasks, strategy) {
      if (!Array.isArray(tasks) || !tasks.length) return { ok: false, error: 'Görev listesi gerekli' };
      const available = Array.from(workers.values()).filter((w) => !w.busy());
      if (!available.length) return { ok: false, error: 'Müsait worker yok' };
      const assignments = {};
      if (strategy === 'broadcast') {
        available.forEach((w) => { assignments[w.id] = tasks.slice(); });
      } else if (strategy === 'capacity') {
        const free = available.map((w) => ({ w, free: w.capacity - w.inFlight }));
        tasks.forEach((t, i) => {
          free.sort((a, b) => b.free - a.free);
          const pick = free[0];
          pick.free -= 1;
          (assignments[pick.w.id] = assignments[pick.w.id] || []).push(t);
        });
      } else {
        /* round-robin */
        tasks.forEach((t, i) => {
          const w = available[i % available.length];
          (assignments[w.id] = assignments[w.id] || []).push(t);
        });
      }
      return { ok: true, assignments, workers: available.map((w) => w.id) };
    },
    async dispatch(workerId, task) {
      const w = workers.get(workerId);
      if (!w) return { ok: false, error: 'Worker bulunamadı' };
      if (w.busy()) return { ok: false, error: 'Worker meşgul' };
      if (!task || typeof task !== 'object') return { ok: false, error: 'Görev gerekli' };
      w.inFlight += 1;
      let out;
      try {
        out = await w.run(task.payload || {});
        if (out && out.ok) w.completed += 1; else w.failed += 1;
      } catch (err) {
        w.failed += 1;
        out = { ok: false, error: String(err.message || err) };
      } finally {
        w.inFlight -= 1;
      }
      const record = { id: `res-${clock().toString(36)}-${results.length}`, workerId, task: task.payload, result: out, at: clock() };
      results.push(record);
      return { ok: true, ...record };
    },
    /**
     * Lead ajan mantığı: leadPrompt'i bir lead worker'a verir; çıkan
     * alt görevleri workerTasks ile fan-out yapar ve sonuçları birleştirir.
     * leadTask tek payload'lu bir görevdir.
     */
    async runLead(leadTask, workerTasks, opts = {}) {
      const { combine = (leadResult, workerResults) => ({ combined: true, lead: leadResult, workers: workerResults }) } = opts;
      const leadId = (opts.leadId && workers.has(opts.leadId)) ? opts.leadId : (Array.from(workers.keys())[0] || null);
      if (!leadId) return { ok: false, error: 'Lead worker gerekli' };
      const leadRes = await api.dispatch(leadId, { type: 'lead', payload: leadTask });
      if (!leadRes.ok) return { ok: false, error: `Lead görevi başarısız: ${leadRes.result?.error || 'bilinmeyen'}`, lead: leadRes };
      const plans = api.distribute(Array.isArray(workerTasks) ? workerTasks : [], opts.strategy || 'capacity');
      if (!plans.ok) return { ok: false, error: plans.error, lead: leadRes };
      const workerResults = [];
      for (const [wid, tasks] of Object.entries(plans.assignments)) {
        for (const t of tasks) {
          const r = await api.dispatch(wid, { type: 'worker', payload: t });
          workerResults.push(r.ok ? r : { ok: false, error: r.error });
        }
      }
      let combined;
      try {
        combined = combine(leadRes.result, workerResults);
      } catch {
        combined = { combined: true, lead: leadRes.result, workers: workerResults };
      }
      return { ok: true, combined, lead: leadRes, workers: workerResults };
    },
    state() {
      const list = [];
      workers.forEach((w) => {
        list.push({
          id: w.id, label: w.label, capacity: w.capacity,
          inFlight: w.inFlight, completed: w.completed, failed: w.failed,
          busy: w.busy(),
        });
      });
      return { ok: true, id, workers: list, inboxSize: inbox.length, results: results.length };
    },
    destroy() {
      workers.clear();
      inbox.length = 0;
      results.length = 0;
      pools.delete(id);
      return { ok: true };
    },
  };
  pools.set(id, api);
  return { ok: true, pool: api };
}

function getPool(id) {
  return pools.get(id) || null;
}

function destroyPool(id) {
  const p = pools.get(id);
  if (!p) return { ok: false, error: 'Havuz bulunamadı' };
  p.destroy();
  return { ok: true };
}

function testOnlyClear() {
  pools.forEach((p) => p.destroy());
}

module.exports = {
  createPool,
  getPool,
  destroyPool,
  testOnlyClear,
};
