'use strict';
/* ---------------------------------------------------------------------------
 * Çoklu Sağlayıcı AI API Katmanı (v3.6.0)
 * OpenRouter, xAI, Mistral, DeepSeek, Cohere, Perplexity, Together, Groq,
 * Cerebras, Fireworks, Replicate, Azure OpenAI, LM Studio ve özel uç noktalar.
 *
 * IPC:
 *   multi-models (handle)  → { provider, apiKey, options } → model listesi
 *   multi-chat (on)        → { provider, model, apiKey, options, messages, agentId }
 *                            SSE stream → chat-chunk / chat-done
 * --------------------------------------------------------------------------- */

const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

const path = require('path');
const fs = require('fs');

const STREAM_TIMEOUT_MS = 180000;

const CATALOG_PATH = path.join(__dirname, '..', '..', 'shared', 'model-catalog.json');

/* V3.14 (A1-2/A1-1): air-gapped ağ modu + kasa anahtar çözücü */
const networkMode = require('../network/network-mode');
const secretsVault = require('../secrets/secrets-vault');
let configStore = null;
function setProviderChatConfigStore(store) {
  configStore = store;
}

function readCatalog() {
  try {
    return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

const SAFE_ID = /^[a-z0-9_-]{1,32}$/;

/* Format: 'openai' | 'cohere' | 'bedrock' | 'azure' */
const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'openrouter.ai', path: '/api/v1/models' },
    format: 'openai',
  },
  xai: {
    label: 'xAI Grok',
    hostname: 'api.x.ai',
    path: '/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.x.ai', path: '/v1/models' },
    format: 'openai',
  },
  mistral: {
    label: 'Mistral',
    hostname: 'api.mistral.ai',
    path: '/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.mistral.ai', path: '/v1/models' },
    format: 'openai',
  },
  deepseek: {
    label: 'DeepSeek',
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.deepseek.com', path: '/models' },
    format: 'openai',
  },
  cohere: {
    label: 'Cohere',
    hostname: 'api.cohere.com',
    path: '/v2/chat',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.cohere.com', path: '/v1/models' },
    format: 'cohere',
  },
  perplexity: {
    label: 'Perplexity',
    hostname: 'api.perplexity.ai',
    path: '/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.perplexity.ai', path: '/models' },
    format: 'openai',
  },
  together: {
    label: 'Together',
    hostname: 'api.together.xyz',
    path: '/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.together.xyz', path: '/v1/models' },
    format: 'openai',
  },
  groq: {
    label: 'Groq',
    hostname: 'api.groq.com',
    path: '/openai/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.groq.com', path: '/openai/v1/models' },
    format: 'openai',
  },
  cerebras: {
    label: 'Cerebras',
    hostname: 'api.cerebras.ai',
    path: '/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.cerebras.ai', path: '/v1/models' },
    format: 'openai',
  },
  fireworks: {
    label: 'Fireworks',
    hostname: 'api.fireworks.ai',
    path: '/inference/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.fireworks.ai', path: '/v1/models' },
    format: 'openai',
  },
  replicate: {
    label: 'Replicate',
    hostname: 'api.replicate.com',
    path: '/v1/chat/completions',
    authType: 'bearer',
    modelEndpoint: { hostname: 'api.replicate.com', path: '/v1/models' },
    format: 'openai',
  },
  azure: {
    label: 'Azure OpenAI',
    hostname: null,
    path: null,
    authType: 'azure',
    modelEndpoint: null,
    format: 'azure',
  },
  lmstudio: {
    label: 'LM Studio',
    hostname: '127.0.0.1',
    port: 1234,
    path: '/v1/chat/completions',
    authType: 'none',
    modelEndpoint: { hostname: '127.0.0.1', port: 1234, path: '/v1/models' },
    local: true,
    format: 'openai',
  },
  custom: {
    label: 'Özel Uç Nokta',
    hostname: null,
    path: null,
    authType: 'custom',
    modelEndpoint: null,
    format: 'custom',
  },
};

function validateProvider(providerId) {
  return SAFE_ID.test(providerId) && Object.prototype.hasOwnProperty.call(PROVIDERS, providerId);
}

function buildAuthHeaders(provider, apiKey) {
  const p = PROVIDERS[provider];
  switch (p.authType) {
    case 'bearer':
      return { Authorization: `Bearer ${apiKey}` };
    case 'azure':
      return { 'api-key': apiKey };
    case 'custom':
      return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    case 'none':
    default:
      return {};
  }
}

/* ---------------- Bedrock SigV4 (aws-bedrock) ---------------- */
function awsSigV4(method, host, pathStr, payload, region, accessKey, secretKey, service = 'bedrock') {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const bodyHash = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalHeaders =
    `content-type:application/json\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, pathStr, '', canonicalHeaders, signedHeaders, bodyHash].join('\n');
  const credScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmacHex(kSigning, stringToSign);
  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-Amz-Date': amzDate,
      'X-Amz-Content-Sha256': bodyHash,
      Authorization: authorization,
      'Content-Length': Buffer.byteLength(payload),
    },
  };
}
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}
function hmacHex(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

const BEDROCK = {
  label: 'Amazon Bedrock',
  authType: 'bedrock',
  format: 'bedrock',
  modelEndpoint: null,
};
PROVIDERS['aws-bedrock'] = BEDROCK;

/* ------------------------------------------------------------------ */
/* Model listesi: provider API'den çek, katalogla merge et            */
/* ------------------------------------------------------------------ */
async function fetchProviderModelList(provider, apiKey, options = {}) {
  if (!validateProvider(provider)) return { ok: false, error: 'Bilinmeyen sağlayıcı' };
  const p = PROVIDERS[provider];

  if (provider === 'azure' || provider === 'custom') {
    const endpoint = (options.endpoint || '').trim();
    if (!endpoint) return { ok: false, error: 'Uç nokta adresi gerekli (örn. https://<resource>.openai.azure.com)' };
    let base;
    try {
      base = new URL(endpoint);
    } catch {
      return { ok: false, error: 'Geçersiz uç nokta adresi' };
    }
    const modelPath = provider === 'azure'
      ? `${base.pathname.replace(/\/$/, '')}/models?api-version=2024-02-15-preview`
      : `${base.pathname.replace(/\/$/, '')}/models`;
    const headers = buildAuthHeaders(provider, apiKey);
    headers.Accept = 'application/json';
    return httpsGetJson(base.hostname, parseInt(base.port, 10) || 443, modelPath, headers, base.protocol === 'http:');
  }

  if (provider === 'aws-bedrock') {
    const { region, accessKeyId, secretAccessKey } = extractAwsCreds(options);
    if (!region || !accessKeyId || !secretAccessKey) {
      return { ok: false, error: 'AWS bölge, erişim anahtarı ve gizli anahtar gerekli' };
    }
    const host = `bedrock-runtime.${region}.amazonaws.com`;
    const payload = JSON.stringify({ foundationModels: true });
    const auth = awsSigV4('GET', host, `/foundation-models`, payload, region, accessKeyId, secretAccessKey, 'bedrock');
    return httpsGetJson(host, 443, '/foundation-models', auth.headers, false, 8000);
  }

  if (!p.modelEndpoint) return { ok: false, error: 'Bu sağlayıcı için model listesi yok' };
  if (p.authType === 'none') {
    return httpsGetJson(p.modelEndpoint.hostname, p.modelEndpoint.port || 443, p.modelEndpoint.path, {}, !!p.local);
  }
  if (!apiKey) {
    return { ok: false, error: 'API anahtarı gerekli' };
  }
  const headers = { ...buildAuthHeaders(provider, apiKey), Accept: 'application/json' };
  return httpsGetJson(p.modelEndpoint.hostname, 443, p.modelEndpoint.path, headers);
}

function httpsGetJson(hostname, port, pathStr, headers, useHttp = false, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = (useHttp ? http : https).get(
      { hostname, port, path: pathStr, headers, timeout: timeoutMs },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => {
          let ids = [];
          try {
            const j = JSON.parse(d);
            ids = extractModelIds(providerContext(pathStr), j);
          } catch {
            /* ignore */
          }
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, models: ids });
        });
      },
    );
    req.on('error', () => resolve({ ok: false, models: [] }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, models: [] }); });
  });
}

function providerContext(pathStr) {
  if (pathStr.includes('/v1/models') || pathStr.includes('/models')) return 'openai-list';
  if (pathStr.includes('foundation-models')) return 'bedrock-list';
  return 'unknown';
}

function extractModelIds(ctx, j) {
  if (ctx === 'bedrock-list') {
    return ((j && j.modelSummaries) || []).map((m) => m.modelId || '').filter(Boolean);
  }
  const arr = j && Array.isArray(j.data) ? j.data : j && Array.isArray(j.models) ? j.models : null;
  if (!arr) return [];
  return arr.map((m) => m.id || m.modelId || m.name || '').filter(Boolean);
}

function extractAwsCreds(options = {}) {
  return {
    region: (options.region || '').trim(),
    accessKeyId: (options.awsAccessKeyId || '').trim(),
    secretAccessKey: (options.awsSecretAccessKey || '').trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Stream: çoklu sağlayıcı chat akışı                                 */
/* ------------------------------------------------------------------ */
const DEFAULT_MODEL_PARAMS = { temperature: 0.7, top_p: 1, max_tokens: 8192, frequency_penalty: 0 };
function sanitizeParams(params = {}) {
  const out = {};
  const num = (v, min, max) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
  };
  if (params.temperature !== undefined) out.temperature = num(params.temperature, 0, 2);
  if (params.top_p !== undefined) out.top_p = num(params.top_p, 0, 1);
  if (params.max_tokens !== undefined) out.max_tokens = num(params.max_tokens, 16, 131072);
  if (params.frequency_penalty !== undefined) out.frequency_penalty = num(params.frequency_penalty, -2, 2);
  if (params.presence_penalty !== undefined) out.presence_penalty = num(params.presence_penalty, -2, 2);
  return out;
}
async function runMultiChat(event, { provider, model, apiKey, options = {}, messages, agentId, modelParams }) {
  const reply = (channel, payload) => {
    if (event && event.sender && !event.sender.isDestroyed()) event.sender.send(channel, payload);
  };
  if (!validateProvider(provider)) {
    reply('chat-chunk', { agentId, content: `❌ Bilinmeyen sağlayıcı: ${provider}` });
    reply('chat-done', { agentId });
    return;
  }
  /* V3.14 (A1-2): air-gapped modda yalnızca yerel sağlayıcılara izin */
  if (!networkMode.isCloudProviderAllowed(provider)) {
    reply('chat-chunk', { agentId, content: `❌ Air-gapped mod: '${provider}' bulut sağlayıcısı kapalı. Yalnızca Ollama/yerel modeller kullanılır.` });
    reply('chat-done', { agentId });
    return;
  }
  /* V3.15 (A2-1): bütçe motoru — soft stop; kullanıcı onayıyla devam edebilir */
  if (networkMode.isCloudProviderAllowed(provider) && configStore) {
    const { costEngine } = require('../cost/cost-engine-wire');
    const budgetCheck = costEngine.checkBudget(configStore, provider);
    if (budgetCheck && !budgetCheck.ok && budgetCheck.state === 'stopped') {
      reply('chat-chunk', { agentId, content: `⚠️ Bütçe durduruldu: '${provider}' için aylık limit (≈$${budgetCheck.limit}) dolmuş. Ayarlar → Bütçe panelinden limiti artırmak ya da onayla devam etmek için “Maliyet” bölümünü kullanın.` });
      reply('chat-done', { agentId });
      return;
    }
    if (budgetCheck && budgetCheck.state === 'warn') {
      reply('chat-chunk', { agentId, content: `⚠️ Bütçe uyarısı: '${provider}' kullanımı ≈$${budgetCheck.spent} / $${budgetCheck.limit}.` });
    }
  }
  if (!Array.isArray(messages) || !messages.length) {
    reply('chat-chunk', { agentId, content: '❌ Mesaj listesi boş.' });
    reply('chat-done', { agentId });
    return;
  }
  /* V3.14 (A1-1): anahtar boşsa kasadan çözmeyi dene */
  if (!apiKey && configStore) {
    const ref = configStore.readConfig?.()?.providers?.[provider]?.apiKey || '';
    if (typeof ref === 'string' && ref.startsWith('VAULT:')) {
      const account = ref.split(':')[2] || provider;
      apiKey = await secretsVault.getKey(account);
    }
  }
  const p = PROVIDERS[provider];

  if (p.authType === 'none') {
    startOpenAICompatibleStream(event, { hostname: p.hostname, port: p.port, path: p.path, headers: {}, useHttp: true, messages, model, provider, agentId, reply, modelParams });
    return;
  }

  if (provider === 'aws-bedrock') {
    startBedrockStream(event, { model, options, messages, agentId, reply, modelParams });
    return;
  }

  if (provider === 'azure') {
    startAzureStream(event, { model, apiKey, options, messages, agentId, reply, modelParams });
    return;
  }

  if (provider === 'custom') {
    startCustomStream(event, { apiKey, options, messages, model, agentId, reply, modelParams });
    return;
  }

  if (!apiKey) {
    reply('chat-chunk', { agentId, content: `❌ ${p.label} API anahtarı eksik. Ayarlar'dan ekleyin.` });
    reply('chat-done', { agentId });
    return;
  }

  if (p.format === 'cohere') {
    startCohereStream(event, { apiKey, model, messages, agentId, reply, modelParams });
  } else {
    startOpenAICompatibleStream(event, {
      hostname: p.hostname,
      port: 443,
      path: p.path,
      headers: buildAuthHeaders(provider, apiKey),
      messages,
      model,
      provider,
      agentId,
      reply,
      modelParams,
    });
  }
}

function normalizeMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue; // system ve diğer roller payload'a eklenmez
    out.push({ role, content: m.content });
  }
  return out;
}

/* ---- OpenAI-uyumlu SSE stream (11 sağlayıcı + LM Studio) ---- */
function startOpenAICompatibleStream(event, { hostname, port, path: pathStr, headers, useHttp, messages, model, provider, agentId, reply, modelParams = {} }) {
  const norm = normalizeMessages(messages);
  const params = { ...DEFAULT_MODEL_PARAMS, ...sanitizeParams(modelParams) };
  const payload = JSON.stringify({ model, messages: norm, stream: true, ...params });
  const allHeaders = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  };
  const req = (useHttp ? http : https).request(
    { hostname, port, path: pathStr, method: 'POST', headers: allHeaders, timeout: STREAM_TIMEOUT_MS },
    (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        let errBuf = '';
        res.on('data', (c) => { errBuf += c; });
        res.on('end', () => {
          const err = errBuf.slice(0, 400);
          reply('chat-chunk', { agentId, content: `❌ ${PROVIDERS[provider]?.label || provider} hatası (HTTP ${res.statusCode}): ${err}` });
          reply('chat-done', { agentId });
        });
        return;
      }
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          const d = l.slice(6).trim();
          if (d === '[DONE]') { reply('chat-done', { agentId }); continue; }
          try {
            const j = JSON.parse(d);
            const txt = j.choices?.[0]?.delta?.content || j.choices?.[0]?.message?.content;
            if (txt) reply('chat-chunk', { agentId, content: txt });
            /* V3.15 (A2): token sayacı — son [DONE] parçası usage alanı taşır */
            const u = j.usage;
            if (u && Number.isFinite(u.prompt_tokens) && Number.isFinite(u.completion_tokens)) {
              reply('chat-usage', { agentId, provider, model, inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens });
            }
          } catch {
            /* ignore malformed chunk */
          }
        }
      });
      res.on('end', () => reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    reply('chat-chunk', { agentId, content: `❌ ${PROVIDERS[provider]?.label || provider} bağlantı hatası: ${e.message || e.code}` });
    reply('chat-done', { agentId });
  });
  req.write(payload);
  req.end();
}

/* ---- Azure OpenAI (resource bazlı URL) ---- */
function startAzureStream(event, { model, apiKey, options, messages, agentId, reply, modelParams }) {
  const endpoint = (options.endpoint || '').trim();
  const apiVersion = (options.apiVersion || '2024-02-15-preview').trim();
  if (!endpoint || !apiKey) {
    reply('chat-chunk', { agentId, content: '❌ Azure uç noktası veya API anahtarı eksik. Ayarlar → API panelinden girin.' });
    reply('chat-done', { agentId });
    return;
  }
  let base;
  try {
    base = new URL(endpoint);
  } catch {
    reply('chat-chunk', { agentId, content: '❌ Azure uç nokta adresi geçersiz.' });
    reply('chat-done', { agentId });
    return;
  }
  const pathStr = `${base.pathname.replace(/\/$/, '')}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
  startOpenAICompatibleStream(event, {
    hostname: base.hostname,
    port: parseInt(base.port, 10) || 443,
    path: pathStr,
    headers: { 'api-key': apiKey },
    useHttp: base.protocol === 'http:',
    messages,
    model,
    provider: 'azure',
    agentId,
    reply,
    modelParams,
  });
}

/* ---- Özel uç nokta ---- */
function startCustomStream(event, { apiKey, options, messages, model, agentId, reply }) {
  const endpoint = (options.endpoint || '').trim();
  if (!endpoint) {
    reply('chat-chunk', { agentId, content: '❌ Özel uç nokta adresi eksik (örn. http://localhost:1234 veya OpenAI-uyumlu sunucu).' });
    reply('chat-done', { agentId });
    return;
  }
  let base;
  try {
    base = new URL(endpoint);
  } catch {
    reply('chat-chunk', { agentId, content: '❌ Uç nokta adresi geçersiz.' });
    reply('chat-done', { agentId });
    return;
  }
  const pathStr = `${base.pathname.replace(/\/$/, '')}/chat/completions`;
  startOpenAICompatibleStream(event, {
    hostname: base.hostname,
    port: parseInt(base.port, 10) || (base.protocol === 'http:' ? 80 : 443),
    path: pathStr,
    headers: buildAuthHeaders('custom', apiKey),
    useHttp: base.protocol === 'http:',
    messages,
    model,
    provider: 'custom',
    agentId,
    reply,
    modelParams,
  });
}

/* ---- Cohere v2/chat stream ---- */
function startCohereStream(event, { apiKey, model, messages, agentId, reply, modelParams }) {
  const norm = normalizeMessages(messages);
  const chatMessages = norm.map((m) => ({ role: m.role === 'user' ? 'user' : 'chatbot', content: m.content }));
  const params = { ...DEFAULT_MODEL_PARAMS, ...sanitizeParams(modelParams) };
  const payload = JSON.stringify({ model, messages: chatMessages, stream: true, ...params });
  const req = https.request(
    {
      hostname: 'api.cohere.com',
      path: '/v2/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: STREAM_TIMEOUT_MS,
    },
    (res) => {
      if (res.statusCode >= 400) {
        let errBuf = '';
        res.on('data', (c) => { errBuf += c; });
        res.on('end', () => {
          reply('chat-chunk', { agentId, content: `❌ Cohere hatası (HTTP ${res.statusCode}): ${errBuf.slice(0, 300)}` });
          reply('chat-done', { agentId });
        });
        return;
      }
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(l.slice(6));
            if (j.type === 'content-delta' && j.delta?.message) {
              reply('chat-chunk', { agentId, content: j.delta.message.content || '' });
            }
          } catch {
            /* ignore */
          }
        }
      });
      res.on('end', () => reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    reply('chat-chunk', { agentId, content: `❌ Cohere bağlantı hatası: ${e.message || e.code}` });
    reply('chat-done', { agentId });
  });
  req.write(payload);
  req.end();
}

/* ---- Amazon Bedrock (Anthropic Messages streaming, SigV4) ---- */
function startBedrockStream(event, { model, options, messages, agentId, reply, modelParams }) {
  const { region, accessKeyId, secretAccessKey } = extractAwsCreds(options);
  if (!region || !accessKeyId || !secretAccessKey) {
    reply('chat-chunk', { agentId, content: '❌ AWS Bedrock: bölge, access key ve secret key gerekli. Ayarlar → API panelinden girin.' });
    reply('chat-done', { agentId });
    return;
  }
  const norm = normalizeMessages(messages);

  const anthropicMsgs = norm.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({
    role: m.role,
    content: [{ type: 'text', text: m.content }],
  }));
  if (!anthropicMsgs.length) {
    reply('chat-chunk', { agentId, content: '❌ Mesaj listesi boş.' });
    reply('chat-done', { agentId });
    return;
  }
  const params = { ...DEFAULT_MODEL_PARAMS, ...sanitizeParams(modelParams) };
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: params.max_tokens,
    temperature: params.temperature,
    top_p: params.top_p,
    messages: anthropicMsgs,
    ...(options.bedrockSystemPrompt ? { system: options.bedrockSystemPrompt } : {}),
  });
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const pathStr = `/model/${encodeURIComponent(model)}/invoke-with-response-stream`;
  const auth = awsSigV4('POST', host, pathStr, body, region, accessKeyId, secretAccessKey, 'bedrock');
  const req = https.request(
    { hostname: host, path: pathStr, method: 'POST', headers: auth.headers, timeout: STREAM_TIMEOUT_MS },
    (res) => {
      if (res.statusCode >= 400) {
        let errBuf = '';
        res.on('data', (c) => { errBuf += c; });
        res.on('end', () => {
          reply('chat-chunk', { agentId, content: `❌ Bedrock hatası (HTTP ${res.statusCode}): ${errBuf.slice(0, 300)}` });
          reply('chat-done', { agentId });
        });
        return;
      }
      /* Bedrock event stream: 32-bit big-endian chunk header + payload */
      let prev = Buffer.alloc(0);
      res.on('data', (c) => {
        prev = Buffer.concat([prev, c]);
        while (prev.length >= 4) {
          const totalLen = prev.readUInt32BE(0);
          if (prev.length < totalLen) break;
          const chunk = prev.slice(0, totalLen);
          prev = prev.slice(totalLen);
          const headersLen = chunk.readUInt32BE(4);
          const payloadStart = 12 + headersLen;
          if (chunk.length < payloadStart) continue;
          const payloadType = chunk.slice(8, 12).toString();
          const payload = chunk.slice(payloadStart, totalLen - 16);
          try {
            const j = JSON.parse(payload.toString());
            if (payloadType === 'event') {
              const txt = j.delta?.text || j.content_block_delta?.delta?.text;
              if (txt) reply('chat-chunk', { agentId, content: txt });
            }
          } catch {
            /* ignore */
          }
        }
      });
      res.on('end', () => reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    reply('chat-chunk', { agentId, content: `❌ Bedrock bağlantı hatası: ${e.message || e.code}` });
    reply('chat-done', { agentId });
  });
  req.write(body);
  req.end();
}

function attachStreamTimeout(req) {
  const t = setTimeout(() => {
    try {
      req.destroy();
    } catch {
      /* ignore */
    }
  }, STREAM_TIMEOUT_MS);
  req.on('close', () => clearTimeout(t));
}

/* ------------------------------------------------------------------ */
/* IPC kayıt                                                           */
/* ------------------------------------------------------------------ */
function registerProviderChatHandlers() {
  const { ipcMain } = require('electron');
  ipcMain.handle('multi-models', async (_e, { provider, apiKey, options }) => {
    if (!validateProvider(provider)) return { ok: false, error: 'Bilinmeyen sağlayıcı' };
    const live = await fetchProviderModelList(provider, apiKey, options);
    const catalog = readCatalog();
    const staticList = Array.isArray(catalog[provider]) ? catalog[provider] : [];
    if (live.ok && Array.isArray(live.models) && live.models.length) {
      const merged = [...new Set([...live.models, ...staticList])].sort();
      return { ok: true, models: merged };
    }
    if (staticList.length) return { ok: true, models: staticList, source: 'catalog' };
    return { ok: false, error: live.error || 'Model listesi alınamadı', models: [] };
  });

  ipcMain.on('multi-chat', (event, payload) => {
    try {
      runMultiChat(event, payload || {});
    } catch (err) {
      const reply = (ch, p) => { if (event.sender && !event.sender.isDestroyed()) event.sender.send(ch, p); };
      reply('chat-chunk', { agentId: payload?.agentId, content: `❌ Sağlayıcı hatası: ${err.message}` });
      reply('chat-done', { agentId: payload?.agentId });
    }
  });
}

module.exports = {
  registerProviderChatHandlers,
  runMultiChat,
  fetchProviderModelList,
  validateProvider,
  PROVIDERS,
  _internal: {
    awsSigV4,
    normalizeMessages,
    extractAwsCreds,
    extractModelIds,
  },
};
