'use strict';

/**
 * workspace.js — Krevyx v3.26 Çalışma Alanı Yönetimi
 *
 * Kapsam:
 *   - Proje başına çalışma alanı tanımı: kök dizin, include/exclude desenleri, kurallar.
 *   - Kural seti: hangi işlem türleri izinli (write, execute, delete, network).
 *   - Yol kapsamı: işlem hedefi workspace dışında ise reddedilir.
 *   - Workspace durumu: active/inactive; varsayılan workspace seçimi.
 *
 * Davranış:
 *   - createWorkspace(spec) → { ok, workspace }; spec { id?, root, rules, include?, exclude? }.
 *   - checkPath(workspace, path, operation) → { ok, allowed, reason? }.
 *   - checkOperation(workspace, operation) → { ok, allowed, reason? }.
 *   - activate/deactivate/destroy; varsayılan workspace işlemlerde otomatik kullanılır.
 *
 * Dönüş:
 *   - checkPath/checkOperation → { ok, allowed, reason? }
 *
 * Test:
 *   - root dışı yol her zaman reddedilir; exclude deseni eşleşen yol reddedilir.
 *   - testOnlyClear() tüm workspace'leri temizler.
 *
 * @version 3.26.0
 */

const pathMod = require('path');
const crypto = require('crypto');

const OPERATIONS = new Set(['read', 'write', 'execute', 'delete', 'network']);
const DEFAULT_RULES = { read: true, write: true, execute: true, delete: false, network: true };

const _workspaces = new Map();
let _defaultId = null;

function createWorkspace(spec = {}) {
  const id = spec.id || `ws-${crypto.randomBytes(6).toString('hex')}`;
  if (!spec.root || typeof spec.root !== 'string') return { ok: false, error: 'Kök dizin gerekli' };
  const root = pathMod.resolve(spec.root);
  const include = Array.isArray(spec.include) ? spec.include.filter((d) => typeof d === 'string' && d.length) : [];
  const exclude = Array.isArray(spec.exclude) ? spec.exclude.filter((d) => typeof d === 'string' && d.length) : [];
  const rules = { ...DEFAULT_RULES, ...(spec.rules && typeof spec.rules === 'object' ? spec.rules : {}) };
  const workspace = {
    id,
    name: spec.name || id,
    root,
    include,
    exclude,
    rules,
    active: true,
    createdAt: Date.now(),
  };
  for (const op of Object.keys(rules)) { if (!OPERATIONS.has(op)) { rules[op] = false; } }
  _workspaces.set(id, workspace);
  if (!_defaultId) _defaultId = id;
  return { ok: true, workspace };
}

function getWorkspace(id) {
  return _workspaces.get(id) || null;
}

function getDefault() {
  return _defaultId ? _workspaces.get(_defaultId) || null : null;
}

function activate(id) {
  const ws = _workspaces.get(id);
  if (!ws) return { ok: false, error: 'Workspace bulunamadı' };
  ws.active = true;
  _defaultId = id;
  return { ok: true };
}

function deactivate(id) {
  const ws = _workspaces.get(id);
  if (!ws) return { ok: false, error: 'Workspace bulunamadı' };
  ws.active = false;
  if (_defaultId === id) _defaultId = null;
  return { ok: true };
}

function pathInScope(workspace, target) {
  const resolved = pathMod.resolve(target);
  const rel = pathMod.relative(workspace.root, resolved);
  if (rel === '' || (!rel.startsWith('..') && !pathMod.isAbsolute(rel))) return { inside: true, rel };
  return { inside: false, rel };
}

function matchesExclude(workspace, relPath) {
  for (const pattern of workspace.exclude) {
    const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/\\\\]*'), 'i');
    if (re.test(relPath)) return true;
  }
  return false;
}

function checkPath(workspace, target, operation) {
  if (!workspace || !_workspaces.has(workspace.id)) return { ok: false, error: 'Workspace bulunamadı' };
  const op = OPERATIONS.has(operation) ? operation : 'read';
  const scope = pathInScope(workspace, target);
  if (!scope.inside) return { ok: true, allowed: false, reason: 'Yol workspace kökü dışında' };
  if (matchesExclude(workspace, scope.rel)) return { ok: true, allowed: false, reason: 'Yol exclude deseninde' };
  if (!workspace.rules[op]) return { ok: true, allowed: false, reason: `İşlem izinli değil: ${op}` };
  return { ok: true, allowed: true };
}

function checkOperation(workspace, operation) {
  if (!workspace || !_workspaces.has(workspace.id)) return { ok: false, error: 'Workspace bulunamadı' };
  const op = OPERATIONS.has(operation) ? operation : 'read';
  return { ok: true, operation: op, allowed: !!workspace.rules[op] };
}

function listWorkspaces() {
  return { ok: true, workspaces: Array.from(_workspaces.values()).map((w) => ({ id: w.id, name: w.name, root: w.root, active: w.active, default: _defaultId === w.id })) };
}

function destroy(id) {
  if (!_workspaces.has(id)) return { ok: false, error: 'Workspace bulunamadı' };
  _workspaces.delete(id);
  if (_defaultId === id) _defaultId = null;
  return { ok: true };
}

function testOnlyClear() {
  _workspaces.clear();
  _defaultId = null;
  return { ok: true };
}

module.exports = {
  createWorkspace,
  getWorkspace,
  getDefault,
  activate,
  deactivate,
  checkPath,
  checkOperation,
  listWorkspaces,
  destroy,
  testOnlyClear,
  OPERATIONS,
  DEFAULT_RULES,
};
