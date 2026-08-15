// MOCK ollamaxApi — Electron preload/contextBridge taklidi (yalnızca UI testi için)
// serve-ui-test.js tarafından servis edilir.
'use strict';
window.__uiTestMode = true;

const __mockData = {
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
    { id: 'w1', name: 'Günlük özet', description: "Her gün 09:00'da proje özetini çıkarır", triggers: 0, enabled: true },
  ],
  plugins: [
    { id: 'builtin:shell', name: 'Shell', description: 'Güvenli kabuk komutları', enabled: true, source: 'yerleşik' },
    { id: 'builtin:web-search', name: 'Web Arama', description: 'Güvenli web arama', enabled: true, source: 'yerleşik' },
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

let __sessionCounter = 3;

const __listeners = {};
function __emit(evt, data) {
  (__listeners[evt] || []).forEach((f) => { try { f(data); } catch (e) { console.warn('mock emit fail', e); } });
}

const __demoReply = 'Merhaba! Ben OllamaX v3.2.0 test modunda çalışıyorum. Yerel Ollama bağlantısı bu modda taklit ediliyor; tüm paneller (Oturumlar, Bellek, İş Akışları, Eklentiler, Denetim) gerçek veri ile dolduruldu. Komut paletini Ctrl/Cmd+K ile açabilir, Agent Canvas bölümlerini /goal ile test edebilirsiniz.';

function __v3Handle(name, args) {
  args = args || {};
  if (name === 'session-list') return { ok: true, sessions: __mockData.sessions };
  if (name === 'session-load') return { ok: true, session: __mockData.sessions.find((s) => s.id === (args.id || args)) || __mockData.sessions[0], messages: [{ role: 'user', content: 'Deneme mesajı' }] };
  if (name === 'session-save') { const s = { id: 's' + (__sessionCounter++), title: args.title || 'Yeni oturum', createdAt: Date.now() }; __mockData.sessions.unshift(s); return { ok: true, session: s }; }
  if (name === 'session-delete') { __mockData.sessions = __mockData.sessions.filter((s) => s.id !== (args.id || args)); return { ok: true }; }
  if (name === 'session-rename') { const s = __mockData.sessions.find((x) => x.id === (args.id || args[0])); if (s) s.title = args.title || args[1]; return { ok: true }; }
  if (name === 'memory-candidates') return { ok: true, candidates: [{ id: 'c1', text: 'Önerilen bellek: test projede vanilla JS tercih ediliyor', score: 0.88 }] };
  if (name === 'memory-accept-candidate') return { ok: true };
  if (name === 'memory-reject-candidate') return { ok: true };
  if (name === 'memory-search') {
    const q = String(args.q || args[0] || '').toLowerCase();
    return { ok: true, items: q ? __mockData.memoryItems.filter((m) => m.text.toLowerCase().includes(q)) : __mockData.memoryItems };
  }
  if (name === 'memory-add') { __mockData.memoryItems.unshift({ id: 'm' + Date.now(), text: args.text, score: 0.7, source: 'manuel', createdAt: Date.now() }); return { ok: true }; }
  if (name === 'memory-delete') { __mockData.memoryItems = __mockData.memoryItems.filter((x) => x.id !== (args.id || args)); return { ok: true }; }
  if (name === 'memory-list') return { ok: true, items: __mockData.memoryItems };
  if (name === 'workflow-list') return { ok: true, workflows: __mockData.workflows };
  if (name === 'workflow-save') return { ok: true };
  if (name === 'workflow-delete') { __mockData.workflows = __mockData.workflows.filter((w) => w.id !== (args.id || args)); return { ok: true }; }
  if (name === 'workflow-run') { __emit('agent:started', { id: 'wf-' + Date.now(), name: (args.workflow && args.workflow.name) || 'İş akışı', goal: 'Mock iş akışı çalışıyor' }); return { ok: true }; }
  if (name === 'tools-list') return { ok: true, tools: __mockData.plugins.map((p) => ({ id: p.id, name: p.name, description: p.description, enabled: p.enabled })) };
  if (name === 'tool-execute') return { ok: true, result: 'Mock komut çıktısı: ls -la' };
  if (name === 'plugins-list') return { ok: true, plugins: __mockData.plugins };
  if (name === 'plugins-install') return { ok: true };
  if (name === 'plugins-uninstall') { __mockData.plugins = __mockData.plugins.filter((p) => p.id !== (args.id || args)); return { ok: true }; }
  if (name === 'audit-log') return { ok: true, entries: __mockData.audit, chainOk: true, total: __mockData.audit.length };
  if (name === 'audit-verify') return { ok: true, chainOk: true, total: __mockData.audit.length };
  if (name === 'generate-image') return { ok: true, path: '/tmp/mock.png' };
  if (name === 'orchestrator-list') return { ok: true, agents: [] };
  if (name === 'agent-start') { const a = { id: 'a' + Date.now(), name: args.name || 'Ajan', goal: args.goal || '', status: 'planning' }; __emit('agent:started', a); return { ok: true, agent: a }; }
  if (name === 'agent-stop') return { ok: true };
  if (name === 'config-get') return { ok: true, config: __mockData.settings };
  if (name === 'config-set') { Object.assign(__mockData.settings, args.config || {}); return { ok: true }; }
  return { ok: false, error: 'mock:unknown-v3', name };
}

function __invokeResult(ch, args) {
  args = args || {};
  if (ch === 'get-models') {
    __emit('models-list', __mockData.models.map((m) => m.name));
    __emit('models-data', __mockData.models);
    return { ok: true, models: __mockData.models };
  }
  if (ch === 'get-model-catalog') return { openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-5'], anthropic: ['claude-sonnet-4-5', 'claude-haiku-4'], gemini: ['gemini-2.5-pro', 'gemini-2.5-flash'] };
  if (ch === 'normalize-ollama-host') return { ok: true, host: (args && args.host) || args || 'http://localhost:11434' };
  if (ch === 'app-health') return { ok: true, ollamaReachable: true, modelCount: 3, latencyMs: 12, version: '3.2.0', platform: 'linux', userData: '/home/ubuntu/.ollamax', ollamaVersion: '0.6.0' };
  if (ch === 'get-stats') return { ok: true, tokensUsed: 12450, sessions: __mockData.sessions.length };
  if (ch === 'get-workspaces') return { ok: true, workspaces: [] };
  if (ch === 'persist-load') return { ok: true, settings: __mockData.settings };
  if (ch === 'persist-save') { Object.assign(__mockData.settings, args.settings || {}); return { ok: true }; }
  if (ch === 'fetch-provider-models') {
    const p = (args && args.provider) || 'openai';
    const lists = { openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-5', 'gpt-5-mini', 'o3'], anthropic: ['claude-sonnet-4-5', 'claude-haiku-4', 'claude-opus-4-5'], gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3'] };
    return { ok: true, models: lists[p] || lists.openai };
  }
  if (ch === 'scan-project') return { ok: true, files: 0 };
  if (ch === 'write-project-doc') return { ok: true, path: '/tmp/doc.md' };
  if (ch === 'get-team-presets') return { ok: true, presets: [] };
  if (ch === 'terminal-create') return { ok: true, id: 'term-' + Date.now() };
  if (ch === 'export-to-path') return { ok: true, filePath: '/home/user/export.json' };
  if (ch === 'set-window-opacity') return { ok: true };
  if (ch === 'open-path') return { ok: true };
  if (ch === 'pull-model') return { ok: true };
  if (ch === 'chat' || ch === 'openai-chat' || ch === 'anthropic-chat' || ch === 'gemini-chat') {
    const aId = (args && args.agentId) || 'master';
    setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        i += 14;
        const part = __demoReply.slice(Math.max(0, i - 14), i);
        __emit('chat-chunk', { agentId: aId, content: part });
        if (i >= __demoReply.length) { clearInterval(iv); __emit('chat-done', { agentId: aId }); }
      }, 25);
    }, 400);
    return { ok: true };
  }
  if (String(ch).startsWith('ipc:3:')) return __v3Handle(String(ch).slice(6), args);
  if (ch === 'ollama' || ch === 'ollamax' || ch === 'events') {
    const method = (args && args.method) || '';
    if (method === 'models') return __mockData.models;
    return { ok: true };
  }
  if (ch === 'tools' || ch === 'tools.v3') return { ok: true, tools: __mockData.plugins.map((p) => ({ id: p.id, name: p.name })) };
  if (ch === 'orchestrator' || ch === 'orchestrator.v3') return { ok: true, agents: [] };
  if (ch === 'version') return { ok: true, ollama: '0.6.0', ollamax: '3.2.0' };
  if (ch === 'status') return { ok: true, ollama: 'mock' };
  return { ok: false, error: 'mock:unknown', channel: ch };
}

const ollamaxApi = {
  send: (ch, args) => { const res = __invokeResult(ch, args); __emit(ch, res); return res; },
  on: (ch, fn) => { (__listeners[ch] = __listeners[ch] || []).push(fn); },
  off: () => {},
  invoke: (ch, args) => Promise.resolve(__invokeResult(ch, args)),
  onEvent: (evt, fn) => { (__listeners[evt] = __listeners[evt] || []).push(fn); },
  offEvent: (evt, fn) => { (__listeners[evt] || []).forEach((f, i) => { if (f === fn) __listeners[evt].splice(i, 1); }); },
};

// EventChannel akış anahtarları ön kayıt (renderer'ın dinlediği kanallar)
['stream:token', 'stream:done', 'stream:error', 'agent:started', 'agent:done', 'agents:changed', 'sessions:changed', 'memory:changed', 'config:changed', 'audit:entry', 'models-list', 'models-data', 'chat-response'].forEach((e) => { ollamaxApi.on(e, () => {}); });

window.ollamaxApi = ollamaxApi;
window.ollamaxPlatform = 'linux';
window.__mockListeners = __listeners;
window.__mockEmit = __emit;
console.log('[mock-api] ollamaxApi yüklendi (test modu)');
