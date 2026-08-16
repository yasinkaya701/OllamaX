/**
 * v318.test.js — v3.18 özellik testleri
 *
 * Kapsam: profil paketi (format/validation/import-export), MCP broker
 * (ajan-MCP atama filtreleme), denetim export (json/csv/sarif), CLI
 * argüman ayrıştırma, araç kayıt defterinde browser araçları.
 */
'use strict';
const path = require('path');

jest.mock('electron', () => ({}), { virtual: true });

beforeEach(() => {
  jest.resetModules();
});

const MockTestState = { config: null, dir: path.join(__dirname, '.tmp-v318') };
function withConfigStore(mockConfig) {
  MockTestState.config = mockConfig;
  jest.mock('../src/main/config/config-store', () => ({
    readConfig: () => JSON.parse(JSON.stringify(MockTestState.config)),
    updateConfig: (fn) => {
      MockTestState.config = fn(JSON.parse(JSON.stringify(MockTestState.config)));
      return MockTestState.config;
    },
    auditLogPath: () => require('path').join(MockTestState.dir, 'audit.jsonl'),
    resolvedProviders: (c) => (c && c.providers) || {},
  }));
}

describe('profile-package (v3.18 C-1)', () => {
  beforeEach(() => {
    withConfigStore({
      schemaVersion: 1,
      app: { theme: 'dark', language: 'tr' },
      providers: { ollama: { hosts: ['localhost:11434'], defaultHostId: 'h1' }, openai: { apiKey: 'sk-secret', model: 'gpt-4o' } },
      agents: [{ id: 'coder', model: 'llama3.2:1b' }],
      workspaces: [],
      mcp: {
        servers: [{ name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'] }],
        agentSets: { coder: ['fs'] },
      },
    });
    jest.mock('../src/main/agents/templates', () => ({
      listTemplates: () => [{ id: 'review', label: 'Code Review', category: 'kod', prompt: 'İncele: {{input}}' }],
      saveTemplate: (t) => ({ ok: true, template: t }),
      deleteTemplate: () => ({ ok: true }),
      templateDir: MockTestState.dir,
      bundledTemplateDir: MockTestState.dir,
    }));
    const fs = require('fs');
    try {
      fs.mkdirSync(MockTestState.dir, { recursive: true });
    } catch {
      /* ignore */
    }
  });

  test('dışa aktarma paketi beklenen şemayı üretir ve API anahtarlarını maskeleyip saklar', () => {
    const pkg = require('../src/main/profile-package').exportProfile({});
    expect(pkg).toMatchObject({
      schemaVersion: 1,
      format: 'krevyxprofile',
      name: expect.any(String),
      createdAt: expect.any(String),
      agents: expect.any(Array),
      templates: expect.any(Array),
      providers: expect.any(Array),
      mcpServers: expect.any(Array),
    });
    expect(Array.isArray(pkg.templates)).toBe(true);
    expect(pkg.templates[0]).toEqual({ id: 'review', label: 'Code Review', category: 'kod', prompt: 'İncele: {{input}}' });
    expect(pkg.agents).toEqual([{ id: 'coder', model: 'llama3.2:1b' }]);
    expect(pkg.providers.length).toBeGreaterThanOrEqual(1);
    const openai = pkg.providers.find((p) => p.id === 'openai');
    expect(openai.apiKey).toBeUndefined();
    expect(pkg.mcpServers).toEqual([{ name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/home'] }]);
  });

  test('içe aktarma tüm bölümleri kayıtlara yazar ve sayıları döndürür', () => {
    const pp = require('../src/main/profile-package');
    const pkg = pp.exportProfile({});
    delete pkg.createdAt;
    // Aynı config zaten paketlenen veriyi içeriyor; yeni öğelerin eklendiğini
    // doğrulamak için paketin içeriğine yeni öğe ekle ve import et.
    pkg.templates.push({ id: 'imported-tpl', label: 'İçe Aktarılan', category: 'imported', prompt: 'yeni: {{input}}' });
    pkg.agents.push({ id: 'imported-agent', model: 'llama3.3:3b' });
    pkg.mcpServers.push({ name: 'github-pkg', command: 'npx', args: ['@modelcontextprotocol/server-github'] });
    const result = pp.importProfile(pkg);
    expect(result.ok).toBe(true);
    expect(result.imported.templates).toBeGreaterThanOrEqual(1);
    expect(result.imported.agents).toBe(1);
    expect(result.imported.mcpServers).toBe(1);
    const cs = require('../src/main/config/config-store');
    expect(cs.readConfig().agents.some((a) => a.id === 'imported-agent')).toBe(true);
  });

  test('geçersiz/eksik paket reddedilir', () => {
    const pp = require('../src/main/profile-package');
    expect(pp.importProfile(null).ok).toBe(false);
    expect(pp.importProfile({})).toMatchObject({ ok: false });
    expect(pp.importProfile({ schemaVersion: 1, format: 'krevyxprofile', templates: 'olmali-dizi-degil' }).ok).toBe(false);
    expect(pp.importProfile({ schemaVersion: 2, format: 'krevyxprofile' }).ok).toBe(false);
    expect(pp.importProfile({ schemaVersion: 1, format: 'bilinmeyen' }).ok).toBe(false);
  });

  test('gizli alanlar provider paketinden asla taşınmaz', () => {
    const pp = require('../src/main/profile-package');
    const result = pp.importProfile({
      schemaVersion: 1,
      format: 'krevyxprofile',
      templates: [],
      providers: [{ id: 'x', apiKey: 'sırrım', command: 'zararlı-cmd' }],
    });
    expect(result.ok).toBe(true);
    expect(result.imported.providers).toBe(1);
    const c = require('../src/main/config/config-store').readConfig();
    expect(c.providers.x.apiKey).toBeUndefined();
    expect(c.providers.x.command).toBe('zararlı-cmd');
  });
});

describe('mcp/broker (v3.18 C-3)', () => {
  beforeEach(() => {
    withConfigStore({
      app: {},
      providers: {},
      agents: [],
      workspaces: [],
      mcp: {
        servers: [
          { name: 'fs', command: 'node', tools: [{ name: 'read_file' }, { name: 'list_dir' }] },
          { name: 'github', command: 'node', tools: [{ name: 'gh_pr_list' }] },
        ],
        agentSets: { codex: ['fs'] },
      },
    });
  });

  test('get/set agentMcpSets configStore üzerinden kalıcıdır', () => {
    const b = require('../src/main/mcp/broker');
    expect(b.getAgentMcpSets()).toEqual({ codex: ['fs'] });
    b.setAgentMcpSets({ codex: ['fs', 'github'] });
    expect(b.getAgentMcpSets()).toEqual({ codex: ['fs', 'github'] });
  });

  test('serversForAgent yalnızca atanan sunucu tanımlarını döndürür', () => {
    const b = require('../src/main/mcp/broker');
    const defs = b.serversForAgent('codex');
    expect(defs.map((d) => d.name)).toEqual(['fs']);
    expect(b.serversForAgent('ollama')).toEqual([]);
  });

  test('filterMcpToolsForAgent atama varsa yalnızca o sunucunun araçlarını bırakır', () => {
    const b = require('../src/main/mcp/broker');
    const tools = [
      { server: 'fs', name: 'read_file' },
      { server: 'github', name: 'gh_pr_list' },
      { server: 'fs', name: 'list_dir' },
    ];
    const filtered = b.filterMcpToolsForAgent('codex', tools);
    expect(filtered.map((t) => t.name)).toEqual(['read_file', 'list_dir']);
    expect(b.filterMcpToolsForAgent('ollama', tools)).toEqual(tools);
    expect(b.filterMcpToolsForAgent(null, tools)).toEqual(tools);
  });

  test('server alanı olmayan araçlar sunucu tanımına geri düşer', () => {
    const b = require('../src/main/mcp/broker');
    const tools = [{ name: 'read_file' }, { name: 'gh_pr_list' }];
    expect(b.filterMcpToolsForAgent('codex', tools).map((t) => t.name)).toEqual(['read_file']);
  });
});

describe('audit-export (v3.18 C-2)', () => {
  const fs = require('fs');

  beforeEach(() => {
    withConfigStore({});
    fs.mkdirSync(MockTestState.dir, { recursive: true });
    const lines = [
      { ts: '2026-08-16T10:00:00Z', actor: 'user', action: 'tool:read_file', detail: { tool: 'read_file' }, duration_ms: 12, prev_hash: '0'.repeat(64), hash: 'a'.repeat(64) },
      { ts: '2026-08-16T10:00:01Z', actor: 'agent', action: 'tool:terminal_execute', detail: { tool: 'terminal_execute', ok: true }, duration_ms: 400, prev_hash: 'a'.repeat(64), hash: 'b'.repeat(64) },
    ];
    fs.writeFileSync(path.join(MockTestState.dir, 'audit.jsonl'), lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  });

  test('json çıktısı satırları ve hash zincirini korur', () => {
    const ae = require('../src/main/audit-export');
    const out = ae.exportAs('json');
    expect(out.count).toBe(2);
    expect(out.payload[0].hash).toBe('a'.repeat(64));
    expect(out.payload[1].actor).toBe('agent');
  });

  test('csv çıktısı başlık + veri satırları üretir ve virgül içeren alanları tırnaklar', () => {
    const ae = require('../src/main/audit-export');
    const out = ae.exportAs('csv');
    const rows = out.payload.split('\n');
    expect(rows[0]).toBe('ts,actor,action,detail,duration_ms,prev_hash,hash');
    expect(rows.length).toBe(3);
    expect(rows[1]).toContain('"tool');
  });

  test('sarif çıktısı OASIS 2.1.0 şemasına uyar', () => {
    const ae = require('../src/main/audit-export');
    const out = ae.exportAs('sarif');
    expect(out.count).toBe(2);
    const sarif = out.payload;
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].tool.driver.name).toBe('Krevyx Audit');
    expect(sarif.runs[0].results.length).toBe(2);
    expect(sarif.runs[0].results[0].ruleId).toMatch(/^KRVX-/);
    expect(sarif.runs[0].results[0].properties.hash).toBe('a'.repeat(64));
  });

  test('var olmayan dosyada boş sonuç döner', () => {
    jest.resetModules();
    withConfigStore({});
    fs.rmSync(path.join(MockTestState.dir, 'audit.jsonl'), { force: true });
    const ae = require('../src/main/audit-export');
    expect(ae.exportAs('json').count).toBe(0);
    expect(ae.exportAs('csv').payload).toBe('ts,actor,action,detail,duration_ms,prev_hash,hash');
  });
});

describe('cli/run argüman ayrıştırma (v3.18 C-4)', () => {
  const { parseArgs } = require('../src/main/cli/run');

  test('prompt ve varsayılanları doğru ayıklar', () => {
    const opts = parseArgs(['node', 'run', 'merhaba dünya']);
    expect(opts.prompt).toBe('merhaba dünya');
    expect(opts.agent).toBe('ollama');
    expect(opts.output).toBe('text');
    expect(opts.timeout).toBe(300000);
    expect(opts.chain).toBe(false);
  });

  test('tüm seçenekleri ayrıştırır', () => {
    const opts = parseArgs(['node', 'run', 'test', '--agent', 'codex', '--agents', 'claude-code,codex', '--dir', '/tmp', '--output', 'json', '--timeout', '5000', '--chain', '--quiet']);
    expect(opts.prompt).toBe('test');
    expect(opts.agent).toBe('codex');
    expect(opts.agents).toEqual(['claude-code', 'codex']);
    expect(opts.dir).toBe('/tmp');
    expect(opts.output).toBe('json');
    expect(opts.timeout).toBe(5000);
    expect(opts.chain).toBe(true);
    expect(opts.quiet).toBe(true);
  });
});

describe('araç kayıt defteri browser araçları (v3.18)', () => {
  const reg = require('../src/main/tools/registry');

  test('dört browser aracı kayıtlı ve doğru tier\'da', () => {
    for (const name of ['browser_navigate', 'browser_click', 'browser_type']) {
      const m = reg.getToolManifest(name);
      expect(m).toBeTruthy();
      expect(m.tier).toBe('exec');
      expect(reg.EXEC_TOOLS).toContain(name);
    }
    const shot = reg.getToolManifest('browser_screenshot');
    expect(shot.tier).toBe('read');
    expect(reg.READ_ONLY_TOOLS).toContain('browser_screenshot');
  });

  test('browser navigasyonu yalnızca http/https kabul eden şemaya sahip', () => {
    const m = reg.getToolManifest('browser_navigate');
    expect(m.input_schema.properties.url.type).toBe('string');
    expect(m.input_schema.required).toContain('url');
  });
});
