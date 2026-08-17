# Krevyx v3.20.0 — Manus Entegrasyonu Raporu

Bu sürüm, Krevyx'e **Manus** entegrasyonunu üç ayrı katmanda ekler: Manus bir AI sağlayıcısı olarak, ajanların Manus görevleri oluşturup sonuçlarını alabileceği bir görev katmanı olarak ve orkestrasyon zincirinde şef (head-agent) rolüyle. Ayrıca uygulama tarafında v3.19 sırasında tespit edilen ayarlar kaydı/okuma bozukluğu (pid-clobber) onarıldı.

## Katman 1 — Manus AI Sağlayıcısı

`src/main/agents/provider-chat.js` içindeki sağlayıcı kayıt defterine `manus` eklendi (toplam 16 kayıtlı sağlayıcı). Ayarlar → APIs sekmesinde yeni bir **Manus API kartı** bulunur; `manusApiKey` girilir, `Save API Keys` ile yalnızca yerel veri klasörüne kaydedilir. `buildAuthHeaders` Bearer doğrulaması üretir ve `manus-chat` IPC kanalı üzerinden sohbet akışı `startManusTaskStream` modülü ile canlı olarak konsola düşer. Hata anında yapılandırılmış hata mesajı ve yeniden deneme mantığı uygulanır.

## Katman 2 — Manus Görev Ajanı

Yeni modül `src/main/agents/manus-agent.js` (≈300 satır, 7 birim testi) Manus API v2'ye bağlanır:

| İşlem | API | İşlev |
|---|---|---|
| Görev açma | `task.create` | Yeni Manus görevi oluşturur, görev ID döner |
| Canlı takip | `task.listMessages` | Adım sinyallerini satır satır çeker (plan → adım → sonuç) |
| Sonuç alma | `structured-output` | Görevin yapılandırılmış çıktısını stüdyoya geri taşır |
| Görev kapatma | `task.stop` | Durdurma butonu uzaktaki görevi kapatır |

Tüm istekler 60 saniye zaman aşımı, HTTPS üzerinden ve anahtar gizliliğiyle çalışır. `tests/manus-agent.test.js` dosyasındaki 7 test, istek/sinyal/sonuç akışını mock sunucu üzerinden doğrular. IPC kanalları (`ipc:3:manus-task:*`) `src/main/ipc-v3-handlers.js` içine eklendi.

## Katman 3 — Orkestrasyon Şefi (Head-Agent)

`src/main/agents/orchestrator.js` kayıt defterine `manus` eklendi; `runAgent` dağıtıcı bunu uzak görev ajanı olarak ele alır. Ajan konsolunda yeni **Manus kartı** bulunur (diğer kod ajanları gibi), zincir düzenine eklendi ve **head-agent seçici** Manus'u kabul eder. Manus şef olduğunda Claude Code → Codex → Antigravity çıktıları Manus'a yönlendirilir ve sonuç zincire geri akar. Air-gapped modda `network-mode.js` Manus'u otomatik olarak engeller.

## Bonus Düzeltme — Ayarlar Pid-Clobber Bozukluğu

v3.19 arayüz testlerinde bulunan kritik bir bozukluk giderildi: `src/renderer/app.js` içindeki sağlayıcı anahtarları döngüsü, tüm girdileri son sağlayıcının anahtarına yazıyordu (girdi ID'lerinin döngü içinde yanlış eşleşmesi). Artık her giriş kendi `pid` anahtarıyla doğru eşleşiyor ve kaydetme/yükleme simetrik.

## Site Güncellemeleri

Site artık v3.20.0'a taşındı: ana sayfada yeni özellik bloğu 08 (Manus Bulut Ajanı), yol haritasında v3.20.0 girişi, SSS'te Manus sorusu, `/docs` sayfasında "Manus Entegrasyonu" bölümü (API anahtarı, bağlantı testi, görev gönderme, zincirde kullanım) ve 19 sağlayıcı + Manus başlıkları. Site otomatik olarak yayına alındı.

## Doğrulama

Uygulama tarafında tüm JS dosyaları `node -c` ile sözdizimi denetiminden geçti, **15 test paketi / 210 test** yeşil. GitHub repo'ya `45fcc2b` olarak gönderildi. Site TypeScript denetiminden geçti ve ekran görüntüleriyle doğrulandı.

## Sonraki Adımlar

1. GitHub token iznini `contents:write` olarak güncelleyin; `scripts/fill-release-notes.mjs` release gövdelerini doldurabilsin.
2. Konsol entegrasyonunun son parçası olan Manus adım sinyallerinin konsolda zengin (renkli/ikonlu) görünümü tamamlanabilir.
3. `git tag v3.20.0` + push edildiğinde GitHub Actions, üç platformun paketlerini otomatik derleyip yayınlar.
