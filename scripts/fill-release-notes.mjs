#!/usr/bin/env node
/**
 * fill-release-notes.mjs — GitHub Release gövdesi doldurucu (v3.18)
 *
 * Release'lerin body'si boşsa ("Not yok." göstermemesi için) her tag için
 * sürüm notlarını GitHub API ile PATCH olarak yazar. Body zaten doluysa
 * dokunmaz (idempotent).
 *
 *   GITHUB_TOKEN=<pat> node scripts/fill-release-notes.mjs
 *
 * Notlar her tag için sabit içerik olarak script içine gömülüdür;
 * ileride tag açıklama yorumlarından (commit convention) otomatik üretim
 * için genNotes() fonksiyonu genişletilebilir.
 */
import process from "node:process";

const REPO_OWNER = "yasinkaya701";
const REPO_NAME = "OllamaX";
const API = "https://api.github.com";

const token = process.env.GITHUB_TOKEN;
if (!token) {
  process.stderr.write("Kullanım: GITHUB_TOKEN=<pat> node scripts/fill-release-notes.mjs\n");
  process.exit(2);
}

/* ---- Sürüm notları: tag -> markdown gövde ---- */
function notesFor(tag) {
  const notes = {
    "v3.18.0": `## Krevyx Ultra v3.18.0 — CLI & Enterprise Entry

v3.18, Krevyx'i CI/CD dünyasına taşıyan sürüm. Electron'u hiç başlatmadan ajanları çalıştıran headless CLI, taşınabilir stüdyo paketleri ve kurumsal denetim export'u bu sürümde.

### Yeni özellikler

- **Headless CLI**: \`krevyx run "prompt"\` tek ajan, \`--agents a,b,c\` ajan zinciri; \`--output json\` ile satır satır JSONL (CI ayrıştırması için).
- **\`.krevyxprofile\` paket formatı**: tüm stüdyo yapılandırması (ajanlar, şablonlar, sağlayıcılar, MCP sunucuları) tek, anahtarsız dosyada — ekipçe paylaşılabilir. \`krevyx profile export / import\`.
- **Ajan-MCP broker**: her ajana kendi MCP sunucu kümesi atanır; ajanlar arası sunucu çakışması yok.
- **Denetim export'u**: JSON, CSV ve **SARIF** (GitHub Code Scanning uyumlu) formatlarında dışa aktarım.
- **Browser kontrol aracı**: headless Chromium CDP ile web otomasyonu yapan ajan aracı.

### İyileştirmeler

- Ayarlar modalına v3.18 panelleri (Profil, MCP atamaları, Denetim export) entegre edildi.
- Proje tamamen açık kaynak: MIT lisansı.

### Teknik

- 13 test paketi, 189 test — tamamı geçiyor.
- GitHub Actions: pnpm v11 native build onayı (\`pnpm-workspace.yaml\`), otomatik asset isimlendirme.`,

    "v3.17.0": `## Krevyx Ultra v3.17.0 — Topluluk & Ekosistem

Krevyx artık tamamen açık kaynak (MIT). Bu sürüm topluluğu ve eklenti ekosistemini büyütme fazıdır.

### Yeni özellikler

- **Açık kaynak kimliği**: MIT lisansı, detaylı CONTRIBUTING rehberi ve GitHub Contributors bölümü.
- **Şablon paneli**: ajan şablonları için CRUD, içe/dışa aktarma ve taşınabilir şablon dosyaları.
- **Eklenti yönetimi**: eklenti yükleyici, başlatma ve kaldırma; starter şablon demoları.

### İyileştirmeler

- Hero'da canlı GitHub yıldız sayacı ve katılımcı avatarları.
- Pro/özel katman tamamen kaldırıldı — tüm özellikler MIT altında.`,

    "v3.16.4": `## Krevyx Ultra v3.16.4 — Güvenlik, Maliyet & Orkestrasyon 2.0

### Yeni özellikler

- **Secrets Vault**: OS keychain entegrasyonu (keytar) + hafıza güvenli sürümü; air-gapped mod.
- **Maliyet motoru**: token tüketimi takibi ve aylık bütçe sınırı.
- **Orkestrasyon 2.0**: Claude Code → Codex → Antigravity prompt bayrağı ve baş-ajan (head-agent) seçimi.

### İyileştirmeler

- GitHub Actions çok platformlu paketleme (Win/Mac/Linux) otomasyonu.`,

    "v3.13.0": `## Krevyx Ultra v3.13.0 — Üç Platform Release

Tek tıkla kurulum artık üç platformda da canlı: portable Windows kurucusu, Apple Silicon imzalı DMG ve Linux AppImage.`,

    "v3.11.0": `## OllamaX Ultra v3.11.0 — Otomatik GitHub Repo Keşfi

Canlı GitHub Search API çekimi, disk cache ve periyodik yenileme ile öne çıkan repolar 5 kategoride otomatik keşfedilir: nanoGPT, llama2.c ve daha fazlası tek tıkla arama paneline akar.`,
  };
  return notes[tag] || null;
}

async function patch(releaseId, body) {
  const url = `${API}/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${url} → ${res.status}: ${err}`);
  }
  return res.status;
}

async function main() {
  const res = await fetch(`${API}/repos/${REPO_OWNER}/${REPO_NAME}/releases`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) {
    process.stderr.write(`Release listesi alınamadı: ${res.status}\n`);
    process.exit(1);
  }
  const releases = await res.json();
  let updated = 0;
  for (const rel of releases) {
    const body = notesFor(rel.tag_name);
    if (!body) {
      process.stdout.write(`[SKIP] ${rel.tag_name} — not seti yok\n`);
      continue;
    }
    if (rel.body && rel.body.trim().length > 0) {
      process.stdout.write(`[SKIP] ${rel.tag_name} — body zaten dolu\n`);
      continue;
    }
    await patch(rel.id, body);
    updated += 1;
    process.stdout.write(`[OK]   ${rel.tag_name} — release notes yazıldı\n`);
  }
  process.stdout.write(`\nTamamlandı: ${updated} release güncellendi\n`);
}

main().catch((err) => {
  process.stderr.write(`Hata: ${err.message}\n`);
  process.exit(1);
});
