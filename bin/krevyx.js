#!/usr/bin/env node
/**
 * bin/krevyx.js — Krevyx CLI giriş noktası (v3.26)
 *
 * Alt komutlar:
 *   run          penceresiz ajan/zincir çalıştırma (cli/run.js)
 *   profile      .krevyxprofile paket işlemleri (dışa/içe aktarma)
 *   verify-audit denetim zinciri (.jsonl) bütünlük doğrulaması (cli/verify-audit.js)
 *   plan, diff-apply, diff-review, memory, secrets-scan, audit2, kreyx-md
 *                v3.25 komutları (cli/v325-commands.js)
 *   runtime-run, tools, sandbox-state, llm-chat, session-list, eval,
 *   pipeline-run, swarm-match, budget-quota, skills-plan, diff-gate,
 *   ci-status, quarantine-list, allowlist, policy-set
 *                v3.26 komutları (cli/v326-commands.js)
 *
 * Electron başlatılmaz; saf Node.js sürecidir.
 */
'use strict';
const path = require('path');

const cmd = process.argv[2];

function usage() {
  process.stdout.write(
    `Krevyx CLI v3.26\n\nKullanım:\n  krevyx run <prompt> [seçenekler]             ajan/zincir çalıştır\n  krevyx profile export [dosya]              stüdyo paketini dışa aktar\n  krevyx profile import <dosya>              paketi stüdyoya içe aktar\n  krevyx verify-audit [dosya|dizin] [--json] denetim zincirini doğrula (v1)\n  krevyx plan <prompt> [--cwd .] [--json]    yeniden denetçi adım planı\n  krevyx diff-apply <dosya> <diff-dosyası>   güvenli diff uygulaması\n  krevyx diff-review <diff-dosyası> [--export sarif] hunk incelemesi\n  krevyx memory <proje> <add|query|prune|info> proje belleği\n  krevyx secrets-scan <hedef>                gizli sızıntı taraması\n  krevyx audit2 [dosya|dizin] [--json]       merkle denetim zinciri v2\n  krevyx kreyx-md [dizin]                    KREYX.md iskeleti\n  krevyx -h, --help                          yardım\n`,
  );
  process.exit(cmd ? 1 : 0);
}

if (!cmd || cmd === '-h' || cmd === '--help') {
  usage();
}

// Alt komutlara temiz argv ile delegasyon: process.argv'den komut jetonu düşülür,
// böylece alt modüller `process.argv.slice(2)` ile doğrudan kendi argümanlarını görür.
if (cmd === 'run') {
  process.argv.splice(2, 1);
  require(path.join(__dirname, '..', 'src', 'main', 'cli', 'run.js'));
} else if (cmd === 'profile') {
  process.argv.splice(2, 1);
  require(path.join(__dirname, '..', 'src', 'main', 'cli', 'profile.js'));
} else if (cmd === 'verify-audit') {
  process.argv.splice(2, 1);
  require(path.join(__dirname, '..', 'src', 'main', 'cli', 'verify-audit.js'));
} else if (['plan', 'diff-apply', 'diff-review', 'memory', 'secrets-scan', 'audit2', 'kreyx-md'].includes(cmd)) {
  /* argv değişmeden geçer — run() ilk jetonu komut olarak çözümler */
  process.exitCode = require(path.join(__dirname, '..', 'src', 'main', 'cli', 'v325-commands.js')).run(process.argv);
} else if (['runtime-run', 'tools', 'sandbox-state', 'llm-chat', 'session-list', 'eval', 'pipeline-run', 'swarm-match', 'budget-quota', 'skills-plan', 'diff-gate', 'ci-status', 'quarantine-list', 'allowlist', 'policy-set'].includes(cmd)) {
  /* argv değişmeden geçer — run() ilk jetonu komut olarak çözümler (v3.26) */
  process.exitCode = require(path.join(__dirname, '..', 'src', 'main', 'cli', 'v326-commands.js')).run(process.argv);
} else {
  process.stderr.write(`Bilinmeyen komut: ${cmd}\n\n`);
  usage();
}
