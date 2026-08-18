'use strict';

/**
 * signing.js — Krevyx v3.26 Dosya Bütünlük İmzası
 *
 * Kapsam:
 *   - Dosya/içerik bütünlük doğrulaması: SHA-256 + HMAC-SHA256.
 *   - sign(content, secret) → { ok, hash, hmac }; verify(content, sig, secret) → { ok, valid, reason? }.
 *   - Manifest: birden fazla dosyanın imzasını tek manifestte toplar.
 *
 * Davranış:
 *   - secret olmadan da hash üretimi çalışır (hmac boş).
 *   - verify hash + hmac ikisini de denetler; yalnız hash istenirse opts.hmac:false.
 *
 * Dönüş:
 *   - sign → { ok, hash, hmac } | { ok:false, error }
 *   - verify → { ok, valid } | { ok:false, error }
 *
 * Test:
 *   - Deterministik hashler sabit dizgelerde doğrulanır.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

function computeHash(content) {
  if (typeof content !== 'string' && !Buffer.isBuffer(content)) return null;
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return crypto.createHash('sha256').update(data).digest('hex');
}

function computeHmac(content, secret) {
  if (!secret) return '';
  const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function sign(content, secret) {
  if (content === undefined || content === null) return { ok: false, error: 'İçerik gerekli' };
  const hash = computeHash(content);
  if (!hash) return { ok: false, error: 'Geçersiz içerik tipi' };
  return { ok: true, hash, hmac: computeHmac(content, secret) };
}

function verify(content, signature = {}, opts = {}) {
  if (content === undefined || content === null) return { ok: false, error: 'İçerik gerekli' };
  if (!signature || typeof signature !== 'object') return { ok: false, error: 'İmza nesnesi gerekli' };
  const expected = { hash: signature.hash || '', hmac: signature.hmac || '' };
  const hash = computeHash(content);
  if (!hash) return { ok: false, error: 'Geçersiz içerik tipi' };
  if (!expected.hash) return { ok: false, error: 'Beklenen hash yok' };
  if (opts.hmac === false) {
    return { ok: true, valid: hash === expected.hash };
  }
  const secret = typeof opts.secret === 'string' ? opts.secret : '';
  const hmac = computeHmac(content, secret);
  const hmacValid = !expected.hmac || (hmac === expected.hmac);
  const valid = hash === expected.hash && hmacValid;
  return { ok: true, valid, reason: valid ? undefined : (hash === expected.hash ? 'HMAC uyuşmuyor' : 'Hash uyuşmuyor') };
}

function manifest(entries = [], secret) {
  if (!Array.isArray(entries)) return { ok: false, error: 'Girdiler dizi olmalı' };
  const items = [];
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string' || typeof entry.content === 'undefined') continue;
    const sig = sign(entry.content, secret);
    if (!sig.ok) continue;
    items.push({ path: entry.path, hash: sig.hash, hmac: sig.hmac });
  }
  const payload = JSON.stringify(items.sort((a, b) => a.path.localeCompare(b.path)));
  return { ok: true, items, manifestHash: computeHash(payload), manifestHmac: computeHmac(payload, secret) };
}

module.exports = {
  sign,
  verify,
  manifest,
  computeHash,
};
