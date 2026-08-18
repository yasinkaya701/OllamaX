'use strict';
/**
 * trust/secrets-audit.js — Krevyx v3.25 Gizli Sızıntı Tespiti (T-3)
 *
 * Kod, diff ve ortam değişkenlerinde 40+ desen kuralıyla gizli anahtar/
 * token araması yapar. False-positive azaltıcı: test dosyaları ve
 * susturma yorumları (krevyx-ignore) atlanır.
 *
 * Kural formatı: { id, name, pattern (regex), category, severity }
 * Kategoriler: api_key, token, private_key, credential, url_secret
 *
 * API:
 *   getRules() / loadRules(custom)
 *   scanText(text, opts)              → bulgular
 *   scanFile(filePath, opts)
 *   scanDirectory(dirPath, opts)      → çok dosyalı tarama
 *   scanEnv(env)                      → ortam değişkeni taraması
 *   scanDiff(diffText, opts)          → eklenen satırları tara
 *   summarize(findings)               → özet rapor
 *
 * Tüm fs erişimi opts.fs ile inject edilir.
 */
const path = require('path');

function defaultRules() {
  const mk = (id, name, pattern, category, severity) => ({ id, name, pattern: new RegExp(pattern, 'i'), category, severity });
  return [
    /* ---- API anahtarları ---- */
    mk('sk-openai', 'OpenAI secret key', 'sk-[a-zA-Z0-9]{20,}', 'api_key', 'critical'),
    mk('sk-anthropic', 'Anthropic secret key', 'sk-ant-[a-zA-Z0-9-]{20,}', 'api_key', 'critical'),
    mk('sk-gemini', 'Gemini API key', 'AIza[0-9A-Za-z-_]{30,}', 'api_key', 'critical'),
    mk('ghp-token', 'GitHub PAT', 'ghp_[a-zA-Z0-9]{36,}', 'token', 'critical'),
    mk('gho-token', 'GitHub OAuth', 'gho_[a-zA-Z0-9]{36,}', 'token', 'critical'),
    mk('ghu-token', 'GitHub user-to-server', 'ghu_[a-zA-Z0-9]{36,}', 'token', 'high'),
    mk('ghs-token', 'GitHub server-to-server', 'ghs_[a-zA-Z0-9]{36,}', 'token', 'high'),
    mk('glpat-token', 'GitLab PAT', 'glpat-[a-zA-Z0-9-]{20,}', 'token', 'critical'),
    mk('bb-token', 'Bitbucket app password', 'ATBB[a-zA-Z0-9]{24,}', 'token', 'high'),
    mk('hf-token', 'HuggingFace token', 'hf_[a-zA-Z0-9]{20,}', 'token', 'high'),
    mk('cohere-key', 'Cohere key', 'co-[a-zA-Z0-9]{10,}', 'api_key', 'high'),
    mk('mistral-key', 'Mistral key', '[a-zA-Z0-9]{20,32}mistral', 'api_key', 'high'),
    mk('azure-key', 'Azure key', 'AzureKey\\s+[a-zA-Z0-9+/=]{40,}', 'api_key', 'critical'),
    mk('aws-key', 'AWS access key', 'AKIA[0-9A-Z]{16}', 'api_key', 'critical'),
    mk('aws-secret', 'AWS secret key', 'aws_secret_access_key\\s*[=:]\\s*[A-Za-z0-9/+=]{40}', 'credential', 'critical'),
    mk('gcp-key', 'GCP key blob', '"private_key"\\s*:\\s*"-----BEGIN', 'private_key', 'critical'),
    mk('stripe-live', 'Stripe live key', 'sk_live_[a-zA-Z0-9]{20,}', 'api_key', 'critical'),
    mk('stripe-test', 'Stripe test key', 'sk_test_[a-zA-Z0-9]{20,}', 'api_key', 'medium'),
    mk('twilio-key', 'Twilio key', 'SK[0-9a-f]{32}', 'api_key', 'high'),
    mk('sendgrid-key', 'SendGrid key', 'SG\\.[a-zA-Z0-9_-]{22}\\.[a-zA-Z0-9_-]{43}', 'api_key', 'high'),
    mk('slack-token', 'Slack token', 'xox[baprs]-[0-9a-zA-Z-]{10,}', 'token', 'high'),
    mk('discord-token', 'Discord token', 'M?F?[a-zA-Z0-9]{24}\\.[a-zA-Z0-9]{6}\\.[a-zA-Z0-9-]{27}', 'token', 'high'),
    mk('npm-token', 'npm token', '//registry\\.npmjs\\.org/:_authToken=[a-zA-Z0-9-]{20,}', 'token', 'high'),
    mk('pypi-token', 'PyPI token', 'pypi-[a-zA-Z0-9_-]{50,}', 'token', 'high'),
    mk('heroku-key', 'Heroku key', 'heroku[a-z0-9_ .\\-,]{0,25}(=|>|:=|\\|\\|:?=).{0,5}[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}', 'credential', 'high'),
    mk('mailgun-key', 'Mailgun key', 'key-[0-9a-zA-Z]{32}', 'api_key', 'high'),
    mk('algolia-key', 'Algolia admin key', '[a-z0-9]{32}admin', 'api_key', 'high'),
    mk('databricks-token', 'Databricks token', 'dapi[a-h0-9]{32}', 'token', 'high'),
    mk('shopify-token', 'Shopify token', 'shpat_[a-zA-Z0-9]{30,}', 'token', 'high'),
    mk('manus-key', 'Manus session key', 'manus[_-]?[a-z0-9_\\-]{0,15}\\s*[=:]\\s*[a-zA-Z0-9._-]{20,}', 'api_key', 'high'),
    /* ---- Özel anahtarlar ---- */
    mk('pk-begin', 'Private key PEM', '-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY', 'private_key', 'critical'),
    mk('ssh-key', 'SSH private key', 'ssh-rsa\\s+[A-Za-z0-9+/=]{100,}|ecdsa-sha2', 'private_key', 'critical'),
    mk('jwt-secret', 'JWT secret', 'jwt[_-]?secret\\s*[=:]\\s*.{8,}', 'credential', 'high'),
    /* ---- URL içinde gizli ---- */
    mk('url-basic-auth', 'URL embedded credentials', 'https?://[^\\s/]+:[^\\s/@]+@', 'url_secret', 'high'),
    mk('mongo-uri', 'MongoDB URI with password', 'mongodb(\\+srv)?://[^\\s]+:[^\\s@]+@', 'url_secret', 'critical'),
    mk('postgres-uri', 'Postgres URI with password', 'postgres(ql)?://[^\\s]+:[^\\s@]+@', 'url_secret', 'critical'),
    mk('redis-uri', 'Redis URI with password', 'rediss?://:[^\\s@]+@', 'url_secret', 'high'),
    /* ---- Genel kalıplar ---- */
    mk('generic-api-key', 'Generic API key assignment', '(api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\\s*[=:]\\s*["\'][a-zA-Z0-9_\\-]{16,}', 'credential', 'medium'),
    mk('password-literal', 'Hardcoded password', '(password|passwd|pwd)\\s*[=:]\\s*["\'][^"\']{8,}', 'credential', 'medium'),
    mk('bearer-token', 'Bearer token literal', 'Authorization:\\s*Bearer\\s+[a-zA-Z0-9._-]{20,}', 'token', 'high'),
    mk('base64-secret', 'Long base64 blob', '(key|secret|token)\\s*[=:]\\s*["\']?[A-Za-z0-9+/=]{60,}', 'credential', 'medium'),
  ];
}

const TEST_PATH_PATTERNS = [
  /\/?test[s]?[\\/]/i, /\/?__tests__[\\/]/i, /\.test\.\w+$/i, /\.spec\.\w+$/i,
  /\/?fixtures[\\/]/i, /\/?mocks?[\\/]/i, /\/?samples?[\\/]/i, /krevyx-ignore\b/i,
];

function isTestPath(p) {
  return TEST_PATH_PATTERNS.some((rx) => rx.test(p));
}

function hasIgnore(line) {
  return /\bkrevyx-ignore\b/i.test(line);
}

function scanText(text, opts = {}) {
  if (typeof text !== 'string') return { ok: false, error: 'Metin gerekli' };
  const rules = opts.rules || defaultRules();
  const findings = [];
  const seen = new Set();
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (hasIgnore(line)) return;
    rules.forEach((rule) => {
      let m;
      const re = new RegExp(rule.pattern.source, rule.pattern.flags);
      while ((m = re.exec(line)) !== null) {
        const key = `${rule.id}:${idx}:${m.index}`;
        if (seen.has(key)) break;
        seen.add(key);
        findings.push({
          rule: rule.id,
          name: rule.name,
          category: rule.category,
          severity: rule.severity,
          line: idx + 1,
          column: m.index + 1,
          match: m[0].slice(0, 60),
          masked: m[0].slice(0, 6) + '…',
        });
        if (m.index === re.lastIndex) re.lastIndex += 1;
        if (findings.length > 5000) return;
      }
    });
  });
  return { ok: true, findings, scannedLines: lines.length };
}

function scanFile(filePath, opts = {}) {
  if (typeof filePath !== 'string') return { ok: false, error: 'Dosya yolu gerekli' };
  const fsMod = opts.fs || require('fs');
  let content;
  try {
    content = fsMod.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { ok: false, error: `Okuma hatası: ${err.message}` };
  }
  const res = scanText(content, opts);
  if (!res.ok) return res;
  res.findings.forEach((f) => { f.file = filePath; });
  return res;
}

function scanDirectory(dirPath, opts = {}) {
  if (typeof dirPath !== 'string') return { ok: false, error: 'Dizin yolu gerekli' };
  const fsMod = opts.fs || require('fs');
  const pathMod = opts.path || path;
  const ignorePatterns = opts.ignore || [/node_modules/, /\.git[\\/]/, /dist[\\/]/, /\.next[\\/]/, /build[\\/]/];
  let all = { ok: true, findings: [], files: 0, skipped: 0 };
  try {
    const walk = (dir) => {
      let entries;
      try { entries = fsMod.readdirSync(dir); } catch { return; }
      entries.forEach((name) => {
        const full = pathMod.join(dir, name);
        if (ignorePatterns.some((rx) => rx.test(full))) { all.skipped += 1; return; }
        let stat;
        try { stat = fsMod.statSync(full); } catch { return; }
        if (stat.isDirectory()) { walk(full); return; }
        if (!stat.isFile() || stat.size > (opts.maxFileSize || 2000000)) return;
        if (isTestPath(full)) { all.skipped += 1; return; }
        const res = scanFile(full, opts);
        all.files += 1;
        if (res.ok) all.findings.push(...res.findings);
      });
    };
    walk(dirPath);
  } catch (err) {
    return { ok: false, error: `Tarama hatası: ${err.message}` };
  }
  return all;
}

function scanEnv(env, opts = {}) {
  const entries = env || (typeof process !== 'undefined' ? process.env : {});
  const findings = [];
  const secretNameHints = /(?:secret|token|key|password|passwd|api)/i;
  Object.entries(entries).forEach(([name, value]) => {
    if (!secretNameHints.test(name) || !value) return;
    if (String(value).length < 8) return;
    const res = scanText(`${name}=${value}`, opts);
    if (res.ok) res.findings.forEach((f) => { f.env = name; findings.push(f); });
  });
  return { ok: true, findings, scanned: Object.keys(entries).length };
}

function scanDiff(diffText, opts = {}) {
  if (typeof diffText !== 'string') return { ok: false, error: 'Diff metni gerekli' };
  const additions = diffText.split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .join('\n');
  const res = scanText(additions, opts);
  res.findings.forEach((f) => { f.context = 'diff-addition'; });
  return res;
}

function summarize(findings) {
  if (!Array.isArray(findings)) return { ok: false, error: 'Bulgu listesi gerekli' };
  const bySeverity = {};
  const byCategory = {};
  const byRule = {};
  findings.forEach((f) => {
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byRule[f.rule] = (byRule[f.rule] || 0) + 1;
  });
  return {
    ok: true, total: findings.length,
    bySeverity, byCategory, byRule,
    verdict: findings.some((f) => f.severity === 'critical') ? 'critical'
      : findings.some((f) => f.severity === 'high') ? 'high'
      : findings.length ? 'low' : 'clean',
  };
}

module.exports = {
  defaultRules,
  isTestPath,
  hasIgnore,
  scanText,
  scanFile,
  scanDirectory,
  scanEnv,
  scanDiff,
  summarize,
};
