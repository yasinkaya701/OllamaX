# Krevyx Ultra — Dağıtım ve kurulum

Bu uygulama **masaüstü Electron** uygulamasıdır; “backend” tarayıcıya değil, **Electron ana sürecine** (`src/main.js`) ve yerel makinede çalışan **Ollama** sürecine bağlıdır.

## Kurulum (son kullanıcı)

- **macOS:** [INSTALL_MACOS.md](INSTALL_MACOS.md)
- **Windows:** [INSTALL_WINDOWS.md](INSTALL_WINDOWS.md)

## Geliştirme (kaynak koddan çalıştırma)

```bash
npm install
npm start
```

- **Ollama:** Yerel modeller için [ollama.com](https://ollama.com) ile daemon’u kurun; varsayılan adres `localhost:11434`.
- **Bulut:** OpenAI / Anthropic / Gemini anahtarları uygulama içinden girilir; ana süreç HTTPS ile ilgili sağlayıcıya bağlanır.

## Üretim paketi oluşturma

Aşağıdaki komutlar proje kökünde **`dist/`** altına kurulum dosyaları üretir.

| Platform | Komut | Çıktı (özet) |
|----------|--------|----------------|
| macOS | `npm run build:mac` | `.dmg` (veya yapılandırmaya göre zip) |
| Windows | `npm run build:win` | Taşınabilir `.exe` (portable) |
| Linux | `npm run build:linux` | `AppImage` (script eklendiyse) |

Önce `package.json` içindeki `build` alanını gözden geçirin: `appId`, `productName`, `files` (`src/**`, `assets/**`).

### macOS notları

- İlk dağıtımda kullanıcılar **İmzasız geliştirici** uyarısı görebilir: Apple **notarization** ve **Developer ID** imzası üretim için önerilir (Apple Developer Program gerekir).
- Geçici olarak: kullanıcı **Sistem Ayarları → Gizlilik ve Güvenlik** üzerinden veya sağ tık → **Aç** ile ilk çalıştırmayı onaylayabilir.

### Windows notları

- **Portable** hedefi kurulum gerektirmez; kurumsal dağıtım için MSI/NSIS hedefi `electron-builder` ile genişletilebilir.

### Linux notları

- `AppImage` için FUSE / `libfuse2` ortamına dikkat (dağıtıma göre değişir).

## CI ile otomatik derleme

`.github/workflows/ci.yml` birim test ve lint çalıştırır. **İmzalı release** için ayrı bir iş akışında:

1. Gizli anahtarlarla (macOS sertifikası, Windows cert) `electron-builder` çalıştırın.
2. Etiket (`v2.5.0`) ile tetiklenen `workflow` artefact’ları GitHub Releases’a yükleyebilir.

## Son kullanıcı verisi

- Oturum ve ayarlar: Electron **`userData`** dizini (`Yardım → Veri klasörünü göster` menüsü veya uygulama içi **Veri klasörü** bağlantısı).
- Ağ: kurumsal proxy varsa `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `api.github.com` ve yerel **Ollama HTTP** adresinin izinli olması gerekir.

## Güvenlik özeti

- Renderer’da **Node entegrasyonu kapalı**; IPC kanalları **preload beyaz listesi** ile sınırlı.
- Üretimde geliştirici araçlarını son kullanıcı paketinde açık bırakmayın (menüden kaldırma veya `NODE_ENV=production` davranışı ileride eklenebilir).
