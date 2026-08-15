'use strict';
/* Krevyx v3.0 — denetim zinciri doğrulama CLI aracı.
 * Kullanım: npm run audit:verify [audit.jsonl yolu] */
const auditLog = require('../src/main/audit-log');

const fs = require('fs');
const path = require('path');

function defaultPath() {
  const root = path.resolve(__dirname, '..');
  return path.join(root, 'audit.jsonl');
}

const target = process.argv[2] || defaultPath();
if (!fs.existsSync(target)) {
  console.log(`Denetim kaydı bulunamadı (${target}); zincir boş. Sorun yok.`);
  process.exit(0);
}

const result = auditLog.verifyChain(target);
if (result.ok) {
  console.log(`Denetim zinciri sağlam: ${result.entries} kayıt doğrulandı. Son hash: ${result.lastHash}`);
  process.exit(0);
}
console.error(`ZİNCİR BOZUK: ${result.error}`);
process.exit(1);
