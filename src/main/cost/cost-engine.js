/*
 * Cost Engine (v3.15 A2-1) — "Cost Command"
 * Provider bazlı aylık bütçe motoru:
 *  - Her sağlayıcı için kullanıcı tanımlı aylık dolar limiti (config `app.cost.budgets`)
 *  - İstek başına token sayacı → tahmini dolar maliyeti (USD/1M token fiyat listesi)
 *  - %80 eşiğinde sarı uyarı, %100'de soft stop (kullanıcı onayıyla devam edebilir)
 *  - Oturum başına maliyet raporu; CSV export'a hazır ham veri
 *
 * NOT: Maliyet hesapları yaklaşık/temsilidir; gerçek API faturalarıyla birebir
 * karşılaştırma değildir. Ürün içinde "tahmini maliyet" dili kullanılır.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/* userData yolunu config-store üzerinden al (Krevyx klasörü) */
function krevyxDir() {
  try {
    const cs = require('../config/config-store');
    if (typeof cs.krevyxRoot === 'function') return cs.krevyxRoot();
  } catch { /* aşağıda fallback */ }
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'Krevyx');
  } catch {
    return process.cwd();
  }
}

/* USD/1M token: input ve output — temsilî liste (2026-08 itibarıyla yaygın fiyatlar) */
const APPROX_PRICING = {
  openai: {
    'gpt-5.5': [2.5, 10],
    'gpt-5.3': [1.5, 6],
    'o5': [2.5, 10],
    'gpt-4o': [2.5, 10],
    'gpt-4o-mini': [0.15, 0.6],
    'gpt-5': [1.25, 5],
    default: [2.5, 10],
  },
  anthropic: {
    'claude-sonnet-5': [3, 15],
    'claude-opus-4.8': [15, 75],
    'claude-sonnet-4.5': [3, 15],
    default: [3, 15],
  },
  gemini: {
    'gemini-2.5-pro': [1.25, 10],
    'gemini-2.5-flash': [0.15, 0.6],
    'gemini-3': [0.2, 0.8],
    default: [1.25, 10],
  },
  openrouter: { default: [1, 4] },
  xai: { default: [2.5, 10] },
  mistral: { default: [0.25, 1] },
  deepseek: { default: [0.27, 1.1] },
  groq: { default: [0.2, 0.8] },
  cerebras: { default: [0.1, 0.4] },
  fireworks: { default: [0.2, 0.8] },
  replicate: { default: [0.3, 1.2] },
  together: { default: [0.5, 2] },
  ollama: { default: [0, 0] }, // yerel: maliyet ~0
  lmstudio: { default: [0, 0] },
  custom: { default: [0, 0] },
  'aws-bedrock': { default: [3, 15] },
  azure: { default: [2.5, 10] },
};

function estimateRate(provider, modelId) {
  const table = APPROX_PRICING[provider] || { default: [1, 4] };
  const hit = table[modelId] || table.default;
  return { inputPerM: hit[0], outputPerM: hit[1] };
}

function estimateCost(provider, modelId, inputTokens, outputTokens) {
  const { inputPerM, outputPerM } = estimateRate(provider, modelId);
  const it = Number(inputTokens) || 0;
  const ot = Number(outputTokens) || 0;
  return (it / 1e6) * inputPerM + (ot / 1e6) * outputPerM;
}

/* ------------------------------------------------------------------ */
/* Kalıcılık: userData/cost-usage.jsonl (günlük satırlar, append)      */
/* ------------------------------------------------------------------ */
function usageFilePath() {
  return path.join(krevyxDir(), 'cost-usage.jsonl');
}

function appendUsage(entry) {
  try {
    fs.appendFileSync(usageFilePath(), JSON.stringify(entry) + '\n');
  } catch {
    /* disk yazımı başarısızsa sessizce atla — akışı bloklamama */
  }
}

function readMonthLines(monthKey) {
  try {
    const fp = usageFilePath();
    if (!fs.existsSync(fp)) return [];
    const body = fs.readFileSync(fp, 'utf8');
    return body
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((e) => e && (!monthKey || (e.month || '').slice(0, 7) === monthKey));
  } catch {
    return [];
  }
}

function monthKey() {
  return new Date().toISOString().slice(0, 7); // 'YYYY-MM'
}

function totalsFor(monthKey) {
  const lines = readMonthLines(monthKey);
  const byProvider = {};
  let total = 0;
  for (const e of lines) {
    const cost = Number(e.cost) || 0;
    total += cost;
    const p = e.provider || 'unknown';
    if (!byProvider[p]) byProvider[p] = { cost: 0, inputTokens: 0, outputTokens: 0, requests: 0 };
    byProvider[p].cost += cost;
    byProvider[p].inputTokens += Number(e.inputTokens) || 0;
    byProvider[p].outputTokens += Number(e.outputTokens) || 0;
    byProvider[p].requests += 1;
  }
  for (const p of Object.keys(byProvider)) byProvider[p].cost = Math.round(byProvider[p].cost * 10000) / 10000;
  return { total: Math.round(total * 10000) / 10000, byProvider, requests: lines.length };
}

/* ------------------------------------------------------------------ */
/* Config ile entegrasyon: app.cost.budgets = { provider: dollarLimit } */
/* ------------------------------------------------------------------ */
function readBudgets(configStore) {
  try {
    const cfg = configStore && configStore.readConfig ? configStore.readConfig() : null;
    const budgets = (cfg && cfg.app && cfg.app.cost && cfg.app.cost.budgets) || {};
    return typeof budgets === 'object' ? budgets : {};
  } catch {
    return {};
  }
}

function writeBudgets(configStore, budgets) {
  try {
    if (configStore && typeof configStore.updateConfig === 'function') {
      configStore.updateConfig((cfg) => ({ ...(cfg || {}), app: { ...(cfg?.app || {}), cost: { budgets } } }));
    }
  } catch {
    /* güncelleme uçları değişirse sessizce atla */
  }
}

/* ------------------------------------------------------------------ */
/* Kayıt API'si: istek sonrası çağrılır                                 */
/* ------------------------------------------------------------------ */
function recordUsage(configStore, { provider, model, inputTokens, outputTokens }) {
  const cost = estimateCost(provider, model, inputTokens, outputTokens);
  const mk = monthKey();
  appendUsage({ month: mk, provider, model, inputTokens, outputTokens, cost, ts: Date.now() });

  const budgets = readBudgets(configStore);
  const providerBudget = Number(budgets[provider]) || 0;
  const providerTotals = totalsFor(mk).byProvider[provider] || { cost: 0 };
  /* providerTotals az önce yazdığımız satırı içerir; ratio hesapla */
  const providerCost = Math.max(0, providerTotals.cost - cost) + cost;
  const providerExcl = providerCost - cost;
  let result = { ok: true, cost, providerCost, limit: providerBudget, state: 'ok' };

  if (providerBudget > 0) {
    const ratio = providerExcl / providerBudget;
    if (providerExcl >= providerBudget) {
      result.state = 'stopped';
      result.ratio = 1;
    } else if (providerCost >= providerBudget * 0.8) {
      result.state = 'warn';
      result.ratio = Math.min(1, providerCost / providerBudget);
    } else {
      result.ratio = ratio;
    }
  }
  return result;
}

/* Soft stop kontrolü: istek öncesi çağrılır; durdurulduysa izin iste */
function checkBudget(configStore, provider) {
  const budgets = readBudgets(configStore);
  const limit = Number(budgets[provider]) || 0;
  if (limit <= 0) return { ok: true, state: 'ok' };
  const mk = monthKey();
  const spent = totalsFor(mk).byProvider[provider]?.cost || 0;
  if (spent >= limit) return { ok: false, state: 'stopped', spent, limit };
  if (spent >= limit * 0.8) return { ok: true, state: 'warn', spent, limit };
  return { ok: true, state: 'ok', spent, limit };
}

/* CSV export — provider bazlı kullanım raporu */
function exportCsv(monthKey) {
  const lines = readMonthLines(monthKey || monthKey());
  const header = 'month,provider,model,inputTokens,outputTokens,costUsd,ts';
  const rows = lines.map((e) =>
    [e.month || '', e.provider || '', e.model || '', Number(e.inputTokens) || 0, Number(e.outputTokens) || 0, (Number(e.cost) || 0).toFixed(4), e.ts || ''].join(','),
  );
  return header + '\n' + rows.join('\n');
}

module.exports = {
  estimateCost,
  estimateRate,
  recordUsage,
  checkBudget,
  totalsFor,
  monthKey,
  readBudgets,
  writeBudgets,
  exportCsv,
  APPROX_PRICING,
};
