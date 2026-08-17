/**
 * secrets-vault.js — Krevyx v3.14 Gizli Anahtar Kasası (A1-1)
 *
 * Amaç: API anahtarları asla düz metin olarak diskte (config.json / localStorage)
 * saklanmaz. Bu modül OS-native şifreli depolamayı kullanır:
 *
 *   macOS      -> Keychain  (keytar, service "Krevyx")
 *   Windows    -> DPAPI/CredUI (keytar)
 *   Linux      -> libsecret (keytar) — Secret Service dbus ile
 *
 * Tasarım ilkeleri:
 *  - "Graceful degradation": keytar yüklenemezse (native build sorunu,
 *    headless ortamlar, ARM Linux'un bazı dağıtımları) kasadan haberdar
 *    ama "pasif" modda çalışır; anahtarlar memory-only (in-process Map)
 *    tutulur. Diskte düz metin asla yazılmaz — bu modda anahtar yalnız
 *    uygulama ömrü boyunca saklanır, kapanınca uçur.
 *  - config.json yalnızca "VAULT:keytar:account-id" referansı tutar.
 *  - Tüm anahtarlar tek bir service ("Krevyx") altında ayrı account
 *    kimlikleriyle saklanır; service adı sabit kalır.
 *  - Migration: mevcut localStorage'ındaki düz metin anahtarlar ilk
 *    kaydetmede kasaya taşınır (migrateKeysFromDisk). Taşıma, düz metin
 *    disk verisini siler.
 */

'use strict';

let keytar = null;
try {
  keytar = require('keytar');
} catch {
  keytar = null;
}

const SERVICE = 'Krevyx';
const ACCOUNT_PREFIX = 'provider.';

// Memory-only fallback (keytar unavailable): process ömrü boyunca yaşar.
const memoryStore = new Map();

/**
 * Kasanın kullanılabilirlik durumu.
 *  - 'native'  : OS keychain erişilebilir (önerilen)
 *  - 'memory'  : keytar yok; anahtarlar yalnızca bellekte (kapanınca uçur)
 *  - 'error'   : keytar var ama erişim hatası
 */
let availability = keytar ? 'native' : 'memory';

function setAvailability(mode) {
  availability = mode;
}

function getAvailability() {
  return availability;
}

function accountFor(provider) {
  return `${ACCOUNT_PREFIX}${String(provider || '').replace(/[^A-Za-z0-9._-]+/g, '').slice(0, 80)}`;
}

/**
 * Bir anahtarı kasaya yazar. provider boşsa yazmaz.
 * @returns {{ ok: boolean, mode: string, error?: string }}
 */
async function setKey(provider, key) {
  const providerKey = String(provider || '').trim();
  if (!providerKey) return { ok: false, mode: availability, error: 'Sağlayıcı belirtilmedi' };

  // Boş anahtar = kaldırmak anlamına gelir
  const effectiveKey = typeof key === 'string' ? key.trim() : '';
  if (!effectiveKey) return removeKey(providerKey);

  try {
    if (keytar) {
      await keytar.setPassword(SERVICE, accountFor(providerKey), effectiveKey);
      memoryStore.set(providerKey, effectiveKey);
      return { ok: true, mode: 'native' };
    }
    // keytar yoksa memory-only
    memoryStore.set(providerKey, effectiveKey);
    return { ok: true, mode: 'memory' };
  } catch (err) {
    // v3.23: Secret Service daemon yokken (CI, sunucu, headless ortam) keytar
    // operasyonu çöker — kasa memory moduna düşer ve işlem yine başarılı sayılır.
    // Anahtar diskte düz metin olarak asla saklanmaz; süreç ömrü boyunca bellekte yaşar.
    setAvailability('memory');
    memoryStore.set(providerKey, effectiveKey);
    return { ok: true, mode: 'memory', warn: err?.message || 'Native kasa erişilemedi — memory modu kullanıldı' };
  }
}

/**
 * Anahtarı kasadan okur. Yoksa boş string döner (null-safe).
 */
async function getKey(provider) {
  const providerKey = String(provider || '').trim();
  if (!providerKey) return '';
  try {
    if (keytar) {
      const v = await keytar.getPassword(SERVICE, accountFor(providerKey));
      const value = typeof v === 'string' ? v : '';
      memoryStore.set(providerKey, value);
      return value;
    }
    return memoryStore.get(providerKey) || '';
  } catch {
    setAvailability('memory');
    return memoryStore.get(providerKey) || '';
  }
}

/**
 * Anahtarı kasadan siler (hem native hem memory).
 */
async function removeKey(provider) {
  const providerKey = String(provider || '').trim();
  if (!providerKey) return { ok: true, mode: availability };
  memoryStore.delete(providerKey);
  try {
    await keytar.deletePassword(SERVICE, accountFor(providerKey));
    return { ok: true, mode: availability };
  } catch {
    setAvailability('memory');
    return { ok: true, mode: 'memory' };
  }
}

/**
 * Kasa durum özeti — UI için tek çağrı.
 * v3.18.1: Linux'ta Secret Service (dbus) daemonu yokken keytar operasyonları
 * asla tamamlanmaz; ilk erişimde gerçek bir probe yapılıp ulaşılamıyorsa
 * kasadan haberdar ama 'memory' moduna düşülür (sonsuz askıyı engeller).
 */
let probeDone = false;
async function probeKeytar() {
  if (probeDone || !keytar) return;
  probeDone = true;
  try {
    // Hızlı probe: var olmayan bir account'u sorgula — dbus yoksa bu asla dönmez.
    await Promise.race([
      keytar.getPassword(SERVICE, '__krevyx__probe__'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('probe-timeout')), 2000)),
    ]);
  } catch {
    setAvailability('memory');
  }
}

async function vaultStatus() {
  await probeKeytar();
  const nativeAvailable = keytar !== null && availability !== 'error';
  return {
    available: nativeAvailable || availability === 'memory',
    mode: availability,
    native: Boolean(keytar),
    service: SERVICE,
  };
}

module.exports = {
  setKey,
  getKey,
  removeKey,
  vaultStatus,
  setAvailability,
  getAvailability,
  SERVICE,
  ACCOUNT_PREFIX,
};
