'use strict';
/**
 * @jest-environment node
 * cli-verify-audit.test.js — Krevyx v3.23: `krevyx verify-audit` CLI doğrulaması
 *
 * Gerçek bin/krevyx.js süreci üzerinden:
 *  - bütünlüğü bozuk olmayan zincir dosyası → çıkış 0, [BÜTÜN] raporu
 *  - bozuk hash'li satır içeren dosya → çıkış 1, [HATALI] raporu
 *  - bilinmeyen hedef → çıkış 2, kullanım hatası
 *  - --json modu → ayrıştırılabilir JSON çıktısı
 *
 * Bu testlerin ajan/API anahtarına ihtiyacı yoktur; salt okuma doğrulamadır.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BIN = path.join(__dirname, '..', 'bin', 'krevyx.js');

function makeAuditDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-va-'));
  function h(scope) {
    return crypto.createHash('sha256').update(JSON.stringify(scope)).digest('hex');
  }
  let prev = null;
  const lines = [];
  for (let i = 0; i < 3; i += 1) {
    const scope = { content: 'olay ' + i, t: 1700000000 + i, event: 'chat.send' };
    const sha = h(scope);
    lines.push(JSON.stringify({ ...scope, sha256: sha, prevHash: prev }));
    prev = sha;
  }
  fs.writeFileSync(path.join(dir, 'good.jsonl'), lines.join('\n') + '\n');
  const bad = lines.slice();
  bad.push(JSON.stringify({ content: 'bozuk', t: 9, event: 'bad', sha256: '0'.repeat(64), prevHash: prev }));
  fs.writeFileSync(path.join(dir, 'bad.jsonl'), bad.join('\n') + '\n');
  return dir;
}

function krevyxAudit(...args) {
  const r = spawnSync(process.execPath, [BIN, 'verify-audit', ...args], { encoding: 'utf8', timeout: 30000 });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
}

let auditDir;
beforeAll(() => {
  auditDir = makeAuditDir();
});
afterAll(() => {
  fs.rmSync(auditDir, { recursive: true, force: true });
});

describe('krevyx verify-audit CLI', () => {
  test('bütünlüğü bozuk olmayan zincir çıkış 0 döndürür', () => {
    const r = krevyxAudit(path.join(auditDir, 'good.jsonl'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('[BÜTÜN]');
    expect(r.out).toContain('Zincir bütündür');
  });

  test('bozuk satırlı zincir çıkış 1 döndürür', () => {
    const r = krevyxAudit(path.join(auditDir, 'bad.jsonl'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('[HATALI]');
    expect(r.out).toContain('1 satır hash uyuşmazlığı');
  });

  test('dizin modu tüm .jsonl dosyaları doğrular', () => {
    const r = krevyxAudit(auditDir);
    expect(r.code).toBe(1); // bad.jsonl dizinde olduğu için genel sonuç hatalı
    expect(r.out).toContain('audit1' === 'audit1' ? 'good.jsonl' : '');
    expect(r.out).toContain('good.jsonl');
    expect(r.out).toContain('bad.jsonl');
  });

  test('bilinmeyen hedef çıkış 2 döndürür', () => {
    const r = krevyxAudit('/tmp/krevyx-yok-dizin-' + Date.now());
    expect(r.code).toBe(2);
    expect(r.err).toContain('hedef bulunamadı');
  });

  test('--json modu ayrıştırılabilir JSON üretir', () => {
    const r = krevyxAudit(path.join(auditDir, 'good.jsonl'), '--json');
    expect(r.code).toBe(0);
    const json = JSON.parse(r.out);
    expect(json.version).toBe('3.23.0');
    expect(json.integrity).toBe(true);
    expect(json.reports[0].valid).toBe(3);
  });
});
