'use strict';

/**
 * allowlist.js — Krevyx v3.26 Araç İzin Listesi
 *
 * Kapsam:
 *   - Çalıştırılabilir araçların beyaz listesi (mod kapalıysa tüm araçlar izinli).
 *   - enableMode(true) → yalnız listedeki araçlar çalışır; check(toolId) denetler.
 *   - Add/remove ile liste yönetimi; wildcard desenler desteklenmez (açık liste).
 *
 * Davranış:
 *   - check(toolId) → mod kapalıysa her zaman { ok, allowed:true }.
 *   - enableMode(false) → allowlist devre dışı, tüm araçlar açık.
 *
 * Dönüş:
 *   - check → { ok, allowed, reason? }
 *
 * Test:
 *   - testOnlyClear() modu kapalı ve listeyi boş döndürür.
 *
 * @version 3.26.0
 */

let _enabled = false;
const _list = new Set();

function enableMode(on) {
  _enabled = on === true;
  return { ok: true, enabled: _enabled, count: _list.size };
}

function isEnabled() {
  return { ok: true, enabled: _enabled };
}

function add(toolId) {
  if (!toolId || typeof toolId !== 'string') return { ok: false, error: 'Araç kimliği gerekli' };
  if (_list.has(toolId)) return { ok: true, already: true };
  _list.add(toolId);
  return { ok: true, count: _list.size };
}

function addMany(ids) {
  if (!Array.isArray(ids)) return { ok: false, error: 'Liste gerekli' };
  const added = [];
  for (const id of ids) {
    if (typeof id === 'string' && id.length && !_list.has(id)) {
      _list.add(id);
      added.push(id);
    }
  }
  return { ok: true, added, count: _list.size };
}

function remove(toolId) {
  if (!_list.has(toolId)) return { ok: false, error: 'Araç listede değil' };
  _list.delete(toolId);
  return { ok: true, count: _list.size };
}

function list() {
  return { ok: true, enabled: _enabled, tools: Array.from(_list).sort() };
}

function check(toolId) {
  if (!_enabled) return { ok: true, allowed: true };
  if (!toolId || typeof toolId !== 'string') return { ok: true, allowed: false, reason: 'Araç kimliği gerekli' };
  if (_list.has(toolId)) return { ok: true, allowed: true };
  return { ok: true, allowed: false, reason: `Araç izin listesinde değil: ${toolId}` };
}

function clear() {
  _list.clear();
  return { ok: true };
}

function testOnlyClear() {
  _enabled = false;
  _list.clear();
  return { ok: true };
}

module.exports = {
  enableMode,
  isEnabled,
  add,
  addMany,
  remove,
  list,
  check,
  clear,
  testOnlyClear,
};
