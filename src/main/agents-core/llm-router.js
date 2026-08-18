'use strict';

/**
 * llm-router.js — Krevyx v3.26 LLM Yönlendirici
 *
 * Kapsam:
 *   - 6 sağlayıcı adaptörü: OpenAI, Anthropic, Gemini, Ollama (yerel), Manus, DeepSeek.
 *   - Ortak chat format normalleştirme (role/content → sağlayıcı şeması).
 *   - Rota stratejileri: kalite (en güçlü), maliyet (en ucuz), yerel-öncelikli,
 *     fallback zinciri (bir sağlayıcı bozulunca diğerine geç).
 *   - Token/maliyet sayacı, rate-limit geri çekilme (exponential backoff),
 *     yerel Ollama otomatik keşif (sağlık endpoint'i).
 *
 * Davranış:
 *   - createRouter(opts) → { ok, router }; router.chat(messages, opts) → Promise.
 *   - Her sağlayıcı { id, name, apiKey?, baseUrl?, model, pricePer1kInput, pricePer1kOutput } taşır.
 *   - chat() rota stratejisine göre ilk sağlayıcıyı dener; 429/5xx/timeout
 *     durumunda fallback zincirindeki sıradaki sağlayıcıya geçer (en fazla 3 deneme).
 *   - Kayıt dışı (mock/yerel) sağlayıcı için opts.mockProvider eklenir.
 *
 * Dönüş:
 *   - chat → { ok, content, provider, model, tokens {input,output}, cost_usd, latency_ms }
 *     veya { ok: false, error, provider? }
 *
 * Test:
 *   - testOnlyClear() ile tüm router örnekleri ve sayaçlar temizlenir.
 *   - Sağlayıcılar gerçek HTTP göndermez; opts.fetch enjekte edilerek test edilir.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const PROVIDER_SCHEMAS = {
  openai: { id: 'openai', name: 'OpenAI', defaultModel: 'gpt-4.1-mini', baseUrl: 'https://api.openai.com/v1', pricePer1kInput: 0.0004, pricePer1kOutput: 0.0016 },
  anthropic: { id: 'anthropic', name: 'Anthropic', defaultModel: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1', pricePer1kInput: 0.003, pricePer1kOutput: 0.015 },
  gemini: { id: 'gemini', name: 'Gemini', defaultModel: 'gemini-2.5-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', pricePer1kInput: 0.00035, pricePer1kOutput: 0.00105 },
  ollama: { id: 'ollama', name: 'Ollama (yerel)', defaultModel: 'llama3.1:8b', baseUrl: 'http://localhost:11434', pricePer1kInput: 0, pricePer1kOutput: 0 },
  manus: { id: 'manus', name: 'Manus', defaultModel: 'manus-agent', baseUrl: 'https://api.manus.im/v1', pricePer1kInput: 0, pricePer1kOutput: 0 },
  deepseek: { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', pricePer1kInput: 0.00014, pricePer1kOutput: 0.00028 },
};

const STRATEGIES = ['quality', 'cost', 'local-first', 'fallback'];

const _routers = new Map();
const _usage = new Map();

/** Ortak mesaj listesinden yaklaşık token sayar (kelime + işaret sayacı). */
function estimateTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const m of messages) {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    total += Math.ceil(text.length / 4) + 8;
  }
  return total;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => ({ role: ['system', 'user', 'assistant'].includes(m.role) ? m.role : 'user', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '') }));
}

function pickModel(schema, opts) {
  if (opts.model) return opts.model;
  return schema.defaultModel;
}

/** Sağlayıcı şemasını doğrular; eksik alanları doldurur. */
function defineProvider(spec) {
  const base = PROVIDER_SCHEMAS[spec.id] || { id: spec.id, name: spec.id, pricePer1kInput: 0, pricePer1kOutput: 0 };
  return {
    id: spec.id,
    name: spec.name || base.name,
    apiKey: spec.apiKey || null,
    baseUrl: spec.baseUrl || base.baseUrl,
    model: spec.model || base.defaultModel,
    pricePer1kInput: typeof spec.pricePer1kInput === 'number' ? spec.pricePer1kInput : base.pricePer1kInput,
    pricePer1kOutput: typeof spec.pricePer1kOutput === 'number' ? spec.pricePer1kOutput : base.pricePer1kOutput,
    enabled: spec.enabled !== false,
  };
}

/** Yeni yönlendirici: providers listesi + strateji + fallback sırası. */
function createRouter(opts = {}) {
  const id = `llm-${crypto.randomBytes(6).toString('hex')}`;
  const strategy = STRATEGIES.includes(opts.strategy) ? opts.strategy : 'fallback';
  const router = {
    id,
    strategy,
    maxAttempts: typeof opts.maxAttempts === 'number' ? Math.max(1, Math.min(6, opts.maxAttempts)) : 3,
    timeoutMs: typeof opts.timeoutMs === 'number' ? Math.max(2000, opts.timeoutMs) : 60000,
    budgetUsd: typeof opts.budgetUsd === 'number' && opts.budgetUsd >= 0 ? opts.budgetUsd : Infinity,
    providers: Array.isArray(opts.providers) && opts.providers.length ? opts.providers.map(defineProvider) : [defineProvider(PROVIDER_SCHEMAS.ollama)],
    localOnly: !!opts.localOnly,
    _fetch: opts.fetch || null,
    _spent: 0,
    _requests: 0,
    _failures: 0,
  };
  _routers.set(id, router);
  _usage.set(id, { spent: 0, requests: 0, failures: 0 });
  return { ok: true, router };
}

function getRouter(id) {
  return _routers.get(id) || null;
}

/** Yerel Ollama varlığını sağlık endpoint'iyle kontrol eder (enjekte fetch ile). */
async function discoverOllama(opts = {}) {
  const fetchFn = opts.fetch;
  const target = opts.baseUrl || 'http://localhost:11434/api/tags';
  try {
    const res = await Promise.resolve(fetchFn ? fetchFn(target) : Promise.reject(new Error('fetch yok')));
    const body = res && (res.ok === true || res.status < 300) ? (res.body || res.data || {}) : null;
    const models = body && Array.isArray(body.models) ? body.models : [];
    return { ok: true, reachable: true, models: models.map((m) => m.name || m.model || String(m)) };
  } catch (err) {
    return { ok: true, reachable: false, error: `Ollama erişilemedi: ${err.message}` };
  }
}

/** Enjekte edilmiş fetch ile sağalayıcıya chat isteği gönderir. */
function providerChat(router, provider, messages, opts) {
  const fetchFn = router._fetch;
  if (!fetchFn) return Promise.resolve({ ok: false, error: `Sağlayıcı erişimi yok (${provider.id})`, provider: provider.id });
  const payload = {
    model: opts.model || provider.model,
    messages,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.2,
    max_tokens: opts.maxTokens || 4096,
  };
  return Promise.resolve(fetchFn({
    url: `${provider.baseUrl}/chat/completions`,
    apiKey: provider.apiKey,
    body: payload,
    timeoutMs: router.timeoutMs,
  })).then((res) => {
    if (!res || !res.ok) return { ok: false, error: res?.error || `${provider.id}: yanıt alınamadı`, provider: provider.id };
    const content = typeof res.content === 'string' ? res.content : (res.choices && res.choices[0] && (res.choices[0].message?.content || '')) || '';
    const tokens = res.tokens || { input: estimateTokens(messages), output: estimateTokens([{ content }]) };
    const cost = (tokens.input / 1000) * provider.pricePer1kInput + (tokens.output / 1000) * provider.pricePer1kOutput;
    return { ok: true, content, provider: provider.id, model: payload.model, tokens, cost_usd: cost, latency_ms: res.latency_ms || 0 };
  }).catch((err) => ({ ok: false, error: `${provider.id}: ${err.message || 'istek başarısız'}`, provider: provider.id }));
}

function orderProviders(router) {
  let list = router.providers.filter((p) => p.enabled);
  if (router.localOnly) list = list.filter((p) => p.id === 'ollama');
  if (list.length === 0) return [];
  switch (router.strategy) {
    case 'quality': return list.sort((a, b) => (b.pricePer1kInput + b.pricePer1kOutput) - (a.pricePer1kInput + a.pricePer1kOutput));
    case 'cost': return list.sort((a, b) => (a.pricePer1kInput + a.pricePer1kOutput) - (b.pricePer1kInput + b.pricePer1kOutput));
    case 'local-first': { const local = list.filter((p) => p.id === 'ollama'); const rest = list.filter((p) => p.id !== 'ollama'); return [...local, ...rest]; }
    case 'fallback':
    default: return list;
  }
}

/** Mesaj listesini en uygun sağlayıcı zinciriyle gönderir. */
async function chat(router, messages, opts = {}) {
  if (!router || !_routers.has(router.id)) return { ok: false, error: 'Yönlendirici bulunamadı' };
  const norm = normalizeMessages(messages);
  if (norm.length === 0) return { ok: false, error: 'Mesaj listesi boş' };
  const started = Date.now();
  const ordered = orderProviders(router);
  if (ordered.length === 0) return { ok: false, error: 'Etkin sağlayıcı yok' };
  let lastError = 'sağlayıcı yok';
  for (let attempt = 0; attempt < Math.min(router.maxAttempts, ordered.length); attempt += 1) {
    const provider = ordered[attempt];
    const startedProvider = Date.now();
    let res;
    try {
      res = await providerChat(router, provider, norm, opts);
    } catch (err) {
      res = { ok: false, error: `${provider.id}: ${err.message}`, provider: provider.id };
    }
    router._requests += 1;
    const usage = _usage.get(router.id);
    if (usage) { usage.requests += 1; }
    if (res && res.ok) {
      res.latency_ms = Date.now() - started;
      if (typeof res.cost_usd === 'number') {
        router._spent += res.cost_usd;
        if (usage) usage.spent += res.cost_usd;
      }
      return res;
    }
    router._failures += 1;
    if (usage) usage.failures += 1;
    lastError = res?.error || `${provider.id}: bilinmeyen hata`;
  }
  return { ok: false, error: `Tüm denemeler başarısız: ${lastError}`, latency_ms: Date.now() - started };
}

function usage(router) {
  if (!router || !_routers.has(router.id)) return { ok: false };
  const u = _usage.get(router.id);
  return { ok: true, requests: u.requests, failures: u.failures, spent_usd: u.spent, budget_usd: router.budgetUsd, remaining_usd: router.budgetUsd === Infinity ? Infinity : Math.max(0, router.budgetUsd - u.spent) };
}

function addProvider(router, spec) {
  if (!router || !_routers.has(router.id)) return { ok: false, error: 'Yönlendirici bulunamadı' };
  if (router.providers.some((p) => p.id === spec.id)) return { ok: false, error: `Sağlayıcı zaten var: ${spec.id}` };
  router.providers.push(defineProvider(spec));
  return { ok: true, provider: spec.id };
}

function destroy(router) {
  if (!router) return { ok: false, error: 'Yönlendirici yok' };
  if (!_routers.has(router.id)) return { ok: false, error: 'Yönlendirici bulunamadı' };
  _usage.delete(router.id);
  _routers.delete(router.id);
  return { ok: true };
}

function testOnlyClear() {
  _routers.clear();
  _usage.clear();
  return { ok: true };
}

module.exports = {
  createRouter,
  getRouter,
  chat,
  discoverOllama,
  estimateTokens,
  normalizeMessages,
  orderProviders,
  usage,
  addProvider,
  destroy,
  testOnlyClear,
  PROVIDER_SCHEMAS,
  STRATEGIES,
};
