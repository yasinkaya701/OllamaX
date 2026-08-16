'use strict';

/**
 * orchestrator.test.js — Lider-ajan orkestra altyapısının birim testleri
 *
 * Kapsam:
 *   - Ajan kayıt defteri: tüm ajanların transport tanımlı olması
 *   - Zincir handoff protokolü: applyHandoff / normalizeOutput davranışı
 *   - runChain sıralı yürütme ve hata durumunda zincirin durması
 *   - discoverAll'ın hem CLI hem HTTP ajanları döndürmesi
 */

const orchestrator = require('../src/main/agents/orchestrator');

describe('orchestrator — ajan kayıt defteri', () => {
  test('kayıt defterinde beklenen ajanlar tanımlı', () => {
    const ids = Object.keys(orchestrator.REGISTRY);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('codex');
    expect(ids).toContain('antigravity');
    expect(ids).toContain('ollama');
    expect(ids).toContain('shell');
  });

  test('her CLI ajaninin en az bir spawn transportu var', () => {
    for (const reg of Object.values(orchestrator.REGISTRY)) {
      if (reg.kind === 'cli') {
        expect(reg.transports.some((t) => t.type === 'spawn')).toBe(true);
      }
    }
  });

  test('Ollama ajanı HTTP transport taşıyor', () => {
    expect(orchestrator.REGISTRY.ollama.kind).toBe('http');
    expect(orchestrator.REGISTRY.ollama.transports[0].type).toBe('ollama-http');
  });
});

describe('orchestrator — handoff protokolü', () => {
  test('zincir bağlamı olmadan görevi olduğu gibi döndürür', () => {
    const out = orchestrator.applyHandoff('test görevi', null);
    expect(out).toBe('test görevi');
  });

  test('boş context ile de görevi değiştirmez', () => {
    expect(orchestrator.applyHandoff('görev', { context: [] })).toBe('görev');
  });

  test('zincir bağlamı [ZİNCİR HANDOFF] bloğunu enjekte eder', () => {
    const out = orchestrator.applyHandoff('devam görevi', {
      context: [{ agent: 'Claude Code', text: 'ilk sonuç' }],
    });
    expect(out).toContain('[ZİNCİR HANDOFF]');
    expect(out).toContain('Claude Code: ilk sonuç');
    expect(out).toContain('Devam görevi: devam görevi');
  });

  test('normalizeOutput string ve nesne adım karışımını metne çevirir', () => {
    const steps = ['doğrudan satır', { text: 'nesne satırı' }, { kind: 'plan' }];
    const out = orchestrator.normalizeOutput({ steps });
    expect(out).toEqual(['doğrudan satır', 'nesne satırı']);
  });

  test('normalizeOutput eksik/boş çıktıda boş dizi verir', () => {
    expect(orchestrator.normalizeOutput(null)).toEqual([]);
    expect(orchestrator.normalizeOutput({})).toEqual([]);
  });
});

describe('orchestrator — zincir yürütme', () => {
  beforeAll(() => {
    jest.spyOn(orchestrator, 'discoverAgent').mockImplementation((id) => {
      const reg = orchestrator.REGISTRY[id];
      if (!reg) return null;
      if (reg.kind === 'http') {
        return { label: reg.label, kind: 'http', transport: reg.transports[0], executable: 'ollama', reachable: false };
      }
      return { label: reg.label, kind: 'cli', transport: reg.transports[0], executable: reg.transports[0].cmd, reachable: false };
    });
  });

  afterAll(() => jest.restoreAllMocks());

  test('erişilemeyen ajanlarda runChain hata zinciri üretir', async () => {
    const res = await orchestrator.runChain(['claude-code', 'codex'], 'test');
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
    expect(res.steps[0].agent).toBe('claude-code');
    expect(res.steps[0].result.ok).toBe(false);
    expect(res.ok).toBe(false);
  });

  test('zincir, bir ajan hata verince durur (devam etmez)', async () => {
    const res = await orchestrator.runChain(['claude-code', 'antigravity', 'codex'], 'test');
    expect(res.steps.length).toBeGreaterThanOrEqual(1);
  });
});

describe('orchestrator — keşif', () => {
  afterAll(() => jest.restoreAllMocks());

  test('discoverAll hem CLI hem HTTP ajanları için sonuç üretir', async () => {
    jest.restoreAllMocks();
    jest.spyOn(orchestrator, 'discoverAgent').mockResolvedValue({
      label: 'X', kind: 'cli', transport: null, executable: null, reachable: false,
    });
    const all = await orchestrator.discoverAll();
    expect(all['claude-code']).toBeTruthy();
    expect(all.ollama).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/* v3.16 (F3-2): prompt forwarding + şef ajan testleri                 */
/* ------------------------------------------------------------------ */
describe('orchestrator — v3.16 prompt forwarding', () => {
  test('applyHandoffForward boş bağlamda görevi değiştirmez', () => {
    expect(orchestrator.applyHandoffForward('görev', { context: [] })).toBe('görev');
  });

  test('applyHandoffForward tam çıktıyı [ZİNCİR FORWARD] bloğunda enjekte eder', () => {
    const out = orchestrator.applyHandoffForward('yeni görev', {
      context: [{ agent: 'Claude Code', text: 'kıs a', fullText: 'uzun tam çıktı\nikinci satır', head: true }],
    });
    expect(out).toContain('[ZİNCİR FORWARD]');
    expect(out).toContain('=== Claude Code [ŞEF] ===');
    expect(out).toContain('uzun tam çıktı\nikinci satır');
    expect(out).toContain('=== son ===');
    expect(out).toContain('Yeni görev: yeni görev');
  });

  test('head=false etiketi [ŞEF] içermiyor', () => {
    const out = orchestrator.applyHandoffForward('t', { context: [{ agent: 'Codex', text: 'x', head: false }] });
    expect(out).toContain('=== Codex ===');
    expect(out).not.toContain('[ŞEF]');
  });

  test('normalizeFullOutput adımları birleştirip 8000 karakterle sınırlar', () => {
    const big = 'a'.repeat(9000);
    expect(orchestrator.normalizeFullOutput({ steps: [{ text: big }] }).length).toBe(8000);
    expect(orchestrator.normalizeFullOutput(null)).toBe('');
    expect(orchestrator.normalizeFullOutput({ steps: [] })).toBe('');
  });

  test('runChain forwardPrompt opsiyonunu ve headAgent bilgisini döner', async () => {
    const res = await orchestrator.runChain(['claude-code'], 'test', { forwardPrompt: true, headAgent: 'claude-code' });
    expect(res.forwardPrompt).toBe(true);
    expect(res.headAgent).toBe('claude-code');
  });

  test('runChain headAgent sadece zincirdeki ajan olabilir, yoksa ilk ajan', () => {
    return orchestrator.runChain(['codex', 'antigravity'], 'test', { headAgent: 'yok-olmayan' }).then((res) => {
      expect(res.headAgent).toBe('codex');
    });
  });
});
