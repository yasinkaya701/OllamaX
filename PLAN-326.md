# KREYX v3.26 — 50k Satırlık Upgrade Planı

> Hedef: Krevyx'i "orkestrasyon merkezli, güven odaklı, agent-first" bir geliştirici çalışma platformuna dönüştürmek. Mevcut taban ~27k satır / 450 test. Bu planda ~52k satır yeni kod eklenir ve toplam 79k satır / ~1000 test hedeflenir.

## Stil sözleşmesi (STYLE-325.md ile aynı)

Tüm yeni modüller `'use strict'`, üstte JSDoc bloğu (kapsam + davranış kuralları), Türkçe hata mesajları, `{ ok: boolean, ... }` dönüş şekli, `testOnlyClear()`/`clearX()` test temizleyicileriyle gelir. Testler jest (jest 29), jest.config.json mevcut; `pnpm run test:ci` = coverage'lı full run. Eslint 0 hata şart. Windows uyumlu: asla `.*\//` tarzı regex yol ayrıştırma; `path.basename`/`path.join` kullan.

## Faz 1 — Çekirdek Motor (agents-core v2, ~9k satır)

1. `src/main/agents-core/runtime.js` — Ajan çalışma zamanı v2: adım bazlı plan yürütme motoru (engine.js + approval.js üzerine), sandbox adım yürütücü registry (step runners), retry/budget/karantina kontrolü, adım akışı IPC olayları (`krevyx:step`, `krevyx:progress`), canlı adım akışı (SSE benzeri event kanalı).
2. `src/main/agents-core/tools.js` — Araç kayıt defteri v2: 24 araç (dosya okuma/yazma/edit, klasör listeleme, shell (izinli allowlist), grep/ripgrep, diff üretme, arama, URL getirici, JSON/CSV işleyici, proje belleği sorgu, diff inceleme, görev kuyruğuna at, hook tetikleyici, plan üret, grading, özet, bağlam kırp, anahtar getir, zamanlayıcı, diff patch üretici, SARIF dışa aktar, imza doğrula, zincir sorgu, kasa rapor, plan diff karşılaştır). Araç şemaları (JSDoc tabanlı), izin matrisi (her adım türüne hangi araçlar), sonuç kırpma.
3. `src/main/agents-core/sandbox.js` — Yürütme izolasyonu: komut allowlist'i (executables allowlist), dizin kısıtı (chroot-benzeri path prefix kontrolü), zaman aşımı, bellek/çocuk proses limiti (spawn limiti, orfan temizleme), temp izni yönetimi, Windows cmd/powershell ayrımı.
4. `src/main/agents-core/llm-router.js` — LLM yönlendirici: 6 sağlayıcı adaptörü (OpenAI, Anthropic, Gemini, Ollama yerel, Manus, DeepSeek), fiyat/tokend sayımı, rota stratejileri (kalite, maliyet, yerel-öncelikli, fallback zinciri), istek normalleştirme (chat completions ortak format), akışlama, rate-limit geri çekilme, yerel Ollama otomatik keşif.
5. `src/main/agents-core/prompts.js` — Prompt şablonları: sistem rolü üretici (kimlik/görev/kısıtlar), plan üretme, araç çağrısı formatı, grading talimatı, diff inceleme talimatı, özet talimatı, 20+ prompt şablonu, şablon sürümlendirme.
6. `src/main/agents-core/session.js` — Oturum yönetimi: paralel oturum, oturum persist (JSONL), oturum kurtarma (crash sonrası devam), oturum zinciri (bir oturumun diğerine devri), oturum istatistikleri, süre ölçümü.
7. `src/main/agents-core/eval.js` — Görev değerlendirme çerçevesi: kriter bazlı puanlama, regresyon testi (görev tekrarı ve karşılaştırma), değerlendirme raporu, değerlendirme zinciri.

## Faz 2 — Orkestrasyon Derinleştirme (~10k satır)

8. `src/main/orch/vault-tasks.js` — Görev kasası: görev tanımları (YAML-benzeri metin ayrıştırıcı), görev şablonları, görev doğrulama.
9. `src/main/orch/pipelines.js` — Pipeline motoru: tanımlı iş akışı dilleri (DAG: stages, koşullar, on-failure handlers), pipeline derleyicisi, parallel stage yürütme, artefakt geçişi.
10. `src/main/orch/handoffs.js` — El devri: lead→worker dağıtımı, sonuç birleştirme (map-reduce), zincirleme el devri, devir bağlamı.
11. `src/main/orch/swarm.js` — Ajan sürüsü: dinamik worker havuzu, iş dağıtım dengeleyici (adaptive load balancing), worker sağlık izleme, ölçekleme politikası (min/max/autoscale tetikleyici).
12. `src/main/orch/budget-engine.js` — Bütçe motoru: token bütçesi, maliyet limiti (para birimi), durdurma kuralları (threshold, per-step, günlük), bütçe raporlama, tahminleme.
13. `src/main/orch/state-store.js` — Paylaşımlı durum deposu: anahtar-değer, pub/sub, atomik işlem (cas), TTL, persist, sorgu.
14. `src/main/orch/events.js` — Olay otobüsü: kanallar, subscriber filtreleme, playback (geçmiş olayları oynatma), persist, kuyruk birikimi limiti.
15. `src/main/orch/skills.js` — Yetenek kayıt defteri: skill tanımları (arama/doküman/örnekler), skill arama (anahtar kelime + skor), skill kompozisyonu, builtin skill'ler (git-workflows, test-runner, doc-writer, code-review, deploy-check).
16. `src/main/orch/workspace.js` — Çalışma alanı: proje tanımlama (.krevyx/workspace.md ayrıştırıcı), çok-proje, proje profili (kurallar, allowlist, hook seti), profil devri.
17. `src/main/orch/observability.js` — Gözlemlenebilirlik: metrikler (sayaç/gauge/histogram), log toplama, trace (adım ağacı), rapor üretici (JSON/Markdown).

## Faz 3 — Güven & Denetim (~9k satır)

18. `src/main/guard/permission.js` — İzin çerçevesi: RBAC (roller: salt okuma, standart, operatör, admin), politikalar (izin/ret/yeterlilik), kaynak-kısıt matrisi, politika doğrulama.
19. `src/main/guard/allowlist.js` — Komut/araç allowlist yönetimi: kurallar, glob desenleri, platform-bağımsız normalleştirme, ihlal günlüğü, allowlist dışı yürütme reddi.
20. `src/main/guard/policy.js` — Güvenlik politikası: hassas dizin koruması (.git, node_modules, system paths), dosya boyut limiti, desen yasakları (değişiklik yasakları), politika test komutu.
21. `src/main/guard/diff-gate.js` — Diff kapısı: diff ön-tarama (tehlike sinyalleri), otomatik kabul/red kuralları, tehlike skoru, kapı raporu, pipeline ile entegrasyon.
22. `src/main/guard/ci-check.js` — CI/CD denetleyici: pipeline YAML doğrulama, tehlikeli desen taraması, minimum test kapsamı kontrolü, denetim raporu SARIF.
23. `src/main/guard/entropy.js` — Entropy izleyici: rastgelelik testi (entropy hesap), token sızıntısı risk skoru, kasa ile entegrasyon.
24. `src/main/guard/quarantine.js` — Karantina: şüpheli dosyaların karantinaya alınması (taşıma + meta veri), inceleme kuyruğu, geri kazanma, süresi dolma.
25. `src/main/trust/signing.js` — Yerel imzalama: paket içerik bütünlüğü (manifest + şa256 merkle), imzalama/doğrulama, zaman damgası, manifest üretici.

## Faz 4 — CLI, IPC & UI (~12k satır)

26. `src/main/cli/v326-commands.js` — 10 yeni CLI komutu: `krevyx run-task` (görev yürütme), `krevyx pipeline` (pipeline yönetimi), `krevyx skill` (skill arama/liste), `krevyx budget` (bütçe rapor), `krevyx state` (durum deposu), `krevyx guard` (izin/gate denetimi), `krevyx metrics` (metrik raporu), `krevyx trace` (oturum izi), `krevyx sign` (paket imzalama), `krevyx workspace` (çalışma alanı).
27. `src/main/ipc-v326-handlers.js` — IPC kayıt: tools/runtime/session/orch/guard uç noktaları (40+ endpoint).
28. `src/renderer/modules/runtime.js` — Ajan çalışma zamanı paneli: canlı adım akışı, araç çağrıları, budget göstergesi, oturum kontrolü.
29. `src/renderer/modules/pipelines.js` — Pipeline paneli: DAG görselleştirme, stage durumu, log akışı.
30. `src/renderer/modules/skills.js` — Skill paneli: arama, skor listesi, detay.
31. `src/renderer/modules/budget.js` — Bütçe paneli: sayaçlar, maliyet trendi, limitler.
32. `src/renderer/modules/guard.js` — Güven paneli: izin matrisi, ihlal günlüğü, diff kapısı, politika durumu.
33. `src/renderer/modules/observability.js` — Gözlemlenebilirlik paneli: metrik dashboard, trace ağacı, log akışı.
34. `index.html` + `styles.css` — 6 panel entegrasyonu.
35. Testler: 14 modül × ortalama 35 test ≈ 490 yeni test.

## Doğrulama hedefi

Eslint 0 hata, jest tüm suite'ler yeşil (hedef ~940 test), CLI smoke testleri geçmeli, Windows path uyumu korunmalı, her modül test-only temizleyiciyle test izole edilmeli.
