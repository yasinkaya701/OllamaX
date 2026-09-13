/**
 * ipc-bridge.js — IPC API sürümleme köprüsü (ADR-002)
 *
 * Yeni uç noktalar ipc:3:* namespace'inde çalışır. Eski uç nokta isimleri
 * (v2 uyumu, eklentiler için) bu köprü üzerinden yeni isimlere yönlendirilir.
 */

'use strict';

const path = require('path');
const { ipcMain, app } = require('electron');
const configStore = require('./config/config-store');
const { withFeature, isFeatureEnabled } = require('./config/feature-flags');
const { bootstrapV4Runtime } = require('./v4/bootstrap');
const { installLifecycleExtension } = require('./v4/runtime/lifecycle-extension');
const { registerPlanningExtension } = require('./v4/runtime/planning-extension');

const LEGACY_TO_V3 = {
  'get-model-catalog': 'ipc:3:get-model-catalog',
  'normalize-ollama-host': 'ipc:3:normalize-ollama-host',
  'persist-save': 'ipc:3:persist-save',
  'persist-load': 'ipc:3:persist-load',
  'app-health': 'ipc:3:app-health',
  'get-stats': 'ipc:3:get-stats',
  'get-workspaces': 'ipc:3:get-workspaces',
  'hardware-profile': 'ipc:3:hardware-profile',
  'get-team-presets': 'ipc:3:get-team-presets',
  'scan-project': 'ipc:3:scan-project',
  'write-project-doc': 'ipc:3:write-project-doc',
  'export-to-path': 'ipc:3:export-to-path',
  'fetch-provider-models': 'ipc:3:fetch-provider-models',
  'open-path': 'ipc:3:open-path',
};

let v4Runtime = null;
let v4Planning = null;
let controlHandlersRegistered = false;

function forwardLegacy(legacyName, v3Name) {
  try {
    ipcMain.handle(legacyName, async (event, ...args) => {
      try {
        return await event.sender.invoke(v3Name, ...args);
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    return true;
  } catch {
    return false;
  }
}

function attachV4Extensions(runtime) {
  if (!runtime || runtime.enabled !== true) return null;
  installLifecycleExtension(runtime);
  if (!v4Planning) {
    v4Planning = registerPlanningExtension(ipcMain, {
      runtime,
      configReader: () => configStore.readConfig(),
    });
  }
  return { planning: v4Planning };
}

function bootstrapV4IfEnabled() {
  if (v4Runtime && v4Runtime.enabled === true) {
    attachV4Extensions(v4Runtime);
    return v4Runtime;
  }
  if (!app || typeof app.getPath !== 'function') return { enabled: false, reason: 'electron-app-unavailable' };
  const rootDir = path.join(app.getPath('userData'), 'Krevyx', 'v4');
  const candidate = bootstrapV4Runtime({
    rootDir,
    ipcMain,
    configReader: () => configStore.readConfig(),
  });
  v4Runtime = candidate;
  if (candidate.enabled === true) attachV4Extensions(v4Runtime);
  return candidate;
}

function registerV4ControlHandlers() {
  if (controlHandlersRegistered) return true;
  const handlers = {
    'ipc:3:v4-feature-status': async () => {
      const config = configStore.readConfig() || {};
      return { ok: true, enabled: isFeatureEnabled(config, 'v4Workspace') };
    },
    'ipc:3:v4-feature-set': async (_event, payload = {}) => {
      const enabled = payload.enabled === true;
      const config = configStore.updateConfig((current) => withFeature(current, 'v4Workspace', enabled));
      let runtime = null;
      if (enabled) runtime = bootstrapV4IfEnabled();
      return {
        ok: true,
        enabled: isFeatureEnabled(config, 'v4Workspace'),
        runtimeReady: Boolean(runtime && runtime.enabled === true),
      };
    },
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    try { ipcMain.handle(channel, handler); } catch { /* already registered */ }
  }
  controlHandlersRegistered = true;
  return true;
}

function registerIpcBridge() {
  const results = {};
  for (const [legacy, v3] of Object.entries(LEGACY_TO_V3)) {
    results[legacy] = forwardLegacy(legacy, v3);
  }
  registerV4ControlHandlers();
  try {
    bootstrapV4IfEnabled();
  } catch (error) {
    console.error('[Krevyx] v4 bootstrap failed:', error && error.message ? error.message : error);
  }
  return results;
}

function getV4Runtime() {
  return v4Runtime;
}

function getV4Planning() {
  return v4Planning;
}

module.exports = {
  LEGACY_TO_V3,
  forwardLegacy,
  attachV4Extensions,
  bootstrapV4IfEnabled,
  registerV4ControlHandlers,
  registerIpcBridge,
  getV4Runtime,
  getV4Planning,
};
