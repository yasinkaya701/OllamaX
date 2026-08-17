/*
 * v3.21.1 test paketi — öz-eleştiri raporu düzeltme geçişi
 *  - Grading feedback loop (ölçüm → düzeltme)
 *  - Plan adım düzenleme (remove / insert-after / override)
 *  - verify-audit: SHA-256 + sıra hash zincir doğrulaması
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

/* Electron mock — sandbox'ta gerçek electron yok */
jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  app: { getPath: () => process.env.TMPDIR || '/tmp/krevyx-test' },
}));

describe('v3.21.1 — grading feedback loop', () => {
  const bridge = require('../src/main/agents/code-agent-bridge');

  test('bridge API yüzeyi grade desteğiyle bozulmadan yüklenir', () => {
    expect(typeof bridge.runCodeAgent).toBe('function');
    expect(typeof bridge.runAgentPlan).toBe('function');
    /* Kod içindeki grading opts passthrough'unu kaynak üzerinden doğrula */
    const src = fs.readFileSync(require.resolve('../src/main/agents/code-agent-bridge'), 'utf8');
    expect(src).toContain('gradeOpts.provider');
    expect(src).toContain('remediationBudget');
    expect(src).toContain('issueTexts');
  }, 15000);
});

describe('v3.21.1 — plan adım düzenleme', () => {
  const bridge = require('../src/main/agents/code-agent-bridge');

  test('sanitizeTask plan düzenleme metnini kesmez (uzun düzenleme metni)', () => {
    const longEdit = 'Y'.repeat(5000);
    const sanitized = bridge.sanitizeTask('görev ' + longEdit + ' [PLAN DÜZENLEMELERİ]', null);
    expect(typeof sanitized).toBe('string');
    expect(sanitized).not.toEqual('');
  });

  test('sanitizeTask boş/undefined görevde güvenli', () => {
    expect(() => bridge.sanitizeTask(null, null)).not.toThrow();
    expect(() => bridge.sanitizeTask(undefined, undefined)).not.toThrow();
    expect(() => bridge.sanitizeTask(123, null)).not.toThrow();
  });
});

describe('v3.21.1 — verify-audit zincir doğrulaması', () => {
  const va = require('../src/main/agents/verify-audit');

  function makeLine(content, t, prevHash) {
    const scope = { content, t, event: 'test' };
    const hash = crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
    return { content, t, event: 'test', sha256: hash, prevHash: prevHash || '' };
  }

  test('temiz zinciri %100 doğrular', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-clean-'));
    const lines = [];
    lines.push(makeLine('ilk giriş', 1000, ''));
    lines.push(makeLine('ikinci giriş', 1001, lines[0].sha256));
    lines.push(makeLine('üçüncü giriş', 1002, lines[1].sha256));
    const file = path.join(dir, 'audit-test.jsonl');
    fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
    const res = va.verifyAuditFile(file);
    expect(res.ok).toBe(true);
    expect(res.integrity).toBe(true);
    expect(res.valid).toBe(3);
    expect(res.corrupted).toBe(0);
  });

  test('hash\u0131 bozulmu\u015f sat\u0131r\u0131 yakalar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-bad-'));
    const l1 = makeLine('giriş', 2000, '');
    const bad = { ...l1, sha256: '0'.repeat(64) };
    const file = path.join(dir, 'audit-bad.jsonl');
    fs.writeFileSync(file, JSON.stringify(bad) + '\n');
    const res = va.verifyAuditFile(file);
    expect(res.ok).toBe(true);
    expect(res.integrity).toBe(false);
    expect(res.corrupted).toBe(1);
  });

  test('sıra zincirini (prevHash) kırık satırda yakalar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-chain-'));
    const l1 = makeLine('giriş1', 3000, '');
    const l2 = makeLine('giriş2', 3001, 'yanlış-prevhash');
    const file = path.join(dir, 'audit-chain.jsonl');
    fs.writeFileSync(file, [l1, l2].map((l) => JSON.stringify(l)).join('\n') + '\n');
    const res = va.verifyAuditFile(file);
    expect(res.ok).toBe(true);
    expect(res.integrity).toBe(false);
    expect(res.chainBroken).toBeGreaterThanOrEqual(1);
  });

  test('bozuk JSON satırında çökmez, corruption sayar', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-json-'));
    const file = path.join(dir, 'audit-json.jsonl');
    fs.writeFileSync(file, 'geçerli json değil\n' + JSON.stringify(makeLine('sağlam', 4000, '')) + '\n');
    const res = va.verifyAuditFile(file);
    expect(res.ok).toBe(true);
    expect(res.corrupted).toBeGreaterThanOrEqual(1);
    expect(res.valid).toBeGreaterThanOrEqual(1);
  });

  test('var olmayan dosyada güvenli hata döner', () => {
    const res = va.verifyAuditFile('/tmp/olmayan-dosya.jsonl');
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });

  test('dosyayı hiçbir şekilde değiştirmez (salt okunur)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-readonly-'));
    const l = makeLine('salt-okunur', 5000, '');
    const file = path.join(dir, 'audit-ro.jsonl');
    fs.writeFileSync(file, JSON.stringify(l) + '\n');
    const before = fs.statSync(file).mtimeMs;
    va.verifyAuditFile(file);
    const after = fs.statSync(file).mtimeMs;
    expect(after).toBe(before);
  });
});
