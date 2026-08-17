# E2E/Hardening Test — Durum Notları (2026-08-17 güncel)

## Ortam
- Sandbox Node 22.13.0. CLI kurulu: claude 2.1.233, gemini 0.55.1, codex 0.147.0 (npm global, PATH'te).
- OPENAI_API_KEY geçersiz (401). ANTHROPIC_API_KEY/GEMINI_API_KEY yok. `antigravity` binary'si yok (gemini var).
- GitHub repo main, son push `efbd47a` (v3.20.1). Site checkpoint `46a1aba7` canlı (v3.20.0 site).

## Bu fazda bridge.js'e yapılan düzeltmeler (HEPSİ commit EDİLMEDİ henüz)
1. sanitizeTask: NULL byte, \uFFFD, kontrol karakter temizliği; LF enjeksiyonu → boşluk; 32KB sınır; boş → 'yok'.
2. resolveCwd: fs.statSync doğrulama; silinmiş dizin → process.cwd() fallback; kayıt defteri güvenli değerle güncellenir.
3. runCli: çift-bitirme bayrağı (finished), push/emit try-catch wrap, safeData (2MB buffer sınırı), stdin destroyed kontrolü.
4. stopAgent: idempotent (killed bayrağı + !child.killed kontrolleri).
5. findExecutable: tüm detect adlarını EŞZAMANLI probe eder (Promise.all), ilk bulunanı döndürür. (Önceki: ilk ada takılıyordu → antigravity 'bağlı değil' görünüyordu.)
6. parseStreamJsonLine: null/undefined String() guard.
7. Claude Code profili: --verbose eklendi (stream-json formatı verbose gerektirir).
8. runCli exe çözümü: opts.executable ? o : profile.detect[0] (bayrak-first buildCmd uyumlu).
9. module.exports: runCli, resolveCwd, sanitizeTask eklendi.

## Test dosyaları (yeni/yanıtılan)
- tests/bridge-stress.test.js — 13 test: fuzz giriş, CWD, 3MB akış, bozuk stream-json, erken stop, çift stop, paralel yarış, stream-json fuzz, bilinmeyen ajan. HEPSİ GEÇİYOR.
- tests/cli-integration.test.js — 16 test: CLI versiyon doğrulaması (claude/gemini/codex), keşif profilleri, komut üretimi, stream-json üretim biçimi, akış sırası. GEÇİYOR (Claude -p, codex exec via stdin, antigravity gemini fallback).
- tests/e2e-cli-flows.mjs — gerçek CLI akış testleri: Test1 Claude gerçek akış (2 adım yakalandı ✓), Test2 Codex hello.txt (401 akışı doğrulandı, exit=1 — anahtar yok), Test3 Gemini spawn ✓ exit=41 1 adım ✓, Test4 üçlü yarış (ajan 1:2 adım, ajan 2:19 adım; ajan 3 sonuç boş — erken bitiş, wrapper race; sonuç {ok:true} beklenir ama runCli undefined döndürmüş olabilir — SON DAKİKA DEBUG KONUSU: Promise.all sonuçları loglanıyor, forEach güvenli).
- tests/e2e-codex-bridge.mjs — önceki fazdan mevcut, çalışıyor (3/3 keşif, 34-35 adım, CWD ✓).
- Jest tam paket: 239 test geçmiş durumda (son koşu).

## Kalan işler
1. e2e-cli-flows.mjs Test4: RESULTS loguna bak, ajan 3 (antigravity, executable='gemini' yok, detect[0]='antigravity' → ENOENT → missing:true olmalı; wrapper {r,st} paterni değil — jobs doğrudan await, sonuç nesne beklenir; undefined ise runCli Promise undefined resolve etmiş demektir → bridge'de bug: exit event + stop race... ARAŞTIR. Muhtemelen: stopAgent('__w3') 1500ms sonra child zaten exited → stopped:false; jobs await — hepsi nesne dönmeli. Eğer biri undefined: spawn ENOENT → child.on('error') → finish → ok:false nesnesi. undefined OLMAMALI. Kontrol: belki stopAgent catch wrapper ({ok:true}) jobs'a karıştı? Hayır — catch sadece stopAgent map'inde. RESULTS log'una bak.
2. Tüm suite yeşil → commit+push (v3.20.2 hardening).
3. Rapor yaz, teslim. Site güncellemesi GEREKMİYOR (bridge internal; ama v3.20.1 changelog düşebilir — roadmap zaten v3.20.0; v3.20.1 bugfix, siteye gerek yok).

## Gerçek davranış bulguları (doğrulandı)
- `claude -p X --output-format stream-json` HATA: "--output-format=stream-json requires --verbose" → --verbose eklendi.
- `gemini -p X` anahtarsız: auth yöntemi eksik mesajı + exit 41 (başarılı spawn, stdin'den).
- `codex exec --skip-git-repo-check` stdin'den görev: spawn✓, 19 adım akış, 401 hatası akışa 'sonuç' etiketiyle düşüyor.
- Codex hello.txt görevi: anahtar yok → exit=1, dosya oluşmadı (beklenen).
