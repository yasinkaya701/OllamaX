/*
 * Cost Engine (v3.15 A2-1) birim testleri — saf fonksiyonlar:
 * estimateCost / totalsFor / checkBudget / recordUsage / exportCsv / writeBudgets
 * Ortam izolasyonu için tests/mocks/* __mocks__ klasörü kullanılır (diğer testlerle uyumlu).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/* electron ve config-store sanal yüklemesi */
jest.mock('electron', () => ({}), { virtual: true });
jest.mock(
  '../src/main/config/config-store',
  () => {
    const mockFs = require('fs');
    const mockPath = require('path');
    const mockOs = require('os');
    return {
      krevyxRoot: () => {
        const tmp = mockPath.join(mockOs.tmpdir(), 'krevyx-cost-test-' + process.pid);
        mockFs.mkdirSync(tmp, { recursive: true });
        return tmp;
      },
      readConfig: () => ({ app: { cost: { budgets: {} } } }),
      updateConfig: jest.fn(),
    };
  },
  { virtual: true },
);
const ce = require('../src/main/cost/cost-engine');

describe('estimateCost', () => {
  test('known provider/model returns plausible cost', () => {
    const c = ce.estimateCost('openai', 'gpt-4o', 1000000, 0);
    expect(c).toBeCloseTo(2.5, 2);
  });
  test('local providers cost ~0', () => {
    expect(ce.estimateCost('ollama', 'llama3', 1e6, 1e6)).toBe(0);
    expect(ce.estimateCost('lmstudio', 'local', 1e6, 1e6)).toBe(0);
  });
  test('unknown provider falls back to default rate', () => {
    const c = ce.estimateCost('unknown-provider', 'any', 1e6, 0);
    expect(c).toBeCloseTo(1, 2);
  });
  test('output tokens multiplied by output rate', () => {
    const c = ce.estimateCost('anthropic', 'claude-sonnet-4.5', 0, 1000000);
    expect(c).toBeCloseTo(15, 2);
  });
  test('model-specific price beats provider default', () => {
    const specific = ce.estimateCost('openai', 'gpt-4o-mini', 1e6, 0);
    const defaultRate = ce.estimateCost('openai', 'model-that-does-not-exist', 1e6, 0);
    expect(specific).toBeLessThan(defaultRate);
  });
});

describe('monthKey', () => {
  test('returns YYYY-MM shape', () => {
    expect(ce.monthKey()).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('recordUsage + totalsFor', () => {
  test('appends a line and totals reflect it', () => {
    const fp = path.join(require('../src/main/config/config-store').krevyxRoot(), 'cost-usage.jsonl');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    ce.recordUsage({ readConfig: () => ({ app: { cost: { budgets: {} } } }) }, {
      provider: 'openai', model: 'gpt-4o', inputTokens: 1000000, outputTokens: 500000,
    });
    const totals = ce.totalsFor(ce.monthKey());
    expect(totals.byProvider.openai.cost).toBeCloseTo(2.5 + 5, 1);
    expect(totals.byProvider.openai.requests).toBe(1);
    expect(totals.requests).toBe(1);
  });
});

describe('checkBudget', () => {
  test('no budget → ok', () => {
    expect(ce.checkBudget({ readConfig: () => ({ app: { cost: { budgets: {} } } }) }, 'openai')).toEqual({ ok: true, state: 'ok' });
  });
  test('spent above limit → stopped', () => {
    const fp = path.join(require('../src/main/config/config-store').krevyxRoot(), 'cost-usage.jsonl');
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    // 2.5$ maliyetli bir kayıt
    ce.recordUsage({ readConfig: () => ({ app: { cost: { budgets: { openai: 1 } } } }) }, {
      provider: 'openai', model: 'gpt-4o', inputTokens: 1000000, outputTokens: 0,
    });
    const cfg = { readConfig: () => ({ app: { cost: { budgets: { openai: 1 } } } }) };
    const res = ce.checkBudget(cfg, 'openai');
    expect(res.state).toBe('stopped');
    expect(res.ok).toBe(false);
  });
});

describe('writeBudgets', () => {
  test('calls updateConfig with nested cost.budgets', () => {
    const updateConfig = jest.fn();
    ce.writeBudgets({ updateConfig }, { openai: 20, anthropic: 30 });
    expect(updateConfig).toHaveBeenCalledTimes(1);
    const fn = updateConfig.mock.calls[0][0];
    const out = fn({ app: { theme: 'dark' } });
    expect(out.app.cost.budgets).toEqual({ openai: 20, anthropic: 30 });
    expect(out.app.theme).toBe('dark');
  });
});

describe('exportCsv', () => {
  test('header + one row per entry', () => {
    const csv = ce.exportCsv(ce.monthKey());
    expect(csv.startsWith('month,provider,model,inputTokens,outputTokens,costUsd,ts')).toBe(true);
    const rows = csv.split('\n').filter(Boolean);
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });
});
