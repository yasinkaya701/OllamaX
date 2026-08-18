# Rakip Öncül Özellik Sentezi — Krevyx v3.21 (YENİ İŞ)

## Faz 1 — Araştırma
- [x] Cursor öne çıkan özellikler (Composer, agent modu, ghost, tab completions, Rules, @mentions, multi-file diff)
- [x] Claude Code öne çıkan özellikler (slash komutları, /compact, hooks, subagents, permissions, MCP)
- [x] Codex CLI (sandbox, approval model, session resume, TUI, multi-session)
- [x] Gemini CLI (Cloud entegrasyonu, IDE integration, slash komutları)
- [x] Windsurf (Cascade, supercomplete, memory) + Zed (agent, speed)
- [x] Krevyx envanteriyle boşluk haritası

## Faz 2 — v3.21 plan
- [x] features.md: skorlama + uygulama sırası (docs/v321-features.md)
- [x] Planı kaydet

## Faz 3 — Uygulama (en yüksek etkili özellikler)
- [ ] KREYX.md proje hafızası (src/main/agents/project-memory.js, testli)
- [ ] Plan Mode (bridge dryRun + ipc agent-plan + renderer toggle)
- [ ] Grading loop (src/main/agents/grade-task.js, renderer kartı)
- [ ] Hooks (krevyx-hooks.json, bridge olaylarına bağlı)
- [ ] Diff review (git diff özet kartı + SARIF)
- [ ] tests/v321.test.js (+15 hedef)
- [ ] Özellik setini uygula (modüler, testli)
- [ ] Birim + entegrasyon testleri

## Faz 4 — Teslim
- [ ] Commit + push, Actions paketleri
- [ ] Site v3.21 güncellemesi (roadmap/changelog)
- [ ] Rapor teslim

# v3.20.1 Hardening + Entegrasyon Testleri (TAMAMLANDI — commit 42e0210)

## Aşama 1 — Köprü Sertleştirme (edge case dayanıklılığı)
- [ ] Görev giriş sertleştirme: boş/çok uzun/çift byte/çift byte bozuk unicode, yeni satır enjeksiyonu, NULL byte, kontrol karakterleri
- [ ] Eşzamanlı görev yarış koruması: aynı ajanda ardışık runCodeAgent (eski süreç stop + yeni spawn yarışı), farklı ajanlarda paralel çalıştırma
- [ ] Durdurma yarışları: erken stop (spawn öncesi, stdout akışı sırasında), stop sonrası yeniden spawn
- [ ] Süreç anormallikleri: stdout çöp akışı, devasa tek satır, satırsız akış, anlık kill
- [ ] CWD yokluğu: silinmiş dizin, geçersiz CWD, çok uzun yol
- [ ] IPC emit koruması: pencere yokken/pencere kapanırken emit güvenliği zaten var — stdout/stderr data olaylarında thrown hata yakalama
- [ ] stream-json ayrıştırıcı fuzz testi (bozuk JSON, çok uzun metin, inner exception)
- [ ] Timeout yarış testi (zamanlayıcı fire sırasında exit)

## Aşama 2 — Entegrasyon Testleri
- [ ] Codex hello.txt tekrar (geçerli anahtar bekleniyor — kullanıcı anahtarı kontrol et)
- [ ] Claude Code CLI: `claude --version`, akış ayrıştırıcı doğrulaması (gerçek stream-json örnekleriyle), --help doğrulaması
- [ ] Gemini CLI: `gemini --version`, `-p` modunun davranışı (interaktif mi non-interaktif mi), akış ayrıştırıcı doğrulaması
- [ ] Üç CLI ile gerçek görev denemeleri (anahtar varsa)

## Aşama 3 — Teslim
- [ ] Commit + push, tüm testler yeşil (210+)
- [ ] Siteye gerekirse yansıtma
- [ ] Rapor teslimi

# v3.24 — Auto-updater + Site güncellemesi

## Auto-updater (masaüstü)
- [ ] Mevcut update mantığını incele (latest.yml kullanımı var mı?)
- [ ] src/main/update/updater.js: latest.yml + semver karşılaştırma
- [ ] Uygulama açılışında arka plan sürüm kontrolü
- [ ] Renderer bildirim toast/dialog (indir + sürüm notları aç)
- [ ] IPC: update-notify / update-dismiss / update-check
- [ ] Birim testler
- [ ] package.json 3.24.0

## Site (v3.24)
- [ ] İndirme butonları v3.23.0 varlıklarına: Krevyx-Ultra-3.23.0.exe / Krevyx-Ultra-3.23.0-arm64.dmg / Krevyx-Ultra-3.23.0.AppImage
- [ ] /cli: verify-audit örnek SARIF çıktı bloğu (TR/EN)
- [ ] i18n 3.24.0 (hero, roadmap, changelog lokal notlar)
- [ ] Changelog.tsx LOCAL_NOTES v3.24.0

## Teslim
- [ ] Tam test paketi yeşil; commit + v3.24.0 tag + push → CI yeşil
- [ ] Release linkleri doğrula; site checkpoint; final rapor

# v3.24.2 — Site medya + OS algılama iyileştirmeleri (site-only, app repo'da todo kaydı)
- [ ] macOS xattr karantina kaldırma demo videosu üret (terminal ekranı, komut yazımı)
- [ ] Videoyu SSS bölümüne göm (TR/EN FAQ yapısına uyarla)
- [ ] macOS algılandığında indirme kartlarında ZIP seçeneğini öne çıkar (highlight + sıralama)
- [ ] TypeScript kontrol + screenshot + checkpoint (otomatik yayın)

# 20k Satırlık Upgrade — v3.25 (YENİ İŞ)

## Faz 1: İnceleme + Plan
- [ ] Kod tabanını tarayıp mevcut satır sayısını ve modül haritasını çıkar
- [ ] 20k satırlık upgrade planını yaz (PLAN-325.md)

## Faz 2: Yeniden Denetçi Motoru (Çekirdek)
- [ ] plan-engine: Plan Mode — plan oluşturma, onay döngüsü, plan diff
- [ ] grading: Ajan çıktı derecelendirme — kalite puanı, geri döngü (plan→execute→grade→revise)
- [ ] diff-review: Dosya değişiklik inceleme — hunk seviyesi onay/reddet
- [ ] diff-apply: Güvenli diff uygulama (context doğrulaması, fallback)
- [ ] memory: Semantik çalışma belleği — KREYX.md + kalıcı proje notları
- [ ] tools registry: Genişletilebilir araç kaydı + permission model
- [ ] Yeni modüller için birim testleri

## Faz 3: Orkestrasyon & Ajan Yetenekleri
- [ ] task-queue: Görev kuyruğu + paralel çalıştırma + öncelik
- [ ] agent-composer: Çoklu ajan orkestrasyonu (lead + worker ajanlar)
- [ ] chain-tasks: Zincir görevler — önceki görev çıktısını sonrakine aktarma
- [ ] context-manager: Bağlam sıkıştırma/özetleme (long-horizon)
- [ ] hooks: Yaşam döngüsü hook'ları (pre/post tool, pre/post run)
- [ ] Yeni modüller için birim testleri

## Faz 4: Güvenlik & Güven Zinciri
- [ ] signed-releases: Release doğrulama — SHA checksum + imza kontrolü (updater entegrasyonu)
- [ ] audit-chain güçlendirme: events genelleştir, merkle root, sorgulanabilir audit log
- [ ] secrets-audit: Gizli sızıntı tespiti (env/diff scan) + desen kural seti
- [ ] vault-cli: krevyx vault import/export/rotate komutları
- [ ] Yeni modüller için birim testleri

## Faz 5: CLI + UI + Testler
- [ ] CLI yeni komutlar: krevyx plan, grade, diff, queue, hooks, audit-query, secrets-scan
- [ ] Renderer UI: Plan onay paneli, diff review paneli, görev kuyruğu görünümü, audit sorgulayıcı
- [ ] Test seti 20k+ satır hedefi, edge case'ler
- [ ] E2E UI testleri

## Faz 6: Sürüm & Teslim
- [ ] Tüm testler yeşil (npm test)
- [ ] Sürüm 3.25.0, CHANGELOG, GitHub tag + push
- [ ] CI'da release pipeline doğrulama
- [ ] Final rapor
