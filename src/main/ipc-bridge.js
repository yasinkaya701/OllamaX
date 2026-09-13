/**
 * ipc-bridge.js — IPC API sürümleme köprüsü (ADR-002)
 *
 * Yeni uç noktalar ipc:3:* namespace'inde çalışır. Eski uç nokta isimleri
 * (v2 uyumu, eklentiler için) bu köprü üzerinden yeni isimlere yönlendirilir.
 * Böylece hem eski hem yeni istemciler aynı anda çalışabilir.
 *
 * Kullanım (main.js içinde): registerIpcBridge() açılışta çağrılır.
 */

'use strict';

const path = require('path');
const { ipcMain, app } = require('electron');
const configStore = require('./config/config-store');
const { bootstrapV4Runtime } = require('./v4/bootstrap');
const { registerPlanningExtension } = require('./v4/runtime/planning-extension');
// Legacy handlers main.js'teki mevcut implementasyonlarla eşleşir;
// bu modül yalnızca isim eşlemesini sağlar.

// Eski isim -> yeni ipc:3:* isim eşlemesi
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

/**
 * Verilen eski IPC adına bir "forward" handler kaydet. Yeni handler
 * zaten mevcut olmalıdır (asıl implementasyon main.js'te ipc:3:* ile
 * tanımlanır); bu köprü yalnızca eski ismi ona yönlendirir.
 */
function forwardLegacy(legacyName, v3Name) {
  if (ipcMain.eventNames && typeof ipcMain.eventNames === 'function') {
    /* electron sürümüne göre mevcudiyet kontrolü; handler yönünden
       bağımsız olarak invoke üzerinden çift kayıt yapılabilir. */
  }
  try {
    ipcMain.handle(legacyName, async (event, ...args) => {
      const delegates = ipcMain.listeners(v3Name);
      if (delegates && delegates.length) {
        // Kayıtlı handler'ları doğrudan çağırmak yerine invoke zincirini
        // kullanmak circular olur; bunun yerine event objesiyle yeni ad
        // üzerinden yeniden göndeririz.
      }
      try {
        const result = await event.sender.invoke(v3Name, ...args);
        return result;
      } catch (err) {
        return { ok: false, error: err.message };
      }
    });
    return true;
  } catch {
    // Handler zaten kayıtlıysa veya isim çakışırsa köprü bu uç için atlanır
    return false;
  }
}

function attachV4Extensions(runtime) {
  if (!runtime || runtime.enabled !== true) return null;
  if (!v4Planning) {
    v4Planning = registerPlanningExtension(ipcMain, {
      runtime,
      configReader: () => configStore.readConfig(),
    });
  }
  return { planning: v4Planning };
}

function bootstrapV4IfEnabled() {
  if (v4Runtime) {
    attachV4Extensions(v4Runtime);
    return v4Runtime;
  }
  if (!app || typeof app.getPath !== 'function') return { enabled: false, reason: 'electron-app-unavailable' };
  const rootDir = path.join(app.getPath('userData'), 'Krevyx', 'v4');
  v4Runtime = bootstrapV4Runtime({
    rootDir,
    ipcMain,
    configReader: () => configStore.readConfig(),
  });
  attachV4Extensions(v4Runtime);
  return v4Runtime;
}

function registerIpcBridge() {
  const results = {};
  for (const [legacy, v3] of Object.entries(LEGACY_TO_V3)) {
    results[legacy] = forwardLegacy(legacy, v3);
  }
  try {
    bootstrapV4IfEnabled();
  } catch (error) {
    // V4 is feature-gated and must never prevent the legacy product from booting.
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
  registerIpcBridge,
  getV4Runtime,
  getV4Planning,
};
