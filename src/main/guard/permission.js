'use strict';

/**
 * permission.js — Krevyx v3.26 İzin Modeli (RBAC Temeli)
 *
 * Kapsam:
 *   - Rol tabanlı yetki denetimi: rol → yetenek (capability) kümesi.
 *   - Yerleşik roller: admin, lead, orchestrator, agent, viewer.
 *   - Yetenekler: tools.*, pipeline.*, swarm.*, vault.*, guard.*, workspace.*, runtime.*.
 *   - check(role, capability) → { ok, allowed, reason? }.
 *   - Rol oluşturma: defineRole(name, capabilities) → { ok }.
 *
 * Davranış:
 *   - Bilinmeyen yetenek wildcard ile kontrol edilir: tools.* her tools.xxx'i kapsar.
 *   - admin her yeteneğe sahip; viewer salt okuma.
 *
 * Dönüş:
 *   - check → { ok, allowed, reason? }
 *
 * Test:
 *   - testOnlyClear() özel rolleri temizler.
 *
 * @version 3.26.0
 */

const BASE_ROLES = {
  admin: ['*'],
  lead: ['tools.*', 'pipeline.*', 'swarm.*', 'guard.read', 'guard.allowlist.*', 'workspace.*', 'runtime.*', 'vault.read'],
  orchestrator: ['tools.read', 'tools.run.readonly', 'pipeline.*', 'swarm.*', 'workspace.read', 'runtime.read'],
  agent: ['tools.read', 'tools.run.readonly', 'workspace.read', 'runtime.read', 'vault.read'],
  viewer: ['tools.read', 'pipeline.read', 'swarm.read', 'guard.read', 'workspace.read', 'runtime.read', 'vault.read'],
};

const _roles = new Map();

function seedRoles() {
  _roles.clear();
  for (const [name, caps] of Object.entries(BASE_ROLES)) _roles.set(name, new Set(caps));
}

function defineRole(name, capabilities) {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Rol adı gerekli' };
  if (!Array.isArray(capabilities) || capabilities.length === 0) return { ok: false, error: 'Yetenek listesi boş' };
  const caps = new Set(capabilities.map((c) => String(c)));
  _roles.set(name.toLowerCase(), caps);
  return { ok: true, role: name };
}

function getRole(name) {
  const caps = _roles.get(String(name).toLowerCase());
  return caps ? Array.from(caps) : null;
}

function roleExists(name) {
  return _roles.has(String(name).toLowerCase());
}

function check(roleName, capability) {
  const caps = _roles.get(String(roleName).toLowerCase());
  if (!caps) return { ok: false, error: `Rol tanımlı değil: ${roleName}` };
  if (!capability || typeof capability !== 'string') return { ok: false, error: 'Yetenek kimliği gerekli' };
  const cap = capability.toLowerCase();
  if (caps.has('*')) return { ok: true, allowed: true };
  if (caps.has(cap)) return { ok: true, allowed: true };
  const [group] = cap.split('.');
  if (group && caps.has(`${group}.*`)) return { ok: true, allowed: true };
  return { ok: true, allowed: false, reason: `Rol '${roleName}' yeteneğe sahip değil: ${capability}` };
}

function listRoles() {
  return { ok: true, roles: Array.from(_roles.entries()).map(([name, caps]) => ({ role: name, capabilities: Array.from(caps) })) };
}

function revoke(roleName, capability) {
  const caps = _roles.get(String(roleName).toLowerCase());
  if (!caps) return { ok: false, error: 'Rol tanımlı değil' };
  if (!caps.has(capability)) return { ok: false, error: 'Yetenek rolden zaten yok' };
  caps.delete(capability);
  return { ok: true };
}

function grant(roleName, capability) {
  const caps = _roles.get(String(roleName).toLowerCase());
  if (!caps) return { ok: false, error: 'Rol tanımlı değil' };
  caps.add(capability);
  return { ok: true };
}

function testOnlyClear() {
  seedRoles();
  return { ok: true };
}

seedRoles();

module.exports = {
  defineRole,
  getRole,
  roleExists,
  check,
  listRoles,
  revoke,
  grant,
  testOnlyClear,
  BASE_ROLES,
};
