'use strict';

/**
 * pipelines.js — Krevyx v3.26 Pipeline (DAG) Motoru
 *
 * Kapsam:
 *   - Stage tanımlı yönlendirilmiş aciklik çizelgesi (DAG) yürütmesi.
 *   - Stage bağımlılık çözümü: topolojik sıralama + döngü tespiti.
 *   - Artefakt akışı: her stage çıktı artefakt üretir; sonraki stage'lere bağlanır.
 *   - Paralel stage grupları: bağımlılığı olmayan stage'ler aynı anda koşar.
 *
 * Davranış:
 *   - createPipeline(id, stages) → { ok, pipeline }; stage { id, instruction, dependsOn:[], maxRetries, timeoutMs, inputs:[] }.
 *   - validate(pipeline) → { ok, order, levels, errors }; order topolojik sıra;
 *     levels paralel yürütme katmanları.
 *   - run(pipeline, executor) → Promise<{ ok, results, duration_ms }>;
 *     executor(stageId, inputArtifacts) → { ok, output?, artifact?, error? }.
 *   - Bir stage başarısız olursa bağımlı stage'ler atlanır (haltOnError varsayılan).
 *
 * Dönüş:
 *   - run → { ok, results: [{stage, status, duration_ms, artifact?}], summary }
 *
 * Test:
 *   - testOnlyClear() ile tüm pipeline kayıtları silinir.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const MAX_STAGES = 256;

const _pipelines = new Map();

function defineStage(spec) {
  return {
    id: String(spec.id || `stage-${crypto.randomBytes(4).toString('hex')}`),
    instruction: typeof spec.instruction === 'string' ? spec.instruction : '',
    dependsOn: Array.isArray(spec.dependsOn) ? spec.dependsOn.filter((d) => typeof d === 'string') : [],
    maxRetries: typeof spec.maxRetries === 'number' ? Math.max(0, Math.min(3, spec.maxRetries)) : 0,
    timeoutMs: typeof spec.timeoutMs === 'number' ? Math.max(1000, Math.min(600000, spec.timeoutMs)) : 60000,
    inputs: Array.isArray(spec.inputs) ? spec.inputs.slice() : [],
  };
}

function createPipeline(id, stages) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'Pipeline kimliği eksik' };
  if (!Array.isArray(stages) || stages.length === 0) return { ok: false, error: 'Stage listesi boş' };
  if (stages.length > MAX_STAGES) return { ok: false, error: `Stage limiti aşıldı: ${MAX_STAGES}` };
  const pipeline = {
    id,
    version: 1,
    createdAt: Date.now(),
    stages: stages.map(defineStage),
    artifacts: new Map(),
    results: [],
  };
  const ids = new Set();
  for (const s of pipeline.stages) {
    if (ids.has(s.id)) return { ok: false, error: `Tekrarlanan stage id: ${s.id}` };
    ids.add(s.id);
  }
  for (const s of pipeline.stages) {
    if (s.dependsOn.some((d) => !ids.has(d))) return { ok: false, error: `Eksik bağımlılık: ${s.dependsOn.find((d) => !ids.has(d))}` };
  }
  _pipelines.set(id, pipeline);
  return { ok: true, pipeline };
}

function getPipeline(id) {
  return _pipelines.get(id) || null;
}

/** Döngü tespiti ile topolojik sıralama ve paralel katman üretimi. */
function validate(pipeline) {
  if (!pipeline || !_pipelines.has(pipeline.id)) return { ok: false, error: 'Pipeline bulunamadı' };
  const errors = [];
  const adjacency = new Map();
  for (const s of pipeline.stages) adjacency.set(s.id, s.dependsOn.slice());
  const order = [];
  const inDegree = new Map();
  pipeline.stages.forEach((s) => inDegree.set(s.id, s.dependsOn.length));
  const queue = pipeline.stages.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
  while (queue.length) {
    const level = queue.splice(0, queue.length);
    level.forEach((id) => order.push(id));
    for (const [sid, deps] of adjacency.entries()) {
      for (const d of deps) {
        if (level.includes(d)) {
          inDegree.set(sid, inDegree.get(sid) - 1);
          if (inDegree.get(sid) === 0) queue.push(sid);
        }
      }
    }
  }
  if (order.length !== pipeline.stages.length) errors.push('Bağımlılık döngüsü tespit edildi');
  return { ok: errors.length === 0, errors, order, levels: pipeline.stages.length };
}

function buildLevels(pipeline) {
  const v = validate(pipeline);
  if (!v.ok) return v;
  const levels = [];
  const placed = new Set();
  while (placed.size < pipeline.stages.length) {
    const ready = pipeline.stages.filter((s) => !placed.has(s.id) && s.dependsOn.every((d) => placed.has(d))).map((s) => s.id);
    if (ready.length === 0) { levels.push([]); break; }
    levels.push(ready);
    ready.forEach((id) => placed.add(id));
  }
  return { ok: true, levels };
}

function gatherArtifacts(pipeline, stage) {
  const result = {};
  for (const depId of stage.dependsOn) {
    const art = pipeline.artifacts.get(depId);
    if (art !== undefined) result[depId] = art;
  }
  return result;
}

/** Pipeline'ı executor fonksiyonuyla yürütür. */
async function run(pipeline, executor, opts = {}) {
  if (!pipeline || !_pipelines.has(pipeline.id)) return { ok: false, error: 'Pipeline bulunamadı' };
  if (typeof executor !== 'function') return { ok: false, error: 'Executor fonksiyonu gerekli' };
  const lv = buildLevels(pipeline);
  if (!lv.ok) return lv;
  pipeline.results = [];
  const startedAt = Date.now();
  const haltOnError = opts.haltOnError !== false;
  const failed = new Set();
  const blocked = new Set();
  for (const level of lv.levels) {
    if (level.length === 0) break;
    const tasks = level.map(async (stageId) => {
      const stage = pipeline.stages.find((s) => s.id === stageId);
      const record = { stage: stageId, status: 'running', duration_ms: 0, startedAt: Date.now() };
      if (stage.dependsOn.some((d) => failed.has(d) || blocked.has(d))) {
        record.status = 'skipped';
        record.duration_ms = Date.now() - record.startedAt;
        pipeline.results.push(record);
        blocked.add(stageId);
        return;
      }
      const inputArtifacts = gatherArtifacts(pipeline, stage);
      let lastErr = null;
      const attempts = stage.maxRetries + 1;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          const res = await executor(stageId, inputArtifacts, { attempt, timeoutMs: stage.timeoutMs });
          if (res && res.ok) {
            record.status = 'succeeded';
            if (res.artifact !== undefined) pipeline.artifacts.set(stageId, res.artifact);
            record.artifact = res.artifact;
            record.output = res.output || null;
            record.duration_ms = Date.now() - record.startedAt;
            pipeline.results.push(record);
            return;
          }
          lastErr = res?.error || 'executor başarısız';
        } catch (err) {
          lastErr = err.message || 'executor hatası';
        }
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
        }
      }
      record.status = 'failed';
      record.error = lastErr;
      record.duration_ms = Date.now() - record.startedAt;
      pipeline.results.push(record);
      failed.add(stageId);
    });
    await Promise.all(tasks);
    if (haltOnError && failed.size > 0) break;
  }
  const summary = {
    total: pipeline.results.length,
    succeeded: pipeline.results.filter((r) => r.status === 'succeeded').length,
    failed: pipeline.results.filter((r) => r.status === 'failed').length,
    skipped: pipeline.results.filter((r) => r.status === 'skipped').length,
    duration_ms: Date.now() - startedAt,
  };
  return { ok: summary.failed === 0 || !haltOnError, results: pipeline.results, summary };
}

function destroy(id) {
  if (!_pipelines.has(id)) return { ok: false, error: 'Pipeline bulunamadı' };
  _pipelines.delete(id);
  return { ok: true };
}

function listPipelines() {
  return { ok: true, pipelines: Array.from(_pipelines.keys()) };
}

function testOnlyClear() {
  _pipelines.clear();
  return { ok: true };
}

module.exports = {
  createPipeline,
  getPipeline,
  validate,
  buildLevels,
  run,
  destroy,
  listPipelines,
  testOnlyClear,
  MAX_STAGES,
};
