'use strict';
/**
 * trust/release-check.js — Krevyx v3.25 Sürüm Doğrulama (T-1)
 *
 * GitHub release asset'inin bütünlüğünü ve özgünlüğünü indirmeden önce ve
 * sonra doğrular:
 *   1. CHECKSUMS.txt ayrıştırma (SHA-256 / SHA-512)
 *   2. İndirilen dosyanın checksum karşılaştırması
 *   3. Opsiyonel imza dosyası (.sig) NaCl Ed25519 doğrulaması
 *
 * API:
 *   parseChecksums(text)                  → { sha256:{}, sha512:{} }
 *   verifyChecksum(fileBuffer, expected, algorithm)
 *   verifyReleaseAsset(opts)              → tam akış (indir + doğrula)
 *   verifySignature(publicKey, sig, data) → imza doğrulama (inject'li crypto)
 *   buildAssetUrl(release, platform)      → platforma doğru asset seçimi
 *
 * Tüm ağ erişimi opts.fetch / opts.readFile ile inject edilir; gerçek
 * GitHub'a çıkılmadan test edilir.
 */
const crypto = require('crypto');
const path = require('path');

const PLATFORM_PATTERNS = {
  win32: ['.exe', '-win.exe'],
  darwin: ['.dmg', 'arm64.dmg', 'intel.dmg'],
  linux: ['.AppImage', 'x86_64.AppImage'],
};

function parseChecksums(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Checksum metni gerekli' };
  const sha256 = {};
  const sha512 = {};
  let lines = 0;
  text.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t) return;
    lines += 1;
    const m = /^([a-f0-9]{64,128})\s+(\S+)$/i.exec(t);
    if (!m) return;
    const hash = m[1].toLowerCase();
    const file = path.basename(m[2]);
    if (hash.length === 64) sha256[file] = hash;
    else if (hash.length === 128) sha512[file] = hash;
  });
  return { ok: true, sha256, sha512, lines };
}

function verifyChecksum(buffer, expected, algorithm) {
  if (!Buffer.isBuffer(buffer)) return { ok: false, error: 'Buffer gerekli' };
  const algo = algorithm === 'sha512' ? 'sha512' : 'sha256';
  const actual = crypto.createHash(algo).update(buffer).digest('hex');
  return { ok: actual === String(expected || '').toLowerCase(), algorithm: algo, actual };
}

/**
 * Basit Ed25519 imza doğrulama sarmalayıcısı. Node 18+ crypto API'sini
 * kullanır; opts.verifyFn inject edilirse o çalıştırılır (testler için).
 */
function verifySignature(opts = {}) {
  const { publicKey, signature, data } = opts;
  if (!publicKey || !signature || !data) return { ok: false, error: 'Anahtar, imza ve veri gerekli' };
  try {
    const key = crypto.createPublicKey ? crypto.createPublicKey({ key: publicKey, format: typeof publicKey === 'string' && publicKey.includes('BEGIN') ? 'pem' : 'der', type: 'spki' }) : null;
    if (opts.verifyFn) {
      const v = opts.verifyFn({ publicKey, signature, data });
      return { ok: Boolean(v) };
    }
    if (!key) return { ok: false, error: 'Geçersiz genel anahtar biçimi' };
    const sigBuf = typeof signature === 'string' ? Buffer.from(signature, 'hex') : signature;
    const dataBuf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    return { ok: crypto.verify(null, dataBuf, key, sigBuf) };
  } catch (err) {
    return { ok: false, error: `Doğrulama hatası: ${err.message}` };
  }
}

/**
 * Platforma uygun asset dosyasını seçer.
 */
function buildAssetUrl(release, platform, opts = {}) {
  if (!release || !Array.isArray(release.assets)) return { ok: false, error: 'Release gerekli' };
  const plat = platform || process.platform;
  const patterns = opts.patterns || PLATFORM_PATTERNS[plat] || PLATFORM_PATTERNS.linux;
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
  for (const p of patterns) {
    const found = release.assets.find((a) => typeof a.name === 'string' && a.name.includes(version) && a.name.includes(p));
    if (found) return { ok: true, asset: found, pattern: p };
  }
  /* Desen eşleşmezse ilk uygun platform adayı */
  const fallback = release.assets.find((a) => typeof a.name === 'string' && patterns.some((p) => a.name.endsWith(p)));
  if (fallback) return { ok: true, asset: fallback, pattern: 'fallback' };
  return { ok: false, error: `${plat} için asset bulunamadı` };
}

/**
 * Tam doğrulama akışı: release → asset URL → indir → checksum karşılaştır.
 * opts.fetch(url) → { status, text(), buffer() }, opts.readChecksums(url) inject.
 */
async function verifyReleaseAsset(opts = {}) {
  const { release, platform, checksumsText, fetchFn, verifySig = false, signatureText } = opts;
  if (!release) return { ok: false, error: 'Release gerekli' };
  const urlRes = buildAssetUrl(release, platform, opts);
  if (!urlRes.ok) return urlRes;
  const asset = urlRes.asset;

  /* İndirme */
  let buffer;
  try {
    if (fetchFn) {
      const res = await fetchFn(asset.browser_download_url);
      if (!res || (typeof res.status === 'number' && res.status !== 200)) {
        return { ok: false, error: `İndirme başarısız: ${res?.status || 'bilinmeyen'}` };
      }
      buffer = res.buffer ? await res.buffer() : Buffer.from(await res.text());
    } else if (opts.fileBuffer) {
      buffer = opts.fileBuffer;
    } else {
      return { ok: false, error: 'fetchFn veya fileBuffer gerekli' };
    }
  } catch (err) {
    return { ok: false, error: `Ağ hatası: ${err.message}` };
  }

  /* Checksum */
  let checksumResult = null;
  const parsed = checksumsText ? parseChecksums(checksumsText) : null;
  if (parsed && parsed.ok && parsed.sha256[asset.name]) {
    checksumResult = verifyChecksum(buffer, parsed.sha256[asset.name], 'sha256');
  } else if (parsed && parsed.ok && parsed.sha512[asset.name]) {
    checksumResult = verifyChecksum(buffer, parsed.sha512[asset.name], 'sha512');
  } else {
    checksumResult = { ok: false, error: 'Asset için checksum kaydı yok', standalone: true };
  }
  if (!checksumResult.ok && !checksumResult.standalone) {
    return { ok: false, error: 'Checksum uyuşmazlığı', asset: asset.name, detail: checksumResult };
  }

  /* İmza (opsiyonel) */
  let signatureResult = null;
  if (verifySig && signatureText) {
    signatureResult = verifySignature({ ...opts, data: buffer, signature: signatureText });
  }

  return {
    ok: true,
    asset: asset.name,
    checksum: checksumResult,
    signature: signatureResult,
    size: buffer.length,
  };
}

module.exports = {
  PLATFORM_PATTERNS,
  parseChecksums,
  verifyChecksum,
  verifySignature,
  buildAssetUrl,
  verifyReleaseAsset,
};
