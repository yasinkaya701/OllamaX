'use strict';
/**
 * test-v326-guard.test.js — Krevyx v3.26 Güvenlik modüllerinin testleri
 *
 * Kapsam:
 *   - guard/permission: rol tabanlı yetenek denetimi
 *   - guard/allowlist: araç beyaz listesi
 *   - guard/policy: organizasyon politikaları (limitler, sessiz saatler)
 *   - guard/diff-gate: fark risk skorlaması ve karar
 *   - guard/ci-check: CI durumu kapısı
 *   - guard/entropy: yüksek entropi / gizli sızıntı algılama
 *   - guard/quarantine: karantina kayıt defteri
 *   - trust/signing: dosya bütünlük imzası
 *
 * @version 3.26.0
 */
const permission = require('../src/main/guard/permission');
const allowlist = require('../src/main/guard/allowlist');
const policy = require('../src/main/guard/policy');
const diffGate = require('../src/main/guard/diff-gate');
const ciCheck = require('../src/main/guard/ci-check');
const entropy = require('../src/main/guard/entropy');
const quarantine = require('../src/main/guard/quarantine');
const signing = require('../src/main/trust/signing');

afterEach(() => {
  allowlist.testOnlyClear();
  ciCheck.testOnlyClear();
  quarantine.testOnlyClear();
});

describe('guard/permission — rol yetenekleri', () => {
  test('agent rolü salt okuma araçlarını kullanabilir', () => {
    const r = permission.check('agent', 'tools.run.readonly');
    expect(r.ok).toBe(true);
    expect(r.allowed).toBe(true);
  });
  test('agent rolü yıkıcı işlem yapamaz', () => {
    const r = permission.check('agent', 'system.rmroot');
    expect(r.ok).toBe(true);
    expect(r.allowed).toBe(false);
  });
  test('lead rolü daha geniş kapsama sahip', () => {
    expect(permission.check('lead', 'tools.run.readonly').allowed).toBe(true);
    expect(permission.check('orchestrator', 'tools.run.readonly').allowed).toBe(true);
    expect(permission.check('admin', 'vault.write').allowed).toBe(true);
  });
});

describe('guard/allowlist — araç beyaz listesi', () => {
  test('mod açılınca listeye girmeyen araç reddedilir', () => {
    allowlist.enableMode(true);
    expect(allowlist.add('file.write').ok).toBe(true);
    expect(allowlist.check('file.write').allowed).toBe(true);
    expect(allowlist.check('shell.exec').allowed).toBe(false);
  });
  test('mod kapalıyken her araç onaylanır', () => {
    allowlist.enableMode(false);
    expect(allowlist.check('shell.exec').allowed).toBe(true);
  });
  test('kaldırılan araç listeden çıkar', () => {
    allowlist.enableMode(true);
    allowlist.add('file.read');
    allowlist.remove('file.read');
    expect(allowlist.check('file.read').allowed).toBe(false);
  });
});

describe('guard/policy — organizasyon politikası', () => {
  test('varsayılan politika alınır', () => {
    const p = policy.get();
    expect(p.ok).toBe(true);
    expect(p.policy && p.policy.maxSteps > 0).toBe(true);
  });
  test('limit yaması kalıcı olur', () => {
    policy.set({ maxSteps: 300 });
    const p = policy.get();
    expect((p.policy && p.policy.maxSteps) || (p.maxSteps)).toBe(300);
  });
  test('değerlendirme geçerli işlemi onaylar', () => {
    policy.set({ quietHours: { enabled: false } });
    const r = policy.evaluate({ steps: 10, memoryMb: 128, operation: 'read' });
    expect(r.ok).toBe(true);
    expect(r.allowed).toBe(true);
  });
  test('limit aşımı ihlal listesi üretir', () => {
    policy.set({ maxSteps: 100 });
    const r = policy.evaluate({ steps: 500 });
    expect(r.ok).toBe(true);
    expect(r.allowed).toBe(false);
    expect(r.violations.some((v) => v.rule === 'maxSteps')).toBe(true);
  });
});

describe('guard/diff-gate — fark kapısı', () => {
  test('küçük düzenleme onaylanır', () => {
    const r = diffGate.analyze('+ console.log("selam")\n- console.log("hata")\n');
    expect(r.ok).toBe(true);
    expect(r.decision).toBe('approved');
    expect(r.score >= 0).toBe(true);
  });
  test('yıkıcı kaldırma inceleme kapısına düşer', () => {
    const r = diffGate.analyze(['diff --git a/big.txt b/big.txt', '-line removed'].concat(Array(600).fill('-deleted line')).join('\n'));
    expect(['review', 'blocked'].includes(r.decision)).toBe(true);
  });
  test('gizli içeren diff engellenir', () => {
    const r = diffGate.analyze(['diff --git a/config.js b/config.js', '+const token = "ghp_5f3a9b2c1d7e4f6a8b0c3d2e1f4a7b9c"'].join('\n'));
    expect(r.decision).toBe('blocked');
  });
  test('boş diff hata döner', () => {
    expect(diffGate.analyze('').ok).toBe(false);
  });
});

describe('guard/ci-check — CI kapısı', () => {
  test('başarılı CI sonucu onaylanabilir', () => {
    ciCheck.configure({ requireCi: true, requiredStatuses: ['build', 'lint'] });
    ciCheck.recordCi('r1', 'success', 'build');
    const r = ciCheck.evaluate('r1');
    expect(r.ok).toBe(true);
    expect(r.passed).toBe(true);
  });
  test('başarısız CI fark onayını engeller', () => {
    ciCheck.configure({ requireCi: true });
    ciCheck.recordCi('r2', 'failure', 'build');
    const r = ciCheck.evaluate('r2');
    expect(r.ok).toBe(true);
    expect(r.passed).toBe(false);
  });
  test('CI kapısı kapalıyken her kimlik geçer', () => {
    ciCheck.configure({ requireCi: false });
    const r = ciCheck.evaluate('rastgele-id');
    expect(r.ok).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe('guard/entropy — gizli sızıntı algılama', () => {
  test('yüksek entropili anahtarı yakalar', () => {
    const r = entropy.scan('key = "A7k2x9QpL4mN8vB3wZ6cY1dR5tJ0sF7uG2hK4wP9"');
    expect(r.ok).toBe(true);
    expect(r.findings.length).toBeGreaterThan(0);
  });
  test('normal cümle sızıntı sayılmaz', () => {
    const r = entropy.scan('bugün hava çok güzel ve temiz');
    expect(r.findings.length).toBe(0);
  });
  test('gizli adayı tespiti uzun random stringi işaretler', () => {
    const candidate = entropy.isSecretCandidate('A7k2!x9QpL4mN8vB3wZ6cY1dR5tJ0sF7uG');
    expect(candidate.secret).toBe(true);
  });
});

describe('guard/quarantine — karantina', () => {
  test('dosya karantinaya alınır ve listelenir', () => {
    quarantine.put('/tmp/q-file.txt', 'yüksek risk');
    expect(quarantine.isQuarantined('/tmp/q-file.txt').quarantined).toBe(true);
    expect(quarantine.list().files.length).toBe(1);
  });
  test('serbest bırakılan dosya listeden çıkar', () => {
    quarantine.put('/tmp/q2.txt', 'x');
    quarantine.release('/tmp/q2.txt');
    expect(quarantine.isQuarantined('/tmp/q2.txt').quarantined).toBe(false);
  });
});

describe('trust/signing — bütünlük imzası', () => {
  test('imzalı içerik doğrulanır', () => {
    const secret = 'krevyx-test-secret';
    const s = signing.sign('içerik', secret);
    expect(s.ok).toBe(true);
    const v = signing.verify('içerik', { hash: s.hash, hmac: s.hmac }, { secret });
    expect(v.ok).toBe(true);
    expect(v.valid).toBe(true);
  });
  test('değişmiş içerik doğrulama reddeder', () => {
    const secret = 'krevyx-test-secret2';
    const s = signing.sign('içerik', secret);
    const v = signing.verify('tadil edilmiş', { hash: s.hash, hmac: s.hmac }, { secret });
    expect(v.ok).toBe(true);
    expect(v.valid).toBe(false);
  });
  test('yanlış anahtarla doğrulama reddedilir', () => {
    const s = signing.sign('içerik', 'doğru');
    const v = signing.verify('içerik', { hash: s.hash, hmac: s.hmac }, { secret: 'yanlış' });
    expect(v.ok).toBe(true);
    expect(v.valid).toBe(false);
  });
  test('manifest bütünlük listesi üretir', () => {
    const m = signing.manifest([{ path: 'a.js', content: 'const a = 1;' }], 'secret');
    expect(m.ok).toBe(true);
    expect(Array.isArray(m.items)).toBe(true);
    expect(m.items[0].path).toBe('a.js');
    expect(typeof m.manifestHash).toBe('string');
  });
});
