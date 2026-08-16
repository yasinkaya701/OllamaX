#!/usr/bin/env node
/**
 * bin/krevyx.js — Krevyx CLI giriş noktası (v3.18)
 *
 * Alt komutlar:
 *   run    penceresiz ajan/zincir çalıştırma (cli/run.js)
 *   profile .krevyxprofile paket işlemleri (dışa/içe aktarma)
 *
 * Electron başlatılmaz; saf Node.js sürecidir.
 */
'use strict';
const path = require('path');

const cmd = process.argv[2];

function usage() {
  process.stdout.write(
    `Krevyx CLI v3.18\n\nKullanım:\n  krevyx run <prompt> [seçenekler]   ajan/zincir çalıştır\n  krevyx profile export [dosya]      stüdyo paketini dışa aktar\n  krevyx profile import <dosya>      paketi stüdyoya içe aktar\n  krevyx -h, --help                  yardım\n`,
  );
  process.exit(cmd ? 1 : 0);
}

if (!cmd || cmd === '-h' || cmd === '--help') {
  usage();
}

if (cmd === 'run') {
  require(path.join(__dirname, '..', 'src', 'main', 'cli', 'run.js'));
} else if (cmd === 'profile') {
  require(path.join(__dirname, '..', 'src', 'main', 'cli', 'profile.js'));
} else {
  process.stderr.write(`Bilinmeyen komut: ${cmd}\n\n`);
  usage();
}
