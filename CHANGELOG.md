# Changelog

## 3.25.0 — 2026-08-18

### Yeniden Denetçi Motoru (P-1: Plan, Onay, Grading, Güvenli Diff, Proje Belleği)

- **`src/main/plans/engine.js`**: ajan prompt'undan adım planı üreten yeniden denetçi motoru. 6 adım türü (list_dir, read, write, edit, execute, review), otomatik risk puanlama (0-100), tehlikeli desen eşleştirme (silme/ağ/kimlik desenleri) ve plan serileştirme.
- **`src/main/plans/approval.js`**: plan onay döngüsü — yürütmeden önce adım bazlı kullanıcı onayı bloklaması, oturum yaşam döngüsü ve zaman aşımı; plan düzenleme (adım değiştirme/ekleme/çıkarma).
- **`src/main/plans/grading.js`**: görev sonuçlarını 0-10 ölçeğinde derecelendiren grading modülü — tam sonuç, eksik veri ve hatalı sonuç ayrımı.
- **`src/main/plans/diff-apply.js`**: güvenli unified diff uygulayıcı — hunk bütünlük doğrulama (eklenen/silinen satır sayımı), yalnızca beklenen dosyalara uygulama, fuzzy strateji.
- **`src/main/plans/diff-review.js`**: hunk bazlı diff inceleme — her hunk için onay/reddet durumu, SARIF 2.1.0 dışa aktarma.
- **`src/main/plans/project-memory.js`**: proje belleği (KREYX.md + semantik notlar) — ekleme/sorgulama/pruning, bellek bütçesi, proje bilgi dosyası iskeleti.

### Orkestrasyon (Q: Görev Kuyruğu + Çoklu Ajan + Zincir + Bağlam + Hook)

- **`src/main/agents-ext/task-queue.js`**: kalıcı görev kuyruğu — öncelik, yeniden deneme, zaman aşımı, crash kurtarma (disk senkronizasyonu), paralel çalışma limiti.
- **`src/main/agents-ext/multi-agent.js`**: ajan havuzu — register/state/distribute (round-robin, least-loaded, broadcast) + dispatch.
- **`src/main/agents-ext/chain-tasks.js`**: zincir görevler — sıralı ve paralel grup yürütme, şablonlu prompt render, iptal jetonu.
- **`src/main/agents-ext/context-manager.js`**: bağlam yöneticisi — proje bağlamı kaydetme/yükleme, kırpma (trim), zincir doğrulama.
- **`src/main/agents-ext/hooks.js`**: yaşam döngüsü hook sistemi — pre-run/post-run/pre-tool/pre-shell hook'ları, kayıt kümesi, blok kararları, FORBIDDEN_TOKENS güvenlik filtresi, zaman aşımı koruması, olay günlüğü.

### Güven ve Denetim (T-4: İmza, Merkle Zincir v2, Gizli Tarama, Kasa)

- **`src/main/trust/release-check.js`**: sürüm doğrulama — checksum ayrıştırma (SHA-256/SHA-512) ve dosya eşleştirme.
- **`src/main/trust/audit-chain-v2.js`**: merkle köklü denetim zinciri v2 — bloklu zincirleme, blok sınırı kök taşıma, JSONL kalıcılık, sorgu/istatistik, CSV/SARIF dışa aktarma; `krevyx audit2` ile statik doğrulama.
- **`src/main/trust/secrets-audit.js`**: 40 kuralı gizli sızıntı tespiti — API anahtarları, PAT, PEM, URL kimlik bilgileri, diff taraması, krevyx-ignore susturma, test dosyası atlama.
- **`src/main/trust/vault-mgmt.js`**: kasa yönetimi — AES-256-GCM import/export, anahtar döndürme (rotate), entropy raporu, bütünlük kontrolü.

### CLI (7 yeni alt komut)

- `krevyx plan`, `krevyx diff-apply`, `krevyx diff-review`, `krevyx memory`, `krevyx secrets-scan`, `krevyx audit2`, `krevyx kreyx-md`.

### UI (5 yeni panel modülü)

- **plans** (Yeniden Denetçi), **diff-review**, **queue** (Görev Kuyruğu), **hooks** (Hook Yöneticisi), **trust** (Güven paneli); `index.html` + `styles.css` entegrasyonu, `ipc:3:*` uç noktaları.

### Testler ve Kalite

- 3 yeni test dosyası: `test-v325-plans` (37), `test-v325-agents` (45), `test-v325-trust` (33) — **25 suite, 450 test**.
- Düzeltilen gerçek bug'lar: paralel grup sonsuz döngüsü (chain-tasks), blok zincirleme hatası ve tek girişlik flush (audit-chain-v2), rotateKey eksik çıktısı (vault-mgmt), 7 regex derleme hatası (secrets-audit), sabit-nullish maxRetries (task-queue).


## 3.16.1 — 2026-08-16

### CI Düzeltmesi

- pnpm artık resmi `pnpm/action-setup@v4` ile kuruluyor (runner PATH sorununu çözer).


## 3.16.0 — 2026-08-16

### Orkestrasyon 2.0 (F3-2: Prompt Bayrağı + Şef Ajan)

- **Prompt forwarding**: `agent-chain` zincirine `{ forwardPrompt: true }` bayrağı eklendi — önde gelen ajanın (şef) **tam çıktısı** sonraki ajanın görev prompt'una `[ZİNCİR FORWARD]` bloklarıyla enjekte edilir (eski özet handoff'a ek olarak).
- **Şef ajan seçimi**: UI'da "Şef ajan" listesinden zincirde başa geçen ajan seçilebilir; çıktıları `[ŞEF]` etiketiyle işaretlenir. Varsayılan: zincirin ilk ajanı.
- Ayarlar modalına "Orkestrasyon" kontrolleri eklendi: şef ajan seçici (`#orch-head-agent`) + prompt bayrağı çipi (`#orch-forward-prompt`).

## 3.15.1 — 2026-08-16

### CI Düzeltmesi

- `release-build.yml` artık `npm ci` yerine `pnpm install --frozen-lockfile` kullanıyor (stale `package-lock.json` kaldırıldı; canonical `pnpm-lock.yaml` ile uyum).
- Linux runner'a `libsecret-1-dev` (keytar native build) eklendi.

## 3.15.0 — 2026-08-16

### Cost Command (A2 fazı: Bütçe Motoru + Maliyet Paneli)

- **Yeni `src/main/cost/cost-engine.js`**: provider bazlı aylık bütçe motoru. Temsili USD/1M token fiyat tablosu (16 sağlayıcı), istek başına token sayacı → tahmini dolar maliyeti; %80 eşiğinde sarı uyarı, %100'de soft stop (kullanıcı onayıyla devam edilebilir).
- **Kalıcılık**: `userData/cost-usage.jsonl` günlük satırlar; config'te `app.cost.budgets = { provider: limit }`.
- **Yeni IPC uçları**: `cost-totals`, `cost-budgets-get`, `cost-budgets-set`, `cost-check`, `cost-csv`, `audit-verify`.
- **Chat entegrasyonu**: `chat-usage` kanalı ile Ollama eval_count ve bulut sağlayıcı usage alanları (input/output token) kaydedilir; `runMultiChat` istek öncesi bütçe denetimi yapar.
- **Renderer (Ayarlar modalı)**: "Maliyet & Bütçe" bölümü — aylık toplam kartı, provider satırı + limit barları, bütçe girdileri, CSV indirme ve karşılaştırma notu (Cursor Pro + Claude Max referansı).
- **Denetim paneli yükseltmesi**: 5. sütun "Karma" (SHA-256 zincir bütünlük karması, tıkla → panoya kopyala); zincir doğrulama barı (`audit-verify`) panel üstünde ✓/✗ durumu gösterir.
- **Güvenlik paneli (Ayarlar modalı)**: kasa modu + ağ modu durumu, air-gapped çip geçişi, "API anahtarlarını kasaya taşı" tek tıkla taşıma.

## 3.14.0 — 2026-08-16

### Güvenlik Katmanı v1 (A1 fazı: Kasa + Air-Gapped)

- **Gizli Anahtar Kasası** (`src/main/secrets/secrets-vault.js`): OS-native keychain desteği (macOS Keychain / Windows DPAPI / Linux libsecret) ile API anahtarları artık düz metin olarak diskte saklanmaz. `keytar` isteğe bağlı native bağımlılığa eklendi.
- **Graceful degradation**: keytar kurulu değilse anahtarlar yalnızca bellekte (memory-only) tutulur — düz metin hiçbir durumda diske yazılmaz, kapanınca uçur. `vault-status` mod durumu: `native` / `memory` / `error`.
- Config'te anahtarlar `VAULT:keytar:provider.<ad>` referansı olarak saklanır; çözümü `resolveVaultKey`/`storeApiKeyInVault` (config-store) ve kasa modülü yapar.
- Yeni IPC uçları: `ipc:3:vault-status`, `ipc:3:vault-set`, `ipc:3:vault-get` (preload izin listesine eklendi).
- **Air-Gapped mod** (`src/main/network/network-mode.js`): `app.network.mode = 'local-only'` ile tüm bulut sağlayıcıları (OpenAI/Anthropic/Gemini + 12 çoklu sağlayıcı) kapatılır; yalnızca Ollama/LM Studio/yerel endpoint'ler çalışır. Otomatik keşif yenilemesi ve periyodik GitHub pull devre dışı kalır, yerel cache servis edilir.
- Bulut chat uçları (`openai-chat`, `anthropic-chat`, `gemini-chat`, `multi-chat`/runMultiChat) her istek öncesi `isCloudProviderAllowed` denetiminden geçer; yerel adres doğrulaması `isHostLocal` ile (loopback + RFC1918 + link-local + IPv6).
- Yeni IPC uçları: `ipc:3:network-mode-get`, `ipc:3:network-mode-set`.
- 2 yeni test dosyası (network-mode, secrets-vault); **144/144 test yeşil**, ESLint temiz.

## 3.12.0-rebrand — 2026-08-16

### Marka Yenilemesi (OllamaX → Krevyx)

- Uygulama tamamen **Krevyx** markasına taşındı: paket adı, Electron `appId`/`productName`, pencere ve tray başlıkları, tema tanımları, API namespace'leri ve testler dahil tüm kaynak dosyalar.
- Tüm `OllamaX` kod referansları (camelCase identifier'lar dahil) `Krevyx` / `krevyx` olarak yeniden adlandırıldı; case-duyarlı eşlemeler korundu.
- **133/133 test yeşil**, ESLint v9 uyarısız.

## 3.12.0 — 2026-08-16

### Orkestrasyon (F3)

- **Orkestrasyon paneli** (sidebar): lokal ajan keşfi — Claude Code, Codex, Antigravity, Ollama, Shell; durum göstergesi (erişilebilir/erişilemiyor), gerçek zamanlı yenileme.
- **Zincir çalıştırma**: çoklu ajan sıralı görev yürütme (Claude Code → Codex → Antigravity), toggle ile ajan seçimi.
- **Canlı ilerleme**: zincir çıktısı chat alanına stream card olarak akar; sistem başlangıç/bitiş mesajları.
- Yeni IPC kanalları: `agent-discover-all` (invoke), `agent-run`, `agent-chain` (send), `agent-output`, `agent-chain-progress` (on).
- `orchestrator.js` modülü artık UI'dan tam erişilebilir.

## 3.11.0 — 2026-08-16

### Otomatik GitHub Repo Keşfi (featured-discover)

- **Canlı keşif motoru** (`src/main/featured-discover.js`): statik katalog yerine GitHub Search API'den beş kategori sorgusu parallel çekilir; otomatik kategori atama (anahtar kelime kuralları), disk cache (`userData/featured-cache.json`), 4 saat TTL.
- **Otomatik yenileme**: açılıştan 60 sn sonra + 4 saatte bir arka plan yenileme; çevrimdışı/rate-limit'te cache servis edilir, statik katalog son yedek.
- **Canlılık rozeti**: Featured Repos başlığında "X dk önce · canlı/yedek" göstergesi; kartlarda GitHub'da açış (↗) linki.
- 7 birim testi eklendi (`tests/featured-discover.test.js`); rate-limit dostu `User-Agent`, escape'li sorgular.

### Kalite

- **133 test** (hepsi yeşil), ESLint v9 uyarısız, sürüm `3.11.0`.

## 3.10.0 — 2026-08-16

### GitHub Repo Keşfi — kategorili, canlı entegre keşif sistemi

- **Merkezi katalog** (`src/shared/featured-repos.json`): 5 kategori, 20+ zenginleştirilmiş repo (Karpathy nanoGPT / llama2.c dahil); ana süreçten IPC ile yüklenir, çevrimdışı yedekli.
- **Zengin kartlar**: kategori pilleri + bölümleme, yıldız skoru ve dil rozeti, tek tıkla GitHub arama paneline yönlendirme (sorgu otomatik dolar, sonuç listesi açılır).
- **Denetim kaydı**: açılan öne çıkan repo `github.featured-open` olarak loglanır.
- UI testleri (`scripts/serve-ui-test.js`, `scripts/mock-api.js`) ve CDP doğrulama betiği (`scripts/verify-discover.js`) eklendi; 9/9 kontrol geçer.

### Kalite

- **126 test** (hepsi yeşil), ESLint v9 uyarısız, `package.json` sürüm `3.10.0`.

## 3.0.0 — 2026-08-15

### AI Agent Studio dönüşümü (ROADMAP Faz 1–6)

- **Otonom AgentLoop** (`src/main/agents/loop.js`): hedef → plan → araç seç → onay → gözlem döngüsü; başarısızlıkta yeniden planlama.
- **Araç sistemi** (`src/main/tools/*`): 12 araç manifesti (dosya okuma/yazma/düzenleme/ekleme/silme, terminal, git-clone, web erişimi), tier tabanlı onay akışları, workspace sandbox'ı, tehlikeli komut blacklist'i.
- **Anlamsal bellek** (`src/main/memory/*`): saf-JS vektör indeksi + SQLite kalıcılığı; panel'den semantik arama ve ajan kontekstine otomatik bellek enjeksiyonu.
- **Bağlam sıkıştırma** (`compaction.js`): uzun sohbetlerde özetleme ile pencere yönetimi.
- **İş akışı motoru** (`workflow/engine.js`): JSON/YAML şablonları, `{{step_n.output}}` interpolasyonu, 20 adım sınırı, hata kapsama.
- **Eklenti sistemi** (`plugins/loader.js`): manifest doğrulama, yükleme/açma zamanlama sınırı, devre dışı bırakma.
- **MCP istemcisi** (`mcp/client.js`): harici model bağlam protokolü köprüsü.
- **EventChannel** (`event-channel.js`): tekil streaming kanalı; OpenAI/Anthropic/Ollama/Gemini akış adaptörleri (thinking dahil).
- **Denetim günlüğü** (`audit-log.js`): SHA-256 hash zincirli JSONL, bütünlük doğrulama, sorgu, 50 MB tavanı + budama; `npm run audit:verify` CLI aracı.
- **Şema-sürümlü config** (`config/config-store.js`, `config-migrations.js`): v2 → v3 migrasyon, atomik yazım, ENV: ön ekli API anahtarları.
- **Versiyonlanmış IPC** (`ipc-v3-handlers.js`): `ipc:3:*` namespace; oturum, config, bellek, iş akışı, eklenti, denetim, araç ve görsel uçları.

### Arayüz (yeni nesil)

- **`v3-ui.js`** katmanı: oturum, bellek, iş akışları, eklentiler, denetim panelleri; araç onay modalı; `/image` komutu; canlı olay akışı balonları. Legacy `app.js`'yi değiştirmeden çalışır.
- **AI slop temizliği**: tüm emoji'ler kaldırıldı; 30+ ikonluk iç SVG ikon sistemi (`iconSvg`).
- Profesyonel tema birleştirmesi (`styles.css`): ortak tipografi hiyerarşisi, panel/stil tutarlılığı.

### Belgeler

- Yeni: `docs/ARCHITECTURE.md`, `docs/FEATURES.md`.
- Güncel: `CHANGELOG.md`, sürüm `3.0.0`.

### Kalite

- **74 test** (41 yeni modül testi dahil), ESLint v9 temiz, `npm audit` 0 açık.

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

- Renderer: `contextIsolation`, no `nodeIntegration`; strict preload whitelist (`krevyxApi`).
- **`src/main-security.js`:** Ollama `host:port` doğrulama (SSRF / kontrol karakteri engeli), dosya gezgininde **yalnızca ana dizin + krevyx-Projects + kullanıcının seçtiği klasör**, `read-file` **2 MB** önizleme sınırı, `open-path` aynı köklerle sınırlı.
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

## 3.16.2 — 2026-08-16

### CI Düzeltmesi

- `pnpm/action-setup` artık `actions/setup-node`dan ÖNCE çalışıyor (setup-node `cache: pnpm` ön doğrulaması).


## 3.16.3 — 2026-08-16

### CI Düzeltmesi

- pnpm v11 varsayılan `onlyBuiltDependencies` kısıtına native modüller (keytar, node-pty, electron-winstaller) eklendi (`pnpm approve-builds` sorunu çözüldü).


## 3.16.4 — 2026-08-16

### CI Düzeltmesi

- Native modül build script onayı `.npmrc` üzerinden `onlyBuiltDependencies[]` ile veriliyor.

