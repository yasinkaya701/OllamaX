/*
 * verify-audit.js — Krevyx v3.21.1: denetim zinciri doğrulama modülü
 *
 * audit-export.js JSON-lines olarak yazılan denetim satırlarının bütünlüğünü
 * SHA-256 ile yeniden doğrular:
 *   1. Her satırın `sha256` alanı, satırın içerik alanına karşı recompute edilir.
 *   2. Zincir modunda bir sonraki satırın `prevHash` alanı, bir önceki satırın
 *      hash'iyle eşleşir (değişmez sıra kanıtı).
 *   3. Dosya boyutu/satır sayısı istatistiği rapora eklenir.
 *
 * Doğrulama salt okunurdur; dosyayı hiçbir şekilde değiştirmez.
 * Bozuk/bilinmeyen alanlı satırlar "bozuk" olarak işaretlenir, uygulama çökmez.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUDIT_DEFAULT_DIR = path.join(require('os').homedir(), '.krevyx', 'audit');

function defaultAuditDir() {
  try {
    const { app } = require('electron');
    if (app && app.getPath) return path.join(app.getPath('userData'), 'audit');
  } catch { /* renderer'da electron yok */ }
  return AUDIT_DEFAULT_DIR;
}

function recomputeHash(lineObj) {
  // hash'in kapsamı: içerik alanı + zaman damgası (satırın doğrulanabilir çekirdeği)
  const scope = {
    content: lineObj && typeof lineObj.content === 'string' ? lineObj.content : '',
    t: Number.isFinite(lineObj && lineObj.t) ? lineObj.t : 0,
    event: lineObj && typeof lineObj.event === 'string' ? lineObj.event : '',
  };
  return crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
}

/**
 * Tek dosyayı doğrular: { ok, lines, valid, corrupted, chainBroken, stats }
 * @param {string} filePath - audit .jsonl dosyası
 */
function verifyAuditFile(filePath) {
  const stats = {};
  try {
    stats.sizeBytes = fs.statSync(filePath).size;
  } catch {
    return { ok: false, error: 'Dosya okunamadı: ' + filePath };
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, error: 'Dosya okunamadı: ' + filePath };
  }

  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  stats.lineCount = lines.length;

  let valid = 0;
  let corrupted = 0;
  let chainBroken = 0;
  let prevHash = null;

  for (let i = 0; i < lines.length; i += 1) {
    let obj;
    try {
      obj = JSON.parse(lines[i]);
    } catch {
      corrupted += 1;
      prevHash = null; // zincir kırıldı
      continue;
    }

    const expected = recomputeHash(obj);
    const hashMatches = typeof obj.sha256 === 'string' && obj.sha256.toLowerCase() === expected;

    const prevMatches = prevHash === null ||
      (typeof obj.prevHash === 'string' && obj.prevHash.toLowerCase() === prevHash);

    if (!prevMatches) chainBroken += 1;

    if (hashMatches && prevMatches) {
      valid += 1;
    } else {
      corrupted += 1;
    }
    prevHash = hashMatches ? obj.sha256.toLowerCase() : null;
  }

  return {
    ok: true,
    file: filePath,
    stats,
    valid,
    corrupted,
    chainBroken,
    integrity: corrupted === 0 && chainBroken === 0,
    message: corrupted === 0 && chainBroken === 0
      ? 'Zincir bütündür: tüm satırlar SHA-256 ve sıra hash eşleşmesi doğrulandı.'
      : `Doğrulama hatalı: ${corrupted} satır hash uyuşmazlığı, ${chainBroken} zincir kırığı.`,
  };
}

/**
 * Dizin içindeki tüm .jsonl denetim dosyalarını doğrular.
 */
function verifyAuditDir(dirPath) {
  const dir = dirPath || defaultAuditDir();
  let entries;
  try {
    entries = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  } catch {
    return { ok: false, error: 'Denetim dizini okunamadı: ' + dir };
  }
  if (entries.length === 0) {
    return { ok: false, error: 'Denetim dizininde dosya yok: ' + dir };
  }
  const results = entries.map((f) => verifyAuditFile(path.join(dir, f)));
  const allGood = results.every((r) => r.ok && r.integrity);
  return {
    ok: true,
    dir,
    files: results,
    integrity: allGood,
    message: allGood
      ? `Tüm ${entries.length} denetim dosyası bütündür.`
      : 'Bir veya daha fazla denetim dosyasında bütünlük hatası tespit edildi.',
  };
}

module.exports = { verifyAuditFile, verifyAuditDir, defaultAuditDir, recomputeHash };
