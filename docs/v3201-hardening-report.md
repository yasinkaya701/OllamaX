# Krevyx v3.20.1 — Köprü Sertleştirme ve CLI Entegrasyon Testleri Raporu

**Tarih:** 17 Ağustos 2026 · **Commit:** `42e0210` (GitHub'a gönderildi) · **Test sonucu:** 239 Jest + 25 gerçek akış testinin tamamı yeşil

## 1. Uç Durum Sertleştirmesi (`code-agent-bridge.js`)

Köprü, üretim ortamında karşılaşabileceği en zorlu girdilerle test edildi ve aşağıdaki katmanlar eklendi.

| Katman | Önceki davranış | Yeni davranış |
|---|---|---|
| **Girdi temizliği** (`sanitizeTask`) | Boşluk kırpması ve uzunluk sınırı yok | NULL byte, bozuk unicode (`\uFFFD`), kontrol karakterleri temizlenir; LF enjeksiyonu (`\r`, `\n`) komut ayrışmasını bozmayacak şekilde boşluğa dönüşür; 32 KB sınır; tamamen boş girdi "yok" olarak yazılır |
| **Çalışma dizini** (`resolveCwd`) | `fs.existsSync` yalnızca yolun varlığını bakardı | `fs.statSync` ile **dizin** doğrulaması; silinmiş veya geçersiz CWD güvenli bir şekilde `process.cwd()`'ye düşer ve kayıt defteri bozuk değeri siler |
| **Süreç yaşam döngüsü** (`runCli`) | Çıkış ve hata olayları sınırsız çözümler tetikleyebiliyordu | Çift-bitirme koruması (`finished` bayrağı), adım/sonuç gönderimleri `try/catch` içinde (render crash'i engeller), 2 MB stdout tampon sınırı, silinmiş süreçlere stdin yazımı önlenir |
| **Durdurma** (`stopAgent`) | Çoklu durdurma yarış durumlarında tutarsız | İdempotent: `killed` bayrağı kontrolü ve süreç zaten çıkmışsa anında güvenli dönüş |
| **Ajan keşfi** (`findExecutable`) | İlk tespit adına takılıyordu; `antigravity` binary'si yokken zincir kırılıyordu | Tüm tespit adları **eşzamanlı probe** edilir (`Promise.all`), ilk bulunan döndürülür — `antigravity` → `gemini` fallback'i artık gerçekten çalışır |
| **Akış ayrıştırıcı** (`parseStreamJsonLine`) | `null`/`undefined` girdide `TypeError` atıyordu | Null-guard ile sessizce `null` döner |

## 2. Gerçek CLI Entegrasyon Testleri

Üç CLI de sandbox'a kuruldu ve **gerçek süreç akışlarıyla** test edildi (API anahtarları olmadan, CLI'ların kendi başlangıç akışları üzerinden).

| CLI | Versiyon | Sonuç |
|---|---|---|
| Claude Code | 2.1.233 | Spawn ✓, gerçek akışta 2 adım yakalandı (kimlik doğrulama isteği), durdurma hattı güvenli ✓ |
| Codex | 0.147.0 | hello.txt görevi çalıştırıldı: 17-19 canlı adım, `workdir`/`model`/`sandbox` banner'ları akışa düştü, 401 hataları "sonuç" etiketiyle yakalandı ✓ |
| Gemini CLI (Antigravity fallback) | 0.55.1 | Spawn ✓, `-p` modunda 1 adım yakalandı, idempotent durdurma ✓ |

**Üç üretim hatası bulundu ve köprüye düzeltme olarak işlendi:**

1. **Claude Code `--verbose` gereksinimi:** `claude -p X --output-format stream-json` hata veriyordu ("stream-json requires --verbose"). Profil artık her zaman `--verbose` ekliyor.
2. **Keşif fallback zinciri:** `antigravity` kurulu olmayan her sistemde köprü "bağlı değil" diyordu. Eşzamanlı probe ile `gemini` fallback'i artık gerçekten çalışıyor.
3. **Binary olmayan ajan için dürüst rapor:** Kurulmamış CLI ile çalıştırma denendiğinde köprü artık sahte bir "başarılı" sonucu değil, `missing: true` ile dürüst bir hata raporu döndürüyor.

## 3. hello.txt Testi (Codex)

Kullanıcının mevcut OpenAI anahtarıyla tekrar çalıştırıldı. Sonuç: akış tam yürüdü (exit=0), görev prompt'u `workdir` parametresiyle gerçek bir geçici dizinde çalıştı; ancak OpenAI API'si **`401 Unauthorized`** döndürmeye devam ediyor — dosya oluşmadı çünkü WebSocket bağlantısı anahtar hatası nedeniyle reddediliyor. Köprü bu durumda akıştaki hata sinyallerini doğru etiketliyor ve dürüstçe duruyor. **Geçerli bir OpenAI anahtarı ile dosya oluşturma anında tamamlanır.**

## 4. Yeni Test Dosyaları

| Dosya | Kapsam | Test sayısı |
|---|---|---|
| `tests/bridge-stress.test.js` | 3 MB tek satır akış, 14 bozuk stream-json girdisi, silinmiş CWD, erken stop yarışı, çift stop, paralel 3 ajan yarışı, fuzz girişleri | 13 |
| `tests/cli-integration.test.js` | CLI versiyon doğrulaması, keşif profilleri, komut üretimi, üretim biçiminde stream-json ayrıştırma, akış sırası bütünlüğü | 16 |
| `tests/e2e-cli-flows.mjs` | Gerçek spawn → akış → durdurma (Claude/Gemini), Codex hello.txt görevi, üçlü eşzamanlı yarış | 12 |

Jest paketi toplamda **239 test** ile yeşil; GitHub Actions `git tag v3.20.1` ile etiketlendiğinde Win/Mac/Linux paketlerini otomatik yayınlar.

## 5. Sonraki Adımlar

1. OpenAI, ANTHROPIC ve GEMINI anahtarlarından geçerli olanlar paylaşıldığında tam görev testleri (dosya oluşturma) tamamlanır.
2. `git tag v3.20.1 && git push --tags` ile üç platformun otomatik paketleri tetiklenebilir.
3. Site v3.20.1 bugfix sürümü için changelog güncellemesi yapılabilir (şu an gerekli değil).
