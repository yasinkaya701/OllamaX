/**
 * network-mode.js — Krevyx v3.14 Ağ Modu (A1-2)
 *
 * `network.mode` ayarı:
 *   - 'normal'     : varsayılan; tüm sağlayıcılar ve arka plan işler aktif
 *   - 'local-only' : air-gapped; tüm bulut sağlayıcıları devre dışı,
 *                    sadece Ollama/yerel endpoint'ler çalışır; otomatik
 *                    güncelleme ve keşif yenilemesi dahil her outbound
 *                    bağlantı engellenir
 *
 * Uygulama mantığı:
 *  - isCloudProviderAllowed(provider) — chat/dispatch katmanının her istek
 *    öncesi sorguladığı kararlaştırıcı
 *  - isOutboundAllowed(reason) — daha genel amaçlı kapı (UI güncelleme
 *    kontrolleri, featured-repos yenilemesi, CLI keşif vs. öncesi)
 *  - config değişikliği canlı okunur (config-store.readConfig), cache
 *    yoktur; toggle anında tüm uçlara yansır.
 */

'use strict';

let configStore = null;

function setConfigStore(store) {
  configStore = store;
}

function readMode() {
  try {
    const app = configStore?.readConfig?.()?.app;
    const mode = app?.network?.mode;
    if (mode === 'local-only') return 'local-only';
    return 'normal';
  } catch {
    return 'normal';
  }
}

/**
 * Bulut sağlayıcılarına istek yapılabilecek mi?
 * Yerel sağlayıcılar (ollama, lm-studio, any localhost) her durumda açık;
 * 'local-only' modda bunlar dahi yalnızca loopback/local subnet'e iner
 * (host doğrulaması normalize-ollama-host tarafında yapılır).
 */
function isCloudProviderAllowed(provider) {
  if (!provider) return false;
  const localProviders = new Set(['ollama', 'lmstudio', 'local']);
  if (localProviders.has(String(provider).toLowerCase())) return true;
  if (readMode() === 'local-only') return false;
  return true;
}

/**
 * Genel outbound kapısı. reason: neyin ağa çıkmak istediğini etiketler
 * (ör. 'update-check', 'featured-refresh', 'chat'). UI gösterimi için
 * engellenen eylemlerin nedeni loglanır.
 */
function isOutboundAllowed(reason = '') {
  if (readMode() !== 'local-only') return true;
  return false;
}

/**
 * Belirli bir host:port'un 'local-only' modda izinli olup olmadığı.
 * Loopback (127.0.0.1/::1/localhost) ve RFC1918 private aralıklar izinli;
 * tüm public IP'ler engelli.
 */
function isHostLocal(host) {
  if (!host) return false;
  let h = String(host).trim().toLowerCase();
  // "http://" gibi şemaları kırp
  h = h.replace(/^https?:\/\//, '');
  // Yolu kırp ama sadece ilk /'den sonra (host:port/path formatında)
  if (h.includes('/')) h = h.slice(0, h.indexOf('/'));
  if (['localhost', '[::1]', '::1'].includes(h)) return true;
  // host:port formatındaki yerel isimleri de kabul et: localhost:11434
  const hostOnly = h.split(':')[0];
  if (hostOnly === 'localhost') return true;
  // IPv6 parantez bloğu içindeki portu kırp: [::1]:11434 -> ::1
  const m = h.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (m) {
    const inner = m[1];
    return inner === '::1' || inner === '127.0.0.1' || ['localhost'].includes(inner);
  }
  const ip = h.split(':')[0];
  if (ip === '127.0.0.1') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // link-local
  }
  return false;
}

function getNetworkMode() {
  return readMode();
}

module.exports = {
  setConfigStore,
  isCloudProviderAllowed,
  isOutboundAllowed,
  isHostLocal,
  getNetworkMode,
};
