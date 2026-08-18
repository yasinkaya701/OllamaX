'use strict';
/**
 * trust/vault-mgmt.js — Krevyx v3.25 Kasa Yönetimi (T-4)
 *
 * secrets-vault.js'teki keytar tabanlı kasayı yönetir: şifreli import/
 * export, anahtar döndürme (rotate), entropy izleme ve bütünlük kontrolü.
 *
 * API:
 *   exportVault(opts)              → şifreli JSON (AES-256-GCM)
 *   importVault(encryptedJson, passphrase, opts) → kasaya geri yükle
 *   rotateKey(oldPass, newPass, opts) → şifre değiştirme
 *   entropyReport(entries)         → zayıf parola tespiti
 *   vaultIntegrity(opts)           → kasa bütünlük doğrulaması
 *
 * keytar erişimi opts.keytar ile inject edilir; şifreleme crypto ile
 * yapılır (AES-256-GCM + PBKDF2).
 */
const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const MIN_ENTROPY_SCORE = 0.4;

function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, 32, 'sha256');
}

function computeEntropy(text) {
  if (!text || !text.length) return 0;
  const freq = {};
  for (const ch of text) freq[ch] = (freq[ch] || 0) + 1;
  let h = 0;
  const n = text.length;
  for (const c in freq) {
    const p = freq[c] / n;
    h -= p * Math.log2(p);
  }
  return Math.min(1, h / 8); /* 8 bit/char'a oranla normalize */
}

function entropyReport(entries) {
  if (!Array.isArray(entries)) return { ok: false, error: 'Girdi gerekli' };
  const report = entries.map((e) => {
    const value = typeof e === 'string' ? e : e.value || '';
    const score = computeEntropy(value);
    return {
      id: (typeof e === 'object' && e.id) || null,
      score: Math.round(score * 1000) / 1000,
      weak: score < MIN_ENTROPY_SCORE,
      length: value.length,
    };
  });
  const weak = report.filter((r) => r.weak);
  return {
    ok: true,
    entries: report,
    weakCount: weak.length,
    verdict: weak.length ? 'weak-entries' : 'acceptable',
  };
}

function exportVault(opts = {}) {
  const { passphrase, entries, keytar, service = 'krevyx-vault' } = opts;
  if (typeof passphrase !== 'string' || !passphrase) return { ok: false, error: 'Parola gerekli' };
  if (!Array.isArray(entries)) return { ok: false, error: 'Girdiler gerekli' };

  let payload;
  try {
    if (keytar && keytar.getPassword) {
      payload = { entries: [], fetched: 0, errors: [] };
      entries.forEach((e) => {
        try {
          /* entry: { account } — keytar'dan gerçek değeri çek */
          const v = keytar.getPassword(service, e.account);
          payload.entries.push({ account: e.account, value: v || '' });
          payload.fetched += 1;
        } catch (err) {
          payload.errors.push({ account: e.account, error: String(err.message) });
        }
      });
    } else {
      /* Inject edilmiş düz değerler */
      payload = { entries: entries.map((e) => ({ account: e.account, value: e.value || '' })), fetched: entries.length, errors: [] };
    }
  } catch (err) {
    return { ok: false, error: `Kasa okuma hatası: ${err.message}` };
  }

  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const data = JSON.stringify({ version: '3.25.0', exportedAt: new Date().toISOString(), service, entries: payload.entries });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ok: true,
    encrypted: Buffer.concat([salt, iv, tag, enc]).toString('base64'),
    entriesExported: payload.entries.length,
    errors: payload.errors,
  };
}

function importVault(encryptedBase64, passphrase, opts = {}) {
  const { keytar, service = 'krevyx-vault' } = opts;
  if (typeof passphrase !== 'string' || !passphrase) return { ok: false, error: 'Parola gerekli' };
  if (typeof encryptedBase64 !== 'string') return { ok: false, error: 'Şifreli veri gerekli' };

  let buf;
  try {
    buf = Buffer.from(encryptedBase64, 'base64');
  } catch {
    return { ok: false, error: 'Geçersiz base64' };
  }
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN + 16) return { ok: false, error: 'Veri çok kısa' };
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const enc = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  let data;
  try {
    const key = deriveKey(passphrase, salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    data = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return { ok: false, error: 'Açma başarısız: parola yanlış veya veri bozuk' };
  }

  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { ok: false, error: 'İçerik bozuk JSON' };
  }
  if (!Array.isArray(parsed.entries)) return { ok: false, error: 'Girdi dizisi yok' };

  let stored = 0;
  const errors = [];
  try {
    if (keytar && keytar.setPassword) {
      parsed.entries.forEach((e) => {
        try {
          keytar.setPassword(service, e.account, String(e.value || ''));
          stored += 1;
        } catch (err) {
          errors.push({ account: e.account, error: String(err.message) });
        }
      });
    } else {
      stored = parsed.entries.length;
    }
  } catch (err) {
    return { ok: false, error: `Depolama hatası: ${err.message}` };
  }
  return { ok: true, imported: stored, errors, total: parsed.entries.length };
}

/**
 * Anahtar döndürme: eski parolayla açıp yeni parolayla yeniden şifreler.
 */
function rotateKey(encryptedBase64, oldPass, newPass, opts = {}) {
  if (typeof newPass !== 'string' || newPass.length < 4) {
    return { ok: false, error: 'Yeni parola en az 4 karakter olmalı' };
  }
  const opened = importVault(encryptedBase64, oldPass, opts);
  if (!opened.ok) return opened;
  /* importVault içeriği döndürmez; yeniden export için değerler gerekir —
     bu yüzden keytar üzerinden oku/çek akışını kullan */
  const entries = Array.isArray(opts.entries) ? opts.entries : [];
  const re = exportVault({ ...opts, passphrase: newPass, entries });
  if (!re.ok) return re;
  return { ok: true, rotated: true, encrypted: re.encrypted, entriesExported: re.entriesExported };
}

/**
 * Kasa bütünlüğü: kayıtların salt okunur listesi tutarlı mı.
 */
function vaultIntegrity(opts = {}) {
  const { keytar, service = 'krevyx-vault', accounts = [] } = opts;
  if (!keytar || !keytar.findPassword) {
    return { ok: false, error: 'keytar erişimi gerekli' };
  }
  let checked = 0;
  const errors = [];
  for (const account of accounts) {
    try {
      keytar.getPassword(service, account);
      checked += 1;
    } catch (err) {
      errors.push({ account, error: String(err.message) });
    }
  }
  return { ok: true, checked, errors, intact: errors.length === 0 };
}

module.exports = {
  PBKDF2_ITERATIONS,
  computeEntropy,
  entropyReport,
  exportVault,
  importVault,
  rotateKey,
  vaultIntegrity,
};
