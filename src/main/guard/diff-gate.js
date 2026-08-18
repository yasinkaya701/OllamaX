'use strict';

/**
 * diff-gate.js — Krevyx v3.26 Fark Kapısı (Diff Gating)
 *
 * Kapsam:
 *   - Değişiklik farkının (git diff çıktısı) risk skorlanarak kapıdan geçirilmesi.
 *   - Risk öğeleri: +/− satır hacmi, kritik dosyalar (package.json, config, env,
 *     security, auth, Dockerfile), gizli/bağlantı desenleri, silme ağırlığı.
 *   - Karar: approved (< eşik) / review (eşik arası) / blocked (>= kritik eşik).
 *   - quarantineFiles() → riskli dosya listesi.
 *
 * Davranış:
 *   - analyze(diffText, opts?) → { ok, score, decision, breakdown, files[] }.
 *   - Eşikler: opts.approveThreshold (vars:10), opts.blockThreshold (vars:60).
 *   - Büyük satır sayısı her 100 satır +2 puan; kritik dosya +15; gizli deseni +40 (otomatik block).
 *
 * Dönüş:
 *   - analyze → { ok, score, decision:'approved|review|blocked', breakdown:{lines, critical, secrets, deletions}, files:[{path, risk}] }
 *
 * Test:
 *   - testOnlyClear() yok (stateless).
 *
 * @version 3.26.0
 */

const pathMod = require('path');

const CRITICAL_PATTERNS = [
  /package\.json$/i, /\b(config|conf)\.[\w.]+$/i, /\.env(\..*)?$/i,
  /\b(security|auth)[\w./-]*$/i, /Dockerfile$/i, /\.(crt|key|pem)$/i,
];

const SECRET_PATTERNS = [
  /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][A-Za-z0-9_\-]{12,}/i,
  /\b(sk|pk)-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
];

const DEFAULTS = { approveThreshold: 10, blockThreshold: 60 };

function parseFiles(diffText) {
  const files = [];
  const lines = diffText.split(/\r?\n/);
  let current = null;
  let add = 0;
  let del = 0;
  let secrets = 0;
  for (const line of lines) {
    const m = /^diff --git a\/[^\s]+ b\/(\S+)/.exec(line);
    if (m) {
      if (current) files.push({ ...current, add, del, secrets });
      current = { path: m[1], add: 0, del: 0, secrets: 0, critical: false };
      add = 0; del = 0; secrets = 0;
      continue;
    }
    if (current) {
      if (line.startsWith('+') && !line.startsWith('+++')) add += 1;
      if (line.startsWith('-') && !line.startsWith('---')) del += 1;
      if (SECRET_PATTERNS.some((re) => re.test(line))) secrets += 1;
    }
  }
  if (current) files.push({ ...current, add, del, secrets });
  return files;
}

function analyze(diffText, opts = {}) {
  if (!diffText || typeof diffText !== 'string') return { ok: false, error: 'Diff metni gerekli' };
  const approveThreshold = typeof opts.approveThreshold === 'number' ? opts.approveThreshold : DEFAULTS.approveThreshold;
  const blockThreshold = typeof opts.blockThreshold === 'number' ? opts.blockThreshold : DEFAULTS.blockThreshold;
  if (approveThreshold >= blockThreshold) return { ok: false, error: 'Eşik değerleri çakışıyor' };

  const files = parseFiles(diffText).map((f) => {
    const critical = CRITICAL_PATTERNS.some((re) => re.test(f.path));
    return { ...f, critical };
  });

  const totalAdd = files.reduce((s, f) => s + f.add, 0);
  const totalDel = files.reduce((s, f) => s + f.del, 0);
  const lineScore = Math.floor((totalAdd + totalDel) / 100) * 2;
  const criticalScore = files.filter((f) => f.critical).length * 15;
  const secretScore = files.reduce((s, f) => s + f.secrets, 0) * 40;
  const deletionWeight = totalDel > totalAdd * 2 ? Math.floor(totalDel / 50) : 0;
  const score = lineScore + criticalScore + secretScore + deletionWeight;

  let decision = 'approved';
  if (score >= blockThreshold || secretScore > 0) decision = 'blocked';
  else if (score >= approveThreshold) decision = 'review';

  return {
    ok: true,
    score,
    decision,
    breakdown: { lines: totalAdd + totalDel, critical: criticalScore, secrets: secretScore, deletions: deletionWeight },
    files: files.map((f) => ({ path: f.path, risk: f.critical ? 'critical' : f.secrets > 0 ? 'blocked' : 'normal', add: f.add, del: f.del })),
    thresholds: { approve: approveThreshold, block: blockThreshold },
  };
}

function quarantineFiles(diffText) {
  const result = analyze(diffText);
  if (!result.ok) return result;
  const risky = result.files.filter((f) => f.risk !== 'normal').map((f) => pathMod.normalize(f.path));
  return { ok: true, quarantine: risky, decision: result.decision };
}

module.exports = {
  analyze,
  quarantineFiles,
  parseFiles,
  CRITICAL_PATTERNS,
  SECRET_PATTERNS,
  DEFAULTS,
};
