#!/usr/bin/env node
/**
 * bin/krevyx.js — Krevyx CLI giriş noktası (v3.23)
 *
 * Alt komutlar:
 *   run          penceresiz ajan/zincir çalıştırma (cli/run.js)
 *   profile      .krevyxprofile paket işlemleri (dışa/içe aktarma)
 *   verify-audit denetim zinciri (.jsonl) bütünlük doğrulaması (cli/verify-audit.js)
 *
 * Electron başlatılmaz; saf Node.js sürecidir.
 */
'use strict';
const path = require('path');

const cmd = process.argv[2];

function usage() {
  process.stdout.write(
    `Krevyx CLI v3.23\n\nKullanım:\n  krevyx run <prompt> [seçenekler]             ajan/zincir çalıştır\n  krevyx profile export [dosya]              stüdyo paketini dışa aktar\n  krevyx profile import <dosya>              paketi stüdyoya içe aktar\n  krevyx verify-audit [dosya|dizin] [--json] denetim zincirini doğrula\n  krevyx -h, --help                          yardım\n`,
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
} else {
  process.stderr.write(`Bilinmeyen komut: ${cmd}\n\n`);
  usage();
}
