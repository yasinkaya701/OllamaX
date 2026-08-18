'use strict';

/**
 * state-store.js — Krevyx v3.26 Durum Deposu
 *
 * Kapsam:
 *   - Modüller arası paylaşımlı anahtar-değer deposu; ad alanı (namespace) bazlı.
 *   - Ad alanları: 'plans', 'agents', 'queues', 'guards', 'budgets', 'sessions', 'meta'.
 *   - TTL desteği: anahtarlar süre sonunda otomatik sonlanır (lazy expiry + prune).
 *   - Değişim aboneliği: set/delete olayları dinleyicilere bildirilir.
 *
 * Davranış:
 *   - createStore(opts) → { ok, store }; store.set/get/delete/list/nsKeys.
 *   - subscribe(ns, fn) / unsubscribe; değişim { type:'set|delete', ns, key, value? } alır.
 *   - prune() süresi dolmuş anahtarları boşaltır; lazy get zaten expired değerleri atar.
 *   - maxKeys ad alanı başına 2048 ile sınırlıdır; taşınca en eski TTL'siz anahtar silinir.
 *
 * Dönüş:
 *   - set → { ok, key, expiryAt? }; get → { ok, value } | { ok:false, error }
 *
 * Test:
 *   - testOnlyClear() tüm depoları temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const NAMESPACES = new Set(['plans', 'agents', 'queues', 'guards', 'budgets', 'sessions', 'meta', 'shared']);
const MAX_KEYS_PER_NS = 2048;
const MAX_TTL_MS = 24 * 3600 * 1000;

const _stores = new Map();

function createStore(opts = {}) {
  const id = `st-${crypto.randomBytes(6).toString('hex')}`;
  const store = {
    id,
    ns: new Map(),
    subs: new Map(),
    maxKeys: typeof opts.maxKeys === 'number' ? Math.max(64, Math.min(16384, opts.maxKeys)) : MAX_KEYS_PER_NS,
  };
  _stores.set(id, store);
  return { ok: true, store };
}

function getStore(id) {
  return _stores.get(id) || null;
}

function ensureNs(store, ns) {
  const name = NAMESPACES.has(ns) ? ns : 'shared';
  if (!store.ns.has(name)) store.ns.set(name, new Map());
  return name;
}

function notify(store, change) {
  const nsSubs = store.subs.get(change.ns) || [];
  const allSubs = store.subs.get('*') || [];
  for (const fn of nsSubs) { try { fn(change); } catch (err) { /* atla */ } }
  for (const fn of allSubs) { try { fn(change); } catch (err) { /* atla */ } }
}

function set(store, ns, key, value, opts = {}) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  if (!key || typeof key !== 'string') return { ok: false, error: 'Anahtar gerekli' };
  const name = ensureNs(store, ns);
  const bucket = store.ns.get(name);
  if (bucket.size >= store.maxKeys) {
    let evicted = null;
    for (const [k, entry] of bucket.entries()) {
      if (!entry.ttlAt) { evicted = k; break; }
    }
    if (evicted) bucket.delete(evicted);
    else return { ok: false, error: `Ad alanı dolu: ${name}` };
  }
  const entry = { value, createdAt: Date.now(), ttlAt: null };
  if (typeof opts.ttlMs === 'number' && opts.ttlMs > 0) {
    entry.ttlAt = Date.now() + Math.min(MAX_TTL_MS, Math.max(1000, opts.ttlMs));
  }
  bucket.set(key, entry);
  notify(store, { type: 'set', ns: name, key, value: entry.value });
  return { ok: true, ns: name, key, expiryAt: entry.ttlAt };
}

function get(store, ns, key) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  if (!key) return { ok: false, error: 'Anahtar gerekli' };
  const name = ensureNs(store, ns);
  const bucket = store.ns.get(name);
  const entry = bucket.get(key);
  if (!entry) return { ok: false, error: `Anahtar yok: ${key}` };
  if (entry.ttlAt && Date.now() > entry.ttlAt) {
    bucket.delete(key);
    notify(store, { type: 'delete', ns: name, key });
    return { ok: false, error: 'Anahtarın süresi doldu' };
  }
  return { ok: true, ns: name, key, value: entry.value };
}

function del(store, ns, key) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  if (!key) return { ok: false, error: 'Anahtar gerekli' };
  const name = ensureNs(store, ns);
  const bucket = store.ns.get(name);
  if (!bucket.delete(key)) return { ok: false, error: `Anahtar yok: ${key}` };
  notify(store, { type: 'delete', ns: name, key });
  return { ok: true };
}

function list(store, ns, opts = {}) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  const limit = typeof opts.limit === 'number' ? Math.max(1, Math.min(4096, opts.limit)) : 256;
  const out = [];
  for (const [name, bucket] of store.ns.entries()) {
    if (ns && name !== ns) continue;
    for (const [key, entry] of bucket.entries()) {
      if (entry.ttlAt && Date.now() > entry.ttlAt) { bucket.delete(key); continue; }
      out.push({ ns: name, key, ttlAt: entry.ttlAt, value: opts.values ? entry.value : undefined });
      if (out.length >= limit) break;
    }
    if (out.length >= limit) break;
  }
  return { ok: true, entries: out };
}

function nsKeys(store, ns) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  const name = ensureNs(store, ns);
  return { ok: true, ns: name, keys: Array.from(store.ns.get(name).keys()) };
}

function subscribe(store, ns, fn) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  if (typeof fn !== 'function') return { ok: false, error: 'Dinleyici fonksiyon gerekli' };
  const name = NAMESPACES.has(ns) || ns === '*' ? ns : 'shared';
  if (!store.subs.has(name)) store.subs.set(name, []);
  const subs = store.subs.get(name);
  if (subs.includes(fn)) return { ok: false, error: 'Zaten abone' };
  subs.push(fn);
  return { ok: true, channel: name };
}

function unsubscribe(store, ns, fn) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  const name = NAMESPACES.has(ns) || ns === '*' ? ns : 'shared';
  const subs = store.subs.get(name);
  if (!subs) return { ok: false, error: 'Kanalda abone yok' };
  const idx = subs.indexOf(fn);
  if (idx === -1) return { ok: false, error: 'Abone bulunamadı' };
  subs.splice(idx, 1);
  return { ok: true };
}

function prune(store) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  const now = Date.now();
  let removed = 0;
  for (const bucket of store.ns.values()) {
    for (const [key, entry] of bucket.entries()) {
      if (entry.ttlAt && now > entry.ttlAt) { bucket.delete(key); removed += 1; }
    }
  }
  return { ok: true, removed };
}

function clearNs(store, ns) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  const name = ensureNs(store, ns);
  const bucket = store.ns.get(name);
  const count = bucket.size;
  bucket.clear();
  return { ok: true, ns: name, cleared: count };
}

function destroy(store) {
  if (!store || !_stores.has(store.id)) return { ok: false, error: 'Depo bulunamadı' };
  store.ns.clear();
  store.subs.clear();
  _stores.delete(store.id);
  return { ok: true };
}

function testOnlyClear() {
  _stores.clear();
  return { ok: true };
}

module.exports = {
  createStore,
  getStore,
  set,
  get,
  del,
  list,
  nsKeys,
  subscribe,
  unsubscribe,
  prune,
  clearNs,
  destroy,
  testOnlyClear,
  NAMESPACES,
  MAX_KEYS_PER_NS,
};
