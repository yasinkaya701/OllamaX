# Krevyx Ultra — macOS kurulumu

## Gereksinimler

- **macOS 13 (Ventura)** veya daha yeni önerilir.
- **[Node.js](https://nodejs.org/)** LTS (geliştirme / kaynak koddan çalıştırma için).
- **Ollama** (yerel modeller için): [ollama.com](https://ollama.com) — isteğe bağlı ama Ollama sekmesi için gerekli.

## A) Kaynak koddan çalıştırma (geliştirme)

```bash
cd /path/to/Krevyx
npm install
npm start
```

İlk çalıştırmada terminalde hata yoksa pencere açılır. **Ollama** çalışmıyorsa üst bağlantı çubuğunda kırmızı nokta görünür; `ollama serve` veya menüden Ollama uygulamasını başlatın.

## B) DMG / derlenmiş uygulama

Proje kökünde:

```bash
npm install
npm run build:mac
```

Çıktı klasörü: **`dist/`** (ör. `.dmg`).

### Güvenlik uyarısı (imzasız derleme)

Apple, imzalanmamış uygulamalarda uyarı gösterebilir:

1. **Sistem Ayarları → Gizlilik ve Güvenlik** bölümünden “Yine de Aç”.
2. Veya `.app` üzerinde **Sağ tık → Aç** ile ilk çalıştırma.

Üretim dağıtımı için **Apple Developer ID** ile imzalama ve **notarization** önerilir; ayrıntı için [docs/DEPLOY.md](DEPLOY.md).

## API anahtarları

1. Uygulamada **Araçlar** panelini açın (**⌘L**).
2. **APIs** sekmesinde OpenAI / Anthropic / Gemini anahtarlarını girin → **Kaydet**.
3. Model listesi otomatik güncellenir; gerekirse üst çubuktan **↻ API** ile yenileyin.

## Sorun giderme

- Boş ekran: `npm start` çıktısında hata var mı bakın; `src/main.js` yolunun doğru olduğundan emin olun.
- Modeller eksik: `docs/TROUBLESHOOTING.md` ve üst çubuktaki Ollama / **Yenile** durumunu kontrol edin.
