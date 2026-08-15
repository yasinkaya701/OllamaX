# Changelog

## 2.7.0 — 2026-08-15

### Güvenlik ve bağımlılıklar

- **Electron `43.4.0`** — 0 güvenlik açığı (önceki sürümde 15 açık, 1 kritik vardı).
- **electron-builder `26.x`** ile dağıtım zinciri güncellendi.
- ESLint **v9** ve **flat config** (`eslint.config.js`) desteği.
- Jest v29 ailesinde tutuldu (v30.4.x modül çözünürlük hatası); tüm testler yeşil.
- `npm audit` artık **0 açık** raporluyor.

### Modeller

- **`src/shared/model-catalog.json`** güncellendi: OpenAI `gpt-5.5`, `gpt-5.3`, `gpt-5.x`, `o5` ailesi; Anthropic Claude Sonnet 5 / Opus 4.6–4.8; Gemini 3.x (3.7 Flash dahil).
- `isLikelyOpenAIChatModel` artık `o5*` modellerini de sohbet modeli olarak kabul ediyor.
- Renderer `MODEL_FALLBACK` listeleri yeni nesil model kimlikleriyle güncellendi.

### Kalite

- Lint uyarıları temizlendi (`no-unused-vars` / `escapedCode`).
- Güvenlik testleri genişletildi: metadata/host engelleme (169.254.x.x, CR injection, geçersiz port), git-clone whitelist ve `sanitizeGeminiModelId` senaryoları (13 test, hepsi geçiyor).
- `test:ci` scripti (coverage destekli) eklendi.

## 2.6.0 — 2026-05-11

- CSS senkronizasyonu, kod kopyalama butonu, markdown tabloları, tam README.
- Ghost Mode (saydamlık) ve Quest Log (görev takipçisi) mantığı.
- Profesyonel logolar ve görsel iyileştirmeler; profesyonel README.

## 2.5.0 — 2026-05-11

### Modeller ve sürüm öncesi kalite

- Merkezi **`src/shared/model-catalog.json`**: güncel OpenAI / Anthropic / Gemini öneri model ID’leri.
- **`get-model-catalog` IPC** + açılışta **bulut listesi birleştirme** (API’den gelen tüm sohbet uygun modeller + katalog).
- OpenAI **reasoning** (`o*`, `gpt-5*`) için `max_completion_tokens`; Gemini listede `generateContent` destekli modeller.
- API anahtarı **Kaydet** sonrası model listelerinin otomatik yenilenmesi.

### UI, kullanılabilirlik, backend ve dağıtım

- Bağlantı çubuğu: Ollama sağlık pingi (`app-health` IPC), sürüm/OS bilgisi, yenile ve veri klasörü kısayolu.
- Türkçe karşılama metinleri, `aria-*`, “Sohbet kutusuna atla” skip linki, odak görünürlüğü (`:focus-visible`).
- macOS/Windows uyumlu uygulama menüsü (Görünüm, Yardım → DEPLOY.md ve userData).
- `docs/DEPLOY.md` (dağıtım rehberi), Linux `AppImage` build scripti, pakete `DEPLOY.md` dahil.

### Security & architecture

- Renderer: `contextIsolation`, no `nodeIntegration`; strict preload whitelist (`ollamaxApi`).
- **`src/main-security.js`:** Ollama `host:port` doğrulama (SSRF / kontrol karakteri engeli), dosya gezgininde **yalnızca ana dizin + OllamaX-Projects + kullanıcının seçtiği klasör**, `read-file` **2 MB** önizleme sınırı, `open-path` aynı köklerle sınırlı.
- **`git-clone`:** yalnızca izin verilen HTTPS host’lar; `git` `shell: false`.
- **`normalize-ollama-host` IPC**; kalıcı ayarlarda yalnızca izin verilen `settings` anahtarları; oturum kaydı **15 MB** üst sınırı.
- **Kaldırıldı:** `exec-command`, `write-file` (ön yüzden rastgele komut / yazma yok).
- Paketlenmiş uygulamada menüden **Geliştirici araçları** gizli; `allowRunningInsecureContent: false`.
- CSP: `base-uri 'none'`, `object-src 'none'`, `frame-ancestors 'none'`.
- Markdown: **DOMPurify** sıkılaştırılmış etiket/olay özniteliği listesi; kod blokları **highlight.js**.

### Features

- **Delegation:** `parseDelegateCalls` + queued sub-agent routing after lead responses.
- **Toasts** and dismissible **error banner**.
- **Export chat** as JSON or Markdown (save dialog via main process).
- **↻ API:** sync OpenAI / Gemini model IDs from provider APIs; Anthropic curated list.
- **Session persistence** to Electron `userData` (`chat-session.json`) plus existing localStorage.
- **Keyboard:** ⌘/Ctrl+K focus chat, +L toggle tools, +, settings.
- **Clone workflow:** opens cloned folder in Finder/Explorer; lists directory in Files tab.

### Tooling

- `src/` layout (`src/main.js`, `src/preload.js`, `src/renderer/`).
- Jest (`tests/delegate-parse.test.js`), ESLint, Prettier, GitHub Actions CI.
- Docs: `CONTRIBUTING.md`, `docs/API.md`, `docs/TROUBLESHOOTING.md`, `docs/DEVELOPMENT.md`, issue/PR templates.
