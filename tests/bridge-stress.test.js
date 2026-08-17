'use strict';
/**
 * bridge-stress.test.js — code-agent-bridge aşırı uç durum testleri
 *
 * Kapsam: fuzz giriş, eşzamanlı yarışlar, erken durdurma, bozuk CWD,
 * devasa/bozuk akış, stream-json fuzz, çift-bitirme yarışları.
 * Gerçek süreç spawn'i kullanır; CLIs PATH'te olmasa da akış güvenliği
 * (hata yolları) bu testlerle doğrulanır.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

/* electron mock */
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: { send: () => {} },
      },
    ],
  },
}), { virtual: true });

const bridge = require('../src/main/agents/code-agent-bridge');

/* Yardımcı: sahte bir CLI üretir — spawn(exe='node', [script]) şeklinde çağrılır */
function makeFakeCli(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-stress-'));
  const script = path.join(dir, 'fake-agent.js');
  fs.writeFileSync(script, body);
  return { dir, script };
}

/* ------------------------------------------------------------------ */
describe('bridge-stress — görev giriş fuzz', () => {
  test('NULL byte, bozuk unicode ve kontrol karakterleri temizlenir', async () => {
    const evil = 'görev\u0000tamam\uFFFD\u0001\u001b\u007F\r\nyeni satır';
    const s = bridge.sanitizeTask(evil, false);
    expect(s).not.toContain('\u0000');
    expect(s).not.toContain('\uFFFD');
    expect(s).not.toMatch(/[\x01\x07\x0b\x0c\x0e-\x1f\x7f]/);
    expect(s).not.toContain('\r');
    expect(s).not.toContain('\n');
  });
  test('çok uzun görev 32KB ile kırpılır ve asla boş dönmez', () => {
    const huge = 'x'.repeat(100 * 1024);
    const s = bridge.sanitizeTask(huge, false);
    expect(s.length).toBeLessThanOrEqual(32 * 1024);
    expect(bridge.sanitizeTask('', false)).toBe('yok');
    expect(bridge.sanitizeTask(null, false)).toBe('yok');
    expect(bridge.sanitizeTask('\u0000\u001F', false)).toBe('yok');
  });
  test('zincir handoff postfixi fuzzed görevle de eklenir', () => {
    const s = bridge.sanitizeTask('g\u0000v', true);
    expect(s).toContain('[HANDOFF]');
  });
});

/* ------------------------------------------------------------------ */
describe('bridge-stress — CWD güvenliği', () => {
  test('silinmiş dizin process.cwd() ye düşer ve kayıt defterine güvenli değer yazılır', () => {
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-del-'));
    fs.rmSync(fake, { recursive: true, force: true });
    const before = bridge.cwdRegistry.get('codex');
    const got = bridge.resolveCwd('codex', { workingDir: fake });
    expect(got).toBe(process.cwd());
    expect(bridge.cwdRegistry.get('codex')).toBe(process.cwd());
    if (before !== undefined) bridge.cwdRegistry.set('codex', before);
  });
  test('mevcut geçerli dizin aynen kullanılır', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-good-'));
    expect(bridge.resolveCwd('antigravity', { workingDir: tmp })).toBe(tmp);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});

/* ------------------------------------------------------------------ */
describe('bridge-stress — akış güvenliği (sahte CLI ile gerçek spawn)', () => {
  test('devasa tek satır akışı buffer sınırıyla yutulur, süreç crash etmez', async () => {
    const { script } = makeFakeCli(
      'console.log("x".repeat(3 * 1024 * 1024)); console.log("done");'
    );
    const profile = { ...bridge.AGENT_PROFILES.codex, buildCmd: () => [script] };
    const r = await bridge.runCli(profile, '__stress', 'görev', 15000, { executable: 'node', env: {} });
    expect(r.ok).toBe(true);
    expect(r.steps.some((s) => /done/.test(s.text))).toBe(true);
    fs.rmSync(path.dirname(script), { recursive: true, force: true });
  }, 30000);

  test('bozuk stream-json çöpleri hiçbir satırda akışı öldürmez', async () => {
    const { script } = makeFakeCli(
      [
        'console.log(JSON.stringify({type:"assistant",message:{content:[{type:"text",text:"Merhaba"}]}}));',
        'console.log("null byte içi: \\u0000");',
        'console.log(JSON.stringify({type:"result",result:{type:"text",content:"Son"}}));',
      ].join('\n')
    );
    const profile = { ...bridge.AGENT_PROFILES['claude-code'], buildCmd: () => [script] };
    const r = await bridge.runCli(profile, '__stress', 'görev', 15000, { executable: 'node', env: {} });
    expect(r.ok).toBe(true);
    expect(r.steps.some((s) => /Merhaba/.test(s.text))).toBe(true);
    expect(r.steps.some((s) => /Son/.test(s.text))).toBe(true);
    fs.rmSync(path.dirname(script), { recursive: true, force: true });
  }, 30000);

  test('erken stop (spawn + stdout akışı sırasında) süreci kill eder ve yarışsız biter', async () => {
    const { script } = makeFakeCli(
      'setInterval(() => console.log("yaşıyorum"), 50);'
    );
    const profile = { ...bridge.AGENT_PROFILES.codex, buildCmd: () => [script] };
    const p = bridge.runCli(profile, '__stress', 'görev', 30000, { executable: 'node', env: {} });
    await new Promise((r) => setTimeout(r, 200));
    const stop = await bridge.stopAgent('__stress');
    expect(stop.stopped).toBe(true);
    const res = await p;
    expect(res.ok).toBe(true);
    fs.rmSync(path.dirname(script), { recursive: true, force: true });
  }, 30000);

  test('çift stop çağrısı güvenlidir (idempotent)', async () => {
    const a = await bridge.stopAgent('__stress');
    const b = await bridge.stopAgent('__stress');
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  test('paralel farklı ajanlar birbirini etkilemez', async () => {
    const mk = (id) => {
      const { script } = makeFakeCli('console.log("' + id + '-bitti");');
      const profile = { ...bridge.AGENT_PROFILES.codex, buildCmd: () => [script] };
      return bridge.runCli(profile, id, 'görev', 15000, { executable: 'node', env: {} }).then((r) => {
        fs.rmSync(path.dirname(script), { recursive: true, force: true });
        return { id, r };
      });
    };
    const out = await Promise.all([mk('__p1'), mk('__p2'), mk('__p3')]);
    for (const { id, r } of out) {
      expect(r.ok).toBe(true);
      expect(r.steps.some((s) => s.text.includes(id + '-bitti'))).toBe(true);
    }
  }, 30000);
});

/* ------------------------------------------------------------------ */
describe('bridge-stress — stream-json ayrıştırıcı fuzz', () => {
  const parse = bridge.parseStreamJsonLine;
  test('her çeşit bozuk girdi null döner, asla throw atmaz', () => {
    const inputs = [
      '', '{', '}', 'null', '[]', '{"type":null}', '\u0000{"type":"assistant"}',
      '{"type":"assistant","message":{"content":"not-array"}}',
      '{"type":"assistant","message":{"content":[{"type":"image"}]}}',
      '{"type":"system"}', '{"type":"system","subtype":"init"}',
      'x'.repeat(5000),
      '{"type":"assistant","message":{"content":[{"type":"text","text":null}]}}',
    ];
    for (const raw of inputs) {
      expect(() => parse(raw)).not.toThrow();
      expect(parse(raw)).toBe(null);
    }
  });
  test('geçerli assistant/tool_use/result/system satırları etiketlenir', () => {
    expect(parse(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'plan yazıyorum' }] } })).kind).toBe('plan');
    expect(parse(JSON.stringify({ type: 'tool_use', tool_name: 'Write' })).kind).toBe('araç');
    expect(parse(JSON.stringify({ type: 'result', result: { type: 'text', content: 'x'.repeat(1000) } })).text.length).toBeLessThanOrEqual(400);
    expect(parse(JSON.stringify({ type: 'result', result: 'string' })).text).toBe('sonuç alındı');
    expect(parse(JSON.stringify({ type: 'system', subtype: 'init', text: 'başlatılıyor' })).kind).toBe('plan');
  });
});

/* ------------------------------------------------------------------ */
describe('bridge-stress — bilinmeyen/görevsiz ajan', () => {
  test('bilinmeyen ajan ok:false, missing olmadan döner', async () => {
    const r = await bridge.runCodeAgent('bu-ajan-yok', 'test');
    expect(r.ok).toBe(false);
    expect(r.missing).toBeFalsy();
  });
});
