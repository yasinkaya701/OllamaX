'use strict';

/**
 * events.js — Krevyx v3.26 Olay Otobüsü
 *
 * Kapsam:
 *   - Uygulama içi olay yayın/dinleme katmanı (kanal bazlı).
 *   - Kanallar: 'task', 'agent', 'pipeline', 'guard', 'budget', 'session', '*'.
 *   - Throttle: aynı kanalda aynı anahtar ile saniyede en fazla N olay.
 *   - Olay geçmişi: son 1024 olay saklanır; sorgulanabilir.
 *
 * Davranış:
 *   - createBus(opts) → { ok, bus }; bus.on(channel, fn) → abone; bus.off aboneliği kaldırır.
 *   - bus.emit(channel, payload) → { delivered, throttled }; aboneler senkron çağrılır.
 *   - bus.history({channel, limit, since}) → kayıt listesi.
 *   - '*' kanalı tüm olayları dinler; throttle per-bus yapılandırılır.
 *
 * Dönüş:
 *   - emit → { ok, delivered, throttled }; history → { ok, events }.
 *
 * Test:
 *   - testOnlyClear() tüm bus örneklerini temizler.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const DEFAULT_HISTORY_LIMIT = 1024;
const VALID_CHANNELS = new Set(['task', 'agent', 'pipeline', 'guard', 'budget', 'session', 'audit', '*']);

const _buses = new Map();

function createBus(opts = {}) {
  const id = `bus-${crypto.randomBytes(6).toString('hex')}`;
  const bus = {
    id,
    channels: new Map(),
    historyLimit: typeof opts.historyLimit === 'number' ? Math.max(64, Math.min(8192, opts.historyLimit)) : DEFAULT_HISTORY_LIMIT,
    throttleMs: typeof opts.throttleMs === 'number' ? Math.max(0, opts.throttleMs) : 0,
    _history: [],
    _lastEmit: new Map(),
  };
  _buses.set(id, bus);
  return { ok: true, bus };
}

function getBus(id) {
  return _buses.get(id) || null;
}

function normalizeChannel(channel) {
  return VALID_CHANNELS.has(channel) ? channel : 'task';
}

/** Abone ekleme; çift abone engellenir. */
function on(bus, channel, fn) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  if (typeof fn !== 'function') return { ok: false, error: 'Dinleyici fonksiyon gerekli' };
  const ch = normalizeChannel(channel);
  if (!bus.channels.has(ch)) bus.channels.set(ch, []);
  const subs = bus.channels.get(ch);
  if (subs.some((s) => s.fn === fn)) return { ok: false, error: 'Zaten abone' };
  const subscription = { fn, channel: ch, at: Date.now(), active: true };
  subs.push(subscription);
  return { ok: true, channel: ch, subscriptionId: `${ch}-${subs.length}` };
}

function off(bus, channel, fn) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  const ch = normalizeChannel(channel);
  const subs = bus.channels.get(ch);
  if (!subs) return { ok: false, error: 'Kanalda abone yok' };
  const idx = subs.findIndex((s) => s.fn === fn);
  if (idx === -1) return { ok: false, error: 'Abone bulunamadı' };
  subs.splice(idx, 1);
  return { ok: true };
}

/** Olay yayını; throttle uygulanır ve geçmişe yazılır. */
function emit(bus, channel, payload = {}) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  const ch = normalizeChannel(channel);
  const now = Date.now();
  const throttleKey = `${ch}:${payload.key || ''}`;
  if (bus.throttleMs > 0) {
    const last = bus._lastEmit.get(throttleKey) || 0;
    if (now - last < bus.throttleMs) return { ok: true, delivered: 0, throttled: 1 };
    bus._lastEmit.set(throttleKey, now);
  }
  bus._history.push({ channel: ch, payload, at: now, id: `ev-${crypto.randomBytes(4).toString('hex')}` });
  if (bus._history.length > bus.historyLimit) bus._history.splice(0, bus._history.length - bus.historyLimit);
  let delivered = 0;
  for (const subscriber of Array.from(bus.channels.get(ch) || [])) {
    if (!subscriber.active) continue;
    try { subscriber.fn({ channel: ch, payload, at: now }); delivered += 1; } catch (err) { /* dinleyici hatası olayı durdurmaz */ }
  }
  if (ch !== '*') {
    for (const subscriber of Array.from(bus.channels.get('*') || [])) {
      if (!subscriber.active) continue;
      try { subscriber.fn({ channel: ch, payload, at: now }); delivered += 1; } catch (err) { /* atla */ }
    }
  }
  return { ok: true, delivered, throttled: 0 };
}

function history(bus, opts = {}) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  const limit = typeof opts.limit === 'number' ? Math.max(1, Math.min(bus.historyLimit, opts.limit)) : 100;
  const since = typeof opts.since === 'number' ? opts.since : 0;
  let events = bus._history;
  if (opts.channel && opts.channel !== '*') events = events.filter((e) => e.channel === opts.channel);
  events = events.filter((e) => e.at >= since);
  return { ok: true, events: events.slice(-limit) };
}

function clearHistory(bus) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  bus._history = [];
  return { ok: true };
}

function destroy(bus) {
  if (!bus || !_buses.has(bus.id)) return { ok: false, error: 'Bus bulunamadı' };
  for (const subs of bus.channels.values()) subs.length = 0;
  bus.channels.clear();
  _buses.delete(bus.id);
  return { ok: true };
}

function testOnlyClear() {
  _buses.clear();
  return { ok: true };
}

module.exports = {
  createBus,
  getBus,
  on,
  off,
  emit,
  history,
  clearHistory,
  destroy,
  testOnlyClear,
  VALID_CHANNELS,
  DEFAULT_HISTORY_LIMIT,
};
