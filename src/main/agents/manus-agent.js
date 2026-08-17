'use strict';

/* ---------------------------------------------------------------------------
 * V3.20 — Manus Task Agent (gerçek süreç köprüsünün bulut karşılığı)
 *
 * Manus'u, Claude Code / Codex / Antigravity gibi "çalıştırılabilir bir ajan"
 * olarak ele alır: gerçek görev oluşturur, canlı olay akışını relay eder,
 * stop sinyaliyle görevi sonlandırır ve sonucu kod ajanı köprüsü ile aynı
 * formatta (steps + live) döndürür. Böylece Manus hem sohbet sağlayıcısı
 * hem de zincire bağlanabilen üçüncü bir "üye ajan" olabilir.
 *
 * Akış:
 *   task.create → poll listMessages (5 s) → waiting'de messageAskUser
 *     sorusu varsa kuyruğa alınır (renderer cevap verince sendMessage)
 *     → stopped → steps olarak dön
 *
 * Olay türleri: status_update / assistant_message / structured_output_result
 *   / error_message / plan_update
 * --------------------------------------------------------------------------- */

const https = require('https');

const MANUS_API_BASE = 'https://api.manus.ai';
const POLL_INTERVAL_MS = 5000;
const DEFAULT_TIMEOUT_MS = 600000;

const _sessions = new Map(); // taskId -> { events: [], waitingEvents: [], resolve }

/* ---- düşük seviye HTTP --------------------------------------------------- */

function manusRequest(method, urlPath, apiKey, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(MANUS_API_BASE + urlPath);
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (apiKey) headers['x-manus-api-key'] = apiKey;
    const req = https.request({
      hostname: url.hostname, port: url.port || 443,
      path: url.pathname + url.search, method, headers, timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const j = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, body: j });
          else reject(new Error((j?.error?.message) || `Manus API HTTP ${res.statusCode}`));
        } catch {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, body: { data } });
          else reject(new Error(`Manus API HTTP ${res.statusCode} (geçersiz yanıt)`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Manus API zaman aşımı')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function findEvent(events, type) {
  if (!Array.isArray(events)) return null;
  for (let i = 0; i < events.length; i += 1) {
    if (events[i] && events[i].type === type) return events[i];
  }
  return null;
}

/* ---- görev yönetimi ------------------------------------------------------- */

async function createManusTask(opts = {}) {
  const apiKey = (opts.apiKey || '').trim();
  if (!apiKey) throw new Error('Manus API anahtarı gerekli');
  const task = (opts.task || '').trim();
  if (!task) throw new Error('Görev metni boş olamaz');
  const body = { message: { content: task } };
  if (opts.model) body.model = opts.model;
  if (opts.projectId) body.project_id = opts.projectId;
  if (opts.agentProfile) body.agent_profile = opts.agentProfile;
  if (opts.connectors && Array.isArray(opts.connectors)) body.message.connectors = opts.connectors;
  if (opts.enableSkills && Array.isArray(opts.enableSkills)) body.message.enable_skills = opts.enableSkills;
  if (opts.forceSkills && Array.isArray(opts.forceSkills)) body.message.force_skills = opts.forceSkills;
  if (opts.structuredOutputSchema) body.structured_output_schema = opts.structuredOutputSchema;
  if (opts.fileIds && Array.isArray(opts.fileIds)) {
    body.message.attachments = opts.fileIds.map((f) => ({ type: 'file_id', file_id: f }));
  } else if (opts.fileUrls && Array.isArray(opts.fileUrls)) {
    body.message.attachments = opts.fileUrls.map((u) => ({ type: 'file_url', file_url: u }));
  }
  const res = await manusRequest('POST', '/v2/task.create', apiKey, body);
  const taskId = res.body?.task_id || res.body?.data?.task_id;
  const taskUrl = res.body?.task_url || res.body?.data?.task_url;
  if (!taskId) throw new Error('task.create yanıtında task_id bulunamadı');
  const sess = {
    taskId, taskUrl, apiKey,
    events: [], waitingEvents: [], seenIds: new Set(),
    stopped: false, startedAt: Date.now(),
    pollTimer: null, resolve: null, reject: null,
  };
  _sessions.set(taskId, sess);
  startPolling(sess);
  return { ok: true, taskId, taskUrl };
}

function pollOnce(sess) {
  return manusRequest('GET', `/v2/task.listMessages?task_id=${encodeURIComponent(sess.taskId)}&order=asc`, sess.apiKey)
    .then((res) => res.body?.events || res.body?.data?.events || (Array.isArray(res.body?.data) ? res.body.data : []))
    .catch(() => []);
}

function settleSession(sess, res) {
  sess.stopped = true;
  if (sess.pollTimer) { clearTimeout(sess.pollTimer); sess.pollTimer = null; }
  if (sess.resolve) { sess.resolve(res); sess.resolve = null; sess.reject = null; }
}

function buildSteps(sess) {
  const steps = [];
  for (const evt of sess.events) {
    const t = evt.type || '';
    if (t === 'assistant_message' && evt.assistant_message) {
      const m = evt.assistant_message.message;
      const text = typeof m === 'string' ? m : (m?.content || JSON.stringify(m));
      if (text) steps.push({ text: String(text).slice(0, 5000), kind: 'assistant' });
    } else if (t === 'plan_update' && evt.plan_update?.text) {
      steps.push({ text: String(evt.plan_update.text).slice(0, 2000), kind: 'plan' });
    }
  }
  return steps;
}

function startPolling(sess) {
  const timeoutMs = DEFAULT_TIMEOUT_MS;
  sess.pollTimer = setInterval(async () => {
    if (sess.stopped) { clearInterval(sess.pollTimer); return; }
    if (Date.now() - sess.startedAt > timeoutMs) {
      settleSession(sess, { ok: true, steps: buildSteps(sess), truncated: true, timeout: true, taskId: sess.taskId, taskUrl: sess.taskUrl });
      return;
    }
    let events;
    try {
      events = await pollOnce(sess);
    } catch {
      return; /* bir sonraki poll denenecek */
    }
    for (const evt of events) {
      const eid = evt?.event_id;
      if (!eid || sess.seenIds.has(eid)) continue;
      sess.seenIds.add(eid);
      sess.events.push(evt);
      if (evt.type === 'status_update') {
        const detail = evt.status_update?.status_detail || {};
        if (evt.status_update?.agent_status === 'waiting') {
          sess.waitingEvents.push({ eventId: detail.waiting_for_event_id, type: detail.waiting_for_event_type, description: detail.waiting_description });
        }
        if (evt.status_update?.agent_status === 'stopped') {
          const so = findEvent(events, 'structured_output_result');
          const result = { ok: true, steps: buildSteps(sess), taskId: sess.taskId, taskUrl: sess.taskUrl };
          if (so?.structured_output_result) result.structuredOutput = so.structured_output_result;
          settleSession(sess, result);
          return;
        }
        if (evt.status_update?.agent_status === 'error') {
          settleSession(sess, { ok: false, error: JSON.stringify(evt.status_update.status_detail || {}).slice(0, 400), taskId: sess.taskId, taskUrl: sess.taskUrl });
          return;
        }
      }
    }
  }, POLL_INTERVAL_MS);
}

async function waitForManusTask(taskId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const sess = _sessions.get(taskId);
  if (!sess) return { ok: false, error: 'Bilinmeyen Manus görevi: ' + taskId };
  if (sess.stopped) return buildFinal(sess);
  return new Promise((resolve) => {
    sess.resolve = resolve;
    setTimeout(() => {
      if (!sess.stopped && sess.resolve === resolve) settleSession(sess, { ok: true, steps: buildSteps(sess), truncated: true, timeout: true, taskId });
    }, timeoutMs);
  });
}

function buildFinal(sess) {
  return { ok: true, steps: buildSteps(sess), taskId: sess.taskId, taskUrl: sess.taskUrl, waitingEvents: sess.waitingEvents };
}

async function stopManusTask(taskId) {
  const sess = _sessions.get(taskId);
  if (!sess) return { ok: false, error: 'Bilinmeyen Manus görevi: ' + taskId };
  try { await manusRequest('POST', '/v2/task.stop', sess.apiKey, { task_id: taskId }); } catch { /* continue */ }
  settleSession(sess, { ok: true, steps: buildSteps(sess), stoppedByUser: true, taskId, taskUrl: sess.taskUrl });
  return { ok: true, taskId };
}

async function answerManusTask(taskId, content) {
  const sess = _sessions.get(taskId);
  if (!sess) return { ok: false, error: 'Bilinmeyen Manus görevi: ' + taskId };
  const waiting = sess.waitingEvents[sess.waitingEvents.length - 1];
  try {
    await manusRequest('POST', '/v2/task.sendMessage', sess.apiKey, { task_id: taskId, message: { content } });
    sess.waitingEvents = [];
    return { ok: true, repliedTo: waiting?.eventId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sendManusMessage(taskId, content) {
  const sess = _sessions.get(taskId);
  if (!sess) return { ok: false, error: 'Bilinmeyen Manus görevi: ' + taskId };
  try {
    await manusRequest('POST', '/v2/task.sendMessage', sess.apiKey, { task_id: taskId, message: { content } });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function listManusTasks() {
  const out = [];
  for (const [taskId, sess] of _sessions) {
    out.push({
      taskId, taskUrl: sess.taskUrl, running: !sess.stopped,
      waitingEvents: sess.waitingEvents,
      eventCount: sess.events.length,
      startedAt: sess.startedAt,
    });
  }
  return out;
}

/* ---- kod ajanı köprüsü arayüzü ile uyumluluk ------------------------------ */
/* code-agent-bridge ile aynı imza: run({agent, task, opts}) → {ok, steps,...} */

async function runManusAgent(opts = {}) {
  const created = await createManusTask(opts);
  if (!created.ok) return { ok: false, error: created.error };
  return waitForManusTask(created.taskId);
}

module.exports = {
  createManusTask, waitForManusTask, stopManusTask, answerManusTask,
  sendManusMessage, listManusTasks, runManusAgent,
  _internal: { manusRequest, _sessions },
};
