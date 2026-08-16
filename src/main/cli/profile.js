/**
 * cli/profile.js — `krevyx profile` CLI alt komutu (v3.18)
 *
 * .krevyxprofile paketlerini terminalden dışa/içe aktarır:
 *   krevyx profile export [dosya.krevyxprofile]
 *   krevyx profile import <dosya.krevyxprofile>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  exportProfile,
  importProfile,
  profileExtension,
} = require('../profile-package');

function defaultExportPath() {
  return path.join(process.cwd(), `krevyx-studio${profileExtension()}`);
}

async function main() {
  const sub = process.argv[3];
  const target = process.argv[4];
  try {
    if (sub === 'export') {
      const outPath = target || defaultExportPath();
      const pkg = exportProfile();
      fs.writeFileSync(outPath, JSON.stringify(pkg, null, 2), 'utf8');
      process.stdout.write(`Profil paketi dışa aktarıldı: ${outPath}\n`);
      process.stdout.write(
        `  ${pkg.templates.length} şablon, ${pkg.agents.length} ajan, ${pkg.providers.length} sağlayıcı, ${pkg.mcpServers.length} MCP sunucusu\n`,
      );
    } else if (sub === 'import') {
      if (!target) {
        process.stderr.write('Kullanım: krevyx profile import <dosya.krevyxprofile>\n');
        process.exit(2);
      }
      const raw = fs.readFileSync(path.resolve(target), 'utf8');
      const pkg = JSON.parse(raw);
      const result = importProfile(pkg);
      if (!result.ok) {
        process.stderr.write(`İçe aktarma başarısız: ${result.error}\n`);
        process.exit(1);
      }
      const { templates, agents, providers, mcpServers } = result.imported;
      process.stdout.write(
        `İçe aktarıldı: ${templates} şablon, ${agents} ajan, ${providers} sağlayıcı, ${mcpServers} MCP sunucusu\n`,
      );
    } else {
      process.stderr.write('Kullanım: krevyx profile <export|import> [dosya]\n');
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`Hata: ${err.message || err}\n`);
    process.exit(1);
  }
}

main();
