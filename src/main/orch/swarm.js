'use strict';

/**
 * swarm.js — Krevyx v3.26 Ajan Sürüsü
 *
 * Kapsam:
 *   - Rol bazlı otonom ajan kümesi: her ajanın rolü, uzmanlık alanı ve kotası.
 *   - Görev eşleştirme: incoming görev metni uzmanlık desenleriyle eşleşir.
 *   - Konsensüs: aynı göreve birden fazla ajan yanıt verir; skor ağırlıklı uzlaşma.
 *   - Sürü durumu: ajan ekleme/çıkarma, iş yükü izleme.
 *
 * Davranış:
 *   - createSwarm(id) → { ok, swarm }; addAgent(swarm, spec) → rol ekler.
 *   - match(swarm, taskText) → en uygun ajanları sıralı döner.
 *   - resolve(swarm, taskText, responses) → konsensüs skoru ve kazanan yanıt.
 *   - statuses → her ajanın iş yükü özetini döner.
 *
 * Dönüş:
 *   - match → { ok, agents: [{agentId, relevance}] }
 *   - resolve → { ok, winner, score, consensus }
 *
 * Test:
 *   - match skoru: uzmanlık anahtarları task'te geçtikçe artar (basit frekans skoru).
 *   - testOnlyClear() tüm sürüleri temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const MAX_AGENTS = 32;
const MIN_CONSENSUS_SCORE = 0.6;

const _swarms = new Map();

function createSwarm(id) {
  if (!id || typeof id !== 'string') return { ok: false, error: 'Sürü kimliği gerekli' };
  if (_swarms.has(id)) return { ok: false, error: `Sürü zaten var: ${id}` };
  const swarm = {
    id,
    agents: new Map(),
    createdAt: Date.now(),
    dispatched: 0,
    resolved: 0,
  };
  _swarms.set(id, swarm);
  return { ok: true, swarm };
}

function getSwarm(id) {
  return _swarms.get(id) || null;
}

function addAgent(swarm, spec = {}) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  if (swarm.agents.size >= MAX_AGENTS) return { ok: false, error: `Ajan limiti: ${MAX_AGENTS}` };
  const agentId = spec.id || `ag-${crypto.randomBytes(6).toString('hex')}`;
  if (swarm.agents.has(agentId)) return { ok: false, error: `Ajan zaten var: ${agentId}` };
  const expertise = Array.isArray(spec.expertise) && spec.expertise.length ? spec.expertise.map((e) => String(e).toLowerCase()) : [];
  const agent = {
    id: agentId,
    role: spec.role || 'worker',
    expertise,
    model: spec.model || 'default',
    quota: typeof spec.quota === 'number' ? Math.max(1, Math.min(1000, spec.quota)) : 50,
    used: 0,
    success: 0,
    failures: 0,
    status: 'idle',
  };
  swarm.agents.set(agentId, agent);
  return { ok: true, agentId, role: agent.role };
}

function removeAgent(swarm, agentId) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  if (!swarm.agents.delete(agentId)) return { ok: false, error: 'Ajan bulunamadı' };
  return { ok: true };
}

/** Görev metni ile ajan eşleştirme: uzmanlık frekans skoru. */
function match(swarm, taskText) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  if (!taskText || typeof taskText !== 'string') return { ok: false, error: 'Görev metni gerekli' };
  const lower = taskText.toLowerCase();
  const scored = [];
  for (const agent of swarm.agents.values()) {
    let score = 0;
    for (const term of agent.expertise) {
      let idx = -1;
      while ((idx = lower.indexOf(term, idx + 1)) !== -1) score += 1;
    }
    const capacityLeft = agent.quota - agent.used > 0;
    scored.push({ agentId: agent.id, role: agent.role, relevance: score, available: capacityLeft });
  }
  scored.sort((a, b) => (b.relevance - a.relevance) || (a.available ? -1 : 1));
  return { ok: true, taskText: taskText.slice(0, 120), agents: scored };
}

/** Birden fazla ajan yanıtının konsensüsle değerlendirilmesi. */
function resolve(swarm, taskText, responses, opts = {}) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  if (!Array.isArray(responses) || responses.length === 0) return { ok: false, error: 'Yanıt listesi boş' };
  const weights = opts.weights || {};
  const scored = responses.map((r, i) => {
    const agentId = typeof r.agentId === 'string' ? r.agentId : `r-${i}`;
    const score = typeof r.score === 'number' ? Math.max(0, Math.min(10, r.score)) : 5;
    const weight = typeof weights[agentId] === 'number' ? weights[agentId] : 1;
    return { agentId, score, weight, output: typeof r.output === 'string' ? r.output : '' };
  });
  const totalWeight = scored.reduce((s, x) => s + x.weight, 0) || 1;
  const consensus = scored.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight;
  const winner = scored.reduce((best, x) => (x.score * x.weight > best.score * best.weight ? x : best), scored[0]);
  swarm.resolved += 1;
  return { ok: true, winner: winner.agentId, output: winner.output, score: Math.round(consensus * 100) / 100, consensus: consensus >= MIN_CONSENSUS_SCORE, responses: scored.length };
}

function statuses(swarm) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  const agents = Array.from(swarm.agents.values()).map((a) => ({
    id: a.id, role: a.role, model: a.model, used: a.used, quota: a.quota,
    success: a.success, failures: a.failures, status: a.used < a.quota ? 'idle' : 'exhausted',
  }));
  return { ok: true, agents, dispatched: swarm.dispatched, resolved: swarm.resolved };
}

function recordDispatch(swarm, agentId, ok) {
  if (!swarm || !_swarms.has(swarm.id)) return { ok: false, error: 'Sürü bulunamadı' };
  const agent = swarm.agents.get(agentId);
  if (!agent) return { ok: false, error: 'Ajan bulunamadı' };
  agent.used += 1;
  swarm.dispatched += 1;
  if (ok) agent.success += 1; else agent.failures += 1;
  return { ok: true, agentId, used: agent.used };
}

function destroy(id) {
  if (!_swarms.has(id)) return { ok: false, error: 'Sürü bulunamadı' };
  _swarms.delete(id);
  return { ok: true };
}

function testOnlyClear() {
  _swarms.clear();
  return { ok: true };
}

module.exports = {
  createSwarm,
  getSwarm,
  addAgent,
  removeAgent,
  match,
  resolve,
  statuses,
  recordDispatch,
  destroy,
  testOnlyClear,
  MAX_AGENTS,
  MIN_CONSENSUS_SCORE,
};
