'use strict';

const http = require('http');
const configStore = require('../../config/config-store');
const { normalizeOllamaHost, splitOllamaHttpTarget } = require('../../../main-security');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const DEFAULT_TIMEOUT_MS = 120000;
const MODEL_PREFERENCE = [
  /qwen.*coder/i,
  /deepseek.*coder/i,
  /codestral/i,
  /codellama/i,
  /qwen/i,
  /llama/i,
];

function requestJson(target, requestPath, options = {}) {
  const timeoutMs = Number.isInteger(options.timeoutMs) ? Math.max(1000, options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: requestPath,
      method: body ? 'POST' : 'GET',
      timeout: timeoutMs,
      headers: body ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      } : undefined,
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
        if (text.length > 8 * 1024 * 1024) req.destroy(new Error('Ollama response exceeds 8 MB'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Ollama HTTP ${res.statusCode}`));
          return;
        }
        try { resolve(JSON.parse(text || '{}')); }
        catch (error) { reject(new Error(`Invalid Ollama JSON: ${error.message}`)); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Ollama request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function choosePlannerModel(models = [], preferredModel = null) {
  const names = models.map((model) => model && (model.name || model.model)).filter(Boolean);
  if (preferredModel && names.includes(preferredModel)) return preferredModel;
  for (const pattern of MODEL_PREFERENCE) {
    const match = names.find((name) => pattern.test(name));
    if (match) return match;
  }
  return names[0] || null;
}

function createOllamaPlannerInvoker(options = {}) {
  const configReader = options.configReader || (() => configStore.readConfig());
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  let cachedModel = null;
  let cachedHost = null;
  let cacheExpiresAt = 0;

  async function resolveTargetAndModel() {
    const config = configReader() || {};
    const provider = config.providers && config.providers.ollama || {};
    const configuredHost = options.host || (Array.isArray(provider.hosts) && provider.hosts[0]) || 'localhost:11434';
    const hostKey = normalizeOllamaHost(configuredHost);
    const target = splitOllamaHttpTarget(hostKey);
    if (!target) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'configured Ollama host is invalid');
    if (cachedModel && cachedHost === hostKey && Date.now() < cacheExpiresAt) return { target, model: cachedModel, hostKey };

    let tags;
    try { tags = await requestJson(target, '/api/tags', { timeoutMs: Math.min(timeoutMs, 15000) }); }
    catch (error) {
      throw new V4Error(ErrorCode.NOT_FOUND, `Ollama is unavailable at ${hostKey}: ${error.message}`);
    }
    const preferredModel = options.model || provider.plannerModel || provider.model || null;
    const model = choosePlannerModel(tags.models || [], preferredModel);
    if (!model) throw new V4Error(ErrorCode.NOT_FOUND, 'Ollama has no installed model available for planning');
    cachedModel = model;
    cachedHost = hostKey;
    cacheExpiresAt = Date.now() + 60000;
    return { target, model, hostKey };
  }

  return async function invokePlanner(input = {}) {
    const messages = Array.isArray(input.messages) ? input.messages : [];
    if (!messages.length) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'planner messages are required');
    const { target, model, hostKey } = await resolveTargetAndModel();
    let response;
    try {
      response = await requestJson(target, '/api/chat', {
        timeoutMs,
        body: {
          model,
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.1,
            num_predict: 4096,
          },
        },
      });
    } catch (error) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `Ollama planner failed: ${error.message}`, { host: hostKey, model });
    }
    const content = response && response.message && response.message.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, 'Ollama planner returned no content', { host: hostKey, model });
    }
    return {
      content,
      provider: 'ollama',
      model,
      host: hostKey,
      usage: {
        promptTokens: response.prompt_eval_count || null,
        completionTokens: response.eval_count || null,
      },
    };
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MODEL_PREFERENCE,
  requestJson,
  choosePlannerModel,
  createOllamaPlannerInvoker,
};
