#!/usr/bin/env node
/**
 * serve-ui-test.js — UI interaktif testi için statik sunucu.
 * index.html'i diskten okuyup:
 *  - CSP'den gereksiz kısıtlamaları gevşetir (testte sorun çıkmasın diye değil; mock için yeterli)
 *  - <head> sonuna mock ollamaxApi (electron IPC taklidi) enjekte eder
 *  - script src'leri aynı dizinden servis edilir
 * ile tarayıcıda tüm UI'ı gerçek Electron olmadan test etmeyi mümkün kılar.
 *
 * Kullanım: node scripts/serve-ui-test.js [port]
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.argv[2]) || 9393;
const RENDERER_DIR = path.resolve(__dirname, '../src/renderer');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};

/* ----------------------------- mock API ----------------------------- */
const fakeData = {
  models: [
    { name: 'qwen3:8b', size: '8.2 GB', family: 'qwen3', status: 'ready', modified: '2026-08-10' },
    { name: 'llama3.1:8b', size: '4.9 GB', family: 'llama', status: 'ready', modified: '2026-07-30' },
    { name: 'gemma3:4b', size: '3.1 GB', family: 'gemma', status: 'ready', modified: '2026-08-02' },
  ],
  sessions: [
    { id: 's1', title: 'OllamaX v3.0 geçişi', createdAt: Date.now() - 3600000 * 5 },
    { id: 's2', title: 'Arayüz modernizasyonu', createdAt: Date.now() - 3600000 * 2 },
  ],
  memoryItems: [
    { id: 'm1', text: 'Kullanıcı Node 22 ve Electron 43 kullanıyor', score: 0.92, source: 'otomatik', createdAt: Date.now() - 86400000 },
    { id: 'm2', text: 'Proje vanilla JS, framework kullanılmıyor', score: 0.85, source: 'otomatik', createdAt: Date.now() - 172800000 },
  ],
  workflows: [
    { id: 'w1', name: 'Günlük özet', description: 'Her gün 09:00\'da proje özetini çıkarır', triggers: 0, enabled: true },
  ],
  plugins: [
    { id: 'builtin:shell', name: 'Shell', description: 'Güvenli kabuk komutları', enabled: true, source: 'yerleşik' },
  ],
  audit: [
    { time: Date.now() - 60000, type: 'config.set', detail: 'theme=dark' },
    { time: Date.now() - 300000, type: 'session.create', detail: 'OllamaX v3.0 geçişi' },
  ],
  agents: [],
  queue: [],
  settings: {
    apiBase: 'http://localhost:11434',
    temperature: 0.7,
    systemPrompt: 'Sen OllamaX AI asistanısın.',
  },
};

let sessionCounter = 3;

function makeMockApi() {
  return `
<script>
// MOCK ollamaxApi — Electron preload/contextBridge taklidi (yalnızca UI testi için)
window.__uiTestMode = true;
const __mock = window.__mockData = ${JSON.stringify(fakeData)};

// Olay aboneleri (EventChannel taklidi)
const __listeners = {};
function emit(evt, data) { (__listeners[evt] || []).forEach((f) => { try { f(data); } catch (e) { console.warn('mock emit fail', e); } }); }

// Stream taklidi: /chat çağrısında karakter karakter token üretir
const __demoReply = 'Merhaba! Ben OllamaX v3.2.0 test modunda çalışıyorum. Yerel Ollama bağlantısı bu modda taklit ediliyor; tüm paneller (Oturumlar, Bellek, İş Akışları, Eklentiler, Denetim) gerçek veri ile dolduruldu. Komut paletini Ctrl/Cmd+K ile açabilir, Agent Canvas bölümlerini /goal ile test edebilirsiniz.';

const api = {
  onEvent: (evt, fn) => { (__listeners[evt] = __listeners[evt] || []).push(fn); },
  offEvent: (evt, fn) => { (__listeners[evt] || []).forEach((f, i) => { if (f === fn) __listeners[evt].splice(i, 1); }); },
  send: (ch, args) => { const res = __invokeResult(ch, args); emit(ch, res); return res; },
  on: (ch, fn) => { (__listeners[ch] = __listeners[ch] || []).push(fn); },
  off: () => {},
  invoke: (ch, args) => Promise.resolve(__invokeResult(ch, args)),
};

function __invokeResult(ch, args) {
  const method = ch;
  args = args || {};
  if (method === 'get-models') {
    emit('models-list', __mock.models.map((m) => m.name));
    return { ok: true, models: __mock.models };
  }
  if (method === 'get-model-catalog') return { openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-5'], anthropic: ['claude-sonnet-4-5', 'claude-haiku-4'], gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'] };
  if (method === 'normalize-ollama-host') return { ok: true, host: args || 'http://localhost:11434' };
  if (method === 'app-health') return { ok: true, ollama: 'mock', userData: '/home/ubuntu/.ollamax' };
  if (method === 'get-stats') return { ok: true, tokensUsed: 12450, sessions: __mock.sessions.length };
  if (method === 'get-workspaces') return { ok: true, workspaces: [] };
  if (method === 'persist-load') return { ok: true, settings: __mock.settings };
  if (method === 'persist-save') { Object.assign(__mock.settings, args.settings || {}); return { ok: true }; }
  if (method === 'fetch-provider-models') return { ok: true, models: [] };
  if (method === 'scan-project') return { ok: true, files: 0 };
  if (method === 'write-project-doc') return { ok: true, path: '/tmp/doc.md' };
  if (method === 'get-team-presets') return { ok: true, presets: [] };
  if (method === 'terminal-create') return { ok: true, id: 'term-' + Date.now() };
  if (method === 'export-to-path') return { ok: true, filePath: '/home/user/export.json' };
  if (method === 'set-window-opacity') return { ok: true };
  if (method === 'open-path') return { ok: true };
  if (method === 'pull-model') return { ok: true };
  if (method === 'open-path') return { ok: true };
  // Chat: stream simülasyonu (app.js 'chat'/'ollama-chat' kanalına response bekler)
  if (method === 'chat' || method === 'openai-chat' || method === 'anthropic-chat' || method === 'gemini-chat') {
    setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        i += 14;
        const part = __demoReply.slice(Math.max(0, i - 14), i);
        emit('stream:token', { key: 'reply', part });
        if (i >= __demoReply.length) { clearInterval(iv); emit('stream:done', { key: 'reply', full: __demoReply }); }
      }, 25);
    }, 400);
    return { ok: true };
  }
  // Genel invoke kanalları (v3 modülleri 'ollamaxApi.invoke(ch, method, args)' çağırır)
  return __invokeByChannel(ch, args);
}

function __invokeByChannel(ch, args) {
  args = args || {};
  if (String(ch).startsWith('ipc:3:')) return __v3Handle(String(ch).slice(6), args);
  if (ch === 'ollama' || ch === 'ollamax' || ch === 'events') {
    if (method === 'models') return __mock.models;
    if (method === 'generate' || method === 'chat') {
      // Stream simülasyonu
      setTimeout(() => {
        let i = 0;
        const iv = setInterval(() => {
          i += 12;
          const part = __demoReply.slice(Math.max(0, i - 12), i);
          emit('stream:token', { key: 'reply', part });
          if (i >= __demoReply.length) { clearInterval(iv); emit('stream:done', { key: 'reply', full: __demoReply }); }
        }, 25);
      }, 400);
      return { ok: true };
    }
    if (method === 'version') return { ollama: '0.6.0', ollamax: '3.2.0' };
    if (method === 'status') return { ok: true, ollama: 'mock' };
  }
  if (ch === 'sessions' || ch === 'sessions.v3') {
    if (method === 'list' || method === 'load') return { ok: true, sessions: __mock.sessions, current: __mock.sessions[0] };
    if (method === 'create') { const s = { id: 's' + (sessionCounter++), title: args.title || 'Yeni oturum', createdAt: Date.now() }; __mock.sessions.unshift(s); emit('sessions:changed', __mock.sessions); return { ok: true, session: s }; }
    if (method === 'rename') { const s = __mock.sessions.find((x) => x.id === args.id); if (s) s.title = args.title; emit('sessions:changed', __mock.sessions); }
    if (method === 'delete') { __mock.sessions = __mock.sessions.filter((x) => x.id !== args.id); emit('sessions:changed', __mock.sessions); }
    return { ok: true, sessions: __mock.sessions };
  }
  if (ch === 'memory' || ch === 'memory.v3') {
    if (method === 'list' || method === 'search') return { ok: true, items: __mock.memoryItems, total: __mock.memoryItems.length };
    if (method === 'add') { __mock.memoryItems.unshift({ id: 'm' + Date.now(), text: args.text, score: 0.7, source: args.source || 'manuel', createdAt: Date.now() }); emit('memory:changed'); return { ok: true }; }
    if (method === 'delete') { __mock.memoryItems = __mock.memoryItems.filter((x) => x.id !== args.id); emit('memory:changed'); return { ok: true }; }
    return { ok: true, items: __mock.memoryItems };
  }
  if (ch === 'workflows' || ch === 'workflows.v3') {
    if (method === 'list') return { ok: true, workflows: __mock.workflows };
    if (method === 'save') return { ok: true };
    if (method === 'run') { emit('agent:started', { id: 'wf-' + Date.now(), name: args.name || 'İş akışı', goal: 'İş akışı çalışıyor (mock)' }); return { ok: true }; }
    return { ok: true, workflows: __mock.workflows };
  }
  if (ch === 'plugins' || ch === 'plugins.v3') {
    if (method === 'list') return { ok: true, plugins: __mock.plugins };
    if (method === 'set') return { ok: true };
    if (method === 'catalog') return { ok: true, plugins: __mock.plugins };
    return { ok: true, plugins: __mock.plugins };
  }
  if (ch === 'audit' || ch === 'audit.v3') {
    if (method === 'list') return { ok: true, entries: __mock.audit, chainOk: true };
    if (method === 'verify') return { ok: true, chainOk: true, total: __mock.audit.length };
    return { ok: true, entries: __mock.audit };
  }
  if (ch === 'agents' || ch === 'agents.v3') {
    if (method === 'list') return { ok: true, agents: __mock.agents };
    if (method === 'start') { const a = { id: 'a' + Date.now(), name: args.name || 'Ajan', goal: args.goal || '', status: 'planning' }; __mock.agents.push(a); emit('agents:changed', __mock.agents); emit('agent:started', a); return { ok: true, agent: a }; }
    if (method === 'stop') { __mock.agents = __mock.agents.filter((x) => x.id !== args.id); emit('agents:changed', __mock.agents); return { ok: true }; }
    return { ok: true, agents: __mock.agents };
  }
  if (ch === 'queue' || ch === 'queue.v3') {
    if (method === 'list') return { ok: true, items: __mock.queue };
    return { ok: true, items: __mock.queue };
  }
  if (ch === 'config' || ch === 'settings' || ch === 'config.v3') {
    if (method === 'get' || method === 'load') return { ok: true, config: __mock.settings };
    if (method === 'set' || method === 'save') { Object.assign(__mock.settings, args.config || args); emit('config:changed', __mock.settings); return { ok: true }; }
    return { ok: true, config: __mock.settings };
  }
  if (ch === 'image') {
    if (method === 'generate') return { ok: true, path: '/tmp/mock-image.png' };
    return { ok: true };
  }
  if (ch === 'app' || ch === 'ui') {
    if (method === 'platform') return process ? 'linux' : 'linux';
    if (method === 'toast' || method === 'log') return { ok: true };
    if (method === 'openExternal' || method === 'openPath' || method === 'shell') return { ok: true };
    if (method === 'dialog' || method === 'dialogSave') return { ok: true, filePath: '/home/user/export.json' };
    if (method === 'quit') return { ok: true };
    if (method === 'showInFolder' || method === 'reveal') return { ok: true };
    return { ok: true };
  }
  if (ch === 'tools' || ch === 'tools.v3') {
    if (method === 'list') return { ok: true, tools: [{ id: 'builtin:shell', name: 'Shell' }, { id: 'builtin:web-search', name: 'Web Arama' }] };
    if (method === 'approve') return { ok: true };
    return { ok: true };
  }
  if (ch === 'orchestrator' || ch === 'orchestrator.v3') {
    if (method === 'list') return { ok: true, agents: [] };
    return { ok: true, agents: [] };
  }
  return { ok: false, error: 'mock:unknown', channel: ch, method };
}

/* ----------------------------- ipc:3:* v3 uçları ----------------------------- */
function __v3Handle(name, args) {
  if (name === 'session-list') return { ok: true, sessions: __mock.sessions };
  if (name === 'session-load') return { ok: true, session: __mock.sessions.find((s) => s.id === (args.id || args)) || __mock.sessions[0], messages: [{ role: 'user', content: 'Deneme mesajı' }] };
  if (name === 'session-save') { const s = { id: 's' + (sessionCounter++), title: args.title || 'Yeni oturum', createdAt: Date.now() }; __mock.sessions.unshift(s); return { ok: true, session: s }; }
  if (name === 'session-delete') { __mock.sessions = __mock.sessions.filter((s) => s.id !== (args.id || args)); return { ok: true }; }
  if (name === 'session-rename') { const s = __mock.sessions.find((x) => x.id === (args.id || args[0])); if (s) s.title = args.title || args[1]; return { ok: true }; }
  if (name === 'memory-candidates') return { ok: true, candidates: [{ id: 'c1', text: 'Önerilen bellek: test projede vanilla JS tercih ediliyor', score: 0.88 }] };
  if (name === 'memory-accept-candidate') return { ok: true };
  if (name === 'memory-reject-candidate') return { ok: true };
  if (name === 'memory-search') return { ok: true, items: __mock.memoryItems.filter((m) => (args.q || '').toLowerCase().split('').every((c) => m.text.toLowerCase().includes(c))) };
  if (name === 'memory-add') { __mock.memoryItems.unshift({ id: 'm' + Date.now(), text: args.text, score: 0.7, source: 'manuel', createdAt: Date.now() }); return { ok: true }; }
  if (name === 'memory-delete') { __mock.memoryItems = __mock.memoryItems.filter((x) => x.id !== (args.id || args)); return { ok: true }; }
  if (name === 'memory-list') return { ok: true, items: __mock.memoryItems };
  if (name === 'workflow-list') return { ok: true, workflows: __mock.workflows };
  if (name === 'workflow-save') return { ok: true };
  if (name === 'workflow-delete') { __mock.workflows = __mock.workflows.filter((w) => w.id !== (args.id || args)); return { ok: true }; }
  if (name === 'workflow-run') { emit('agent:started', { id: 'wf-' + Date.now(), name: (args.workflow && args.workflow.name) || 'İş akışı', goal: 'Mock iş akışı çalışıyor' }); return { ok: true }; }
  if (name === 'tools-list') return { ok: true, tools: [{ id: 'builtin:shell', name: 'Shell', description: 'Güvenli kabuk komutları', enabled: true }, { id: 'builtin:web-search', name: 'Web Arama', description: 'Güvenli web arama', enabled: true }] };
  if (name === 'tool-execute') return { ok: true, result: 'Mock komut çıktısı' };
  if (name === 'plugins-list') return { ok: true, plugins: __mock.plugins };
  if (name === 'plugins-install') return { ok: true };
  if (name === 'plugins-uninstall') { __mock.plugins = __mock.plugins.filter((p) => p.id !== (args.id || args)); return { ok: true }; }
  if (name === 'audit-log') return { ok: true, entries: __mock.audit, chainOk: true, total: __mock.audit.length };
  if (name === 'audit-verify') return { ok: true, chainOk: true, total: __mock.audit.length };
  if (name === 'generate-image') return { ok: true, path: '/tmp/mock.png' };
  if (name === 'orchestrator-list') return { ok: true, agents: [] };
  if (name === 'agent-start') { const a = { id: 'a' + Date.now(), name: args.name || 'Ajan', goal: args.goal || '', status: 'planning' }; emit('agent:started', a); return { ok: true, agent: a }; }
  if (name === 'agent-stop') return { ok: true };
  if (name === 'config-get') return { ok: true, config: __mock.settings };
  if (name === 'config-set') { Object.assign(__mock.settings, args.config || {}); return { ok: true }; }
  return { ok: false, error: 'mock:unknown-v3', name };
}

// ipcRenderer taklidi (gerekirse kullanan modüller için)
window.__mockIpc = { on: (c, fn) => { emit(c, fn); }, off: () => {} };

// EventChannel akış anahtarları ön kayıt (renderer'ın dinlediği kanallar)
['stream:token', 'stream:done', 'stream:error', 'agent:started', 'agent:done', 'agents:changed', 'sessions:changed', 'memory:changed', 'config:changed', 'audit:entry'].forEach((e) => { api.onEvent(e, () => {}); });

window.ollamaxApi = api;
window.ollamaxPlatform = 'linux';
console.log('[ui-test-server] mock ollamaxApi yüklendi');
</script>`;
}

/* ----------------------------- sunucu ----------------------------- */
const server = http.createServer((req, res) => {
  let reqPath = url.parse(req.url).pathname;
  if (reqPath === '/') reqPath = '/index.html';
  const file = reqPath.startsWith('/scripts/') ? path.resolve(__dirname, '..' + reqPath) : path.join(RENDERER_DIR, reqPath);
  const SCRIPTS_DIR = path.resolve(__dirname);
  if (!file.startsWith(RENDERER_DIR + path.sep) && file !== RENDERER_DIR && !file.startsWith(SCRIPTS_DIR + path.sep)) { res.writeHead(404); res.end('not found'); return; }
  if (file.startsWith(SCRIPTS_DIR + path.sep) && path.basename(file) !== 'mock-api.js') { res.writeHead(404); res.end('not found'); return; }

  if (req.method !== 'GET') { res.writeHead(405); res.end('method not allowed'); return; }

  try {
    let data = fs.readFileSync(file);
    const mime = MIME[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' };
    if (reqPath === '/index.html') {
      let html = data.toString('utf8');
      // CSP script-src 'self' nedeniyle inline script yerine /mock-api.js dosyası referans edilir
      html = html.replace('</head>', '<script src="/scripts/mock-api.js"></script></head>');
      data = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, headers);
    res.end(data);
  } catch { res.writeHead(404); res.end('not found'); }
});

server.listen(PORT, () => console.log(`[ui-test-server] http://localhost:${PORT} — mock ollamaxApi aktif`));
console.log(`[ui-test-server] başlatılıyor... port ${PORT}`);
