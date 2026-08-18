'use strict';

/**
 * quarantine.js — Krevyx v3.26 Karantina Kayıt Defteri
 *
 * Kapsam:
 *   - diff-gate tarafından işaretlenen riskli dosyaların karantina altında tutulması.
 *   - put(path, reason) → dosyayı karantinaya alır; onay almadan kullanılmaz.
 *   - isQuarantined(path) → { ok, quarantined, reason?, since? }.
 *   - release(path) → karantinadan çıkarır (onay sonrası).
 *
 * Davranış:
 *   - Karantina listesi bellekte tutulur; persistence store'dan beslenebilir.
 *
 * Dönüş:
 *   - put → { ok, path, reason } | { ok:false, error }
 *   - release → { ok } | { ok:false, error }
 *
 * Test:
 *   - testOnlyClear() karantinayı boşaltır.
 *
 * @version 3.26.0
 */

const pathMod = require('path');

const _quarantine = new Map();

function put(filePath, reason) {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'Dosya yolu gerekli' };
  const norm = pathMod.normalize(filePath);
  _quarantine.set(norm, { path: norm, reason: reason || 'Diff kapısı tarafından işaretlendi', since: Date.now() });
  return { ok: true, path: norm, count: _quarantine.size };
}

function isQuarantined(filePath) {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'Dosya yolu gerekli' };
  const norm = pathMod.normalize(filePath);
  const entry = _quarantine.get(norm);
  if (!entry) return { ok: true, quarantined: false };
  return { ok: true, quarantined: true, reason: entry.reason, since: entry.since };
}

function release(filePath) {
  if (!filePath || typeof filePath !== 'string') return { ok: false, error: 'Dosya yolu gerekli' };
  const norm = pathMod.normalize(filePath);
  if (!_quarantine.delete(norm)) return { ok: false, error: 'Dosya karantinada değil' };
  return { ok: true, count: _quarantine.size };
}

function list() {
  return { ok: true, files: Array.from(_quarantine.values()) };
}

function clear() {
  _quarantine.clear();
  return { ok: true };
}

function testOnlyClear() {
  return clear();
}

module.exports = {
  put,
  isQuarantined,
  release,
  list,
  clear,
  testOnlyClear,
};
