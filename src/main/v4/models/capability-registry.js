'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

const PrivacyClass = Object.freeze({
  LOCAL: 'local',
  PRIVATE: 'private',
  CLOUD: 'cloud',
});

const LatencyTier = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const DEFAULT_PROVIDER_CAPABILITIES = Object.freeze({
  ollama: {
    local: true,
    privacyClass: PrivacyClass.LOCAL,
    latencyTier: LatencyTier.LOW,
    reasoning: 0.6,
    coding: 0.65,
    toolCalling: true,
    vision: false,
    structuredOutput: true,
    contextSize: 32768,
    estimatedCost: 0,
  },
  openai: {
    local: false,
    privacyClass: PrivacyClass.CLOUD,
    latencyTier: LatencyTier.MEDIUM,
    reasoning: 0.9,
    coding: 0.92,
    toolCalling: true,
    vision: true,
    structuredOutput: true,
    contextSize: 128000,
    estimatedCost: 0.6,
  },
  anthropic: {
    local: false,
    privacyClass: PrivacyClass.CLOUD,
    latencyTier: LatencyTier.MEDIUM,
    reasoning: 0.95,
    coding: 0.95,
    toolCalling: true,
    vision: true,
    structuredOutput: true,
    contextSize: 200000,
    estimatedCost: 1,
  },
  gemini: {
    local: false,
    privacyClass: PrivacyClass.CLOUD,
    latencyTier: LatencyTier.MEDIUM,
    reasoning: 0.88,
    coding: 0.86,
    toolCalling: true,
    vision: true,
    structuredOutput: true,
    contextSize: 1000000,
    estimatedCost: 0.45,
  },
  deepseek: {
    local: false,
    privacyClass: PrivacyClass.CLOUD,
    latencyTier: LatencyTier.MEDIUM,
    reasoning: 0.84,
    coding: 0.9,
    toolCalling: true,
    vision: false,
    structuredOutput: true,
    contextSize: 64000,
    estimatedCost: 0.2,
  },
  manus: {
    local: false,
    privacyClass: PrivacyClass.CLOUD,
    latencyTier: LatencyTier.HIGH,
    reasoning: 0.88,
    coding: 0.82,
    toolCalling: true,
    vision: true,
    structuredOutput: true,
    contextSize: 128000,
    estimatedCost: 1.2,
  },
});

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp01(value, fallback) {
  return Math.max(0, Math.min(1, finiteNumber(value, fallback)));
}

function normalizeCapability(input = {}) {
  const provider = String(input.provider || input.id || '').trim().toLowerCase();
  if (!provider) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'model capability provider is required');
  const defaults = DEFAULT_PROVIDER_CAPABILITIES[provider] || {};
  const model = String(input.model || input.modelId || 'default').trim();
  const id = String(input.id || `${provider}:${model}`).trim();
  if (!id) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'model capability id is required');

  const local = typeof input.local === 'boolean' ? input.local : Boolean(defaults.local);
  const privacyClass = input.privacyClass || defaults.privacyClass || (local ? PrivacyClass.LOCAL : PrivacyClass.CLOUD);
  if (!Object.values(PrivacyClass).includes(privacyClass)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid privacy class: ${privacyClass}`);
  }

  const latencyTier = input.latencyTier || defaults.latencyTier || LatencyTier.MEDIUM;
  if (!Object.values(LatencyTier).includes(latencyTier)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid latency tier: ${latencyTier}`);
  }

  return Object.freeze({
    id,
    provider,
    model,
    local,
    privacyClass,
    contextSize: Math.max(0, Math.floor(finiteNumber(input.contextSize, defaults.contextSize || 0))),
    reasoning: clamp01(input.reasoning, defaults.reasoning || 0.5),
    coding: clamp01(input.coding, defaults.coding || 0.5),
    toolCalling: typeof input.toolCalling === 'boolean' ? input.toolCalling : Boolean(defaults.toolCalling),
    vision: typeof input.vision === 'boolean' ? input.vision : Boolean(defaults.vision),
    structuredOutput: typeof input.structuredOutput === 'boolean' ? input.structuredOutput : Boolean(defaults.structuredOutput),
    latencyTier,
    estimatedCost: Math.max(0, finiteNumber(input.estimatedCost, defaults.estimatedCost || 0)),
    availability: input.availability !== false,
    enabled: input.enabled !== false,
    metadata: Object.freeze({ ...(input.metadata || {}) }),
  });
}

function createCapabilityRegistry(initial = []) {
  const records = new Map();

  function register(input) {
    const record = normalizeCapability(input);
    records.set(record.id, record);
    return record;
  }

  function get(id) {
    return records.get(id) || null;
  }

  function list(options = {}) {
    let values = Array.from(records.values());
    if (options.enabledOnly !== false) values = values.filter((record) => record.enabled);
    if (options.availableOnly) values = values.filter((record) => record.availability);
    if (options.provider) values = values.filter((record) => record.provider === options.provider);
    return values.slice();
  }

  function setAvailability(id, availability) {
    const current = get(id);
    if (!current) throw new V4Error(ErrorCode.NOT_FOUND, `model capability not found: ${id}`);
    const next = normalizeCapability({ ...current, availability: Boolean(availability) });
    records.set(id, next);
    return next;
  }

  function remove(id) {
    return records.delete(id);
  }

  for (const item of initial) register(item);
  return { register, get, list, setAvailability, remove };
}

function fromLegacyProviders(providers = []) {
  return providers
    .filter((provider) => provider && provider.id)
    .map((provider) => normalizeCapability({
      provider: provider.id,
      model: provider.model || provider.defaultModel || 'default',
      enabled: provider.enabled !== false,
      estimatedCost: Math.max(
        0,
        finiteNumber(provider.pricePer1kInput, 0) + finiteNumber(provider.pricePer1kOutput, 0),
      ),
      metadata: {
        baseUrl: provider.baseUrl || null,
        legacy: true,
      },
    }));
}

module.exports = {
  PrivacyClass,
  LatencyTier,
  DEFAULT_PROVIDER_CAPABILITIES,
  normalizeCapability,
  createCapabilityRegistry,
  fromLegacyProviders,
};
