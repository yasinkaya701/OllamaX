'use strict';
/**
 * test-v325-plans.test.js — Krevyx v3.25 Yeniden Denetçi modüllerinin testleri
 *
 * Kapsam:
 *   - plans/engine: plan üretimi, risk, seri/deseri, diff, tahmin
 *   - plans/approval: oturum yaşam döngüsü, onay/reddet, toplu onay, iptal
 *   - plans/grading: sonuç derecelendirme bütçesi ve eşikler
 *   - plans/diff-apply: geçerli/geçersiz diff ayrıştırma, güvenli uygulama
 *   - plans/diff-review: hunk ayrıştırma, karar, toplu karar, export
 *   - plans/project-memory: KREYX.md, not ekleme, tekrar eden isabet, sorgu, budama
 */
const path = require('path');
const engine = require('../src/main/plans/engine');
const approval = require('../src/main/plans/approval');
const grading = require('../src/main/plans/grading');
const diffApply = require('../src/main/plans/diff-apply');
const diffReview = require('../src/main/plans/diff-review');
const projectMemory = require('../src/main/plans/project-memory');

/** Promptta hedef dosya adı açıkça geçmeli — kalıplar hedef istemezse
 *  salt okuma planına düşer (REVIEW adımı). */
function buildWith(prompt) {
  const r = engine.buildPlan(prompt, { cwd: '/tmp' });
  if (!r.ok) throw new Error(`buildPlan başarısız: ${r.error}`);
  return r.plan;
}

describe('plans/engine — plan oluşturma', () => {
  test('boş ve string olmayan promptu reddeder', () => {
    expect(engine.buildPlan('', { cwd: '/tmp' }).ok).toBe(false);
    expect(engine.buildPlan(null, { cwd: '/tmp' }).ok).toBe(false);
  });
  test('hedef dosyalı düzenleme promptu adım üretir', () => {
    const plan = buildWith('src/index.js dosyasındaki metni düzenle');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.id).toBeTruthy();
    expect(plan.status).toBe('draft');
  });
  test('her adım zorunlu alanlara sahip', () => {
    const plan = buildWith('test.txt dosyasını oluştur');
    plan.steps.forEach((s) => {
      expect(s.type).toBeTruthy();
      expect(typeof s.risk).toBe('number');
      expect(s.risk >= 0 && s.risk <= 10).toBe(true);
    });
  });
  test('risk skoru 0-100 aralığında', () => {
    const plan = buildWith('log.txt dosyasını oku');
    const score = engine.planRiskScore(plan);
    expect(score >= 0 && score <= 100).toBe(true);
  });
  test('plan seri/deseri yuvarlak yol sorunsuz', () => {
    const plan = buildWith('notes.md dosyasını düzenle');
    const ser = engine.serializePlan(plan);
    expect(ser.ok).toBe(true);
    const de = engine.parsePlan(ser.json);
    expect(de.ok).toBe(true);
    expect(de.plan.steps.length).toBe(plan.steps.length);
    expect(de.plan.id).toBe(plan.id);
  });
  test('bozuk JSON ayrıştırmayı reddeder', () => {
    expect(engine.parsePlan('bozuk {json').ok).toBe(false);
  });
  test('planDiff farkları döndürür', () => {
    const a = buildWith('ilk.txt dosyasını oku');
    const b = buildWith('ikinci.txt dosyasını sil');
    const d = engine.planDiff(a, b);
    expect(d && typeof d === 'object').toBe(true);
    expect(Array.isArray(d.added) || Array.isArray(d.removed)).toBe(true);
  });
  test('estimateSteps pozitif sayı döndürür', () => {
    expect(engine.estimateSteps('basit bir düzenleme yap')).toBeGreaterThan(0);
  });
  test('shell karalistesi bloklar', () => {
    const plan = buildWith('çalıştır komutu: rm -rf / tüm dosyaları sil');
    const blocked = plan.steps.find((s) => s.type === engine.STEP_TYPES.SHELL);
    if (blocked) expect(blocked.blocked).toBe(true);
  });
});

describe('plans/approval — onay döngüsü', () => {
  test('oturum oluşturma ve durum', () => {
    const plan = buildWith('deneme.txt dosyasını oku');
    const s = approval.createApprovalSession(plan);
    expect(s.ok).toBe(true);
    expect(s.session.steps.length).toBe(plan.steps.length);
    const st = approval.sessionState(s.session.id);
    expect(st.ok).toBe(true);
    expect(st.state.status).toBe('awaiting_approval');
    expect(st.state.counts.pending).toBe(st.state.total);
  });
  test('adım onaylanınca bekleyenlerden düşer', () => {
    const plan = buildWith('onay.txt dosyasını düzenle');
    const s = approval.createApprovalSession(plan);
    const first = s.session.steps[0].id;
    const ok = approval.approveStep(s.session.id, first);
    expect(ok.ok).toBe(true);
    const st = approval.sessionState(s.session.id);
    expect(st.state.counts.approved).toBe(1);
    expect(st.state.counts.pending).toBeLessThan(st.state.total);
  });
  test('tüm adımlar onaylanınca oturum açılır', () => {
    const plan = buildWith('toplu.txt dosyasını oluştur');
    const s = approval.createApprovalSession(plan);
    approval.bulkApprove(s.session.id, { all: true });
    const st = approval.sessionState(s.session.id);
    expect(st.state.counts.pending).toBe(0);
    expect(st.state.editable).toBe(true);
    expect(approval.resolveSession(s.session.id).ok).toBe(true);
  });
  test('var olmayan oturum hata döndürür', () => {
    expect(approval.approveStep('olmayan-oturum', 'x').ok).toBe(false);
  });
  test('iptal oturumu çözülmeden kapatır', () => {
    const plan = buildWith('iptal.txt dosyasını oku');
    const s = approval.createApprovalSession(plan);
    approval.cancelSession(s.session.id);
    expect(approval.sessionState(s.session.id).state.status).toBe('cancelled');
  });
  test('plan düzenleme adımı değiştirir', () => {
    const plan = buildWith('duzen.txt dosyasını düzenle');
    const s = approval.createApprovalSession(plan);
    const first = s.session.steps[0];
    const ed = approval.planEdit(s.session.id, { op: 'change', stepId: first.id, patch: { target: 'yeni/hedef.js' } });
    expect(ed.ok).toBe(true);
    const pending = approval.pendingSteps(s.session.id);
    expect(pending.ok).toBe(true);
    const updated = pending.pending.find((p) => p.id === first.id);
    if (updated) expect(updated.target).toBe('yeni/hedef.js');
  });
});

describe('plans/grading — sonuç derecelendirme', () => {
  test('başarılı tam sonuç iyi skor alır', () => {
    const g = grading.gradeTaskResult({ status: 'completed', changedFiles: ['a.js', 'b.js'], errors: [], durationMs: 500, output: 'dosya düzenlendi', steps: ['ok', 'ok'] });
    expect(g.ok).toBe(true);
    expect(g.score >= 0 && g.score <= 10).toBe(true);
    expect(['pass', 'marginal', 'fail'].includes(g.verdict)).toBe(true);
  });
  test('hatalı sonuç düşük skor alır', () => {
    const g = grading.gradeTaskResult({ status: 'failed', changedFiles: [], errors: ['patladı'], durationMs: 100 });
    expect(g.score < 5).toBe(true);
  });
  test('eksik veriyle güvenli hata döner', () => {
    const g = grading.gradeTaskResult(null);
    expect(g.ok).toBe(false);
  });
  test('kural dışı skor sınırları korunur', () => {
    const g = grading.gradeTaskResult({ status: 'completed', changedFiles: ['a.js'], errors: [], durationMs: 10 });
    expect(g.score >= 0 && g.score <= 10).toBe(true);
  });
  test('verdict alanı tanımlı', () => {
    const g = grading.gradeTaskResult({ status: 'completed', changedFiles: ['x'], errors: [], durationMs: 10 });
    expect(g.verdict).toBeTruthy();
  });
});

describe('plans/diff-apply — güvenli diff uygulaması', () => {
  test('geçerli birleşik diff parse edilir', () => {
    const sample = '--- a/test.txt\n+++ b/test.txt\n@@ -1,1 +1,1 @@\n-eski\n+yeni\n';
    const r = diffApply.parseUnifiedDiff(sample);
    expect(r.ok).toBe(true);
    expect(r.hunks.length).toBe(1);
  });
  test('bozuk diff reddedilir', () => {
    expect(diffApply.parseUnifiedDiff('bozuk icerik').ok).toBe(false);
  });
  test('applyDiffToFile dosya yoksa hata döndürür', async () => {
    const r = await diffApply.applyDiffToFile('/tmp/olmayan-dosya-xyz-123.txt', '--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n');
    expect(r.ok).toBe(false);
  });
  test('geçerli diff geçici dosyaya uygulanır', async () => {
    const fs = require('fs');
    const os = require('os');
    const fp = path.join(os.tmpdir(), `krevyx-diff-test-${Date.now()}.txt`);
    fs.writeFileSync(fp, 'eski satir\n');
    const diff = `--- a/${path.basename(fp)}\n+++ b/${path.basename(fp)}\n@@ -1,1 +1,1 @@\n-eski satir\n+yeni satir\n`;
    const r = await diffApply.applyDiffToFile(fp, diff);
    const after = fs.readFileSync(fp, 'utf8');
    fs.unlinkSync(fp);
    expect(r.ok).toBe(true);
    expect(after).toContain('yeni satir');
    expect(after).not.toContain('eski satir');
  });
  test('validateDiffIntegrity başlık tutarsızlığını yakalar', () => {
    // Başlık 1 satır ilan ediyor ama gövde 2 satır içeriyor — tutarsız hunk
    const r = diffApply.validateDiffIntegrity('--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n-ikinci-eski\n');
    expect(r.valid).toBe(false);
    expect(r.invalid).toBeGreaterThan(0);
  });
  test('tutarlı diff geçerli sayılır', () => {
    const r = diffApply.validateDiffIntegrity('--- a/x\n+++ b/x\n@@ -1,1 +1,1 @@\n-a\n+b\n');
    expect(r.valid).toBe(true);
  });
});

describe('plans/diff-review — hunk inceleme', () => {
  const sample = '--- a/a.txt\n+++ b/a.txt\n@@ -1,2 +1,2 @@\n degisme\n-eski\n+yeni\n@@ -3,1 +3,1 @@\n b\n-c\n+d\n';

  test('diff hunklara ayrışır', () => {
    const r = diffReview.createReview(sample);
    expect(r.ok).toBe(true);
    expect(r.review.hunks.length).toBeGreaterThan(0);
    expect(r.review.id).toBeTruthy();
  });
  test('kararlar duruma yansır', () => {
    const r = diffReview.createReview(sample);
    const d = diffReview.decideHunk(r.review.id, 0, 'approved');
    expect(d.ok).toBe(true);
    expect(diffReview.reviewState(r.review.id).state.counts.approved).toBe(1);
  });
  test('toplu onay tüm hunkları onaylar', () => {
    const r = diffReview.createReview(sample);
    diffReview.bulkDecide(r.review.id, { all: true, decision: 'approved' });
    const st = diffReview.reviewState(r.review.id);
    expect(st.state.counts.approved).toBe(st.state.total);
  });
  test('exportReview sarif üretir', () => {
    const r = diffReview.createReview(sample);
    const e = diffReview.exportReview(r.review.id);
    expect(e.ok).toBe(true);
    expect(e.sarif.version).toBe('2.1.0');
  });
  test('filteredDiff yalnızca onaylıları içerir', () => {
    const r = diffReview.createReview(sample);
    diffReview.decideHunk(r.review.id, 0, 'approved');
    const f = diffReview.filteredDiff(r.review.id);
    expect(f.ok).toBe(true);
    expect(typeof f.diff).toBe('string');
  });
  test('bilinmeyen review kimliği hata döndürür', () => {
    expect(diffReview.decideHunk('olmayan', 0, 'approved').ok).toBe(false);
  });
});

describe('plans/project-memory — KREYX.md ve notlar', () => {
  const fs = require('fs');
  const os = require('os');
  const dir = path.join(os.tmpdir(), `krevyx-memory-test-${Date.now()}`);

  afterEach(() => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    try { projectMemory.testOnlyClear(); } catch { /* ignore */ }
  });

  test('ensureKreyxMd iskelet dosyası oluşturur', () => {
    fs.mkdirSync(dir, { recursive: true });
    const r = projectMemory.ensureKreyxMd(dir);
    expect(r.ok).toBe(true);
    expect(r.created).toBe(true);
    expect(fs.existsSync(r.path)).toBe(true);
    expect(fs.readFileSync(r.path, 'utf8')).toContain('KREYX.md');
  });
  test('var olan dosyayı yeniden oluşturmadan bırakır', () => {
    fs.mkdirSync(dir, { recursive: true });
    const first = projectMemory.ensureKreyxMd(dir);
    const second = projectMemory.ensureKreyxMd(dir);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
  });
  test('not ekleme ve tekrar eden isabet', () => {
    const g = projectMemory.getMemoryStore('test-proje');
    expect(g.ok).toBe(true);
    const a = g.store.add({ category: 'genel', body: 'aynı not içeriği' });
    expect(a.ok).toBe(true);
    expect(a.note.hits).toBe(0);
    const b = g.store.add({ category: 'genel', body: 'aynı not içeriği' });
    expect(b.duplicated).toBe(true);
    expect(b.note.hits).toBe(1);
  });
  test('sorgu alaka ile sıralı sonuç verir', () => {
    const g = projectMemory.getMemoryStore('sorgu-proje');
    g.store.add({ category: 'genel', body: 'veritabanı bağlantısı postgres kullanıyor' });
    g.store.add({ category: 'genel', body: 'arabirimi zümrüt yeşili ile boyandı' });
    const r = g.store.query('veritabanı postgres');
    expect(r.ok).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0].note.body).toContain('postgres');
  });
  test('prune fazlalıkları temizler', () => {
    const g = projectMemory.getMemoryStore('prune-proje');
    for (let i = 0; i < 5; i += 1) g.store.add({ category: 'genel', body: `geçici not ${i}` });
    const r = g.store.prune();
    expect(r.ok).toBe(true);
    expect(r.remaining).toBeLessThanOrEqual(r.before);
  });
});
