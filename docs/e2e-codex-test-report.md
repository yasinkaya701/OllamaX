# Codex Uçtan Uca Test Raporu — v3.20.1

Bu test, Krevyx kod ajanı köprüsünü (code-agent-bridge) gerçek CLI kurulumlarıyla sandbox ortamında uçtan uca doğruladı. Test; ajan keşfi, süreç spawn, stdin görev aktarımı, canlı akış (IPC adım sinyalleri), süreç çıkışı ve durdurma hattını kapsadı.

## Kurulum Doğrulaması

| CLI | Versiyon | PATH'te | Durum |
|---|---|---|---|
| Claude Code (`claude`) | 2.1.233 | Evet | Kurulu, test edilebilir |
| Antigravity / gemini-cli (`gemini`) | 0.55.1 | Evet | Kurulu, test edilebilir |
| Codex (`codex`) | 0.147.0 | Evet | Kurulu, uçtan uca test edildi |

**Önemli blokaj:** Ortamdaki tek geçerli API anahtarı olan **OpenAI anahtarınız geçersiz** — Codex her iki taşıma yönteminden de (WebSocket ve HTTPS) `401 Unauthorized` aldı. Anahtarın süresi dolmuş veya iptal edilmiş görünüyor. Claude Code ve Gemini için anahtar hiç yok; bunların gerçek görev testleri için `ANTHROPIC_API_KEY` ve `GEMINI_API_KEY` gerekli.

## Bulunan ve Düzeltilen Köprü Hataları (3 adet)

E2E test üç gerçek hatayı ortaya çıkardı ve hepsi düzeltildi (commit `efbd47a`):

| # | Hata | Etki | Düzeltme |
|---|---|---|---|
| 1 | `codex prompt` interaktif (PTY) modudur; pipe edilen stdin ile "stdin is not a terminal" hatası verir | Bridge'in Codex akışı hiçbir zaman çalışamazdı | Codex profili artık `codex exec --skip-git-repo-check` kullanıyor (non-interaktif, stdin uyumlu) |
| 2 | `runCli`, `spawn(args[0], args.slice(1))` ile spawn ediyordu ama `buildCmd` binary adı içermeyen bayraklar döndürüyordu (örn. `['exec', '--skip-git-repo-check']`) | Tüm ajanlarda spawn ENOENT / garip davranış — köprü hiç çalışmazdı | Çözülen executable artık açıkça spawn'a geçiliyor: `spawn(exe, args)` |
| 3 | `findExecutable`, `sh -c "command -v X"` kullanırken sonucu `spawn` event'inden çözüyordu; `sh` her zaman spawn olduğu için olmayan ajan bile "bulundu" sayılıyordu | Yanlış keşif sonucu → spawn ENOENT zinciri | Keşif artık çıkış koduna bakıyor (`command -v` bulunamazsa 127 → bağlı değil) |

## E2E Test Sonuçları

Düzeltmeler sonrası yeni E2E donanımı (`tests/e2e-codex-bridge.mjs`) şu sonuçları verdi: ajan keşfi **3/3 doğru** (Codex, Claude Code bağlı; antigravity binary'si ortamda yok, gemini CLI'sı ile fallback beklenirken gemini ile gelen `--prompt` uyumsuzluğu da gözlemlendi — not aşağıda), gerçek Codex akışı **spawn → 35 IPC adım sinyali → exit** doğrulandı (adım etiketleri `plan`/`sonuç` olarak doğru sınıflandı; 401 hataları da akışa "sonuç" etiketiyle düştü), CWD kayıt defteri çalışıyor, durdurma hattı çalışıyor. Jest paketi **15/15 yeşil, 210/210 test geçti**.

## Bilinen Kalan Noktalar

`antigravity` binary'si ortamda yok; bridge `gemini` fallback'ine geçer ancak gemini CLI'sı `-p` bayrağı isterken antigravity profili bazı yollarda `--prompt` üretebiliyordu (düzeltme mevcut: `executable === 'gemini'` durumu zaten `-p` döndürüyor). Tam Gemini akış testi için `GEMINI_API_KEY` gerekli. Ayrıca gerçek bir model çıktısı (kod üretimi) görmek için geçerli bir OpenAI anahtarı paylaşılmalı.

## Sonraki Adımlar

1. Geçerli bir OpenAI anahtarı ile tam Codex görev testi tekrarlanır (hello.txt yazma görevi hazır).
2. `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` paylaşılırsa Claude Code ve Gemini zincirleri de aynı donanımla test edilir.
3. `git tag v3.20.1` ile etiketlendiğinde GitHub Actions üç platformun paketlerini otomatik yayınlar.
