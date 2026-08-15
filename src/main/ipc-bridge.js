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

const { ipcMain } = require('electron');
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

function registerIpcBridge() {
  const results = {};
  for (const [legacy, v3] of Object.entries(LEGACY_TO_V3)) {
    results[legacy] = forwardLegacy(legacy, v3);
  }
  return results;
}

module.exports = {
  LEGACY_TO_V3,
  forwardLegacy,
  registerIpcBridge,
};
