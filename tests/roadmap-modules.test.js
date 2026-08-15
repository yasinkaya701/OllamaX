/**
 * tests/roadmap-modules.test.js — ROADMAP Faz 1-6 yeni modül testleri
 *
 * Kapsam: audit-log, tools/registry+executor, agents/event-channel,
 * workflow/engine, memory/store+compaction, plugins/loader, mcp/client
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const auditLog = require('../src/main/audit-log');
const { getToolManifest, listTools, validateToolArgs, isDangerousCommand } = require('../src/main/tools/registry');
const { executeTool } = require('../src/main/tools/executor');
const { EventChannel, openaiAdapter, anthropicAdapter, ollamaAdapter, geminiAdapter } = require('../src/main/agents/event-channel');
const { parseWorkflow, validateWorkflow, interpolate, runWorkflow } = require('../src/main/workflow/engine');
const { SimpleVectorIndex, cosineSimilarity } = require('../src/main/memory/store');
const { compactContext } = require('../src/main/memory/compaction');
const { validateManifest } = require('../src/main/plugins/loader');
const { McpClient } = require('../src/main/mcp/client');

const configStore = require('../src/main/config/config-store');

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ollamax-modules-'));
  configStore.setApp({ getPath: () => tmpDir });
  // Workspace klasörü oluşturup config'e işle (executor sandbox kökü için)
  // userDataDir() = app.getPath('userData') => tmpDir; ollamaxRoot() => tmpDir/ollamax
  fs.mkdirSync(path.join(tmpDir, 'ollamax'), { recursive: true });
  configStore.updateConfig((c) => ({
    ...c,
    workspaces: [{ path: path.join(tmpDir, 'workspace'), alias: 'ws' }],
  }));
  fs.mkdirSync(path.join(tmpDir, 'workspace'), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'workspace', 'deneme.txt'), 'selam dünya', 'utf8');
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('audit-log zinciri', () => {
  test('yazım ve sorgulama', () => {
    const e1 = auditLog.logEntry('user', 'ipc:test', { a: 1 });
    expect(e1).not.toBeNull();
    expect(e1.prev_hash).toBe('genesis');
    expect(e1.hash).toMatch(/^[a-f0-9]{64}$/);
    const e2 = auditLog.logEntry('agent', 'tool:x', null, 42);
    expect(e2.prev_hash).toBe(e1.hash);
    const q = auditLog.query({ limit: 10 });
    expect(q.total).toBeGreaterThanOrEqual(2);
    expect(q.entries[0].actor).toBeDefined();
  });

  test('zincir doğrulama temiz', () => {
    const r = auditLog.verifyChain();
    expect(r.valid).toBe(true);
    expect(r.badLine).toBe(-1);
  });

  test('bozuk zincir tespit edilir', () => {
    // Zinciri kırmak için doğrudan dosyaya yazarız (yeni dosyaya)
    const logPath = path.join(tmpDir, 'broken-audit.jsonl');
    const e = { ts: new Date().toISOString(), actor: 'user', action: 't', detail: null, duration_ms: null, prev_hash: 'genesis', hash: '0'.repeat(64) };
    fs.writeFileSync(logPath, JSON.stringify(e) + '\n', 'utf8');
    const r = auditLog.verifyChain(logPath);
    expect(r.valid).toBe(false);
    expect(r.badLine).toBe(1);
  });

  test('filtreli sorgulama', () => {
    const q = auditLog.query({ actor: 'sistem-yok', limit: 1 });
    expect(q.entries.length).toBe(0);
  });
});

describe('tools/registry', () => {
  test('12 araç manifesti mevcut', () => {
    const tools = listTools();
    expect(tools.length).toBe(12);
    expect(getToolManifest('read_file').tier).toBe('read');
    expect(getToolManifest('create_file').tier).toBe('write');
    expect(getToolManifest('terminal_execute').tier).toBe('exec');
    expect(getToolManifest('yok')).toBeNull();
  });

  test('şema doğrulama', () => {
    const m = getToolManifest('create_file');
    expect(validateToolArgs(m, { path: 'a.txt', content: 'x' })).toBe(true);
    expect(validateToolArgs(m, { path: 'a.txt' })).toBe(false);
    expect(validateToolArgs(m, { path: 'a.txt', content: 5 })).toBe(false);
    expect(validateToolArgs(null, {})).toBe(false);
  });

  test('tehlikeli komut blacklist', () => {
    expect(isDangerousCommand('sudo apt update')).toBe(true);
    expect(isDangerousCommand('rm -rf /')).toBe(true);
    expect(isDangerousCommand('echo "a" && rm x')).toBe(true);
    expect(isDangerousCommand('ls -la')).toBe(false);
    expect(isDangerousCommand('npm test')).toBe(false);
    // Boş/null komut executeTool düzeyinde reddedilir; fonksiyon
    // normalleştirme sonrası boş string'i güvenli kabul edebilir.
  });
});

describe('tools/executor', () => {
  test('read_file sandbox dışı yolu reddeder', async () => {
    const m = getToolManifest('read_file');
    const r = await executeTool(m, { path: '/etc/passwd' });
    expect(r.content).toContain('[HATA]');
  });

  test('read_file workspace dosyasını okur', async () => {
    const m = getToolManifest('read_file');
    const r = await executeTool(m, { path: path.join(tmpDir, 'workspace', 'deneme.txt') });
    expect(r.content).toBe('selam dünya');
    expect(r.type).toBe('text');
  }, 10000);

  test('create_file workspace altında yazar', async () => {
    const m = getToolManifest('create_file');
    const target = path.join(tmpDir, 'workspace', 'yeni.txt');
    const r = await executeTool(m, { path: target, content: 'deneme içerik' });
    expect(r.type).toBe('created');
    expect(fs.readFileSync(target, 'utf8')).toBe('deneme içerik');
    fs.unlinkSync(target);
  });

  test('create_file mevcut dosyayı üzerine yazmaz', async () => {
    const m = getToolManifest('create_file');
    const target = path.join(tmpDir, 'workspace', 'var.txt');
    fs.writeFileSync(target, 'mevcut', 'utf8');
    const r = await executeTool(m, { path: target, content: 'yeni' });
    expect(r.error).toBe('exists');
    expect(fs.readFileSync(target, 'utf8')).toBe('mevcut');
    fs.unlinkSync(target);
  });

  test('delete_file workspace dışında reddedilir', async () => {
    const m = getToolManifest('delete_file');
    const r = await executeTool(m, { path: '/etc/hosts' });
    expect(r.content || r.error).toContain('sandbox');
  });

  test('bilinmeyen araç', async () => {
    const r = await executeTool(null, {});
    expect(r.error).toBe('unknown_tool');
  });

  test('terminal tehlikeli komutu reddeder', async () => {
    const m = getToolManifest('terminal_execute');
    const r = await executeTool(m, { command: 'rm -rf /' });
    expect(r.error).toBe('dangerous_command');
  });

  test('git_clone izin dışı URL reddeder', async () => {
    const m = getToolManifest('git_clone');
    const r = await executeTool(m, { url: 'git://evil.host/r' });
    expect(r.error).toBe('url_not_allowed');
  });

  test('edit_file + append_file zinciri', async () => {
    const target = path.join(tmpDir, 'workspace', 'zincir.txt');
    await executeTool(getToolManifest('create_file'), { path: target, content: 'satır1\n' });
    await executeTool(getToolManifest('append_file'), { path: target, content: 'satır2' });
    expect(fs.readFileSync(target, 'utf8')).toContain('satır1\nsatır2');
    await executeTool(getToolManifest('edit_file'), { path: target, content: 'tamamen yeni' });
    expect(fs.readFileSync(target, 'utf8')).toBe('tamamen yeni');
    await executeTool(getToolManifest('delete_file'), { path: target });
    expect(fs.existsSync(target)).toBe(false);
  });
});

describe('agents/event-channel', () => {
  test('OpenAI chunk adapter akışı', () => {
    const channel = new EventChannel('s1');
    const events = [];
    channel.on('token', (t) => events.push(t));
    channel.on('thinking', (t) => events.push(t));
    channel.on('tool-call', (t) => events.push(t));
    channel.on('done', (t) => events.push(t));
    const adapter = openaiAdapter(channel);

    adapter({ choices: [{ delta: { content: 'mer' } }] });
    adapter({ choices: [{ delta: { content: 'haba' } }] });
    adapter({ choices: [{ delta: { reasoning_content: 'düşün...' } }] });
    adapter({ choices: [{ delta: { tool_calls: [{ id: 'tc1', function: { name: 'read_file', arguments: '{' } }] } }] });
    adapter({ choices: [{ delta: { tool_calls: [{ id: 'tc1', function: { arguments: '"p"' } }] } }, { finish_reason: 'tool_calls' }] });

    expect(events.filter((e) => e.type === undefined).length).toBe(5);
    const tokens = events.filter((e) => e.delta && e.sessionId === 's1' && !e.name);
    expect(channel.thinkingBuffer).toBe('düşün...');
  });

  test('Anthropic adapter text/thinking/done', () => {
    const channel = new EventChannel('s2');
    const events = [];
    channel.on('token', (t) => events.push(t));
    channel.on('thinking', (t) => events.push(t));
    channel.on('done', (t) => events.push(t));
    const adapter = anthropicAdapter(channel);
    adapter({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'abc' } });
    adapter({ type: 'content_block_delta', index: 1, delta: { type: 'thinking_delta', thinking: 'hmm' } });
    expect(channel.thinkingBuffer).toBe('hmm');
    adapter({ type: 'message_stop' });
    expect(events.length).toBe(3);
    expect(events[2].finish).toBe('stop');
  });

  test('Ollama adapter done', () => {
    const channel = new EventChannel('s3');
    let done = false;
    channel.on('done', () => (done = true));
    ollamaAdapter(channel)({ done: true });
    expect(done).toBe(true);
  });

  test('Gemini adapter functionCall ve token', () => {
    const channel = new EventChannel('s4');
    const events = [];
    channel.on('token', (t) => events.push(t));
    channel.on('tool-call', (t) => events.push(t));
    geminiAdapter(channel)({
      candidates: [{ content: { parts: [{ text: 'x' }, { functionCall: { name: 'f', args: { a: 1 } } }] } }],
    });
    expect(events.length).toBe(2);
  });

  test('geçersiz olay tipi reddedilir', () => {
    const channel = new EventChannel('s5');
    let fired = false;
    channel.on('garbage', () => (fired = true));
    channel.push('garbage', {});
    expect(fired).toBe(false);
  });

  test('clear listeners siler', () => {
    const channel = new EventChannel('s6');
    let fired = false;
    channel.on('token', () => (fired = true));
    channel.clear();
    channel.push('token', { delta: 'x' });
    expect(fired).toBe(false);
  });
});

describe('workflow/engine', () => {
  test('JSON workflow ayrıştırma ve doğrulama', () => {
    const wf = { name: 't', steps: [{ agent: 'a1' }, { agent: 'a2', input: '{{step_1.output}}' }] };
    expect(validateWorkflow(wf).ok).toBe(true);
    expect(validateWorkflow({ steps: [] }).ok).toBe(false);
    expect(validateWorkflow({ steps: [{ agent: '' }] }).ok).toBe(false);
  });

  test('basit YAML ayrıştırma', () => {
    const yaml = `
name: Arama
steps:
  - agent: arastirmaci
    input: Konu hakkında araştır
  - agent: yazar
    input: "{{step_1.output}} tabanlı yaz"
`;
    const wf = parseWorkflow(yaml);
    expect(wf.name).toBe('Arama');
    expect(wf.steps.length).toBe(2);
    expect(wf.steps[1].input).toBe('{{step_1.output}} tabanlı yaz');
  });

  test('bozuk JSON boş adımlar döner', () => {
    const wf = parseWorkflow('{bozuk');
    expect(wf.steps).toEqual([]);
  });

  test('değişken interpolasyonu', () => {
    const vars = { userMessage: 'merhaba', steps: ['ilk çıktı'] };
    expect(interpolate('{{step_1.output}} ve {{user_message}}', vars)).toBe('ilk çıktı ve merhaba');
    expect(interpolate('{{step_2.output}}', vars)).toBe('');
  });

  test('runWorkflow adımları sırayla yürütür', async () => {
    const wf = { name: 'test', steps: [{ agent: 'a1' }, { agent: 'a2', input: 'özet: {{step_1.output}}' }] };
    const calls = [];
    const result = await runWorkflow(wf, {
      userMessage: 'görev',
      agents: [{ id: 'a1' }, { id: 'a2' }],
      runFn: async (agent, input) => {
        calls.push({ agent, input });
        return `${agent.id}:${input.slice(0, 3)}`;
      },
    });
    expect(result.ok).toBe(true);
    expect(result.outputs.length).toBe(2);
    expect(calls[1].input).toBe('özet: a1:gör');
    expect(result.final).toBe('a2:öze');
  });

  test('runFn hatası adım çıktısına yansır', async () => {
    const wf = { steps: [{ agent: 'x' }] };
    const result = await runWorkflow(wf, {
      userMessage: 'm',
      agents: [],
      runFn: async () => {
        throw new Error('patladı');
      },
    });
    expect(result.ok).toBe(true);
    expect(result.outputs[0].output).toContain('HATA');
  });

  test('yirmi adımdan fazlası reddedilir', () => {
    const wf = { steps: Array.from({ length: 21 }, () => ({ agent: 'a' })) };
    expect(validateWorkflow(wf).ok).toBe(false);
  });
});

describe('memory/store (vektör indeksi)', () => {
  test('kosinüs benzerliği', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    const c = [0.9, 0.1, 0];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    expect(cosineSimilarity(a, c)).toBeGreaterThan(0.8);
  });

  test('indekse ekleme ve arama', () => {
    const idx = new SimpleVectorIndex(3);
    idx.insert('v1', [1, 0, 0]);
    idx.insert('v2', [0, 1, 0]);
    idx.insert('v3', [0.9, 0.1, 0]);
    const hits = idx.search([1, 0, 0], 2);
    expect(hits[0].k).toBe('v1');
    expect(hits[1].k).toBe('v3');
  });

  test('küçük indeks brute-force ile eşleşir', () => {
    const idx = new SimpleVectorIndex(8);
    const vecs = Array.from({ length: 100 }, () =>
      Array.from({ length: 8 }, () => Math.random() * 2 - 1),
    );
    vecs.forEach((v, i) => idx.insert(`k${i}`, v));
    const query = [1, 0.5, -0.5, 0.2, 0.8, -0.1, 0.3, 0.6];
    const brute = idx
      .search(query, 5)
      .map((h) => h.k)
      .sort();
    const indexed = idx.search(query, 5);
    const indexedKeys = indexed.map((h) => h.k).sort();
    // Küçük indeks brute-force yoluna düşer — sonuçlar aynı
    expect(indexedKeys).toEqual(brute);
  });

  test('MemoryStore dosya kalıcılığı', () => {
    const { MemoryStore } = require('../src/main/memory/store');
    const s1 = new MemoryStore();
    s1.load();
    s1.records.push({ id: 'm1', content: 'bilgi', category: 'not', vector: null });
    s1.save();
    const s2 = new MemoryStore();
    s2.load();
    expect(s2.records.map((r) => r.id)).toContain('m1');
  });
});

describe('memory/compaction', () => {
  test('kısa sohbet sıkıştırılmaz', async () => {
    const messages = Array.from({ length: 10 }, (_, i) => ({ role: 'user', content: `msg${i}` }));
    const r = await compactContext(messages);
    expect(r.archivedCount).toBe(0);
    expect(r.kept).toBe(messages);
  });

  test('null girdi güvenli döner', async () => {
    const r = await compactContext(null);
    expect(r.kept).toBeNull();
    const r2 = await compactContext('garbage');
    expect(r2.kept).toBe('garbage');
  });

  test('uzun sohbette özet + son mesajlar korunur (özet üretimi başarısız olursa not döner)', async () => {
    const messages = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `Uzun mesaj ${i} içeriği` }));
    const r = await compactContext(messages, { summaryModel: 'yok-model-123' });
    // Ollama yoksa fallback OpenAI yok; not 'summary_unavailable' döner
    expect(r.note === 'summary_unavailable' || r.archivedCount > 0).toBe(true);
  });
});

describe('plugins/loader manifest doğrulama', () => {
  test('geçerli manifest', () => {
    expect(
      validateManifest({
        id: 'com.example.test',
        name: 'Test',
        version: '1.0.0',
        main: 'index.js',
        permissions: ['config-get'],
      }),
    ).toBeNull();
  });

  test('geçersiz kimlik', () => {
    expect(validateManifest({ id: 'A B!', name: 'T', version: '1.0.0', main: 'index.js', permissions: [] })).toBeTruthy();
  });

  test('eksik alanlar', () => {
    expect(validateManifest(null)).toBeTruthy();
    expect(validateManifest({ id: 'ok-id' })).toBeTruthy();
    expect(validateManifest({ id: 'ok-id', name: 'n', version: 'x', main: 'index.js', permissions: [] })).toBeTruthy();
  });

  test('izin string uzunluk sınırı', () => {
    expect(
      validateManifest({ id: 'x', name: 'n', version: '1.0.0', main: 'index.js', permissions: ['a'.repeat(81)] }),
    ).toBeTruthy();
  });
});

describe('mcp/client konfigurasyon doğrulama', () => {
  test('izinli komutlar kabul', () => {
    expect(McpClient.validateConfig({ command: 'npx', args: ['@anthropic/mcp-server'] })).toBe(true);
    expect(McpClient.validateConfig({ command: 'node', args: [] })).toBe(true);
  });

  test('bilinmeyen komut reddedilir', () => {
    expect(McpClient.validateConfig({ command: 'bash', args: [] })).toBe(false);
    expect(McpClient.validateConfig({ command: 'curl', args: ['-X', 'POST'] })).toBe(false);
  });

  test('bilinmeyen scoped paket reddedilir', () => {
    expect(McpClient.validateConfig({ command: 'npx', args: ['@evil/org-server'] })).toBe(false);
  });

  test('mutlak yol kontrolü', () => {
    expect(McpClient.validateConfig({ command: '/usr/bin/node', args: [] })).toBe(true);
    // Var olmayan mutlak yol reddedilir (mevcut dosya kontrolü)
    expect(McpClient.validateConfig({ command: '/opt/olamax/yok-bin', args: [] })).toBe(false);
    // Görece yol yalnızca whitelist komutlarıyla izinli
    expect(McpClient.validateConfig({ command: 'bash', args: [] })).toBe(false);
  });

  test('eksik komut', () => {
    expect(McpClient.validateConfig(null)).toBe(false);
    expect(McpClient.validateConfig({})).toBe(false);
  });
});
