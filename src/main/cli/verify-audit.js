/*
 * verify-audit.js — Krevyx v3.23 CLI komutu
 *
 * Terminalden denetim zinciri doğrulaması:
 *   krevyx verify-audit                   ~/.krevyx/audit içindeki tüm .jsonl dosyaları doğrular
 *   krevyx verify-audit <dosya>           tek bir denetim dosyasını doğrular
 *   krevyx verify-audit <dizin>           dizindeki tüm .jsonl dosyaları doğrular
 *   krevyx verify-audit --json            sonuçları makine dostu JSON olarak basar
 *
 * Doğrulama salt okunurdur; çıkış kodu 0 = zincir bütür, 1 = hata tespit edildi, 2 = kullanım hatası.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { verifyAuditFile, verifyAuditDir } = require(path.join(__dirname, '..', 'agents', 'verify-audit.js'));

function resolveTargets(args) {
  if (args.length === 0) {
    // Elektron olmadan kullanıcı dizini varsayılır (CLI süreci, arayüz değil)
    return [path.join(os.homedir(), '.krevyx', 'audit')];
  }
  const targets = [];
  for (const a of args) {
    if (a === '--json') continue;
    if (!fs.existsSync(a)) {
      process.stderr.write(`Hata: hedef bulunamadı: ${a}\n`);
      process.exit(2);
    }
    targets.push(a);
  }
  return targets;
}

function run(argv) {
  const args = (argv || process.argv).slice(2);
  const jsonMode = args.includes('--json');
  const targets = resolveTargets(args);
  const reports = [];
  for (const t of targets) {
    let isDir = false;
    try {
      isDir = fs.statSync(t).isDirectory();
    } catch {
      isDir = false;
    }
    reports.push(isDir ? verifyAuditDir(t) : verifyAuditFile(t));
  }
  const allGood = reports.every((r) => r.ok && r.integrity);
  const anyLoaded = reports.some((r) => r.ok);
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ version: '3.23.0', targets, reports, integrity: allGood }, null, 2) + '\n');
  } else {
    process.stdout.write(`Krevyx Denetim Doğrulama v3.23.0 — ${targets.length} hedef\n`);
    for (const r of reports) {
      if (!r.ok) {
        process.stdout.write(`  [OKUMADI] ${r.file || r.dir || targets[reports.indexOf(r)]}: ${r.error}\n`);
        continue;
      }
      const status = r.integrity ? 'BÜTÜN' : 'HATALI';
      if (r.file) {
        process.stdout.write(`  [${status}] ${path.basename(r.file)} — ${r.stats.lineCount || 0} satır, ${r.valid} geçerli, ${r.corrupted} bozuk, ${r.chainBroken} zincir kırığı (${r.stats.sizeBytes || 0} B)\n`);
      } else {
        process.stdout.write(`  [${status}] ${r.dir} — ${(r.files || []).length} dosya:\n`);
        for (const f of r.files || []) {
          process.stdout.write(`      ${path.basename(f.file)}: ${f.stats.lineCount || 0} satır, ${f.valid} geçerli, ${f.corrupted} bozuk, ${f.chainBroken} kırık\n`);
        }
      }
      if (r.message) process.stdout.write(`      ${r.message}\n`);
    }
    process.stdout.write(allGood && anyLoaded ? '\nSonuç: zincir bütündür.\n' : '\nSonuç: bütünlük hatası tespit edildi (çıkış kodu 1).\n');
  }
  process.exit(allGood && anyLoaded ? 0 : 1);
}

module.exports = { run };

// bin/krevyx.js tarafından require edildiğinde komutu çalıştır
run();
