'use strict';

/**
 * session.js — Krevyx v3.26 Oturum Yöneticisi
 *
 * Kapsam:
 *   - Ajan oturumlarının persist (diske kayıt), listeleme ve kurtarılması.
 *   - Oturum zinciri: bir oturumun çıktısı sonraki oturuma bağlam olarak taşınır.
 *   - Otomatik kaydetme aralığı ve son durum anlık görüntüsü (snapshot).
 *
 * Davranış:
 *   - createSession(opts) → { ok, session }; session.id string kimlik.
 *   - save(session) diskte oturum durumunu günceller; load(id) geri okur.
 *   - linkChain(prevSession, nextSession) öncekinin özetini sonraki bağlamına ekler.
 *   - prune(ageMs) eski oturumları siler.
 *   - Veri dizini: ~/.krevyx/sessions (pathPrefix varsa o altında).
 *
 * Dönüş:
 *   - save/load → { ok, path? } | { ok:false, error }
 *
 * Test:
 *   - testOnlyClear() kayıtlı oturumları ve bellek tablosunu temizler (disk verisini de boşaltır).
 *
 * @version 3.26.0
 */

const fsMod = require('fs');
const pathMod = require('path');
const os = require('os');
const crypto = require('crypto');

const MAX_SNAPSHOTS = 64;
const MAX_CONTEXT_TOKENS = 16384;

/** Oturum veri dizini; pathPrefix verildiğinde onun altında. */
function sessionDir(opts = {}) {
  const base = opts.pathPrefix || pathMod.join(os.homedir(), '.krevyx');
  const dir = pathMod.join(base, 'sessions');
  fsMod.mkdirSync(dir, { recursive: true });
  return dir;
}

const _sessions = new Map();

function createSession(opts = {}) {
  const id = `session-${crypto.randomBytes(8).toString('hex')}`;
  const createdAt = Date.now();
  const session = {
    id,
    name: opts.name || id,
    cwd: opts.cwd || process.cwd(),
    status: 'created',
    createdAt,
    updatedAt: createdAt,
    steps: [],
    context: [],
    chain: [],
    budget: typeof opts.budget === 'number' ? Math.max(0, opts.budget) : Infinity,
    saveIntervalMs: typeof opts.saveIntervalMs === 'number' ? Math.max(1000, opts.saveIntervalMs) : 30000,
    _timer: null,
    _path: null,
    _dir: opts.pathPrefix ? pathMod.join(pathMod.resolve(opts.pathPrefix), '.krevyx-sessions') : sessionDir({ pathPrefix: opts.storeDir }),
  };
  fsMod.mkdirSync(session._dir, { recursive: true });
  session._path = pathMod.join(session._dir, `${id}.json`);
  _sessions.set(id, session);
  return { ok: true, session };
}

function getSession(id) {
  return _sessions.get(id) || null;
}

function listSessions() {
  return { ok: true, sessions: Array.from(_sessions.values()).map((s) => ({
    id: s.id, name: s.name, status: s.status, createdAt: s.createdAt, updatedAt: s.updatedAt, stepCount: s.steps.length,
  })) };
}

/** Adım kaydını oturuma ekler; durum günceller. */
function addStep(session, step) {
  if (!session || !_sessions.has(session.id)) return { ok: false, error: 'Oturum bulunamadı' };
  if (!step) return { ok: false, error: 'Adım eksik' };
  const record = {
    id: step.id || `step-${session.steps.length}`,
    type: step.type || 'unknown',
    status: step.status || 'pending',
    payload: step.payload || null,
    output: typeof step.output === 'string' ? step.output.slice(0, 4096) : null,
    error: step.error || null,
    duration_ms: typeof step.duration_ms === 'number' ? step.duration_ms : null,
    at: Date.now(),
  };
  session.steps.push(record);
  session.status = step.status === 'failed' || step.status === 'denied' ? 'attention' : 'running';
  session.updatedAt = Date.now();
  return { ok: true, step: record.id, total: session.steps.length };
}

function setContext(session, messages) {
  if (!session || !_sessions.has(session.id)) return { ok: false, error: 'Oturum bulunamadı' };
  const norm = Array.isArray(messages) ? messages.filter((m) => m && typeof m.content === 'string').slice(0, 512) : [];
  session.context = norm;
  session.updatedAt = Date.now();
  return { ok: true, messages: norm.length };
}

/** Oturumu diske yazar (snapshot olarak). */
function save(session) {
  if (!session || !_sessions.has(session.id)) return { ok: false, error: 'Oturum bulunamadı' };
  try {
    fsMod.mkdirSync(session._dir, { recursive: true });
    const snapshot = {
      id: session.id,
      name: session.name,
      cwd: session.cwd,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      steps: session.steps.slice(-MAX_SNAPSHOTS),
      context: session.context.slice(-64),
      chain: session.chain.slice(-16),
      budget: session.budget,
    };
    fsMod.writeFileSync(session._path, JSON.stringify(snapshot, null, 2), 'utf8');
    return { ok: true, path: session._path };
  } catch (err) {
    return { ok: false, error: `Kaydetme hatası: ${err.message}` };
  }
}

/** Diskten oturum geri yükler. */
function load(id, opts = {}) {
  const dir = opts.pathPrefix ? pathMod.join(pathMod.resolve(opts.pathPrefix), '.krevyx-sessions') : sessionDir({ pathPrefix: opts.storeDir });
  const file = pathMod.join(dir, `${id}.json`);
  let raw;
  try { raw = fsMod.readFileSync(file, 'utf8'); } catch (err) {
    return { ok: false, error: `Oturum bulunamadı: ${id}` };
  }
  let data;
  try { data = JSON.parse(raw); } catch (err) {
    return { ok: false, error: 'Oturum dosyası bozuk' };
  }
  const session = {
    id: data.id,
    name: data.name || data.id,
    cwd: data.cwd || process.cwd(),
    status: 'recovered',
    createdAt: data.createdAt || Date.now(),
    updatedAt: Date.now(),
    steps: Array.isArray(data.steps) ? data.steps.slice() : [],
    context: Array.isArray(data.context) ? data.context.slice() : [],
    chain: Array.isArray(data.chain) ? data.chain.slice() : [],
    budget: typeof data.budget === 'number' ? data.budget : Infinity,
    saveIntervalMs: 30000,
    _timer: null,
    _path: file,
    _dir: dir,
  };
  _sessions.set(session.id, session);
  return { ok: true, session };
}

/** Önceki oturumun çıktısını sonraki oturumun zincirine bağlar. */
function linkChain(prevSession, nextSession, opts = {}) {
  if (!prevSession || !nextSession) return { ok: false, error: 'Oturum(lar) eksik' };
  if (!_sessions.has(prevSession.id) || !_sessions.has(nextSession.id)) {
    return { ok: false, error: 'Oturum bulunamadı' };
  }
  const outputs = prevSession.steps.filter((s) => s.status === 'succeeded' && s.output).map((s) => ({ step: s.id, type: s.type, output: s.output }));
  const maxTokens = typeof opts.maxTokens === 'number' ? Math.max(64, opts.maxTokens) : MAX_CONTEXT_TOKENS;
  const payload = { prevId: prevSession.id, outputs, linkedAt: Date.now() };
  const text = JSON.stringify(payload);
  if (Math.ceil(text.length / 4) > maxTokens) {
    payload.outputs = payload.outputs.slice(0, 8);
  }
  nextSession.chain.push(payload);
  return { ok: true, linked: payload.prevId, outputs: payload.outputs.length };
}

/** Belirli süreden eski oturumları diskten ve bellekten siler. */
function prune(ageMs, opts = {}) {
  const dir = opts.pathPrefix ? pathMod.join(pathMod.resolve(opts.pathPrefix), '.krevyx-sessions') : sessionDir({ pathPrefix: opts.storeDir });
  let removed = 0;
  const now = Date.now();
  let files = [];
  try { files = fsMod.readdirSync(dir); } catch (err) { return { ok: true, removed: 0 }; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const file = pathMod.join(dir, f);
    let data;
    try { data = JSON.parse(fsMod.readFileSync(file, 'utf8')); } catch (err) { fsMod.unlinkSync(file); removed += 1; continue; }
    if (now - (data.updatedAt || data.createdAt || 0) > ageMs) {
      try { fsMod.unlinkSync(file); removed += 1; _sessions.delete(data.id); } catch (err) { /* atla */ }
    }
  }
  return { ok: true, removed };
}

function close(session) {
  if (!session || !_sessions.has(session.id)) return { ok: false, error: 'Oturum bulunamadı' };
  if (session._timer) { clearTimeout(session._timer); session._timer = null; }
  session.status = 'closed';
  session.updatedAt = Date.now();
  _sessions.delete(session.id);
  return { ok: true };
}

function testOnlyClear() {
  for (const s of _sessions.values()) { if (s._timer) clearTimeout(s._timer); }
  _sessions.clear();
  return { ok: true };
}

module.exports = {
  createSession,
  getSession,
  listSessions,
  addStep,
  setContext,
  save,
  load,
  linkChain,
  prune,
  close,
  testOnlyClear,
  MAX_SNAPSHOTS,
  MAX_CONTEXT_TOKENS,
};
