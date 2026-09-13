'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { PrivacyClass } = require('./capability-registry');

const RoutingPolicy = Object.freeze({
  LOCAL_ONLY: 'local-only',
  LOWEST_COST: 'lowest-cost',
  BEST_CODING: 'best-coding',
  BALANCED: 'balanced',
  MANUAL: 'manual',
});

const LATENCY_SCORE = Object.freeze({ low: 1, medium: 0.65, high: 0.3 });

function privacyRank(value) {
  return {
    [PrivacyClass.LOCAL]: 0,
    [PrivacyClass.PRIVATE]: 1,
    [PrivacyClass.CLOUD]: 2,
  }[value] ?? 2;
}

function matchesRequirements(model, requirements = {}) {
  if (!model.enabled || !model.availability) return false;
  if (requirements.localOnly && !model.local) return false;
  if (requirements.maxPrivacyClass && privacyRank(model.privacyClass) > privacyRank(requirements.maxPrivacyClass)) return false;
  if (requirements.minContextSize && model.contextSize < requirements.minContextSize) return false;
  if (requirements.toolCalling && !model.toolCalling) return false;
  if (requirements.vision && !model.vision) return false;
  if (requirements.structuredOutput && !model.structuredOutput) return false;
  if (typeof requirements.minCoding === 'number' && model.coding < requirements.minCoding) return false;
  if (typeof requirements.minReasoning === 'number' && model.reasoning < requirements.minReasoning) return false;
  if (Array.isArray(requirements.allowedProviders) && requirements.allowedProviders.length) {
    if (!requirements.allowedProviders.includes(model.provider)) return false;
  }
  return true;
}

function scoreBalanced(model, requirements = {}) {
  const codingWeight = requirements.codingWeight ?? 0.35;
  const reasoningWeight = requirements.reasoningWeight ?? 0.3;
  const latencyWeight = requirements.latencyWeight ?? 0.2;
  const costWeight = requirements.costWeight ?? 0.15;
  const costScore = 1 / (1 + model.estimatedCost);
  return (
    model.coding * codingWeight +
    model.reasoning * reasoningWeight +
    (LATENCY_SCORE[model.latencyTier] || 0.5) * latencyWeight +
    costScore * costWeight
  );
}

function sortCandidates(candidates, policy, requirements) {
  const list = candidates.slice();
  if (policy === RoutingPolicy.LOWEST_COST) {
    return list.sort((a, b) => a.estimatedCost - b.estimatedCost || b.coding - a.coding || a.id.localeCompare(b.id));
  }
  if (policy === RoutingPolicy.BEST_CODING) {
    return list.sort((a, b) => b.coding - a.coding || b.reasoning - a.reasoning || a.estimatedCost - b.estimatedCost || a.id.localeCompare(b.id));
  }
  return list.sort((a, b) => scoreBalanced(b, requirements) - scoreBalanced(a, requirements) || a.id.localeCompare(b.id));
}

function explainSelection(model, policy, requirements) {
  if (policy === RoutingPolicy.LOCAL_ONLY) return `Selected ${model.id} because the route is restricted to local models.`;
  if (policy === RoutingPolicy.LOWEST_COST) return `Selected ${model.id} as the lowest-cost available model satisfying the task capabilities.`;
  if (policy === RoutingPolicy.BEST_CODING) return `Selected ${model.id} for the strongest coding capability among allowed available models.`;
  if (policy === RoutingPolicy.MANUAL) return `Selected ${model.id} because the user explicitly requested this model.`;
  const privacy = requirements.maxPrivacyClass ? ` within ${requirements.maxPrivacyClass} privacy` : '';
  return `Selected ${model.id} using balanced coding, reasoning, latency and cost scoring${privacy}.`;
}

function routeModel(registry, options = {}) {
  if (!registry || typeof registry.list !== 'function' || typeof registry.get !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'routeModel requires a capability registry');
  }
  const policy = Object.values(RoutingPolicy).includes(options.policy)
    ? options.policy
    : RoutingPolicy.BALANCED;
  const requirements = { ...(options.requirements || {}) };
  if (policy === RoutingPolicy.LOCAL_ONLY) {
    requirements.localOnly = true;
    requirements.maxPrivacyClass = PrivacyClass.LOCAL;
  }

  if (policy === RoutingPolicy.MANUAL) {
    const requested = registry.get(options.manualModelId);
    if (!requested) throw new V4Error(ErrorCode.NOT_FOUND, `manual model not found: ${options.manualModelId}`);
    if (!matchesRequirements(requested, requirements)) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `manual model does not satisfy task requirements: ${requested.id}`);
    }
    return {
      policy,
      selected: requested,
      fallback: [],
      explanation: explainSelection(requested, policy, requirements),
      requirements,
    };
  }

  const eligible = registry.list({ enabledOnly: true }).filter((model) => matchesRequirements(model, requirements));
  if (!eligible.length) {
    throw new V4Error(ErrorCode.NOT_FOUND, 'no available model satisfies the routing requirements', {
      policy,
      requirements,
    });
  }

  const ordered = sortCandidates(eligible, policy, requirements);
  const selected = ordered[0];
  const fallbackLimit = Number.isInteger(options.maxFallbacks) ? Math.max(0, options.maxFallbacks) : 2;
  const fallback = ordered.slice(1, fallbackLimit + 1);

  return {
    policy,
    selected,
    fallback,
    explanation: explainSelection(selected, policy, requirements),
    requirements,
  };
}

function nextFallback(route, failedModelIds = []) {
  if (!route || !route.selected) return null;
  const failed = new Set(failedModelIds);
  if (!failed.has(route.selected.id)) return route.selected;
  return (route.fallback || []).find((model) => !failed.has(model.id)) || null;
}

module.exports = {
  RoutingPolicy,
  matchesRequirements,
  scoreBalanced,
  routeModel,
  nextFallback,
};
