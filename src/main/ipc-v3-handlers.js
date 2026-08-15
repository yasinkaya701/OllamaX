/**
 * ipc-v3-handlers.js — ipc:3:* uç noktaları (ROADMAP Faz 1-6 uygulamaları)
 *
 * Bu modül main.js'te registerIpcV3Handlers(mainWindow, eventRefs) ile
 * çağrılır. Tüm handlers {ok, ...} şablonu döndürür. Eski uç noktalar
 * ipc-bridge.js üzerinden v3 isimlerine yönlendirilir.
 */

'use strict';

const http = require('http');
const https = require('https');

const { ipcMain } = require('electron');

const configStore = require('./config/config-store');
const auditLog = require('./audit-log');
const { getToolManifest, listTools } = require('./tools/registry');
const { executeTool } = require('./tools/executor');
const { AgentLoop, getLoop, registerLoop } = require('./agents/loop');
const { interpolatePrompt, listTemplates, saveTemplate } = require('./agents/templates');
const { runWorkflow, loadWorkflows, saveWorkflow, deleteWorkflow } = require('./workflow/engine');
const { getMemoryStore } = require('./memory/store');
const { compactContext } = require('./memory/compaction');
const { loadAll, uninstallPlugin, listPlugins } = require('./plugins/loader');
const { startServer, stopServer, listServers } = require('./mcp/client');
const { runCodeAgent } = require('./agents/code-agent-bridge');
const orchestrator = require('./agents/orchestrator');

const IMG_PROVIDERS = {
  openai: {
    hostname: 'api.openai.com',
    path: '/v1/images/generations',
    headers: (key) => ({ Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }),
    parse: (j) => (j.data && j.data[0] ? (j.data[0].url || j.data[0].b64_json || '') : ''),
  },
};

function handler(name, fn) {
  ipcMain.handle(`ipc:3:${name}`, async (event, ...args) => {
    const started = process.hrtime.bigint();
    try {
      const result = await fn(event, ...args);
      const ms = Number(((process.hrtime.bigint() - started) / BigInt(1000000)).toString());
      auditLog.logEntry('user', `ipc:${name}`, null, ms);
      return result;
    } catch (err) {
      auditLog.logEntry('user', `ipc:${name}-error`, { error: String(err.message).slice(0, 200) });
      return { ok: false, error: err.message };
    }
  });
}

function registerIpcV3Handlers(mainWindow) {
  /* ------------------------------ CONFIG ------------------------------ */

  handler('config-get', () => {
    const config = configStore.readConfig();
    // Diskte hassas değerler saklanır; renderer'a çözülmüş değerler verilir
    const providers = configStore.resolvedProviders(config);
    return { ok: true, config: { ...config, providers } };
  });

  handler('config-update', (_e, patch) => {
    if (!patch || typeof patch !== 'object') return { ok: false, error: 'Geçersiz patch.' };
    const config = configStore.updateConfig((c) => {
      const next = { ...c };
      if (patch.app) next.app = { ...(next.app || {}), ...patch.app };
      if (patch.providers) {
        next.providers = { ...(next.providers || {}), ...patch.providers };
        // apiKey güncellemelerinde ENV: ön ekini koru
        for (const p of ['openai', 'anthropic', 'gemini']) {
          if (patch.providers[p] && typeof patch.providers[p].apiKey === 'string') {
            next.providers[p].apiKey = patch.providers[p].apiKey;
          }
        }
      }
      if (Array.isArray(patch.agents)) next.agents = patch.agents;
      if (Array.isArray(patch.workspaces)) next.workspaces = patch.workspaces;
      return next;
    });
    return { ok: true, config: { ...config, providers: configStore.resolvedProviders(config) } };
  });

  /* ------------------------------ SESSIONS ------------------------------ */

  handler('session-save', (_e, { sessionId, data }) => {
    if (!sessionId || !data) return { ok: false, error: 'Eksik parametre.' };
    return configStore.writeSession(sessionId, data);
  });

  handler('session-load', (_e, { sessionId }) => {
    if (!sessionId) return { ok: false, error: 'Eksik parametre.' };
    const s = configStore.readSession(sessionId);
    return { ok: true, session: s };
  });

  handler('session-list', () => ({ ok: true, sessions: configStore.listSessions() }));

  handler('session-delete', (_e, { sessionId }) => configStore.deleteSession(sessionId));

  /* ------------------------------ TOOLS ------------------------------ */

  handler('tools-list', () => ({ ok: true, tools: listTools() }));

  handler('tool-execute', async (_e, { name, args, context } = {}) => {
    const manifest = getToolManifest(name);
    if (!manifest) return { ok: false, error: 'Bilinmeyen araç.' };
    if (manifest.tier === 'read') {
      const result = await executeTool(manifest, args || {}, context || {});
      return { ok: !result.error, ...result };
    }
    // write/exec araçları AgentLoop'un approval köprüsünden geçmek zorunda;
    // doğrudan çağrı reddedilir (güvenlik katmanı).
    return { ok: false, error: 'Bu araç yalnızca ajan döngüsü içinden onay akışıyla çalışır.' };
  });

  /* ------------------------------ AGENT LOOP ------------------------------ */

  handler('agent-loop-start', (event, { sessionId, provider, model, apiKey, messages, tools }) => {
    if (getLoop(sessionId)) return { ok: false, error: 'Oturum zaten çalışıyor.' };
    const hosts = configStore.readConfig()?.providers?.ollama?.hosts || ['localhost:11434'];
    const host = hosts[0] || 'localhost:11434';
    const loop = new AgentLoop({
      sessionId,
      provider,
      model,
      apiKey: configStore.resolveApiKey(apiKey || ''),
      messages: messages || [],
      tools: tools || [],
      win: event.sender.getOwnerBrowserWindow ? event.sender.getOwnerBrowserWindow() : mainWindow,
      host,
    });
    registerLoop(sessionId, loop);

    const onToken = (t) => {
      if (t.sessionId === sessionId) event.sender.send('event:token', { agentId: sessionId, content: t.delta });
    };
    const onThinking = (t) => {
      if (t.sessionId === sessionId) event.sender.send('event:thinking', { agentId: sessionId, content: t.delta });
    };
    const onToolCall = (t) => {
      if (t.sessionId === sessionId) event.sender.send('event:tool-call', { agentId: sessionId, ...t });
    };
    const onToolResult = (t) => {
      if (t.sessionId === sessionId) event.sender.send('event:tool-result', { agentId: sessionId, ...t });
    };
    const onError = (e) => {
      if (e.sessionId === sessionId) event.sender.send('chat-chunk', { agentId: sessionId, content: `\n\n❌ ${e.msg}` });
    };
    const onDone = (d) => {
      if (d.sessionId !== sessionId) return;
      event.sender.send('chat-done', { agentId: sessionId, steps: d.steps, finish: d.finish });
      loop.channel.off('token', onToken);
      loop.channel.off('thinking', onThinking);
      loop.channel.off('tool-call', onToolCall);
      loop.channel.off('tool-result', onToolResult);
      loop.channel.off('error', onError);
      loop.channel.off('done', onDone);
    };
    loop.channel.on('token', onToken);
    loop.channel.on('thinking', onThinking);
    loop.channel.on('tool-call', onToolCall);
    loop.channel.on('tool-result', onToolResult);
    loop.channel.on('error', onError);
    loop.channel.on('done', onDone);

    void loop.run();
    return { ok: true };
  });

  handler('agent-loop-abort', (_e, { sessionId }) => {
    const loop = getLoop(sessionId);
    if (!loop) return { ok: false, error: 'Oturum bulunamadı.' };
    loop.abort();
    return { ok: true };
  });

  handler('agent-loop-status', (_e, { sessionId }) => {
    const loop = getLoop(sessionId);
    return {
      ok: true,
      running: Boolean(loop),
      steps: loop?.steps || 0,
      done: loop?.done || false,
    };
  });

  /* ------------------------------ MEMORY ------------------------------ */

  handler('memory-search', async (_e, { query, limit, category }) => {
    const store = getMemoryStore();
    return store.search(query, limit || 10, category);
  });

  handler('memory-candidates', () => ({
    ok: true,
    candidates: getMemoryStore().listCandidates(),
  }));

  handler('memory-accept-candidate', (_e, { id }) => getMemoryStore().acceptCandidate(id));

  handler('memory-reject-candidate', (_e, { id }) => getMemoryStore().rejectCandidate(id));

  handler('compact-context', async (_e, { messages }) => compactContext(messages));

  /* ------------------------------ WORKFLOWS ------------------------------ */

  handler('workflow-list', () => ({ ok: true, workflows: loadWorkflows() }));

  handler('workflow-save', (_e, { id, workflow }) => {
    if (!id || !workflow) return { ok: false, error: 'Eksik parametre.' };
    return saveWorkflow(id, workflow);
  });

  handler('workflow-delete', (_e, { id }) => deleteWorkflow(id));

  handler('workflow-run', async (event, { workflow, userMessage, agents }) => {
    const runFn = async (agentDef, input) => {
      return new Promise((resolve) => {
        const hosts = configStore.readConfig()?.providers?.ollama?.hosts || ['localhost:11434'];
        const host = hosts[0] || 'localhost:11434';
        const t = require('../../main-security').splitOllamaHttpTarget(require('../../main-security').normalizeOllamaHost(host));
        if (!t) {
          resolve('[HATA] Ollama adresi geçersiz.');
          return;
        }
        const body = JSON.stringify({ model: agentDef.model || 'llama3.2:1b', messages: [{ role: 'user', content: input }], stream: true });
        const req = http.request(
          { hostname: t.hostname, port: t.port, path: '/api/chat', method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 180000 },
          (res) => {
            let out = '';
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (c) => {
              buf += c;
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const l of lines) {
                try {
                  const j = JSON.parse(l);
                  if (j.message?.content) out += j.message.content;
                } catch {
                  /* ignore */
                }
              }
            });
            res.on('end', () => resolve(out || '[BOŞ YANIT]'));
            res.on('error', () => resolve(`[HATA] Ollama bağlantı hatası`));
          },
        );
        req.on('error', () => resolve(`[HATA] ${host} bağlantı hatası`));
        req.on('timeout', () => {
          req.destroy();
          resolve('[HATA] Zaman aşımı.');
        });
        req.write(body);
        req.end();
      });
    };
    const result = await runWorkflow(workflow, { userMessage: userMessage || '', agents: agents || [], runFn });
    return result;
  });

  /* ------------------------------ TEMPLATES ------------------------------ */

  handler('templates-list', () => ({ ok: true, templates: listTemplates() }));

  handler('templates-save', (_e, { template }) => {
    if (!template) return { ok: false, error: 'Eksik şablon.' };
    template.prompt = interpolatePrompt(template.prompt, {});
    return saveTemplate(template);
  });

  /* ------------------------------ MCP ------------------------------ */

  handler('mcp-servers', () => ({ ok: true, servers: listServers() }));

  handler('mcp-server-start', (_e, { name, config }) => ({ ok: startServer(name, config) }));

  handler('mcp-server-stop', (_e, { name }) => {
    stopServer(name);
    return { ok: true };
  });

  /* ------------------------------ PLUGINS ------------------------------ */

  handler('plugins-list', () => ({ ok: true, plugins: listPlugins() }));

  handler('plugins-uninstall', (_e, { id }) => uninstallPlugin(id));

  /* ------------------------------ AUDIT ------------------------------ */

  handler('audit-log', (_e, { actor, action, limit, offset } = {}) => {
    return auditLog.query({ actor, action, limit: limit || 100, offset: offset || 0 });
  });

  /* ------------------------------ IMAGE GENERATION ------------------------------ */

  handler('generate-image', async (_e, { prompt, provider = 'openai', apiKey, size = '1024x1024' } = {}) => {
    if (!prompt || typeof prompt !== 'string') return { ok: false, error: 'Prompt eksik.' };
    const key = configStore.resolveApiKey(apiKey || '');
    const prov = IMG_PROVIDERS[provider];
    if (!prov) return { ok: false, error: 'Desteklenmeyen görsel sağlayıcı.' };
    if (!key) return { ok: false, error: 'API anahtarı gerekli.' };
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname: prov.hostname,
          path: prov.path,
          method: 'POST',
          headers: prov.headers(key),
          timeout: 120000,
        },
        (res) => {
          let buf = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (buf += c));
          res.on('end', () => {
            try {
              const j = JSON.parse(buf);
              const data = prov.parse(j);
              if (data) {
                resolve({ ok: true, data });
              } else {
                resolve({ ok: false, error: j.error?.message || 'Görsel üretilemedi.' });
              }
            } catch {
              resolve({ ok: false, error: 'Yanıt ayrıştırılamadı.' });
            }
          });
          res.on('error', () => resolve({ ok: false, error: 'Ağ hatası.' }));
        },
      );
      req.on('error', () => resolve({ ok: false, error: 'Ağ hatası.' }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, error: 'Zaman aşımı.' });
      });
      req.write(JSON.stringify({ model: 'dall-e-3', prompt, size }));
      req.end();
    });
  });

  /* ------------------------------ FLEET ------------------------------ */

  handler('fleet-scan', () => {
    const config = configStore.readConfig();
    const hosts = config?.providers?.ollama?.hosts || ['localhost:11434'];
    return new Promise((resolve) => {
      let remaining = hosts.length;
      const results = [];
      for (const host of hosts) {
        const t = require('../../main-security').splitOllamaHttpTarget(require('../../main-security').normalizeOllamaHost(host));
        if (!t) {
          results.push({ host, ok: false, error: 'geçersiz adres' });
          remaining -= 1;
          continue;
        }
        const req = http.request(
          { hostname: t.hostname, port: t.port, path: '/api/version', method: 'GET', timeout: 5000 },
          (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
              results.push({ host, ok: true, version: buf.trim() });
              remaining -= 1;
              if (remaining === 0) resolve({ ok: true, machines: results });
            });
            res.on('error', () => {
              results.push({ host, ok: false, error: 'bağlantı hatası' });
              remaining -= 1;
              if (remaining === 0) resolve({ ok: true, machines: results });
            });
          },
        );
        req.on('error', () => {
          results.push({ host, ok: false, error: 'bağlantı hatası' });
          remaining -= 1;
          if (remaining === 0) resolve({ ok: true, machines: results });
        });
        req.on('timeout', () => {
          req.destroy();
          results.push({ host, ok: false, error: 'zaman aşımı' });
          remaining -= 1;
          if (remaining === 0) resolve({ ok: true, machines: results });
        });
        req.end();
      }
      if (hosts.length === 0) resolve({ ok: true, machines: [] });
    });
  });

  /* ------------------------------ KOD AJANLARI (anahtarsız CLI köprüsü) ------------------------------ */

  handler('code-agent-detect', async () => {
    const detected = await discoverAgents();
    const orch = await orchestrator.discoverAll();
    // Orchestrator keşfi CLI + HTTP ajanları birleştirir (Ollama dahil)
    return { ok: true, agents: { ...detected, ...orch } };
  });

  handler('code-agent-run', async (_e, payload) => {
    if (!payload || typeof payload.agentId !== 'string') return { ok: false, error: 'agentId gerekli.' };
    const { agentId, task, chain } = payload;
    const result = await runCodeAgent(agentId, String(task || ''), chain || null);
    return result;
  });

  handler('orchestra-discover', async () => {
    const orch = await orchestrator.discoverAll();
    return { ok: true, agents: orch };
  });

  handler('orchestra-run', async (_e, payload) => {
    if (!payload || typeof payload.agentId !== 'string') return { ok: false, error: 'agentId gerekli.' };
    const { agentId, task, chain } = payload;
    const result = await orchestrator.runAgent(agentId, String(task || ''), { chain: chain || null, model: payload.model });
    return result;
  });

  handler('orchestra-chain', async (_e, payload) => {
    if (!payload || !Array.isArray(payload.order) || payload.order.length === 0) return { ok: false, error: 'order gerekli.' };
    const result = await orchestrator.runChain(payload.order, String(payload.task || ''));
    return result;
  });

  /* ------------------------------ PLUGIN LOADING (açalışta) ------------------------------ */

  try {
    const ipcInvoke = async (channel, payload) => {
      const delegates = ipcMain.listeners(`ipc:3:${channel}`);
      if (delegates && delegates.length) {
        return delegates[0](null, payload);
      }
      throw new Error(`İzin dışı IPC: ${channel}`);
    };
    loadAll(ipcInvoke);
  } catch {
    /* açılışta eklenti yükleme hatası app'i kırmasın */
  }

  return true;
}

module.exports = { registerIpcV3Handlers };
