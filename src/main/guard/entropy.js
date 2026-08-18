'use strict';

/**
 * entropy.js — Krevyx v3.26 Yüksek Entropi Tespiti (Sızıntı Taraması)
 *
 * Kapsam:
 *   - Metin içindeki yüksek entropili (muhtemelen gizli) dizgelerin tespiti.
 *   - Shannon entropisi hesabı; varsayılan eşik: 4.5 bit/karakter, min uzunluk: 20.
 *   - scan(text, opts?) → { ok, findings:[{token, entropy, index}] }.
 *   - isSecretCandidate(token, opts?) → { ok, secret:bool, entropy }.
 *
 * Davranış:
 *   - Alfasayısal dizgeler ayrıştırılır; her biri eşik üstündeyse bulgu.
 *   - excludeWords ile yanlış pozitif baskılanabilir.
 *
 * Dönüş:
 *   - scan → { ok, findings } | { ok:false, error }
 *
 * Test:
 *   - Deterministik sabit dizgelerde entropi hesaplaması test edilebilir.
 *
 * @version 3.26.0
 */

function shannonEntropy(token) {
  if (!token || token.length === 0) return 0;
  const freq = new Map();
  for (const ch of token) {
    freq.set(ch, (freq.get(ch) || 0) + 1);
  }
  const len = token.length;
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return Math.round(entropy * 1000) / 1000;
}

function scan(text, opts = {}) {
  if (typeof text !== 'string') return { ok: false, error: 'Taranacak metin gerekli' };
  const threshold = typeof opts.threshold === 'number' && opts.threshold > 0 ? opts.threshold : 4.5;
  const minLength = typeof opts.minLength === 'number' && opts.minLength > 0 ? opts.minLength : 20;
  const excludeWords = Array.isArray(opts.excludeWords) ? new Set(opts.excludeWords.map((w) => String(w))) : new Set();
  const re = /[A-Za-z0-9_\-+/=]{20,}/g;
  const findings = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const token = match[0];
    if (excludeWords.has(token)) continue;
    const entropy = shannonEntropy(token);
    if (entropy >= threshold) {
      findings.push({ token: token.slice(0, 32), entropy, index: match.index, length: token.length });
    }
  }
  return { ok: true, findings, threshold, scanned: text.length };
}

function isSecretCandidate(token, opts = {}) {
  if (typeof token !== 'string') return { ok: false, error: 'Dizge gerekli' };
  const threshold = typeof opts.threshold === 'number' && opts.threshold > 0 ? opts.threshold : 4.5;
  const entropy = shannonEntropy(token);
  return { ok: true, secret: token.length >= 20 && entropy >= threshold, entropy };
}

module.exports = {
  shannonEntropy,
  scan,
  isSecretCandidate,
};
