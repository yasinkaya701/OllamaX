'use strict';
/**
 * test-v325-trust.test.js — Krevyx v3.25 Güven modüllerinin testleri
 *
 * Kapsam:
 *   - trust/release-check: checksum ayrıştırma, doğrulama, asset seçimi, imza
 *   - trust/audit-chain-v2: zincir, merkle kök, sorgu, export, bozuk zincir
 *   - trust/secrets-audit: desen yakalama, diff/ortam taraması, test atlaması, özet
 *   - trust/vault-mgmt: import/export, anahtar döndürme, entropy raporu
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const release = require('../src/main/trust/release-check');
const auditV2 = require('../src/main/trust/audit-chain-v2');
const secrets = require('../src/main/trust/secrets-audit');
const vault = require('../src/main/trust/vault-mgmt');

describe('trust/release-check — sürüm doğrulama', () => {
  test('parseChecksums sha256 satırlarını çıkarır', () => {
    const t = ('a'.repeat(64) + '  Krevyx-Ultra-3.25.0.exe\n');
    const r = release.parseChecksums(t);
    expect(r.ok).toBe(true);
    expect(r.sha256['Krevyx-Ultra-3.25.0.exe']).toBeTruthy();
  });
  test('sha512 satırlarını ayrı haritalar', () => {
    const t = 'a'.repeat(128) + '  dosya.AppImage\n';
    const r = release.parseChecksums(t);
    expect(r.sha512['dosya.AppImage']).toBeTruthy();
    expect(Object.keys(r.sha256).length).toBe(0);
  });
  test('geçerli buffer doğrulaması ok döner', () => {
    const buf = Buffer.from('test icerik');
    const expected = crypto.createHash('sha256').update(buf).digest('hex');
    expect(release.verifyChecksum(buf, expected).ok).toBe(true);
  });
  test('yanlış hash false döndürür', () => {
    expect(release.verifyChecksum(Buffer.from('x'), '0'.repeat(64)).ok).toBe(false);
  });
  test('buildAssetUrl platform deseniyle eşleştirir', () => {
    const rel = { tag_name: 'v3.25.0', assets: [
      { name: 'Krevyx-Ultra-3.25.0-win.exe', browser_download_url: 'http://x/e' },
      { name: 'Krevyx-Ultra-3.25.0-arm64.dmg', browser_download_url: 'http://x/d' },
      { name: 'Krevyx-Ultra-3.25.0-x86_64.AppImage', browser_download_url: 'http://x/a' },
    ] };
    expect(release.buildAssetUrl(rel, 'darwin').asset.name).toContain('.dmg');
    expect(release.buildAssetUrl(rel, 'win32').asset.name).toContain('.exe');
    expect(release.buildAssetUrl(rel, 'linux').asset.name).toContain('.AppImage');
  });
  test('eşleşme yoksa hata döndürür', () => {
    expect(release.buildAssetUrl({ tag_name: 'v1', assets: [] }, 'win32').ok).toBe(false);
  });
  test('verifyReleaseAsset inject edilen fetch ile dosyayı doğrular', async () => {
    const buf = Buffer.from('asset icerik');
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const checks = `${hash}  Krevyx-Ultra-3.25.0-arm64.dmg\n`;
    const rel = { tag_name: 'v3.25.0', assets: [{ name: 'Krevyx-Ultra-3.25.0-arm64.dmg' }] };
    const res = await release.verifyReleaseAsset({
      release: rel, platform: 'darwin', checksumsText: checks,
      fetchFn: async () => ({ status: 200, buffer: async () => buf }),
    });
    expect(res.ok).toBe(true);
    expect(res.checksum.ok).toBe(true);
  });
  test('checksum uyuşmazlığı akışı başarısız kılar', async () => {
    const rel = { tag_name: 'v3.25.0', assets: [{ name: 'Krevyx-Ultra-3.25.0-arm64.dmg' }] };
    const res = await release.verifyReleaseAsset({
      release: rel, platform: 'darwin',
      checksumsText: '0'.repeat(64) + '  Krevyx-Ultra-3.25.0-arm64.dmg\n',
      fileBuffer: Buffer.from('farkli icerik'),
    });
    expect(res.ok).toBe(false);
  });
});

describe('trust/audit-chain-v2 — merkle denetim zinciri', () => {
  const tmpDir = path.join(os.tmpdir(), `krevyx-audit2-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('girişler zincirlenir ve doğrulanır', () => {
    const ch = auditV2.createChain(path.join(tmpDir, 'a.jsonl'), { blockSize: 8 });
    ch.append('cli', 'run-plan', { prompt: 'test' });
    ch.append('cli', 'apply', { file: 'x.js' });
    const v = ch.verify();
    expect(v.valid).toBe(true);
    expect(v.merkleValid).toBe(true);
  });
  test('blok sonunda merkle kök işlenir', () => {
    const ch = auditV2.createChain(path.join(tmpDir, 'b.jsonl'), { blockSize: 4 });
    for (let i = 0; i < 9; i += 1) ch.append('otomasyon', `adim-${i}`, {});
    const v = ch.verify();
    expect(v.valid).toBe(true);
    expect(v.merkleValid).toBe(true);
    expect(v.blocks).toBeGreaterThan(1);
  });
  test('bozuk giriş zinciri kırar', () => {
    const fp = path.join(tmpDir, 'c.jsonl');
    const ch = auditV2.createChain(fp, { blockSize: 4 });
    ch.append('a', 'b', {});
    ch.append('c', 'd', {});
    fs.appendFileSync(fp, JSON.stringify({ ts: '2099', actor: 'saldırgan', action: 'x', detail: null, prev_hash: '0'.repeat(64), hash: '0'.repeat(64) }) + '\n');
    const fresh = auditV2.createChain(fp, { blockSize: 4 });
    const v = fresh.verify();
    expect(v.valid).toBe(false);
  });
  test('query filtreleri uygular', () => {
    const ch = auditV2.createChain(path.join(tmpDir, 'd.jsonl'));
    ch.append('alice', 'plan-build', {});
    ch.append('bob', 'apply', {});
    ch.append('alice', 'grade', {});
    const r = ch.query({ actor: 'alice' });
    expect(r.total).toBe(2);
    const p = ch.query({ action: 'apply' });
    expect(p.total).toBe(1);
  });
  test('csv export satırları üretir', () => {
    const ch = auditV2.createChain(path.join(tmpDir, 'e.jsonl'));
    ch.append('cli', 'run', {});
    const c = ch.export('csv');
    expect(c.text).toContain('ts,actor,action');
  });
  test('sarif export 2.1.0 sürümü taşır', () => {
    const ch = auditV2.createChain(path.join(tmpDir, 'f.jsonl'));
    ch.append('cli', 'run', {});
    const s = ch.export('sarif');
    expect(s.sarif.version).toBe('2.1.0');
  });
  test('computeMerkleRoot deterministiktir', () => {
    const hashes = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
    expect(auditV2.computeMerkleRoot(hashes)).toBe(auditV2.computeMerkleRoot(hashes));
    expect(auditV2.computeMerkleRoot(hashes)).not.toBe(auditV2.computeMerkleRoot([...hashes].reverse()));
  });
});

describe('trust/secrets-audit — gizli tespiti', () => {
  test('OpenAI anahtarını yakalar', () => {
    const r = secrets.scanText('KEY = "sk-1234567890abcdefghijklmn"');
    expect(r.findings.some((f) => f.rule === 'sk-openai')).toBe(true);
  });
  test('GitHub PAT yakalar', () => {
    const r = secrets.scanText('TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890');
    expect(r.findings.some((f) => f.rule === 'ghp-token')).toBe(true);
  });
  test('PEM özel anahtarı yakalar', () => {
    const r = secrets.scanText('-----BEGIN RSA PRIVATE KEY-----\nMIIEpA\n');
    expect(r.findings.some((f) => f.rule === 'pk-begin')).toBe(true);
  });
  test('URL içindeki kimlik bilgilerini yakalar', () => {
    const r = secrets.scanText('url = "https://user:secret123@example.com/api"');
    expect(r.findings.some((f) => f.category === 'url_secret')).toBe(true);
  });
  test('test dosyaları atlanır', () => {
    expect(secrets.isTestPath('/proje/test/api.test.js')).toBe(true);
    expect(secrets.isTestPath('/proje/src/api.js')).toBe(false);
  });
  test('krevyx-ignore susturma yorumunu tanır', () => {
    const r = secrets.scanText('TOKEN = "sk-1234567890abcdefghijklmn" // krevyx-ignore');
    expect(r.findings.length).toBe(0);
  });
  test('diff taraması yalnızca eklemeleri tarar', () => {
    const diff = '-eski gizli yok\n+TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890\n context';
    const r = secrets.scanDiff(diff);
    expect(r.findings.some((f) => f.rule === 'ghp-token')).toBe(true);
  });
  test('ortam değişkeni taraması anahtar ipuçlarını yakalar', () => {
    const r = secrets.scanEnv({ OPENAI_API_SECRET: 'sk-1234567890abcdefghijklmn' });
    expect(r.findings.length).toBeGreaterThan(0);
  });
  test('temiz metin bulgu üretmez', () => {
    const r = secrets.scanText('console.log("merhaba dünya");');
    expect(r.findings.length).toBe(0);
    expect(secrets.summarize(r.findings).verdict).toBe('clean');
  });
  test('özet severity dağılımını üretir', () => {
    const findings = [
      { rule: 'sk-openai', category: 'api_key', severity: 'critical', line: 1, column: 1, match: 'sk-123' },
      { rule: 'generic-api-key', category: 'credential', severity: 'medium', line: 2, column: 1, match: 'key=abc' },
    ];
    const s = secrets.summarize(findings);
    expect(s.total).toBe(2);
    expect(s.verdict).toBe('critical');
    expect(s.bySeverity.critical).toBe(1);
  });
  test('dosya olmayan yol hata döndürür', () => {
    expect(secrets.scanFile('/olmayan-dosya-xyz-123.txt').ok).toBe(false);
  });
});

describe('trust/vault-mgmt — kasa yönetimi', () => {
  const testEntries = [
    { account: 'openai', value: 'sk-test-1234567890abcdefghijklmnopqr' },
    { account: 'anthropic', value: 'sk-ant-test-1234567890abcdefghijklmnopqrs' },
  ];

  test('exportVault şifreli paket üretir', () => {
    const r = vault.exportVault({ passphrase: 'güçlü-parola-123', entries: testEntries });
    expect(r.ok).toBe(true);
    expect(r.encrypted).toBeTruthy();
    expect(r.entriesExported).toBe(2);
  });
  test('yanlış parolayla açma başarısız olur', () => {
    const e = vault.exportVault({ passphrase: 'doğru', entries: testEntries });
    const r = vault.importVault(e.encrypted, 'yanlış');
    expect(r.ok).toBe(false);
  });
  test('import/export yuvarlak yol tüm girdileri korur', () => {
    const e = vault.exportVault({ passphrase: 'yuvarlak-1', entries: testEntries });
    const r = vault.importVault(e.encrypted, 'yuvarlak-1');
    expect(r.ok).toBe(true);
    expect(r.imported).toBe(2);
  });
  test('anahtar döndürme yeni parolayla erişim sağlar', () => {
    const e = vault.exportVault({ passphrase: 'eski', entries: testEntries });
    const r = vault.rotateKey(e.encrypted, 'eski', 'yeni-parola-x', { entries: testEntries });
    expect(r.ok).toBe(true);
    const reopened = vault.importVault(r.encrypted, 'yeni-parola-x');
    expect(reopened.ok).toBe(true);
    const wrong = vault.importVault(r.encrypted, 'eski');
    expect(wrong.ok).toBe(false);
  });
  test('kısa yeni parola reddedilir', () => {
    const e = vault.exportVault({ passphrase: 'p', entries: testEntries });
    const r = vault.rotateKey(e.encrypted, 'p', 'ab', { entries: testEntries });
    expect(r.ok).toBe(false);
  });
  test('entropy raporu zayıf değerleri işaretler', () => {
    const r = vault.entropyReport([
      { id: 'a', value: 'sk-long-random-value-here' },
      { id: 'b', value: '11111111' },
    ]);
    expect(r.entries[0].weak).toBe(false);
    expect(r.entries[1].weak).toBe(true);
    expect(r.verdict).toBe('weak-entries');
  });
  test('boş veri özetlemede güvenli', () => {
    expect(vault.entropyReport([]).entries.length).toBe(0);
  });
});
