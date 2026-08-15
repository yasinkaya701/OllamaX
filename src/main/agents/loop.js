/**
 * agents/loop.js — Ajan planlama/araç döngüsü (F2.4)
 *
 * Döngü:
 *  1. Lead ajan, araç listesiyle sistem prompt'u + geçmişle stream edilir
 *  2. tool-call olayı gelirse döngü duraklar -> ToolExecutor çalıştırır
 *     (write/exec tier araçlar tool-approval-request ile onay ister)
 *  3. tool-result mesajı geçmişe eklenir, ajan devam eder
 *  4. done veya max adım (25) aşıldığında biter
 *
 * Her adımda checkpoint yazılır; pencere kapansa bile durum korunur.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { EventChannel } = require('./event-channel');
const { executeTool, getToolManifest } = require('../tools/executor');
const configStore = require('../config/config-store');

const MAX_TOOL_STEPS = 25;

class AgentLoop {
  constructor({ sessionId, provider, model, apiKey, messages, tools, win, host }) {
    this.sessionId = sessionId;
    this.provider = provider || 'ollama';
    this.model = model || '';
    this.apiKey = apiKey || '';
    this.messages = Array.isArray(messages) ? [...messages] : [];
    this.tools = Array.isArray(tools) ? tools : [];
    this.win = win;
    this.host = host || 'localhost:11434';
    this.channel = new EventChannel(sessionId);
    this.steps = 0;
    this.aborted = false;
    this.done = false;
  }

  abort() {
    this.aborted = true;
  }

  /**
   * tool-approval-request -> tool-approval-response köprüsü
   */
  requestApproval(manifest, args) {
    return new Promise((resolve) => {
      if (!this.win || this.win.isDestroyed()) {
        resolve(false);
        return;
      }
      const listener = (_event, decision) => {
        if (decision?.sessionId !== this.sessionId) return;
        this.win.webContents.removeListener('tool-approval-response', listener);
        clearTimeout(timer);
        resolve(Boolean(decision?.approved));
      };
      const timer = setTimeout(() => {
        this.win.webContents.removeListener('tool-approval-response', listener);
        resolve(false);
      }, 120000); // 2 dakika sessizlik = red
      this.win.webContents.on('tool-approval-response', listener);
      this.win.webContents.send('tool-approval-request', {
        sessionId: this.sessionId,
        tool: manifest.display_name || manifest.name,
        args,
      });
    });
  }

  async run() {
    let stopReason = 'stop';
    while (this.steps < MAX_TOOL_STEPS && !this.aborted) {
      this.steps += 1;
      this.saveCheckpoint('start');

      const hadToolCall = await new Promise((resolve) => {
        let toolCall = null;
        const cleanup = () => {
          this.channel.off('tool-call', onToolCall);
          this.channel.off('done', onDone);
          this.channel.off('error', onError);
        };
        const onDone = (d) => {
          cleanup();
          stopReason = d?.finish || 'stop';
          resolve(null);
        };
        const onError = () => {
          cleanup();
          resolve(null);
        };
        const onToolCall = (tc) => {
          toolCall = tc;
          cleanup();
          resolve(toolCall);
        };
        this.channel.on('done', onDone);
        this.channel.on('error', onError);
        this.channel.on('tool-call', onToolCall);
        this.startProviderStream().catch((err) => {
          this.channel.push('error', { msg: err?.message || 'Akış başlatılamadı' });
        });
      });

      if (this.aborted) {
        stopReason = 'abort';
        break;
      }
      if (!hadToolCall) break;

      // Tool-call tamamlandı mı? (args akışı bittikten sonra tam JSON)
      const manifest = getToolManifest(hadToolCall.name);
      if (!manifest) {
        this.messages.push({ role: 'tool', name: hadToolCall.name, content: `[HATA] Bilinmeyen araç: ${hadToolCall.name}` });
        this.channel.push('tool-result', { name: hadToolCall.name, content: '[HATA] Bilinmeyen araç' });
        continue;
      }

      let parsedArgs;
      try {
        parsedArgs = JSON.parse(hadToolCall.args || '{}');
      } catch {
        parsedArgs = {};
      }

      const approved = manifest.tier === 'read' ? true : await this.requestApproval(manifest, parsedArgs);
      if (!approved) {
        this.messages.push({ role: 'tool', name: hadToolCall.name, content: '[Kullanıcı reddetti]' });
        this.channel.push('tool-result', { name: hadToolCall.name, content: '[Kullanıcı reddetti]' });
        continue;
      }

      const result = await executeTool(manifest, parsedArgs, { actor: 'agent' });
      const content = typeof result.content === 'string' ? result.content : JSON.stringify(result);
      this.messages.push({ role: 'tool', name: hadToolCall.name, content });
      this.channel.push('tool-result', { name: hadToolCall.name, content });
      this.saveCheckpoint('step');
    }

    if (this.steps >= MAX_TOOL_STEPS && !this.done) {
      this.channel.push('error', { msg: `Maksimum araç adımı sınırına (${MAX_TOOL_STEPS}) ulaşıldı.` });
      stopReason = 'step_limit';
    }
    this.done = true;
    this.saveCheckpoint('done');
    this.channel.push('done', { finish: this.aborted ? 'abort' : stopReason, steps: this.steps });
    this.channel.clear();
  }

  async startProviderStream() {
    // Adapter seçimi
    let adapter;
    const { openaiAdapter, anthropicAdapter, geminiAdapter, ollamaAdapter } = require('./event-channel');
    if (this.provider === 'openai') adapter = openaiAdapter(this.channel);
    else if (this.provider === 'anthropic') adapter = anthropicAdapter(this.channel);
    else if (this.provider === 'gemini') adapter = geminiAdapter(this.channel);
    else adapter = ollamaAdapter(this.channel);

    if (this.provider === 'ollama') {
      // Ollama stream: main.js'teki mevcut akışı kanal üzerinden yönlendir
      const http = require('http');
      const url = new URL(`http://${this.host}/api/chat`);
      const payload = { model: this.model, messages: this.messages, stream: true };
      await new Promise((resolve) => {
        const req = http.request(
          { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: 180000 },
          (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              buf += chunk;
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                const t = line.trim();
                if (!t) continue;
                try {
                  adapter(JSON.parse(t));
                } catch {
                  /* ignore */
                }
              }
            });
            res.on('end', () => resolve());
            res.on('error', () => resolve());
          },
        );
        req.on('error', () => resolve());
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(JSON.stringify(payload));
        req.end();
      });
      return;
    }

    if (this.provider === 'openai' && this.apiKey) {
      const https = require('https');
      await new Promise((resolve) => {
        const payload = {
          model: this.model,
          messages: this.messages,
          stream: true,
          stream_options: { include_usage: true },
        };
        const req = https.request(
          {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: 180000,
          },
          (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              buf += chunk;
              const parts = buf.split('\n');
              buf = parts.pop();
              for (const part of parts) {
                const t = part.trim();
                if (!t.startsWith('data:')) continue;
                const data = t.slice(5).trim();
                if (data === '[DONE]') {
                  this.channel.push('done', { finish: 'stop' });
                  continue;
                }
                try {
                  adapter(JSON.parse(data));
                } catch {
                  /* ignore */
                }
              }
            });
            res.on('end', () => resolve());
            res.on('error', () => resolve());
          },
        );
        req.on('error', (err) => {
          this.channel.push('error', { msg: err.message });
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(JSON.stringify(payload));
        req.end();
      });
      return;
    }

    if (this.provider === 'anthropic' && this.apiKey) {
      const https = require('https');
      await new Promise((resolve) => {
        const payload = {
          model: this.model,
          max_tokens: 4096,
          messages: this.messages.filter((m) => m.role !== 'system'),
          stream: true,
        };
        const systemMsg = this.messages.find((m) => m.role === 'system');
        if (systemMsg) payload.system = systemMsg.content;
        const req = https.request(
          {
            hostname: 'api.anthropic.com',
            path: '/v1/messages',
            method: 'POST',
            headers: {
              'x-api-key': this.apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            timeout: 180000,
          },
          (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              buf += chunk;
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const data = t.slice(5).trim();
                try {
                  adapter(JSON.parse(data));
                } catch {
                  /* ignore */
                }
              }
            });
            res.on('end', () => resolve());
            res.on('error', () => resolve());
          },
        );
        req.on('error', (err) => {
          this.channel.push('error', { msg: err.message });
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(JSON.stringify(payload));
        req.end();
      });
      return;
    }

    if (this.provider === 'gemini' && this.apiKey) {
      const https = require('https');
      const contents = this.messages.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
      }));
      await new Promise((resolve) => {
        const req = https.request(
          {
            hostname: 'generativelanguage.googleapis.com',
            path: `/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: 180000,
          },
          (res) => {
            let buf = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              buf += chunk;
              const parts = buf.split('\n');
              buf = parts.pop();
              for (const part of parts) {
                const t = part.trim();
                if (!t.startsWith('data:')) continue;
                const data = t.slice(5).trim();
                try {
                  adapter(JSON.parse(data));
                } catch {
                  /* ignore */
                }
              }
            });
            res.on('end', () => resolve());
            res.on('error', () => resolve());
          },
        );
        req.on('error', (err) => {
          this.channel.push('error', { msg: err.message });
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          resolve();
        });
        req.write(JSON.stringify({ contents }));
        req.end();
      });
    }
  }

  saveCheckpoint(stage) {
    try {
      const dir = configStore.checkpointsDir();
      const safe = String(this.sessionId).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64);
      const p = path.join(dir, `loop-${safe}-latest.json`);
      fs.writeFileSync(
        p,
        JSON.stringify({
          sessionId: this.sessionId,
          stage,
          steps: this.steps,
          aborted: this.aborted,
          done: this.done,
          provider: this.provider,
          model: this.model,
          messages: this.messages,
          ts: new Date().toISOString(),
        }),
        'utf8',
      );
    } catch {
      /* disk hatası döngüyü kırmasın */
    }
  }
}

const activeLoops = new Map();

function getLoop(sessionId) {
  return activeLoops.get(sessionId) || null;
}

function registerLoop(sessionId, loop) {
  activeLoops.set(sessionId, loop);
  loop.channel.on('done', () => activeLoops.delete(sessionId));
}

module.exports = { AgentLoop, activeLoops, getLoop, registerLoop, MAX_TOOL_STEPS };
