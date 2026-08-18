'use strict';

/**
 * policy.js — Krevyx v3.26 Kurumsal Güvenlik Politikası
 *
 * Kapsam:
 *   - Ajan davranışını kısıtlayan politika seti:
 *     - maxSteps: görev başına azami adım sayısı.
 *     - maxMemoryMb: bellek tavanı.
 *     - requireApproval: ['write','execute','delete'] → onay gerektiren işlemler.
 *     - quietHours: çalışmama penceresi (start:'HH:MM', end:'HH:MM', tz).
 *     - maxConcurrent: eşzamanlı görev sınırı.
 *   - evaluate(policy, request) → { ok, allowed, violations[] }.
 *   - Politika birleşimi: merge(defaults, overrides) → { ok, policy }.
 *
 * Davranış:
 *   - activeHours() → aktif çalışma penceresi dışındaysa { ok, active:false }.
 *   - evaluate adım sayısı, bellek ve onay ihlallerini ayrı ayrı raporlar.
 *
 * Dönüş:
 *   - evaluate → { ok, allowed, violations:[{rule, detail}] }
 *
 * Test:
 *   - testOnlyClear() varsayılan politikayı geri yükler.
 *
 * @version 3.26.0
 */

const DEFAULT_POLICY = {
  maxSteps: 500,
  maxMemoryMb: 2048,
  requireApproval: ['delete', 'network.write'],
  maxConcurrent: 8,
  quietHours: { enabled: false, start: '02:00', end: '06:00' },
};

let _policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));

function get() {
  return { ok: true, policy: JSON.parse(JSON.stringify(_policy)) };
}

function set(patch) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'Politika parçası gerekli' };
  if (patch.maxSteps !== undefined) {
    if (typeof patch.maxSteps !== 'number' || patch.maxSteps < 1) return { ok: false, error: 'maxSteps pozitif sayı olmalı' };
    _policy.maxSteps = patch.maxSteps;
  }
  if (patch.maxMemoryMb !== undefined) {
    if (typeof patch.maxMemoryMb !== 'number' || patch.maxMemoryMb < 64) return { ok: false, error: 'maxMemoryMb en az 64 olmalı' };
    _policy.maxMemoryMb = patch.maxMemoryMb;
  }
  if (patch.requireApproval !== undefined) {
    if (!Array.isArray(patch.requireApproval)) return { ok: false, error: 'requireApproval dizi olmalı' };
    _policy.requireApproval = patch.requireApproval.slice();
  }
  if (patch.maxConcurrent !== undefined) {
    if (typeof patch.maxConcurrent !== 'number' || patch.maxConcurrent < 1) return { ok: false, error: 'maxConcurrent pozitif sayı olmalı' };
    _policy.maxConcurrent = patch.maxConcurrent;
  }
  if (patch.quietHours !== undefined) {
    if (!patch.quietHours || typeof patch.quietHours !== 'object') return { ok: false, error: 'quietHours nesne olmalı' };
    const qh = _policy.quietHours;
    if (patch.quietHours.enabled !== undefined) qh.enabled = patch.quietHours.enabled === true;
    if (patch.quietHours.start) qh.start = String(patch.quietHours.start);
    if (patch.quietHours.end) qh.end = String(patch.quietHours.end);
  }
  return { ok: true, policy: JSON.parse(JSON.stringify(_policy)) };
}

function merge(base, overrides) {
  if (!base || !overrides) return { ok: false, error: 'İki politika gerekli' };
  return { ok: true, policy: { ...JSON.parse(JSON.stringify(base)), ...JSON.parse(JSON.stringify(overrides)) } };
}

function _parseMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Math.min(1439, parseInt(m[1], 10) * 60 + parseInt(m[2], 10));
}

function activeHours() {
  const qh = _policy.quietHours;
  if (!qh.enabled) return { ok: true, active: true };
  const start = _parseMinutes(qh.start);
  const end = _parseMinutes(qh.end);
  if (start === null || end === null) return { ok: false, error: 'Geçersiz sessiz saat formatı (HH:MM)' };
  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const active = start <= end ? (nowMin < start || nowMin >= end) : (nowMin >= end && nowMin < start);
  return { ok: true, active, quietHours: { start: qh.start, end: qh.end } };
}

function evaluate(request = {}) {
  const violations = [];
  const steps = typeof request.steps === 'number' ? request.steps : 0;
  const memoryMb = typeof request.memoryMb === 'number' ? request.memoryMb : 0;
  const operation = typeof request.operation === 'string' ? request.operation.toLowerCase() : '';
  if (steps > _policy.maxSteps) violations.push({ rule: 'maxSteps', detail: `${steps} > ${_policy.maxSteps}` });
  if (memoryMb > _policy.maxMemoryMb) violations.push({ rule: 'maxMemoryMb', detail: `${memoryMb}MB > ${_policy.maxMemoryMb}MB` });
  if (operation && _policy.requireApproval.includes(operation)) violations.push({ rule: 'requireApproval', detail: `İşlem onay bekliyor: ${operation}` });
  const hours = activeHours();
  if (hours.ok && !hours.active) violations.push({ rule: 'quietHours', detail: 'Şu an sessiz saat aralığında' });
  return { ok: true, allowed: violations.length === 0, violations };
}

function testOnlyClear() {
  _policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  return { ok: true };
}

module.exports = {
  get,
  set,
  merge,
  activeHours,
  evaluate,
  testOnlyClear,
  DEFAULT_POLICY,
};
