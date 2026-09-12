'use strict';

/**
 * v4 feature flags are default-deny. Missing values are treated as false so
 * older/fresh configs cannot accidentally enable unfinished v4 surfaces.
 */
const FEATURE_DEFAULTS = Object.freeze({
  v4Workspace: false,
});

function normalizeFeatures(config) {
  const current = config && typeof config.features === 'object' && !Array.isArray(config.features)
    ? config.features
    : {};
  return {
    ...FEATURE_DEFAULTS,
    ...current,
    v4Workspace: current.v4Workspace === true,
  };
}

function isFeatureEnabled(config, name) {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, name)) return false;
  return normalizeFeatures(config)[name] === true;
}

function withFeature(config, name, enabled) {
  if (!Object.prototype.hasOwnProperty.call(FEATURE_DEFAULTS, name)) {
    throw new Error(`Bilinmeyen feature flag: ${name}`);
  }
  return {
    ...(config || {}),
    features: {
      ...normalizeFeatures(config || {}),
      [name]: enabled === true,
    },
  };
}

module.exports = {
  FEATURE_DEFAULTS,
  normalizeFeatures,
  isFeatureEnabled,
  withFeature,
};
