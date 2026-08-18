'use strict';
/**
 * cli/v325-commands.js — Krevyx v3.25 CLI komutları
 *
 * bin/krevyx.js'e eklenen alt komutlar:
 *   krevyx plan <prompt> [--cwd .] [--json]      → adım planı üret
 *   krevyx diff-apply <dosya> <diff-dosyası> [--strategy fuzzy]
 *   krevyx diff-review <diff-dosyası> [--export sarif]
 *   krevyx memory <proje> <komut>                → add|query|prune|info
 *   krevyx queue-demo                            → kuyruk akışını göster
 *   krevyx secrets-scan <hedef>                  → dizin/dosya taraması
 *   krevyx audit2 <dosya|dizin>                  → zincir v2 doğrulama
 *   krevyx kreyx-md <dizin>                      → KREYX.md iskeleti
 *
 * Çıkış kodları: 0 = başarı, 1 = bulgu/hata, 2 = kullanım hatası.
 * Tüm I/O opts üzerinden inject edilebilir (test edilebilirlik).
 */
const path = require('path');
const os = require('os');

function engine() { return require(path.join(__dirname, '..', 'plans', 'engine')); }
function diffApply() { return require(path.join(__dirname, '..', 'plans', 'diff-apply')); }
function diffReview() { return require(path.join(__dirname, '..', 'plans', 'diff-review')); }
function projectMemory() { return require(path.join(__dirname, '..', 'plans', 'project-memory')); }
function secretsAudit() { return require(path.join(__dirname, '..', 'trust', 'secrets-audit')); }
function auditV2() { return require(path.join(__dirname, '..', 'trust', 'audit-chain-v2')); }

function writeOut(str, opts) { (opts && opts.stdout ? opts.stdout : process.stdout).write(str); }
function writeErr(str, opts) { (opts && opts.stderr ? opts.stderr : process.stderr).write(str); }

function cmdPlan(argv, opts) {
  const args = (argv || []).slice();
  const jsonMode = args.includes('--json');
  const cwdIdx = args.indexOf('--cwd');
  const cwd = cwdIdx >= 0 ? (args[cwdIdx + 1] || '.') : process.cwd();
  const promptArgs = args.filter((a) => a !== '--json' && a !== '--cwd');
  const promptIdx = promptArgs.indexOf(args.includes('--cwd') ? '--cwd' : '__none__');
  const prompt = promptArgs.slice(cwdIdx >= 0 ? 2 : 0).join(' ');
  if (!prompt) {
    writeErr('Kullanım: krevyx plan "görev tanımı"\n', opts);
    return 2;
  }
  const res = engine().buildPlan(prompt, { cwd });
  if (!res.ok) { writeErr(`Hata: ${res.error}\n`, opts); return 1; }
  if (jsonMode) {
    writeOut(JSON.stringify(res.plan, null, 2) + '\n', opts);
  } else {
    writeOut(`Plan ${res.plan.id} — ${res.plan.steps.length} adım, risk ${(() => { const e = engine(); return e.planRiskScore(res.plan); })()}/100\n`, opts);
    res.plan.steps.forEach((s, i) => {
      writeOut(`  ${i + 1}. [${s.type}] ${s.target || '—'} (risk ${s.risk}${s.blocked ? ' BLOKLU' : ''})\n`, opts);
    });
  }
  return 0;
}

function cmdDiffApply(argv, opts) {
  const args = (argv || []).slice();
  const [file, diffFile] = args;
  if (!file || !diffFile) {
    writeErr('Kullanım: krevyx diff-apply <dosya> <diff-dosyası>\n', opts);
    return 2;
  }
  const fs = require('fs');
  if (!fs.existsSync(file) || !fs.existsSync(diffFile)) {
    writeErr('Hata: dosya bulunamadı\n', opts);
    return 2;
  }
  const diffText = fs.readFileSync(diffFile, 'utf8');
  const res = diffApply().applyDiffToFile(file, diffText, { strategy: 'fuzzy' });
  if (!res.ok) { writeErr(`Hata: ${res.error}\n`, opts); return 1; }
  writeOut(`Uygulandı: ${res.report.applied.length} hunk, atlanan: ${res.report.skipped.length}\n`, opts);
  return 0;
}

function cmdDiffReview(argv, opts) {
  const args = (argv || []).slice();
  const exportMode = args.includes('--export');
  const diffFile = args.find((a) => a !== '--export');
  const fmtIdx = args.indexOf('--export');
  const fmt = fmtIdx >= 0 ? (args[fmtIdx + 1] || 'sarif') : 'sarif';
  if (!diffFile) {
    writeErr('Kullanım: krevyx diff-review <diff-dosyası> [--export sarif|json]\n', opts);
    return 2;
  }
  const fs = require('fs');
  if (!fs.existsSync(diffFile)) { writeErr('Hata: diff dosyası bulunamadı\n', opts); return 2; }
  const diffText = fs.readFileSync(diffFile, 'utf8');
  const res = diffReview().createReview(diffText);
  if (!res.ok) { writeErr(`Hata: ${res.error}\n`, opts); return 1; }
  writeOut(`İnceleme ${res.review.id} — ${res.review.hunks.length} hunk\n`, opts);
  if (exportMode && fmt === 'sarif') {
    const exported = diffReview().exportReview(res.review.id);
    if (exported.ok) {
      writeOut(JSON.stringify(exported.sarif, null, 2) + '\n', opts);
    }
  }
  return 0;
}

function cmdMemory(argv, opts) {
  const args = (argv || []).slice();
  const project = args[0];
  const sub = args[1];
  const rest = args.slice(2).join(' ');
  if (!project || !sub) {
    writeErr('Kullanım: krevyx memory <proje> <add|query|prune|info> [metin]\n', opts);
    return 2;
  }
  const g = projectMemory().getMemoryStore(project);
  if (!g.ok) { writeErr(`Hata: ${g.error}\n`, opts); return 1; }
  if (sub === 'add') {
    const r = g.store.add({ category: 'general', body: rest });
    if (!r.ok) { writeErr(`Hata: ${r.error}\n`, opts); return 1; }
    writeOut(r.duplicated ? 'Not zaten var (isabet sayacı +1)\n' : `Not eklendi: ${r.note.id}\n`, opts);
    return 0;
  }
  if (sub === 'query') {
    const r = g.store.query(rest);
    r.results.forEach((x) => writeOut(`  [${x.note.category}] ${x.note.body.slice(0, 120)} (alaka ${x.relevance.toFixed(2)})\n`, opts));
    return 0;
  }
  if (sub === 'prune') {
    const r = g.store.prune();
    writeOut(`Prune: ${r.removed} silindi, kalan ${r.remaining}\n`, opts);
    return 0;
  }
  if (sub === 'info') {
    const r = g.store.info();
    writeOut(`Proje ${r.project}: ${r.total} not\n`, opts);
    Object.entries(r.byCategory).forEach(([c, n]) => writeOut(`  ${c}: ${n}\n`, opts));
    return 0;
  }
  writeErr('Bilinmeyen alt komut\n', opts);
  return 2;
}

function cmdSecretsScan(argv, opts) {
  const args = (argv || []).slice();
  const target = args[0];
  if (!target) {
    writeErr('Kullanım: krevyx secrets-scan <dizin|dosya>\n', opts);
    return 2;
  }
  const fs = require('fs');
  const isDir = fs.existsSync(target) && fs.statSync(target).isDirectory();
  const res = isDir ? secretsAudit().scanDirectory(target) : secretsAudit().scanFile(target);
  if (!res.ok) { writeErr(`Hata: ${res.error}\n`, opts); return 1; }
  const summary = secretsAudit().summarize(res.findings);
  writeOut(`Tarama tamamlandı — ${res.findings.length} bulgu (${summary.verdict})\n`, opts);
  res.findings.slice(0, 50).forEach((f) => {
    writeOut(`  [${f.severity}] ${f.rule} @ ${f.file || f.env || '<stdin>'}:${f.line} — ${f.match.slice(0, 40)}\n`, opts);
  });
  return summary.verdict === 'clean' ? 0 : 1;
}

function cmdAudit2(argv, opts) {
  const args = (argv || []).slice();
  const jsonMode = args.includes('--json');
  const targets = args.filter((a) => a !== '--json');
  if (!targets.length) targets.push(path.join(os.homedir(), '.krevyx', 'audit'));
  const reports = [];
  for (const t of targets) {
    let isDir = false;
    try { isDir = require('fs').statSync(t).isDirectory(); } catch { isDir = false; }
    if (isDir) {
      /* Dizin: içindeki .jsonl dosyalarını doğrula */
      const fs = require('fs');
      const files = fs.readdirSync(t).filter((f) => f.endsWith('.jsonl'));
      const subs = files.map((f) => auditV2().verifyFile(path.join(t, f)));
      reports.push({ dir: t, ok: true, files: subs });
    } else {
      reports.push(auditV2().verifyFile(t));
    }
  }
  const allGood = reports.every((r) => r.ok && (r.valid !== false));
  if (jsonMode) {
    writeOut(JSON.stringify({ version: '3.25.0', reports }, null, 2) + '\n', opts);
  } else {
    writeOut(`Krevyx Denetim Zinciri v2 — ${targets.length} hedef\n`, opts);
    reports.forEach((r) => {
      if (!r.ok) { writeErr(`  [HATA] ${r.error}\n`, opts); return; }
      if (r.valid) writeOut(`  [BÜTÜN] ${r.total || 0} giriş, ${r.blocks || 0} blok\n`, opts);
      else writeOut(`  [HATALI] satır ${r.badLine}\n`, opts);
    });
  }
  return allGood ? 0 : 1;
}

function cmdKreyxMd(argv, opts) {
  const args = (argv || []).slice();
  const dir = args[0] || process.cwd();
  const fs = require('fs');
  const res = projectMemory().ensureKreyxMd(dir, { fs });
  if (!res.ok) { writeErr(`Hata: ${res.error}\n`, opts); return 1; }
  writeOut(res.created ? `KREYX.md oluşturuldu: ${res.path}\n` : `Zaten var: ${res.path}\n`, opts);
  return 0;
}

const COMMANDS = {
  plan: cmdPlan,
  'diff-apply': cmdDiffApply,
  'diff-review': cmdDiffReview,
  memory: cmdMemory,
  'secrets-scan': cmdSecretsScan,
  audit2: cmdAudit2,
  'kreyx-md': cmdKreyxMd,
};

function run(argv, opts) {
  const args = (argv || process.argv).slice(2);
  const cmd = args[0];
  if (!cmd || !COMMANDS[cmd]) {
    writeErr('Krevyx v3.25 CLI komutları: plan, diff-apply, diff-review, memory, secrets-scan, audit2, kreyx-md\n', opts);
    return 2;
  }
  return COMMANDS[cmd](args.slice(1), opts);
}

module.exports = { run, COMMANDS };
