# Krevyx v3.25 — 20.000 Satırlık Upgrade Planı

**Mevcut taban:** ~21.500 satır (src + tests), sürüm 3.24.1, 34 test dosyası.
**Hedef:** ≥20.000 satır YENİ kod (modüller + testler) ile tabanı ~41k+ satıra taşımak; sürüm 3.25.0.

Mevcut mimari: `src/main.js` (1297 satır çekirdek), `src/renderer/app.js` (949), modüler renderer `src/renderer/modules/*` (7 dosya, global `api`, `q`, `toast`, `log`, `esc` yardımcıları), IPC uçları `ipc-v3-handlers.js`'te `handler(name, fn)` ile tanımlanıyor, preload `ipc:3:*` ad alanını serbest bırakıyor. Testler Jest (jsdom+node). Bu kalıpları koruyarak büyütüyoruz.

## 1. Yeniden Denetçi Motoru — `src/main/plans/*` (~3.800 satır)

| Modül | Satır | İçerik |
|---|---|---|
| `plans/engine.js` | 750 | Plan Modu çekirdeği: prompt → adım planı (dosya okuma, düzenleme, shell), adım türleri (read/edit/append/create/shell/review), tahmini risk skoru, plan diff serileştirme |
| `plans/approval.js` | 550 | Onay döngüsü: bekleyen adım kuyruğu, tekil toplu onay/red, "hepsini uygula" modu, süre aşımı, plan-edit (kullanıcı adımı kaldırır/ekler/değiştirir), plan diff hesaplaması |
| `plans/grading.js` | 600 | Grading: LLM-free kural tabanlı + optional LLM kalite puanı (1–10), revizyon döngüsü (plan→execute→grade→revise, maxN), sonuç raporlama |
| `plans/diff-apply.js` | 650 | Hunk seviyesinde güvenli diff uygulama: context doğrulama, fuzzy offset, 3 strateji (precise/fuzzy/skip), geri alım logu, conflict raporları |
| `plans/diff-review.js` | 550 | Hunk onay/reddet: inceleme durumu makinesi, toplu seçim, gerekçe kaydı, sarif uyumlu export |
| `plans/project-memory.js` | 700 | KREYX.md yönetimi + semantik not deposu: kategori şeması, duplicate tespiti, bozulma (decay) skorları, bağlam enjeksiyonu |

## 2. Orkestrasyon & Ajan Yetenekleri — `src/main/agents-ext/*` + CLI (~4.400 satır)

| Modül | Satır | İçerik |
|---|---|---|
| `agents-ext/task-queue.js` | 700 | Görev kuyruğu: durum makinesi, öncelik, eşzamanlılık limiti, yeniden deneme, süre aşımı, kuyruk serializasyonu/disk, olay emitleri |
| `agents-ext/multi-agent.js` | 800 | Lead+worker orkestrasyonu: ajan havuzu, görev dağıtımı (round-robin/kapasite), sonuç birleştirme, lead agent'a yönlendirme protokolü |
| `agents-ext/chain-tasks.js` | 650 | Zincir görevler: görev tanım dizisi, çıktı→girdi aktarımı, şablon enjeksiyonu, paralel-fan-in, iptal yayılımı |
| `agents-ext/context-manager.js` | 700 | Long-horizon bağlam: özetleme katmanı, önem skorlu budama, kaydet/yükle, token bütçe izleme |
| `agents-ext/hooks.js` | 850 | Yaşam döngüsü hook'ları: pre/post tool, pre/post run, on-error; hook dosyası (krevyx-hooks.json) JS sandbox'lı yürütücü, güven profil kontrolü, hook event log |
| `cli/queue.js` + `cli/hooks.js` + `cli/plans.js` | 700 | `krevyx queue`, `krevyx hooks`, `krevyx plans` komutları; bin/krevyx.js entegrasyonu |

## 3. Güvenlik & Güven Zinciri — `src/main/trust/*` (~3.600 satır)

| Modül | Satır | İçerik |
|---|---|---|
| `trust/release-check.js` | 750 | Release doğrulama: GitHub release asset indirme, SHA-256/512 checksum karşılaştırma, CHECKSUMS.txt ayrıştırma, imza dosyası (.sig) doğrulama (Ed25519/NaCl ile yerel doğrulama), updater entegrasyonu |
| `trust/audit-chain-v2.js` | 800 | Audit v2: merkle root (SHA-256 ağacı), olay tipleri genelleştirme, sorgulanabilir index (actor/action/zaman aralığı), export (json/csv/sarif), append-only kilitleme |
| `trust/secrets-audit.js` | 700 | Gizli sızıntı tespiti: 40+ desen kuralı (API anahtarları, token, özel anahtarlar), env tarama, diff tarama, false-positive azaltıcı (test dosyası hariç tutma), gerekçeyle susturma |
| `trust/vault-mgmt.js` | 700 | Kasa yönetimi: import/export (şifreli JSON), rotate (anahtar döndürme), entropy izleme, kasa bütünlük doğrulaması; `krevyx vault` CLI komutu |
| `cli/secrets.js` + `cli/vault.js` + `cli/audit.js` | 650 | Yeni CLI komutları + bin entegrasyonu |

## 4. Renderer UI — `src/renderer/modules/*` + paneller (~3.400 satır)

| Modül | Satır | İçerik |
|---|---|---|
| `modules/plans.js` | 700 | Plan Modu paneli: plan listesi, adım ağacı, onay/red kontrolleri, diff önizleme, revizyon geçmişi |
| `modules/diff-review.js` | 650 | Diff inceleme paneli: hunk listesi, toplu onay, gerekçe inputu, conflict uyarıları |
| `modules/queue.js` | 600 | Görev kuyruğu görünümü: kuyruk listesi, durum rozetleri, öncelik sıralama, iptal, yeniden deneme |
| `modules/hooks.js` | 550 | Hook yöneticisi: hook dosyası editörü (güvenli), hook event akışı, toggle |
| `modules/trust.js` | 600 | Güven paneli: release checksum doğrulama durumu, merkle root göstergesi, gizli tarama sonuçları, audit sorgulayıcı |
| `v325-panels.js` | 300 | Panel çerçevesi: sekmeli panel yerleşimi, yeni bölümlerin DOM enjeksiyonu (index.html'a minimal ek) |

## 5. Testler — `tests/v325/*` + kök (~4.800 satır)

| Dosya | Satır | Kapsam |
|---|---|---|
| `v325-plans-engine.test.js` | 700 | plan üretimi, risk skorlama, diff serileştirme, edge case'ler |
| `v325-approval.test.js` | 600 | onay/red/timeout/edit akışları, çoklu oturum |
| `v325-grading.test.js` | 550 | kural puanlama, revizyon döngüsü, sınır koşulları |
| `v325-diff-apply.test.js` | 700 | precise/fuzzy/skip stratejileri, bozuk context, büyük hunk, binary |
| `v325-diff-review.test.js` | 500 | durum makinesi, toplu seçim, export |
| `v325-project-memory.test.js` | 550 | CRUD, duplicate, decay, enjeksiyon |
| `v325-task-queue.test.js` | 650 | kuyruk yaşam döngüsü, eşzamanlılık, disk kalıcılık, crash kurtarma |
| `v325-multi-agent.test.js` | 600 | dağıtım, birleştirme, havuz yönetimi, iptal |
| `v325-chain-tasks.test.js` | 550 | zincir aktarım, şablon, fan-in, iptal yayılımı |
| `v325-context-manager.test.js` | 550 | özetleme, budama, bütçe |
| `v325-hooks.test.js` | 650 | hook yürütme, sandbox kaçış koruması, event log |
| `v325-release-check.test.js` | 600 | checksum, imza, bozuk asset, MITM senaryoları |
| `v325-audit-chain-v2.test.js` | 600 | merkle doğrulama, sorgu, export, bozulma tespiti |
| `v325-secrets-audit.test.js` | 550 | 40+ desen, false-positive, env/diff tarama |
| `v325-vault-mgmt.test.js` | 550 | import/export/rotate, entropy |
| `v325-cli.test.js` | 400 | yeni CLI komutları (run, usage, exit kodları) |
| `v325-renderer.test.js` | 350 (jsdom) | plan/diff/kuyruk paneli render + etkileşim |
| `v325-integration.test.js` | 550 | plan→apply→grade→audit uçtan uca akış |

## 6. Sürüm & Teslim

v3.25.0 sürümü, CHANGELOG girişi, `git tag v3.25.0` + push → GitHub Actions paralel build (EXE/DMG/AppImage/zip), site (ollamax-site) indirme linkleri ve roadmap/changelog güncellemesi, final rapor.

**Kalite kuralları:** her modül `'use strict'` + JSDoc tarzı başlık yorumu + modüler import (lazy require ile döngü kırma) + inject edilebilir bağımlılıklar (testlenebilirlik) + tüm public API unit testli. Jest `test` komutu yeşil olmadan tag atılmaz.
