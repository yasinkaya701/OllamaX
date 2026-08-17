# v3.20.1 Hardening + Entegrasyon Testleri

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
