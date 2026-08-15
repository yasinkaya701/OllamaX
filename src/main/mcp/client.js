/**
 * mcp/client.js — MCP (Model Context Protocol) stdio istemcisi (F2.3)
 *
 * Kullanıcının settings'ten eklediği MCP sunucularını ayrı child process
 * olarak başlatır (shell:false, komut allowlist). Sunucunun expose ettiği
 * araçlar ana araç kaydı tarafından sarmalanır ve tool-approval
 * mekanizmasına tabi olur.
 *
 * Güvenlik:
 *  - command allowlist: npx, node, uvx, bun, deno + absolute path
 *  - Her sunucu kendi process'i; ayrılmış stdio ile JSON-RPC
 *  - Sunucu çökerse graceful degrade: araçlar "kullanılamıyor" olur
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ALLOWED_COMMANDS = new Set(['npx', 'node', 'uvx', 'bun', 'deno', 'uv', 'pipx']);

const ALLOWED_ARGS_PREFIXES = ['@modelcontextprotocol/', '@anthropic/', '@anthropic-ai/'];

class McpClient {
  constructor(serverName, config, allowedRoots) {
    this.serverName = serverName;
    this.config = config;
    this.allowedRoots = allowedRoots;
    this.process = null;
    this.ready = false;
    this.tools = [];
    this.messageId = 0;
    this.pending = new Map();
    this.receiveBuffer = '';
    this.crashCount = 0;
  }

  /**
   * Komut doğrulaması: allowlist + argüman prefix kontrolü
   */
  static validateConfig(config) {
    if (!config || typeof config.command !== 'string') return false;
    const base = path.basename(config.command).toLowerCase();
    const isAllowed =
      ALLOWED_COMMANDS.has(base) ||
      (path.isAbsolute(config.command) && fs.existsSync(config.command));
    if (!isAllowed) return false;
    const args = Array.isArray(config.args) ? config.args : [];
    for (const a of args) {
      if (typeof a !== 'string') return false;
      if (a.startsWith('@') && !ALLOWED_ARGS_PREFIXES.some((p) => a.slice(1).startsWith(p.replace('@', '')))) {
        // Bilinmeyen scoped paketler engellenir
        return false;
      }
    }
    return true;
  }

  start() {
    if (!McpClient.validateConfig(this.config)) return false;
    try {
      this.process = spawn(this.config.command, Array.isArray(this.config.args) ? this.config.args : [], {
        shell: false,
        env: { ...process.env, ...(this.config.env || {}) },
      });
      this.process.stdout.setEncoding('utf8');
      this.process.stdout.on('data', (chunk) => this.onData(chunk));
      this.process.stderr.setEncoding('utf8');
      this.process.stderr.on('data', () => {
        /* stderr gürültüsü yutulur */
      });
      this.process.on('exit', (_code) => {
        this.ready = false;
        this.process = null;
        this.crashCount += 1;
        if (this.crashCount >= 3) {
          console.warn(`[mcp] ${this.serverName} crash-loop: devre dışı`);
        }
      });
      this.process.on('error', () => {
        this.ready = false;
        this.process = null;
      });
      return true;
    } catch {
      return false;
    }
  }

  onData(chunk) {
    this.receiveBuffer += chunk;
    const lines = this.receiveBuffer.split('\n');
    this.receiveBuffer = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const msg = JSON.parse(t);
        if (typeof msg.id === 'number' || typeof msg.id === 'string') {
          const p = this.pending.get(String(msg.id));
          if (p) {
            this.pending.delete(String(msg.id));
            clearTimeout(p.timer);
            p.resolve(msg.result);
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  rpc(method, params, timeoutMs = 30000) {
    return new Promise((resolve) => {
      if (!this.process || !this.ready && method !== 'initialize') {
        resolve(null);
        return;
      }
      const id = String(++this.messageId);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      try {
        this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch {
        this.pending.delete(id);
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async initialize() {
    const result = await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ollamax', version: '3.0.0' },
    });
    if (!result) return false;
    await this.rpc('notifications/initialized', {});
    this.ready = true;
    return true;
  }

  async listTools() {
    if (!this.ready) return [];
    try {
      const result = await this.rpc('tools/list', {});
      const tools = Array.isArray(result?.tools) ? result.tools : [];
      this.tools = tools.map((t) => ({
        ...t,
        source: this.serverName,
        mcp: true,
      }));
      return this.tools;
    } catch {
      return [];
    }
  }

  async callTool(name, args) {
    if (!this.ready) return { content: [{ type: 'text', text: '[MCP sunucusu hazır değil]' }] };
    try {
      const result = await this.rpc('tools/call', { name, arguments: args }, 120000);
      return result;
    } catch {
      return { content: [{ type: 'text', text: '[MCP araç çağrısı başarısız]' }] };
    }
  }

  stop() {
    try {
      if (this.process) this.process.kill();
    } catch {
      /* ignore */
    }
    this.process = null;
    this.ready = false;
  }
}

/**
 * Global sunucu yönetimi
 */
const servers = new Map();

function startServer(name, config, allowedRoots) {
  if (servers.has(name)) stopServer(name);
  const client = new McpClient(name, config, allowedRoots);
  if (!client.start()) return false;
  servers.set(name, client);
  void client.initialize().then((ok) => {
    if (ok) void client.listTools();
  });
  return true;
}

function stopServer(name) {
  const c = servers.get(name);
  if (c) c.stop();
  servers.delete(name);
}

function getServer(name) {
  return servers.get(name) || null;
}

function listServers() {
  const out = [];
  for (const [name, c] of servers) {
    out.push({ name, ready: c.ready, toolCount: c.tools.length });
  }
  return out;
}

async function listAllMcpTools() {
  let all = [];
  for (const c of servers.values()) {
    if (c.ready) all = all.concat(await c.listTools());
  }
  return all;
}

module.exports = {
  McpClient,
  startServer,
  stopServer,
  getServer,
  listServers,
  listAllMcpTools,
  ALLOWED_COMMANDS,
};
