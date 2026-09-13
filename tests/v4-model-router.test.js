'use strict';

const {
  PrivacyClass,
  createCapabilityRegistry,
  fromLegacyProviders,
} = require('../src/main/v4/models/capability-registry');
const {
  RoutingPolicy,
  nextFallback,
  routeModel,
} = require('../src/main/v4/models/model-router');
const { ErrorCode } = require('../src/shared/v4/errors');

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function registryFixture() {
  return createCapabilityRegistry([
    {
      id: 'ollama:qwen-coder', provider: 'ollama', model: 'qwen-coder',
      coding: 0.82, reasoning: 0.7, toolCalling: true, structuredOutput: true,
      contextSize: 32768, estimatedCost: 0,
    },
    {
      id: 'openai:code', provider: 'openai', model: 'code',
      coding: 0.94, reasoning: 0.9, toolCalling: true, structuredOutput: true,
      contextSize: 128000, estimatedCost: 0.7,
    },
    {
      id: 'anthropic:sonnet', provider: 'anthropic', model: 'sonnet',
      coding: 0.98, reasoning: 0.95, toolCalling: true, structuredOutput: true,
      contextSize: 200000, estimatedCost: 1.1,
    },
    {
      id: 'deepseek:coder', provider: 'deepseek', model: 'coder',
      coding: 0.9, reasoning: 0.8, toolCalling: true, structuredOutput: true,
      contextSize: 64000, estimatedCost: 0.2,
    },
  ]);
}

describe('v4 model capability registry', () => {
  test('legacy provider definitions normalize into auditable capability records', () => {
    const records = fromLegacyProviders([
      { id: 'ollama', model: 'llama3.1:8b', enabled: true, pricePer1kInput: 0, pricePer1kOutput: 0 },
      { id: 'openai', model: 'gpt-code', enabled: true, pricePer1kInput: 0.2, pricePer1kOutput: 0.8 },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(expect.objectContaining({ provider: 'ollama', local: true, privacyClass: PrivacyClass.LOCAL }));
    expect(records[1]).toEqual(expect.objectContaining({ provider: 'openai', local: false, privacyClass: PrivacyClass.CLOUD, estimatedCost: 1 }));
  });

  test('availability changes are explicit and registry-scoped', () => {
    const registry = registryFixture();
    const updated = registry.setAvailability('anthropic:sonnet', false);
    expect(updated.availability).toBe(false);
    expect(registry.list({ availableOnly: true }).some((record) => record.id === 'anthropic:sonnet')).toBe(false);
  });
});

describe('v4 model routing policies', () => {
  test('local-only never selects or falls back to a cloud provider', () => {
    const route = routeModel(registryFixture(), {
      policy: RoutingPolicy.LOCAL_ONLY,
      requirements: { toolCalling: true },
      maxFallbacks: 5,
    });
    expect(route.selected.provider).toBe('ollama');
    expect(route.selected.privacyClass).toBe(PrivacyClass.LOCAL);
    expect(route.fallback.every((model) => model.local)).toBe(true);
    expect(route.explanation).toContain('restricted to local models');
  });

  test('best-coding chooses strongest allowed available coding model', () => {
    const route = routeModel(registryFixture(), {
      policy: RoutingPolicy.BEST_CODING,
      requirements: { structuredOutput: true, minContextSize: 64000 },
    });
    expect(route.selected.id).toBe('anthropic:sonnet');
    expect(route.fallback.map((model) => model.id)).toEqual(['openai:code', 'deepseek:coder']);
  });

  test('lowest-cost chooses cheapest capable candidate', () => {
    const route = routeModel(registryFixture(), {
      policy: RoutingPolicy.LOWEST_COST,
      requirements: { minContextSize: 64000 },
    });
    expect(route.selected.id).toBe('deepseek:coder');
  });

  test('manual route cannot bypass privacy requirements', () => {
    expectCode(
      () => routeModel(registryFixture(), {
        policy: RoutingPolicy.MANUAL,
        manualModelId: 'openai:code',
        requirements: { maxPrivacyClass: PrivacyClass.LOCAL },
      }),
      ErrorCode.VALIDATION_FAILED,
    );
  });

  test('provider outage uses only the pre-authorized fallback chain', () => {
    const registry = registryFixture();
    registry.setAvailability('anthropic:sonnet', false);
    const route = routeModel(registry, {
      policy: RoutingPolicy.BEST_CODING,
      requirements: { minContextSize: 64000 },
    });
    expect(route.selected.id).toBe('openai:code');
    expect(nextFallback(route, ['openai:code']).id).toBe('deepseek:coder');
    expect(nextFallback(route, ['openai:code', 'deepseek:coder'])).toBeNull();
  });

  test('capability mismatch fails closed instead of silently loosening requirements', () => {
    expectCode(
      () => routeModel(registryFixture(), {
        policy: RoutingPolicy.BALANCED,
        requirements: { vision: true, maxPrivacyClass: PrivacyClass.LOCAL },
      }),
      ErrorCode.NOT_FOUND,
    );
  });
});
