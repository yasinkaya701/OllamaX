# Krevyx Ultra — Kapsamlı Geliştirme Planı ve Yol Haritası

**Sürüm hedefi:** v3.0 → v4.x · **Yazar:** Manus AI · **Tarih:** 15 Ağustos 2026
**Repo:** https://github.com/yasinkaya701/Krevyx · **Mevcut sürüm:** 2.7.0

---

## İçindekiler

| Bölüm | İçerik |
|---|---|
| 1 | Yönetici Özeti ve Vizyon |
| 2 | Mevcut Durum Analizi (v2.7.0) |
| 3 | Mimari Temeller ve Karar Kaydı |
| 4 | Faz 1 — Çekirdek Sağlamlaştırma (v3.0) |
| 5 | Faz 2 — Ajan Mimarisi ve Orkestrasyon (v3.1) |
| 6 | Faz 3 — İşbirliği ve Bellek (v3.2) |
| 7 | Faz 4 — Çok Modlu Yetenekler (v3.3) |
| 8 | Faz 5 — Dağıtım, Entegrasyon ve Eklenti (v3.4) |
| 9 | Faz 6 — Kurumsal Katman (v4.0) |
| 10 | Güvenlik ve Uyumluluk Master Planı |
| 11 | Test ve Kalite Güvencesi Master Planı |
| 12 | Sürüm Yönetimi ve Çıkarım Stratejisi |
| 13 | Ekip, Zamanlama ve Kaynak Planı |
| 14 | Risk Analizi ve Azaltma Stratejileri |
| 15 | Sonuç ve Sonraki Adımlar |

---

# Bölüm 1 — Yönetici Özeti ve Vizyon

## 1.1 Vizyon

Krevyx Ultra, tek bir masaüstü uygulaması içinde **yerel (Ollama)** ve **bulut (OpenAI, Anthropic, Gemini)** yapay zeka modellerini güvenli, performanslı ve kullanıcı dostu biçimde birleştiren bir **AI ajan stüdyosudur**. Projenin uzun vadeli vizyonu, tekil bir sohbet arayüzünden evrilen bir ürünü; **kişisel, yerel-öncelikli (local-first), çok ajanlı bir yapay zeka iş istasyonuna** dönüştürmektir. Bu dönüşümde üç ilke rehberdir:

1. **Gizlilik önceliği:** Kullanıcının verisi önce kullanıcının makinesinde yaşar. Bulut API'leri yalnızca isteğe bağlı bir katmandır.
2. **Güvenlik mimarisi:** SSRF koruması, path sandbox ve IPC beyaz listesi gibi v2.5'te atılan güvenlik temelleri, tüm yeni özellikler için değişmez kurallar (invariant) olarak korunur.
3. **Pragmatik mühendislik:** Electron + vanilla JavaScript mimarisi bilinçli olarak sade tutulmuştur; bu sadeliği koruyarak, her yeni özellik minimum bağımlılık ekleyecek biçimde tasarlanır.

## 1.2 Neden Bu Plan Gerekli?

Proje Mayıs 2026'da v2.6.0 ile durdurulmuştur. Ağustos 2026 itibarıyla sektör dört ayda önemli ölçüde ilerlemiştir: OpenAI GPT-5.5'i (Nisan 2026) ve GPT-5.3-Codex'i, Anthropic Claude Sonnet 5 ve Opus 4.8'i, Google ise Gemini 3.7 Flash'ı (Ağustos 2026) yayınlamıştır. Bu plan, projeyi yalnızca bağımlılık düzeyinde değil, **ürün mimarisi, ajan yetenekleri ve ticarileşme hazırlığı** düzeyinde de 2026-2027 standartlarına taşıyacak çok aşamalı bir geliştirme reçetesi sunar.

## 1.3 Yol Haritası Özeti (Kuş Bakışı)

| Faz | Sürüm | Zaman Aralığı | Odak | Ana Çıktılar |
|---|---|---|---|---|
| 1 | v3.0 | Hafta 1–6 | Çekirdek sağlamlaştırma | Config sistemi, otomatik güncelleme, IPC API sürümleme, performans |
| 2 | v3.1 | Hafta 7–14 | Ajan orkestrasyonu | MCP destek, araç setleri, planlayıcı, çok aşamalı ajan pipeline'ı |
| 3 | v3.2 | Hafta 15–22 | Bellek ve işbirliği | Embedding yerel bellek, vektör depolama, paylaşımlı ajan profilleri |
| 4 | v3.3 | Hafta 23–30 | Çok modluluk | Görüntü/görsel anlama, görsel üretim entegrasyonu, TTS/STT |
| 5 | v3.4 | Hafta 31–38 | Eklenti ve dağıtım | Eklenti mimarisi, mağaza, tema sistemi, genişletilmiş CI/CD |
| 6 | v4.0 | Hafta 39–52 | Kurumsal katman | Ekip lisansı, denetim kayıtları, SSO hazırlığı, kurulum yönetici |

## 1.4 Hedef Kitle ve Kullanım Senaryoları

Hedef kitle dört kümeye ayrılır. **Yerel modellerle çalışan geliştiriciler** (birincil): GPU'su güçlü, veri gizliliğine hassas mühendisler; Ollama çekirdeği bu kitle içindir. **Hibrit kullanan profesyoneller**: kritik işler için yerel model, en üst seviye kalite gerektiğinde bulut modeline düşen (fallback) kullanıcılar. **Araştırma ve öğrenci kesimi**: ücretsiz Ollama modelleriyle derinlemesine çalışanlar. **Kurumsal pilot kullanıcıları** (v4.0): politikalar, denetim ve ekip yönetimi isteyen küçük ekipler.

---

# Bölüm 2 — Mevcut Durum Analizi (v2.7.0)

## 2.1 Mimari Envanter

v2.7.0 itibarıyla sistem, üç katmanlı bir Electron mimarisinde çalışmaktadır. Aşağıdaki tablo mevcut IPC yüzeyini tam olarak listeler; yeni özellikler bu yüzeye eklenirken mevcut uç noktalarla anlam bütünlüğü korunmalıdır.

| Katman | Bileşen | Satır Sayısı | Sorumluluk |
|---|---|---|---|
| Main | `src/main.js` | ~1032 | 33 IPC uç noktası, pencere yönetimi, streaming SSE, git işlemleri |
| Main | `src/main-security.js` | ~178 | SSRF engeli, path sandbox, URL whitelisting, sanitize fonksiyonları |
| Preload | `src/preload.js` | ~47 | `contextBridge` beyaz listesi (`krevyxApi`) |
| Renderer | `src/renderer/app.js` | ~1773 | UI state yönetimi, mesaj döngüsü, ajan arayüzü, quest log |
| Renderer | `src/renderer/lib/delegate-parse.js` | ~22 | Lead ajan delegasyon ayrıştırıcısı (`//CALL:AgentName`) |
| Shared | `src/shared/model-catalog.json` | — | Sağlayıcı model katalogları |
| Shared | `src/shared/team-presets.json` | — | Ajan takım presetleri (Türkçe) |

**IPC uç nokta envanteri (33 adet):** `get-model-catalog`, `set-window-opacity`, `normalize-ollama-host`, `persist-save`, `persist-load`, `export-to-path`, `fetch-provider-models`, `app-health`, `open-path`, `get-models`, `pull-model`, `chat`, `openai-chat`, `anthropic-chat`, `gemini-chat`, `github-search`, `git-clone`, `list-dir`, `read-file`, `open-folder-dialog`, `get-workspaces`, `get-stats`, `hardware-profile`, `get-team-presets`, `scan-project`, `write-project-doc`, `terminal-create`, `terminal-input`, `terminal-resize`, `terminal-close`, ve dört provider streaming uç noktasının SSE tabanlı veri akışları (`chat-reply`, `pull-progress` vb.).

## 2.2 Güçlü Yönler

Mevcut kod tabanı dört alanda sektördeki birçok Electron projesinden daha iyi konumdadır. **Güvenlik disiplini**: `src/main-security.js` içindeki `normalizeOllamaHost` fonksiyonu metadata uç noktası engeli, kontrol karakteri filtreleme ve 169.254.x.x link-local aralığı engeli içermektedir. **Sağlayıcı çeşitliliği**: OpenAI, Anthropic ve Gemini streaming uçları ayrı ayrı implement edilmiş, ortak akış soyutlaması ile birleştirilmiştir. **Türkçe yerelleştirme**: UI metinleri, karşılama mesajları ve quest log dilleri yerelleştirilmiş olup, bu pazarda nadir bir özelliktir. **Test kültürü**: 13 güvenlik odaklı Jest testi mevcut olup, lint ve audit sıfır hata ile yeşildir.

## 2.3 Zayıflıklar ve Teknik Borç

| # | Zayıflık | Etki | Öncelik | Faz |
|---|---|---|---|---|
| 1 | Tüm state tek bir `app.js` dosyasında (~1773 satır) | Sürdürülebilirlik, merge çakışmaları | Kritik | 1 |
| 2 | Config kalıcılığı yalnızca `persist-save/load` JSON dump'ı | Şema evrimi imkansız, hata eğilimli | Yüksek | 1 |
| 3 | Otomatik güncelleme yok (`autoUpdater` entegre değil) | Kullanıcı güncellemelerini kaçırıyor | Yüksek | 1 |
| 4 | Ajan "delegasyonu" yalnızca regex tabanlı `//CALL:` ayrıştırma | Gerçek tool-use yok, ajanlar bağlamı göremez | Kritik | 2 |
| 5 | Bellek sistemi yalnızca `chat-session.json` serileştirmesi | Uzun süreli bağlam yok, yeniden keşif maliyeti | Yüksek | 3 |
| 6 | Tek pencere, çoklu sohbet desteği yok | İş akışı verimliliği düşük | Orta | 1 |
| 7 | Görsel modeller (vision) için UI/IPC akışı yok | 2026 modellerinin temel yeteneği atıl | Yüksek | 4 |
| 8 | Eklenti/pluggable yapısı yok | 3. şahıs entegrasyonları imkansız | Orta | 5 |
| 9 | Jest 29'e pinlenmiş olması (Jest 30.4.2 bug'u) | Bağımlılık takibi | Düşük | 1 |
| 10 | Windows `.exe` ve macOS `.dmg` imza/sürüm zinciri otomasyonu yok | Güvenlik uyarıları, mağaza kısıtları | Orta | 5 |

## 2.4 Rekabet Analizi ve Konumlandırma

Rakip ürünler üç kategoridedir. **Tam istemci ekosistemleri** (Continue, Cline, Windsurf) IDE içinde çalışır ve kod üretimine odaklanır; Krevyx'in farkı, **bağımsız bir stüdyo** olması ve sohbet/ajandan kod ötesine (doküman, analiz, otomasyon) uzanabilmesidir. **Genel chat istemcileri** (ChatGPT Desktop, Claude Desktop) tek sağlayıcıya sadıktır; Krevyx'in farkı hibrit çoklu sağlayıcı ve yerel-öncelikli mimaridir. **Açık kaynak arayüzler** (LibreChat, Open WebUI, Chutes) web tabanlıdır; Krevyx'in farkı native masaüstü deneyimi, terminal entegrasyonu ve dosya sistemi işlemleridir.

Konumlandırma önerisi: *"Gizlilik odaklı, hibrit çok-providercılı masaüstü AI ajan stüdyosu — tek bir arayüzde Ollama + OpenAI + Anthropic + Gemini."*

---

# Bölüm 3 — Mimari Temeller ve Karar Kaydı

Bu bölümde yol haritasının tüm fazlarını bağlayan **mimari karar kayıtları (ADR)** tanımlanır. Her kararın gerekçesi, reddedilen alternatifler ve uygulanma şekli belirtilir.

## 3.1 ADR-001: Mimari Sadelik — Vanilla JS Kalır, Framework Eklenmez

**Durum:** Kabul edildi. **Bağlam:** `app.js` 1773 satıra ulaşmıştır; React/Vue gibi bir framework'e geçiş cazip görünmektedir. **Karar:** Vanilla JavaScript korunur; ancak dosya, modüler bir yapıya bölünür (`renderer/modules/` altında domain modülleri). **Gerekçe:** Electron + vanilla kombinasyonu paket boyutunu ~%35 azaltır, derleme adımı gerektirmez, güvenlik yüzeyi (build toolchain) dar kalır. Reddedilen alternatifler: React (eklenti karmaşıklığı ve paket büyüklüğü), Vue (aynı nedenler), Tauri (Rust öğrenme eğrisi ve mevcut IPC yüzeyinin yeniden yazılması).

## 3.2 ADR-002: IPC Yüzeyi Sürümlenir

**Durum:** Kabul edildi. **Karar:** Tüm yeni IPC uç noktaları `ipc:3:` ön eki ile isimlendirilir (`ipc:3:agent-tool-invoke`). Mevcut `chat`, `get-models` gibi uç noktalar geriye dönük uyumluluk katmanı (`ipc-bridge.js`) üzerinden v1 olarak yeniden export edilir. **Gerekçe:** v3.x serisinde renderer/main ayrıştırılırken çift sürüm çalıştırma gerekecek; sürümlü isimlendirme bu geçişi risksiz kılar.

## 3.3 ADR-003: Eklenti Sistemi Sandboxlı Çalışır

**Durum:** Kabul edildi (Faz 5'te uygulanacak). **Karar:** Eklentiler kendi `contextBridge` namespace'inde, ana IPC beyaz listesinin alt kümesini miras alarak çalışır; hiçbir eklenti doğrudan `child_process` erişemez. **Reddedilen alternatif:** Eklentilerin tam IPC erişimi (güvenlik modelini kırar).

## 3.4 ADR-004: Yerel Bellek İçin Embedded Vektör Deposu

**Durum:** Kabul edildi (Faz 3'te uygulanacak). **Karar:** Bellek katmanı, hafif bir embedded vektör deposu (örn. `sqlite-vss` veya pure-JS HNSW implementasyonu) üzerinde SQLite ile çalışır; harici sunucu gerektirmez. **Gerekçe:** local-first ilkesi ve sıfır kurulum hedefi. Reddedilen alternatif: ChromaDB/Qdrant sunucu kurulumu (kullanıcı sürtünmesi yaratır).

## 3.5 ADR-005: Streaming Mimarisi Olay Tabanlı Kanal Soyutlamasına Evrilir

**Durum:** Kabul edildi (Faz 2'de uygulanacak). **Karar:** Provider'a özgü SSE ayrıştırma (`chat-reply` event'leri), tek bir `EventChannel` soyutlamasının arkasına alınır. `EventChannel` olay tipi uzatılabilir: `token`, `thinking`, `tool-call`, `tool-result`, `error`, `done`. **Gerekçe:** Faz 2'deki tool-use ve Faz 4'teki çok modlu akışlar aynı kanal üzerinden çalışmalıdır; provider'lara özel akış dağıtımı sürdürülemeyecek noktaya gelmiştir.

## 3.6 ADR-006: Konfigürasyon Şema-Sürümlü Olarak Saklanır

**Durum:** Kabul edildi (Faz 1'de uygulanacak). **Karar:** `persist-save/load` tek JSON dump'ı yerine, sürümlü bir şema (`schemaVersion` alanı) ile yazılır; migration fonksiyonları `config-migrations.js` içinde tanımlanır. **Gerekçe:** Kullanıcı ayarlarının v2.7 → v3.0 ve sonrası sürümler arasında kaybolmaması gerekir.
# Bölüm 4 — Faz 1: Çekirdek Sağlamlaştırma (v3.0)

**Zaman aralığı:** Hafta 1–6 · **Hedef kararlılık:** `npm audit` 0 açık korunarak, teknik borç %60 azaltılır.

## 4.1 F1.1 — Renderer Modülerizasyonu

**Problem:** `app.js` 1773 satır, tek state objesi (`const state = { agents, history, ... }`), tüm UI ve iş mantığı iç içe.

**Hedef mimari:** `src/renderer/` dizini domain modüllerine bölünür:

```
src/renderer/
├── index.html
├── styles.css
├── app.js                (sadece bootstrap + event routing, <150 satır)
├── modules/
│   ├── chat/             (mesaj döngüsü, markdown render, streaming UI)
│   ├── agents/           (ajan CRUD, takım presetleri, delegasyon UI)
│   ├── tools/            (workspace, dosya paneli, terminal, quest log)
│   ├── providers/        (model seçimi, API key yönetimi, health bar)
│   ├── settings/         (ayarlar paneli, workspace seçim)
│   └── shared/           (dom helpers, toast, esc, PH, i18n)
└── lib/
    ├── delegate-parse.js (mevcut, genişletilecek)
    └── event-bus.js      (yeni — modüller arası olay kanalı)
```

**Uygulama sözleşmeleri:** Her modül bir `init(appApi)` fonksiyonu döndürür; `app.js` modülleri sırayla başlatır. Modüller birbirini doğrudan import etmez; iletişim `event-bus.js` üzerinden `emit('chat:message-sent', payload)` kalıbıyla yapılır. DOM sorguları `shared/dom.js` içindeki `q()` ve `qa()` yardımcılarında kalır (mevcut koddan taşınır). Bu yapı kod satır toplamını artırmaz; sürdürülebilirliği artırır.

**Kabul kriterleri:** `npm run lint` 0 uyarı; her modül bağımsız başlatılabilir; `app.js` 150 satır altı; mevcut 13 test ve tüm UI davranışı değişmeden çalışır.

## 4.2 F1.2 — Şema-Sürümlü Konfigürasyon Sistemi

**Mevcut:** `persist-save`/`persist-load` tüm state'i `userData/chat-session.json` içine tek JSON dump olarak yazar; 15 MB üst sınırı ile.

**Yeni tasarım:**

```
userData/
└── Krevyx/
    ├── config.json          (settings, providers, ajan tanımları — şema v3)
    ├── sessions/
    │   └── {sessionId}.db   (oturum mesajları — ayrı dosyalar)
    └── migrations/          (opsiyonel migration log)
```

Config şeması:

```json
{
  "schemaVersion": 3,
  "app": { "theme": "dark", "language": "tr", "ghostMode": false },
  "providers": {
    "ollama": { "hosts": ["localhost:11434"], "pollInterval": 30000 },
    "openai":  { "apiKey": "ENV:OPENAI_API_KEY", "modelFallback": ["gpt-5.5"] },
    "anthropic": { "apiKey": "ENV:ANTHROPIC_API_KEY" },
    "gemini": { "apiKey": "ENV:GEMINI_API_KEY" }
  },
  "agents": [ { "id": "a1", "name": "Lead", ... } ],
  "workspaces": [ { "path": "/home/x/krevyx-Projects", "alias": "default" } ]
}
```

**Kritik özellikler:** (1) `ENV:` ön eki ile API anahtarları disk yerine env'den okunabilir — güvenlik açığı yüzeyi küçülür. (2) `config-migrations.js` içinde her `schemaVersion` için `migrate(v2→v3)` fonksiyonu; uygulamanın açılışında otomatik çalışır. (3) Config değişiklikleri atomic write (yeni dosyaya yaz → rename) ile kaydedilir; çökme durumunda eski config korunur.

**Geriye uyumluluk:** Eski `chat-session.json` açılışta otomatik olarak yeni yapıya taşınır (tek seferlik migration), orijinal dosya `.bak` olarak bırakılır.

## 4.3 F1.3 — IPC API Sürümleme Köprüsü (ADR-002 uygulaması)

Yeni uç noktalar `ipc:3:*` prefixi ile eklenir. Eski uç noktalar `src/ipc-bridge.js` içinde yeniden map'lenir:

```js
ipcMain.handle('ipc:3:normalize-ollama-host', (_e, input) => {
  const h = normalizeOllamaHost(input);
  if (!h) return { ok: false, error: 'Geçersiz Ollama adresi.' };
  return { ok: true, host: h };
});
// Eski isim geriye uyum için yönlendirilir
ipcMain.handle('normalize-ollama-host', (e, input) =>
  ipcMain.emit('ipc:3:normalize-ollama-host', e, input));
```

Bu sayede v2.x uyumlu eklentiler (gelecekteki Faz 5) eski isimlerle çalışmaya devam eder.

## 4.4 F1.4 — Otomatik Güncelleme (electron-updater)

`electron-updater` paketi eklenir; dağıtım GitHub Releases üzerinden yapılır. `publish` bloğu `electron-builder.yml`'e eklenir. Güncelleme davranışı: arka planda kontrol (1 saatte bir), indirme tamamlandığında bildirim, kullanıcı onayı ile yeniden başlatma. `set-feed-url` IPC'si enterprise mirror desteği için opsiyonel bırakılır. macOS `dmg`, Windows `nsis`, Linux `AppImage` hedefleri üç platformda da test edilir. **Güvenlik notu:** Güncelleme feed'i yalnızca `https` üzerinden alınır; imzalı paketler (Faz 5'te kod imzalama ile) doğrulanır.

## 4.5 F1.5 — Çoklu Sohbet ve Oturum Yönetimi

Tek pencere korunur; ancak **sohbet sekmeleri** eklenir. Her sohbet sekmesi bağımsız bir `sessionId` taşır ve mesajları `sessions/{sessionId}.json` dosyasına yazılır (v3.2'de vektör indeksine bağlanır). Sekme yönetimi: yeni sohbet, sekme kapatma (onay promptu ile), sürükle-sıralama (basit ok tuşları), sohbet arama (başlık/ilk mesaj üzerinden). Ana görünüm "sohbet listesi" paneli ile genişletilir: son 20 sohbet, ajan etiketi, tarih, mesaj sayısı.

## 4.6 F1.6 — Performans ve Sağlık İzleme

**Sorunlar:** Uzun sohbetlerde (`history` dizisi büyüdükçe) markdown render yeniden oluşturması yavaşlar; ghost mode (saydamlık) belirli GPU sürücülerinde titreme yaratır.

**Çözümler:** (1) Sanallaştırma: yalnızca görünür pencere + 500px tamponundaki mesajlar DOM'da kalır; diğerleri placeholder'a dönüşür (`chat` modülüne virtualization eklenir). (2) Markdown parse cache'i: aynı içerik için cached `DOMPurify` + highlight çıktıları 1000 girişlik LRU cache'te tutulur. (3) `app-health` IPC'sine CPU/memory/threadpool metrikleri eklenir; bağlantı çubuğunda periyodik yenileme. (4) Streaming buffer batching: SSE'den gelen token'lar 16ms'lik (requestAnimationFrame) batch'lerle DOM'a yazılır; mevcut per-token yazma kalıbı throttling'e çevrilir.

## 4.7 F1.7 — Hata Raporlama ve Crash Recovery

Kullanıcı opt-in crash raporu için `electron-unhandled` entegrasyonu; raporlar lokal dosyaya yazılır ve kullanıcı dilerse GitHub issue şablonuna dönüştürülür. Ajan/sohbet state'i 30 saniyede bir otomatik checkpoint edilir; çökme sonrası "kurtarılmamış oturum bulundu" diyalogu checkpoint'i geri yükler.

## 4.8 Faz 1 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | `npm test` + `npm run lint` | 13+ test, 0 uyarı |
| 2 | v2.7 config'i v3.0'da açma | Otomatik migration, 0 veri kaybı |
| 3 | 10.000 mesajlı sohbet render'ı | <100ms scroll, 60fps |
| 4 | electron-updater ile release simülasyonu | Güncelleme indirilir ve kurulur |
| 5 | Çökme sonrası checkpoint geri yükleme | Son 30 sn state'i korunur |
# Bölüm 5 — Faz 2: Ajan Mimarisi ve Orkestrasyon (v3.1)

**Zaman aralığı:** Hafta 7–14 · **Temel vaat:** Krevyx, "delegasyon regex'i"nden gerçek **tool-use** destekli, plancı-çalıştırıcı ajan mimarisine evrilir.

## 5.1 F2.1 — Araç (Tool) Soyutlama Katmanı

**Mevcut durum:** Ajan delegasyonu `parseDelegateCalls` ile `//CALL:AjanAdı` satırlarını ayrıştırır; lead ajan mesaj verdikten sonra sub-agent kuyruğa alınır. Araçlar yalnızca gömülü IPC işlemleridir (dosya okuma, terminal, git).

**Yeni araç şeması:**

```json
{
  "name": "read_file",
  "display_name": "Dosya Oku",
  "description": "Workspace içindeki bir dosyanın içeriğini okur (max 2MB)",
  "input_schema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "Workspace içindeki göreceli yol" }
    },
    "required": ["path"]
  },
  "handler": "tools:file.read",
  "category": "files",
  "sandbox": { "roots": ["home", "workspace", "user_selected"] },
  "timeout_ms": 30000
}
```

**Araç kaydı (`src/main/tools/registry.js`):** Her araç `name`, şema, handler referansı ve güvenlik profiline sahip bir kayıt nesnesidir. Ajan tanımındaki `tools: ["read_file", "terminal", "git_clone"]` listesi, modelin görebileceği araç kümesini belirler. Yerleşik araç kataloğu:

| Araç | Kategori | Güvenlik profili |
|---|---|---|
| `read_file`, `list_dir`, `scan_project` | Dosya (read-only) | home + workspace sandbox |
| `terminal_execute` | Terminal | tty ayrıcalığı; komut blacklist (sudo, rm -rf / vb.) |
| `git_clone`, `git_info` | Git | HTTPS-only host whitelist (mevcut) |
| `web_fetch` | Web | SSRF koruması (`normalizeOllamaHost` benzeri URL guard) |
| `search_memory` | Bellek (F3'te) | sandbox yok, salt okuma |
| `create_file` (yeni) | Dosya (write) | Yalnızca workspace kökü; her yazma **kullanıcı onayı** gerektirir |

**Kullanıcı onayı mekanizması:** Write-tier araçlar için main süreç `tool-approval-request` event'i gönderir; renderer'da modal "Ajan şu işlemi yapmak istiyor: `write_file → docs/roadmap.md` — İzin ver?" gösterilir. Onay hatırlanabilir (per-tool remember decision, 24 saat TTL).

## 5.2 F2.2 — EventChannel Streaming Soyutlaması (ADR-005 uygulaması)

Dört provider'ın SSE ayrıştırma kodu tek bir `EventChannel` sınıfında birleştirilir:

```js
class EventChannel extends EventEmitter {
  // Ortak olay tipleri: token, thinking, tool-call, tool-result, error, done
  // Provider adapter'ları: openaiAdapter(), anthropicAdapter(),
  //                        geminiAdapter(), ollamaAdapter()
}
```

Her adapter provider'ın akış JSON'ını ortak olay setine map'ler. Örneğin OpenAI `reasoning_content` alanı → `thinking` olayı; Anthropic `tool_use` bloğu → `tool-call` olayı; Gemini `functionCall` → `tool-call`. Bu katman olmadan Faz 2 tool-use ve Faz 4 çok modlu akışların implementasyonu her provider için ayrı ayrı çoğaltılmak zorunda kalır.

## 5.3 F2.3 — MCP (Model Context Protocol) Desteği

MCP, 2025-2026'da ajan araç standartlaşmasının fiili protokolüdür. Krevyx'in yerleşik araç setini MCP sunucularıyla genişletmesi, pazardaki rakiplerle (Cline, Zed) özellik denkliğini sağlar.

**Mimari:** MCP client `src/main/mcp/client.js` içinde stdio tabanlı olarak çalışır. Kullanıcı `settings`'ten MCP sunucusu ekler:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"],
      "enabled": true
    }
  }
}
```

**Güvenlik kuralları:** (1) `command` alanı allowlist (yalnızca `npx`, `node`, `uvx` ve kullanıcı tanımlı absolute path'ler; path `resolveReadablePath` sandbox'ından geçmelidir). (2) Her MCP sunucusu ayrı bir child process; spawn `shell: false` (mevcut git-clone kuralının genellemesi). (3) MCP sunucusunun expose ettiği araçlar, ana araç kaydı tarafından sarmalanır ve tool-approval mekanizmasına tabi olur. (4) Sunucu çökerse graceful degrade: ajan MCP araçlarını "kullanılamıyor" olarak işaretler, sohbet devam eder.

## 5.4 F2.4 — Ajan Planlayıcı ve Döngü Yönetimi

Gerçek tool-use, ajanın **planlama döngüsü** gerektirir. Döngü şöyle çalışır:

1. Kullanıcı mesajı → Lead ajan, sistem prompt'u araç listesi ve görev bağlamıyla donatılır.
2. Lead ajan `tool-call` event'i gönderir → `EventChannel` bunu main sürece iletir.
3. Main süreç aracı onay mekanizmasından geçirir, çalıştırır, sonucu `tool-result` olarak geri gönderir.
4. Ajan sonucu değerlendirir; gerektiğinde yeni araç çağrısı yapar (döngü).
5. Maksimum adım sınırı (`max_tool_steps`, varsayılan 25) aşıldığında veya ajan `done` sinyalinde bulunduğunda döngü biter; lead ajan özet mesajını stream eder.

**Uygulama bileşenleri:** `AgentLoop` sınıfı (`src/main/agents/loop.js`) durumu taşır; `ToolExecutor` (`src/main/tools/executor.js`) çalıştırmayı ve log'ları yönetir; renderer `thinking` olaylarını "Ajan şu anda `read_file` çalıştırıyor…" biçiminde gösterir. Döngü her adımda checkpoint'e yazar; pencere kapatılsa bile devam eden iş "arka planda çalışan ajan" panelinde izlenebilir.

## 5.5 F2.5 — Ajan Şablonları ve Sistem Prompt Yönetimi

Mevcut 8 ajan şablonu + 2 takım preseti, yeni bir şablon editörüne taşınır. Her şablon: ad, sistem prompt (template değişkenleri destekli: `{{workspace_root}}`, `{{os}}`, `{{date}}`), araç kümesi, model tercihi (örn. "yerel mümkünse Ollama, değilse fallback"), maksimum adım ve sıcaklık. Şablon topluluğu `src/shared/agent-templates/` dizininde JSON olarak saklanır; kullanıcı şablonları `userData/agent-templates/` içinde override eder. Türkçe varsayılan şablonlar korunur; İngilizce şablon paketi opsiyonel olarak eklenir.

## 5.6 F2.6 — Görev Akışı (Workflow) Desteği

Basit workflow tanımı: kullanıcı "adım" dizisini JSON/YAML ile tanımlar; her adım bir ajan çağrısıdır ve önceki adımın çıktısını `{{step_n.output}}` değişkeniyle alabilir:

```yaml
steps:
  - agent: analyst
    input: "{{user_message}}"
  - agent: writer
    input: "Analiz: {{step_1.output}}. Buna göre raporu yaz."
  - agent: reviewer
    input: "Rapor: {{step_2.output}}. Hataları listele."
```

Renderer'da basit bir workflow editörü (adım kartları, sürükle-sıralama) eklenir. Workflow'lar `userData/workflows/` altında saklanır ve sohbetlerden `//RUN:workflow_name` ile çağrılabilir — mevcut `//CALL:` sentaksinin doğal genişlemesi.

## 5.7 Faz 2 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | Lead ajan `read_file` + `terminal_execute` döngüsü | Tool sonucu sohbete entegre, onay modalı çalışır |
| 2 | MCP filesystem sunucusu entegrasyonu | `mcp_ls` aracı görünür, sandbox ihlali yok |
| 3 | 25 adım sınır testi | Döngü kesilir, kullanıcı bilgilendirilir |
| 4 | Workflow 3 adımlı koşu | Adım çıktıları zincirleme iletilir |
| 5 | Dört provider'da tool-call stream | `tool-call`/`tool-result` görsel olarak düzgün render |
| 6 | Ajan çökme/recovery | Checkpoint'ten döngü yeniden başlatılabilir |
# Bölüm 6 — Faz 3: Bellek ve İşbirliği (v3.2)

**Zaman aralığı:** Hafta 15–22 · **Temel vaat:** Uygulama geçmiş konuşmaları "hatırlar"; ajanlar önceki bağlamı yeniden keşfetmek zorunda kalmaz.

## 6.1 F3.1 — Semantic Memory (Anlamsal Bellek)

**Mimari (ADR-004 uygulaması):** Embedded SQLite + vektör indeksi (`sqlite-vss` veya pure-JS HNSW). Her sohbet mesajı ve kullanıcı tarafından işaretlenen bilgi parçacığı embedding ile indekslenir:

```
userData/
└── Krevyx/
    └── memory/
        ├── memory.db        (SQLite: messages, memories, sources tabloları)
        └── index/           (vektör index dosyası)
```

**Embedding üretimi:** Birincil yol yereldir — Ollama'dan `nomic-embed-text` veya `mxbai-embed-large` gibi bir model. Fallback: OpenAI `text-embedding-3-small`. Embedding çağrısı main süreçte arka planda kuyruğa alınır (chat akışını bloklamaz); toplu indexing (batch 32) ile yapılır.

**Kullanım senaryoları:** (1) `search_memory` aracı: ajan bellekte ilgili pasajları sorgular. (2) Sohbet başlarken otomatik bağlam enjeksiyonu: son N ilgili bellek özet olarak sistem prompt'una eklenir. (3) "Bu projeyi hatırla" düğmesi: kullanıcı bir sohbeti veya dosyayı kalıcı bilgiye dönüştürür.

**Gizlilik:** Embedding tamamen lokalde kalır (Ollama kullanıldığında); bulut embedding isteğe bağlıdır ve şeffaf biçimde gösterilir. Bellek içeriği `read-file` sandbox'ının dışına hiçbir zaman gönderilmez.

## 6.2 F3.2 — Bilgi Kartları ve Kullanıcı Onaylı Öğrenme

Ajanların otomatik öğrendiklerini bir "bilgi kartı" adayı olarak işaretlemesi (`memory-candidate` olayı), renderer'da kart olarak gösterilir; kullanıcı **kabul/reddet/düzenle** ile kalıcı hafızaya geçirir. Bu, ajanın yanlış bilgi depolamasını önler ve kullanıcıya kontrol verir. Bilgi kartları kategori (proje, tercih, kişi, teknik not) ve kaynak (hangi sohbet) ile etiketlenir.

## 6.3 F3.3 — Çalışma Alanı Bilgi Tabanı (Knowledge Base)

Workspace kökündeki dokümanlar (Markdown, README, kod özetleri) otomatik taranıp indekslenir. `scan-project` IPC'si (mevcut) bu iş için genişletilir: sadece dosya listesi yerine içerik özetleri ve embedding'leri üretir. Değişiklik izleyici (watcher) yalnızca `workspace` köklerinde aktif olur (main-security'de register edilmiş klasörler); sistem klasörlerini izlemez.

## 6.4 F3.4 — Sohbet Özetleme ve Bağlam Kompaksiyonu

Uzun sohbetlerde context window dolduğunda, `compact-context` IPC'si devreye girer: geçmiş mesajların ilk %60'ı bir özet model çağrısı (yerel küçük model tercihli: Ollama'dan 7B sınıfı) ile özetlenir, ayrıntılar bellek deposuna yazılır, pencereye yalnızca özet + son N mesaj kalır. Kullanıcıya "sohbet sıkıştırılıyor, ayrıntılar belleğe kaydedildi" bildirimi gösterilir. Bu mekanizma 128k+ context'li modellerde de maliyet kontrolü için değerlidir.

## 6.5 F3.5 — Ajan Profili İşbirliği ve Dışa Aktarım

Ajan tanımları ve takım presetleri artık paylaşılabilir biçime sahiptir: `agent-pack.json` (ajanlar + şablonlar + workflow'lar). Dışa aktarım: dosyaya kaydet (save dialog), içe aktarım: sürükle-bırak veya dosya seçici; içe aktarılan preset'in araç erişimleri kullanıcıya gösterilir ve onaylanır (F2.1 onay mekanizmasının genişletimi). Topluluk preset paylaşımı için GitHub Gist entegrasyonu (opsiyonel): preset'i gist'e yükle, link ile paylaş.

## 6.6 F3.6 — İstatistik ve Kullanım Görünürlüğü

`get-stats` IPC'sine (mevcut) bellek deposu boyutu, embedding sırası uzunluğu, toplam ajan adım sayısı, sağlayıcı başına token tahmini eklenir. Ayarlar paneline "Bellek" sekmesi: indekslenen öğe sayısı, kategori dağılımı grafiği (basit CSS bar chart), belleği temizle/bakım işlemleri.

## 6.7 Faz 3 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | 500 mesajlık geçmişte `search_memory` | İlgili pasajlar <500ms |
| 2 | Yerel + bulut embedding fallback | Ollama kapalıyken OpenAI fallback çalışır |
| 3 | Bilgi kartı kabul/red döngüsü | Kalıcı hafızaya doğru kayıt |
| 4 | Context compaction | Özet doğruluğu korunur, ayrıntılar bellekte |
| 5 | Workspace watcher | Yalnızca kayıtlı kökleri izler, CPU < %2 |
| 6 | Agent-pack import güvenlik onayı | Araç erişimleri onay öncesi görünür |
# Bölüm 7 — Faz 4: Çok Modlu Yetenekler (v3.3)

**Zaman aralığı:** Hafta 23–30 · **Temel vaat:** Krevyx metin dışına çıkar: görüntü anlama, görsel üretim, ses.

## 7.1 F4.1 — Görsel Giriş (Vision)

**Mimari:** Mesaj girişine medya eki düğmesi eklenir; seçilen görseller main süreçte base64'e çevrilip boyutlandırılır (max 2048px, max 5 görsel/mesaj). Provider adaptörleri: OpenAI (`image_url` content part), Anthropic (`image` content block, base64), Gemini (inline_data), Ollama (vision destekli modellerde `images` dizisi — model catalog'ta `supports_vision` alanı eklenir).

**Model katalog genişletmesi:** `model-catalog.json`'a `capabilities: { vision, function_calling, reasoning }` alanları eklenir. Provider API'den gelen modeller `supports_vision` bayrağı ile işaretlenir; vision destekli olmayan model seçildiğinde görsel eki otomatik olarak devre dışı bırakılır (yumuşak degradation).

**Kullanım senaryoları:** Ekran görüntüsü + "bu UI'daki sorunu açıkla", belge fotoğrafı + "özetle", grafik + "yorumla". Vision sonuçları mevcut mesaj akışına aynı markdown render ile düşer.

## 7.2 F4.2 — Görsel Üretim Entegrasyonu

Üretim (generation) farklı bir akıştır: model bir araç çağrısı olarak `generate_image` ister, main süreç provider'a görsel üretme isteği yapar (OpenAI: DALL-E; Google: Gemini/Imagen; Anthropic: yok, bu kategori pas geçilir), dönen görsel main süreçte `userData/generated/` altına kaydedilir ve renderer'da önizleme + indir düğmesiyle gösterilir. Rate limit ve maliyet uyarısı: üretim isteği başına onay modalı (yüksek maliyetli işlem sınıfı).

## 7.3 F4.3 — Ses: TTS ve STT

**STT (konuşmadan metin):** Whisper tabanlı (OpenAI `whisper-1` veya lokal Ollama destekli ASR). Mikrofon kaydı renderer'da `MediaRecorder` ile; kayıt main sürece chunk olarak iletilir, transkript mesaj kutusuna otomatik yerleşir. **TTS (metinden konuşma):** Cevap tamamlanınca isteğe bağlı okuma; provider'dan stream edilen ses (`mp3` chunks) renderer'da sıralı oynatılır. Ses ayarları: otomatik okuma açık/kapalı, ses hızı, tercih edilen TTS modeli.

## 7.4 F4.4 — Medya Varlık Yönetimi

Eklenen ve üretilen tüm görseller/sesler `media` deposunda indekslenir (F3.1 bellek mimarisinin medya uzantısı). Sohbet mesajlarındaki medya referansları `media://id` URI'siyle çözülür; dosya taşınsa bile referans kırılmaz.

## 7.5 Faz 4 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | 4 provider'da vision mesajı | Görsel doğru akışta render, desteklenmeyen modelde soft-disable |
| 2 | `generate_image` aracı | Üretim onayı, sonuç önizleme ve indirme |
| 3 | STT transkripti | 10 sn ses <3 sn transkript (bulut), lokal fallback |
| 4 | TTS sıralı oynatma | Buffering kesintisi yok |
| 5 | Medya URI çözünürlüğü | Taşınan workspace'te referanslar çalışır |

---

# Bölüm 8 — Faz 5: Dağıtım, Entegrasyon ve Eklenti (v3.4)

**Zaman aralığı:** Hafta 31–38 · **Temel vaat:** Üçüncü parti genişletilebilirlik ve profesyonel dağıtım zinciri.

## 8.1 F5.1 — Eklenti Mimarisi (ADR-003 uygulaması)

**Paket biçimi:** Eklenti bir klasördür; `manifest.json` + `index.js` + opsiyonel assets:

```json
{
  "manifestVersion": 1,
  "id": "com.yasin.notifier",
  "name": "Bildirimler",
  "version": "1.0.0",
  "description": "Uzun ajan işleri bittiğinde sistem bildirimi",
  "permissions": ["notifications", "ipc:3:agent-loop-status"],
  "main": "index.js",
  "configSchema": { ... }
}
```

**Sandbox:** Eklentiler ayrı bir `vm.Context` (Node `vm` modülü) içinde çalışır; yalnızca `permissions` listesindeki IPC'leri çağırabilir. `child_process`, `fs` raw erişimi, `net` yasaktır. Manifest'in `permissions` alanı kurulumda kullanıcıya gösterilir ve onaylanır. Eklenti çökmesi (exception/timeout 500ms) ana uygulamayı etkilemez; crash loop koruması eklentiyi devre dışı bırakır.

**API yüzeyi:** `pluginApi.registerCommand(name, handler)`, `pluginApi.onAgentEvent(filter, callback)`, `pluginApi.invokeIPC(ipcName, payload)` (izinli liste üzerinden), `pluginApi.addSettingsPanel(title, html)`.

## 8.2 F5.2 — Tema ve UI Genişletilebilirlik

Tema motoru CSS değişkenleri üzerine kurulur (`styles.css` mevcut değişken yapısı genişletilir). Kullanıcı temaları `userData/themes/` klasörüne JSON + CSS olarak eklenir. Eklentiler `addSettingsPanel` ile ayarlar sekmesine panel ekleyebilir. Ajan şablonları da bir "içerik paketi" olarak eklenti biçiminde paylaşılır.

## 8.3 F5.3 — Eklenti Mağazası (Topluluk)

GitHub Gist/Discussion tabanlı minimalist bir " eklenti dizini" protokolü: plugin dizini bir JSON dosyasıdır (`index.json`), eklentiler oradan keşfedilir ve GitHub releases'tan indirilir. Uygulama içi "Eklenti Mağazası" paneli dizini listeler; indirme HTTPS üzerinden yapılır, manifest hash doğrulaması uygulanır. İmzalı eklentiler (F5.4'te kod imzalama) "doğrulanmış" rozeti alır.

## 8.4 F5.4 — Profesyonel Dağıtım Zinciri

**Kod imzalama:** Windows `signtool` (OV/EV sertifika) veya Apple Developer ID (notarization). Sertifika yoksa en azından Windows SmartScreen'u aşmak için GitHub Actions üzerinde `certutil` ile Microsoft Store yayınına hazır format. **Mac notarization:** `electron-notarize` ile CI'da otomatik notarize. **AppImage:** `linuxdeploy-plugin-appimage` ile güncellenebilir (AppImageUpdate) hedef. **Windows installer:** NSIS ile başlangıç kısayolu ve otomatik güncelleme servisi kayıt. **Release otomasyonu:** GitHub Actions workflow'u (`release.yml`): tag push'ta üç platformda build → artifact → draft release → publish. Bu dosya `workflow` scope'u gerektirdiği için GitHub arayüzünden (veya workflow yetkili token ile) eklenir; lokalde hazır `.github/workflows/ci.yml` + `release.yml` taslakları `docs/WORKFLOW_TASLAKLARI/` altında belgelenir.

## 8.5 F5.5 — IDE ve Dış Entegrasyonlar

**URI handler:** `Krevyx://chat?agent=lead&workspace=/path` URI şeması kaydedilir; tarayıcıdan veya terminal'den `open Krevyx://...` ile Krevyx açılıp bağlam taşınır. **CLI köprüsü:** `Krevyx send "mesaj"` komutu (basit bir Node CLI, `userData` pipe socket'i üzerinden ana pencereye IPC gönderir). **VS Code uzantısı (opsiyonel):** Seçili kodu Krevyx'e gönderen hafif uzantı (URI handler ile entegre, sıfır backend).

## 8.6 Faz 5 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | 3 eklenti paralel yük (bildirim, tema, komut) | Sandbox ihlali yok, ana akış etkilenmez |
| 2 | Kötü niyetli eklenti (fs erişim denemesi) | İzin dışı IPC reddedilir, eklenti crash-loop'a düşer |
| 3 | Üç platformda imzalı/imzasız build | macOS notarize OK, Windows SmartScreen minimum seviye |
| 4 | URI handler ile sohbet açma | Doğru ajan + workspace ile pencere açılır |
| 5 | Eklenti mağazası dizini | İndirme + hash doğrulama çalışır |
# Bölüm 9 — Faz 6: Kurumsal Katman (v4.0)

**Zaman aralığı:** Hafta 39–52 · **Hedef:** Küçük ekiplerin Krevyx'i güvenli biçimde benimseyebilmesi.

## 9.1 F6.1 — Ekip Profili ve Politika Yönetimi

Tek kullanıcılı yapı korunur; ancak **çoklu profil** eklenir: `userData/profiles/` altında her profil kendi config'i, ajanları, belleği ve temalarıyla yaşar. Politika dosyası (`policy.json`, opsiyonel olarak salt okunur): izin verilen Ollama host'ları, yasaklı provider'lar, maksimum araç erişimi, bellek depolama zorunluluğu (Açık/Kapalı), eklenti yüklemeye izin (Açık/Kapalı). IT yöneticisi `policy.json`'ı MDM/registry üzerinden dağıtabilir.

## 9.2 F6.2 — Denetim Kaydı (Audit Log)

F2.4'teki `ToolExecutor` log altyapısı genişletilir: her araç çağrısı, onay kararı, API çağrısı ve config değişikliği yapılandırılabilir log dosyasına yazılır. Log formatı JSON-lines: `{ts, actor, action, tool, approved, decision_source, duration_ms, hash}`. Log bütünlüğü için her satır önceki satırın hash'ini içerir (hash zinciri); kullanıcı logu "Değişiklik geçmişi" panelinden filtreler. Bu, mevcut kök dizindeki `AUDIT_TRAIL.md` dosyasının doğal evrimidir.

## 9.3 F6.3 — SSO ve Kimlik Entegrasyonu (Hazırlık)

v4.0 tam SSO implementasyonu yerine **hazırlık katmanı** ekler: `auth-provider.json` ile harici kimlik doğrulama vekili; kurumsal Ollama cluster'larında kullanılan OAuth2 bearer token'lar provider ayarlarında saklanır. Uygulama açılışunda token süresi dolmuşsa yenileme akışı başlar. Gerçek SSO (SAML/OIDC) v4.x serisinde değerlendirilir.

## 9.4 F6.4 — Ollama Fleet Yönetimi

Çok makinelik Ollama kurulumları için: profil başına host listesi (mevcut) + **sağlık panosu** (her host: durum, model kataloğu, GPU durumu, pull kuyruğu). Model dağıtımı: bir host'tan diğerine model aktarma yönergeleri. Proxy desteği: `http_proxy` env uyumlu Ollama istekleri.

## 9.5 F6.5 — Lisanslama ve Ticarileştirme Altyapısı

Açık kaynak çekirdek + kurumsal eklenti modeli: çekirdek (mevcut tüm özellikler) mevcut lisansla kalır; kurumsal modüller (politika yönetimi, merkezi log toplama, SSO) ayrı eklenti paketi olarak tasarlanır. Lisans anahtarı yönetimi `userData/license/` altında; çevrimdışı aktivasyon kodu desteklenir (kurumsal ağlar internete kapalı olabilir).

## 9.6 Faz 6 Kabul Testleri

| # | Test | Beklenen Sonuç |
|---|---|---|
| 1 | Politika dosyası ile provider kısıtlama | Kısıtlı provider UI'da görünmez, IPC reddedilir |
| 2 | 10.000 log satırlı denetim kaydı | Hash zinciri doğrulaması <2s |
| 3 | İki profil arası geçiş | 0 veri sızıntısı, bağımsız bellek depoları |
| 4 | Ollama fleet 5 host panosu | Health <5s, model senkronizasyonu |

---

# Bölüm 10 — Güvenlik ve Uyumluluk Master Planı

Güvenlik, bu yol haritasının her fazında birinci sınıf vatandaş olarak ele alınır. Aşağıdaki ilkeler tüm fazlar için geçerlidir ve her yeni IPC/araç/eklenti bu matrise göre incelenir.

## 10.1 Değişmez Güvenlik Kuralları (Invariants)

| # | Kural | Kaynak | Uygulama |
|---|---|---|---|
| I1 | Context isolation + preload beyaz listesi | v2.5 mirası | Her yeni IPC `ipcMain.handle` üzerinden, renderer asla doğrudan Node API'sine erişmez |
| I2 | SSRF koruması | `main-security.js` | Tüm dış istek URL'leri `normalizeOllamaHost`/benzeri guard'dan geçer; metadata IP aralıkları engelli |
| I3 | Path sandbox | `resolveReadablePath` | Dosya erişimi yalnızca home + krevyx-Projects + kullanıcı seçili + workspace kökleri |
| I4 | Shell:false child process | `git-clone` mirası | Tüm spawn çağrıları argüman dizisi ile; asla komut string'i değil |
| I5 | Maksimum boyut sınırları | 15MB session, 2MB preview | Yeni akışlar için (medya 2048px, embedding batch 32) benzer tavanlar tanımlanır |
| I6 | CSP: base-uri/object-src/frame-ancestors none | v2.5 | Değişmeden kalır; eklenti panelleri aynı CSP içinde render edilir |
| I7 | Tool write-tier kullanıcı onayı | F2.1 | Write işlemleri onaysız asla gerçekleşmez |
| I8 | Dependency güvenliği | `npm audit` 0 açık | CI'da her PR'da `npm audit` çalışır; ≥high açık merge'i bloklar |

## 10.2 Bağımlılık ve Süreç Güvenliği

Jest 29 pin durumu (Jest 30.4.2 modül çözünürlük bug'u) aylık olarak yeniden değerlendirilir; düzeltme yayılınca `^30`'a geçilir. Electron ana sürüm yükseltmeleri 6 aylık pencerede (her LTS cycle'da bir kez) değerlendirilir. Native modül (`node-pty`) electron-rebuild ile her Electron yükseltmesinde yeniden derlenir; CI'da üç platform matrix'i bu derlemeyi doğrular.

## 10.3 Gizlilik ve Uyumluluk

Veri akış haritası dokümante edilir: hangi veri hangi sağlayıcıya gider, lokalde ne saklanır. Kullanıcı "sıfırla" işleminde (`userData/Krevyx/` silme) tüm bellek, config ve logların silindiği garanti edilir (test: dosya listesi boş olmalı). Kurumsal kullanımda log toplama hedefleri kullanıcı tanımlıdır (Krevyx merkezi hiçbir veri toplamaz). GDPR benzeri talepler (veri dışa aktarımı) `export-data` komutu ile karşılanır: tüm config + bellek + loglar `.zip` olarak dışa aktarılır.

## 10.4 Güvenlik Test Sürekliliği

Mevcut 13 güvenlik testi, her fazın kabul testlerine güvenlik senaryolarıyla genişletilir: I2 için SSRF vektör testleri (yeni web_fetch aracı için), I3 için path traversal fuzz testi, I4 için shell injection vektörleri (araç argümanlarında), I7 için onay bypass denemeleri. Üçüncü taraf güvenlik değerlendirmesi v3.4 öncesinde hedeflenir (topluluk contributor'lardan hakemli inceleme).
# Bölüm 11 — Test ve Kalite Güvencesi Master Planı

## 11.1 Test Piramidi

Krevyx'in test stratejisi dört katmana ayrılır. **Birim testleri** (Jest): pure fonksiyonlar — `main-security.js` fonksiyonları, `delegate-parse.js`, config migration fonksiyonları, araç şema validasyonu, EventChannel adapter map'leri. Hedef: çekirdek saf fonksiyonlarda %90 satır kapsaması. **IPC entegrasyon testleri**: electron'un gerçek `ipcMain`/`ipcRenderer` çiftiyle (spectron benzeri hafif bir mock katmanı veya `electron` binary ile `--enable-logging`) ana süreç akışları doğrulanır; özellikle streaming pipeline'ı ve tool execution döngüsü. **UI davranış testleri**: Playwright ile Electron penceresi başlatılır; sohbet gönderimi, onay modalı, sekme yönetimi, ayarlar kalıcılığı e2e doğrulanır. **Performans testleri**: 10k mesaj render, 1000 öğe bellek arama, 5 host fleet taraması — her biri süre bütçesiyle (bkz. Faz 1 ve 3 kabul testleri).

## 11.2 CI/CD Kalite Kapısı

GitHub Actions pipeline'ı (`ci.yml`, lokalde hazır) dört job içerir: `lint` (ESLint v9), `unit` (Jest + coverage raporu), `e2e` (xvfb ile Playwright, yalnızca ubuntu), `audit` (`npm audit` ≥high bloklama). PR'lar bu dört job geçmeden merge edilemez (branch protection). Her sürüm adayında üç platformda (`windows-latest`, `macos-latest`, `ubuntu-latest`) build job'ı çalışır. Codecov benzeri bir coverage servisi yerine GitHub Action artifact'lerinde coverage raporu saklanır (maliyet optimizasyonu).

## 11.3 Sürüm Öncesi Kontrol Listesi

Her sürüm için: (1) tüm kabul testleri yeşil, (2) config migration testi bir önceki sürümden, (3) üç platformda smoke test (uygulama açılır, sohbet gönderilir, çıkılır), (4) `npm audit` 0 açık, (5) CHANGELOG bölümü yazılır, (6) GitHub Release draft'i oluşturulur, (7) Türkçe + İngilizce UI walkthrough videosu (opsiyonel topluluk için).

---

# Bölüm 12 — Sürüm Yönetimi ve Çıkarım Stratejisi

## 12.1 Sürüm Takvimi

| Sürüm | Hedef Tarih | Kararlılık | Açıklama |
|---|---|---|---|
| v3.0.0 | 2026-09 sonu | Beta → RC → Stable | Çekirdek sağlamlaştırma |
| v3.1.0 | 2026-11 ortası | Stable | Ajan orkestrasyonu + MCP |
| v3.2.0 | 2027-01 başı | Stable | Bellek + işbirliği |
| v3.3.0 | 2027-02 sonu | Stable | Çok modluluk |
| v3.4.0 | 2027-04 ortası | Stable | Eklenti + dağıtım |
| v4.0.0 | 2027-06 | Enterprise preview | Kurumsal katman |

Patch sürümler (v3.0.1, ...) yalnızca hata düzeltmeleri içerir; minor sürümler geriye uyumlu özellik ekler; major sürümler config migration gerektirebilir (her zaman migration fonksiyonu ile).

## 12.2 Feature Flag Stratejisi

Büyük özellikler flag ile açılır: `config.json` içinde `features: { mcp: true, memory: false }`. Bu, kademeli rollout ve topluluk beta'sını destekler. Flag'ler v3.4'te ayarlar panelinde "Deneysel" sekmesi altında görselleştirilir.

## 12.3 Dokümantasyon Sürümü

Her faz kendi dokümanını getirir: `docs/ARCHITECTURE.md` (Faz 1'de yazılır — modül haritası), `docs/AGENT-DEV.md` (Faz 2 — ajan şablon geliştirme), `docs/MEMORY.md` (Faz 3), `docs/PLUGIN-DEV.md` (Faz 5), `docs/ENTERPRISE.md` (Faz 6). README'nin üst bölümü sürüm rozetleri (CI, audit, downloads) ve faz haritası linki ile güncellenir.

---

# Bölüm 13 — Ekip, Zamanlama ve Kaynak Planı

## 13.1 Ekip Modeli

Proje tek geliştirici (yasinkaya701) ile yürüyor; bu plan bu modele göre tasarlanmıştır. Haftalık efor varsayımı: **15–20 saat/hafta**. Faz 5 ve 6'da topluluk katkısı hedeflenir (CONTRIBUTING.md mevcut, hakemli inceleme süreci ile). Efor dağılımı: geliştirme %60, test %25, dokümantasyon %15.

## 13.2 Zamanlama Varsayımları

| Faz | Hafta | Kritik bağımlılık |
|---|---|---|
| F1 (Çekirdek) | 1–6 | — |
| F2 (Ajan) | 7–14 | F1 modülerlik (agents modülü F1'de ayrılır) |
| F3 (Bellek) | 15–22 | F2 EventChannel (memory aracı aynı kanalı kullanır) |
| F4 (Multimodal) | 23–30 | F2 adapter katmanı (vision content part'ları aynı adaptörlere eklenir) |
| F5 (Eklenti) | 31–38 | F1 IPC sürümleme (ipc:3: namespace) |
| F6 (Kurumsal) | 39–52 | F2 ToolExecutor log altyapısı |

Kritik yol: F1 → F2 → F3 → F4 paralel olarak F5; F6 F2 log altyapısına bağımlı. F4 ve F5 kısmen paralelleştirilebilir (farklı dosya alanları).

## 13.3 Donanım Gereksinimleri (Geliştirme)

Bellek ve embedding geliştirme testleri için 16GB+ RAM ve Ollama kurulu bir makine; CI'da Ollama gerektiren testler mock adapter ile ayrılır (gerçek Ollama bağlantısı isteğe bağlı integration suite olarak çalışır).

---

# Bölüm 14 — Risk Analizi ve Azaltma Stratejileri

| # | Risk | Olasılık | Etki | Azaltma |
|---|---|---|---|---|
| R1 | Provider API'lerinde kırıcı değişiklik (örn. OpenAI streaming formatı) | Orta | Yüksek | Adapter katmanı (F2.2) izolasyonu; provider değişikliklerinde yalnızca adapter güncellenir |
| R2 | Electron native modül uyumsuzluğu (`node-pty`, electron-updater) | Orta | Orta | CI üç-platform matrix; native modül opsiyonel (pty yoksa degrade) |
| R3 | Jest 30 ailesi bug'larının devamı | Düşük | Düşük | Pinli Jest 29; aylık değerlendirme |
| R4 | Tek geliştirici dar boğazı | Yüksek | Yüksek | Faz bazlı öncelik; topluluk beta programı (v3.1'de) |
| R5 | Çok modlu akışlarda UI performans düşüşü | Orta | Orta | Virtualization (F1.6) + medya thumbnail lazy-load |
| R6 | Bellek indeksinin disk şişmesi | Orta | Düşük | İndeks boyut kota'sı (1GB), eski mesajların arşivlenmesi |
| R7 | Eklenti ekosisteminde kötü niyetli paket | Düşük | Yüksek | Sandbox + permission model + hash doğrulama + topluluk bildirimi |
| R8 | Sektördeki hızlı model değişimi (roadmap'te anılan modellerin eskimesi) | Yüksek | Düşük | Model katalogu API'den canlı çekilir; katalog yalnızca fallback'tir |

## 14.1 Geri Dönüş Stratejisi

Her faz sonunda kararlı bir release tag'i (`v3.0.0`, `v3.1.0`…) konur. Herhangi bir fazda ciddi teknik engel çıkarsa, bir önceki kararlı sürüm production olarak kullanılabilir; geliştirme o fazda dondurulur ve alternatif tasarım değerlendirilir. Config migration'ları tek yönlü değil, **geri dönüştürülebilir** yazılır (`migrateBack` fonksiyonları) — bu, geri dönüş stratejisinin temelidir.

---

# Bölüm 15 — Sonuç ve Sonraki Adımlar

## 15.1 Özet

Bu plan, Krevyx Ultra'yı v2.7.0'dan alıp altı fazda v4.0 kurumsal olgunluğa taşıyan, mevcut mimarideki güvenlik temellerini koruyan, vanilla JS sadeliğine sadık kalan ve tek geliştirici modeline uygun eforla yürütülebilecek bir yol haritasıdır. En kritik sıralama mantığı şudur: **önce altyapı (F1), sonra ajan beyni (F2), sonra hafıza (F3), sonra duyular (F4), sonra ekosistem (F5), en son ölçek (F6)** — her faz bir öncekinin üzerine inşa edilir ve bağımlılık zinciri minimum tutulmuştur.

## 15.2 Hemen Sonraki Adımlar (İlk 2 Hafta)

1. `docs/ARCHITECTURE.md` yazımı (mevcut IPC envanteri + yeni modül haritası) — hafta 1.
2. `src/renderer/modules/` bölünmesi başlangıcı (chat modülünden başlayarak) — hafta 1–2.
3. Config şema v3 tasarımı + migration fonksiyonunun prototipi — hafta 2.
4. GitHub repo'da branch protection + CI workflow'un etkinleştirilmesi (workflow scope'lu token ile).

## 15.3 Toplum Katkısı Daveti

Repo herkese açık olduğundan (private'tan public'e geçiş kararı kullanıcıya ait), bu plan `docs/ROADMAP.md` olarak yayınlanabilir; issue şablonuna "roadmap önerisi" etiketi eklenebilir. Topluluk, özellikle eklenti geliştirme (F5) ve ajan şablonu katkıları (F2.5) alanlarında değer katacaktır.

---

*Bu doküman Krevyx v2.7.0 kod tabanı incelenerek 15 Ağustos 2026 tarihinde Manus AI tarafından hazırlanmıştır. Tüm fazlar mevcut kodun mimarisine (33 IPC uç noktası, main-security katmanı, delegate-parse delegasyonu, provider streaming adapter'ları) birebir referans verilerek tasarlanmıştır.*
# EK — Uygulama Detayları ve Referans Kod Örnekleri

Bu ek bölüm, yol haritasındaki her faz için anahtar bileşenlerin **gerçekten kullanılabilir referans implementasyonlarını** içerir. Kodlar Electron 43.4.0 + Node 22 uyumlu yazılmıştır ve mevcut kod tabanındaki sözleşmeleri (DOMPurify, esc(), q()/qa(), IPC isimlendirme) takip eder.

---

## EK-A — Renderer Modül Yapısı: Tam Örnek (Faz 1)

### EK-A.1 `src/renderer/lib/event-bus.js`

```js
// Modüller arası hafif olay kanalı. Her modül bus'a abone olur,
// diğer modülleri doğrudan import etmez.
class EventBus {
  constructor() {
    this.listeners = new Map();
  }
  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    const fns = this.listeners.get(event);
    if (fns) this.listeners.set(event, fns.filter((f) => f !== fn));
  }
  emit(event, payload) {
    const fns = this.listeners.get(event) || [];
    for (const fn of fns) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[event-bus] ${event} handler hatası:`, err);
      }
    }
  }
}
const bus = new EventBus();

// Standart olaylar (sözleşme):
// chat:message-sent   { text, agentId, attachments }
// chat:token          { sessionId, delta }
// chat:done           { sessionId }
// agents:delegate     { fromAgent, toAgent, text }
// tools:request-approval { tool, args, decisionFn }
// settings:changed    { key, value }
export { bus };
```

### EK-A.2 `src/renderer/modules/chat/render.js` — Virtualization + Markdown Cache

```js
// Virtualization: sadece görünür pencere + 500px tampon DOM'da kalır.
// markdownCache: aynı içerik için purify+highlight çıktısı 1000 giriş LRU.

const MARKDOWN_CACHE_MAX = 1000;
const markdownCache = new Map();

function lruTouch(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  else if (cache.size >= MARKDOWN_CACHE_MAX) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, value);
}

function renderMarkdown(text) {
  if (markdownCache.has(text)) return markdownCache.get(text);
  const html = marked.parse(text); // marked global, mevcut bağımlılık
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['h1','h2','h3','p','a','ul','ol','li','blockquote',
                   'pre','code','table','thead','tbody','tr','th','td',
                   'strong','em','del','hr','br','img','span','div'],
    ALLOWED_ATTR: ['href','src','alt','class','title','onclick-copy'],
  });
  lruTouch(markdownCache, text, clean);
  return clean;
}

const ROW_HEIGHT_EST = 60; // px, mesaj satırı ortalama
const BUFFER_PX = 500;

function renderChatWindow(session, scrollTop, viewportHeight) {
  const container = q('#chat-list');
  const { messages } = session;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT_EST) - 5);
  const endIdx = Math.min(
    messages.length,
    Math.ceil((scrollTop + viewportHeight + BUFFER_PX) / ROW_HEIGHT_EST) + 5
  );

  // Üst/kırpılmış alan için spacer
  const topSpacer = document.createElement('div');
  topSpacer.style.height = `${startIdx * ROW_HEIGHT_EST}px`;
  container.innerHTML = '';
  container.appendChild(topSpacer);

  for (let i = startIdx; i < endIdx; i += 1) {
    const msg = messages[i];
    const div = document.createElement('div');
    div.className = `msg ${msg.role}`;
    div.innerHTML = renderMarkdown(msg.content);
    container.appendChild(div);
  }
}
```

### EK-A.3 `src/renderer/app.js` — Yeni Bootstrap (150 satır altı hedef)

```js
import { bus } from './lib/event-bus.js';
import { initChat }    from './modules/chat/index.js';
import { initAgents }  from './modules/agents/index.js';
import { initTools }   from './modules/tools/index.js';
import { initProviders } from './modules/providers/index.js';
import { initSettings }  from './modules/settings/index.js';

const api = window.krevyxApi;
const modules = [initChat, initAgents, initTools, initProviders, initSettings];

for (const initFn of modules) {
  try {
    initFn(api, bus);
  } catch (err) {
    console.error('[app] modül başlatma hatası:', err);
  }
}

// Global kısayollar
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); q('#msg-input').focus(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') { bus.emit('tools:toggle'); }
});

console.log('[app] Krevyx Ultra başlatıldı, modül sayısı:', modules.length);
```

---

## EK-B — Config Migration Sistemi (Faz 1, F1.2)

### EK-B.1 `src/main/config/config-migrations.js`

```js
// Her sürüm için ileri ve geri migration fonksiyonu.
// Kullanımı: migrateConfig(rawJson, currentSchemaVersion)

const migrations = [
  {
    from: 2, to: 3,
    up(config) {
      // Eski chat-session.json tek dump'ını yeni yapıya dönüştür
      const { settings = {}, agents = [], workspaces = [], history = [] } = config;
      return {
        schemaVersion: 3,
        app: {
          theme: settings.theme || 'dark',
          language: settings.language || 'tr',
          ghostMode: Boolean(settings.ghostMode),
        },
        providers: {
          ollama: { hosts: settings.ollamaHosts || ['localhost:11434'], pollInterval: 30000 },
          openai: { apiKey: settings.openaiKey ? `ENV:${settings.openaiKey}` : '', modelFallback: ['gpt-5.5'] },
          anthropic: { apiKey: settings.anthropicKey ? `ENV:${settings.anthropicKey}` : '' },
          gemini: { apiKey: settings.geminiKey ? `ENV:${settings.geminiKey}` : '' },
        },
        agents,
        workspaces: workspaces.map((w) => (typeof w === 'string' ? { path: w, alias: w.split('/').pop() } : w)),
      };
    },
    down(config) {
      // v3 -> v2 geri dönüş (config-migration geri dönüştürülebilirliği)
      return {
        settings: {
          theme: config.app.theme,
          language: config.app.language,
          ghostMode: config.app.ghostMode,
        },
        agents: config.agents,
        workspaces: config.workspaces.map((w) => w.path),
        // history sessions/ dizinine taşınmıştı; geri dönüş için birleştirilir
        history: [],
      };
    },
  },
];

function migrateConfig(raw, targetSchemaVersion = 3) {
  let config = raw;
  let current = config.schemaVersion || 2;
  if (current === targetSchemaVersion) return config;

  while (current < targetSchemaVersion) {
    const m = migrations.find((x) => x.from === current && x.to === current + 1);
    if (!m) throw new Error(`Migration bulunamadı: v${current}`);
    config = m.up(config);
    current += 1;
  }
  config.schemaVersion = targetSchemaVersion;
  return config;
}

module.exports = { migrateConfig, migrations };
```

### EK-B.2 Atomic write yardımcı

```js
const fs = require('fs');
const path = require('path');
const os = require('os');

function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}`);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath); // atomik (aynı dosya sistemi)
}
```

---

## EK-C — EventChannel ve Tool-Use Döngüsü (Faz 2)

### EK-C.1 `src/main/agents/event-channel.js`

```js
// Ortak olay tipleri: token, thinking, tool-call, tool-result, error, done.
// Her provider adapter'ı kendi SSE JSON'ını bu set'e map'ler.

const { EventEmitter } = require('events');

class EventChannel extends EventEmitter {
  constructor(sessionId) {
    super();
    this.sessionId = sessionId;
  }
  // Adapter'lar bu metodu çağırır
  push(eventType, payload) {
    if (!['token','thinking','tool-call','tool-result','error','done'].includes(eventType)) {
      console.warn(`[EventChannel] bilinmeyen olay: ${eventType}`);
      return;
    }
    this.emit(eventType, { sessionId: this.sessionId, ...payload });
  }
}

// OpenAI adapter örneği
function openaiAdapter(channel) {
  return (chunk) => {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) return;
    if (delta.content) channel.push('token', { delta: delta.content });
    if (delta.reasoning_content) channel.push('thinking', { delta: delta.reasoning_content });
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        channel.push('tool-call', { id: tc.id, name: tc.function?.name, args: tc.function?.arguments });
      }
    }
    if (chunk.choices?.[0]?.finish_reason === 'stop') channel.push('done', { finish: 'stop' });
  };
}

// Gemini adapter örneği (functionCall akışı)
function geminiAdapter(channel) {
  return (chunk) => {
    const cand = chunk.candidates?.[0];
    if (cand?.content?.parts) {
      for (const part of cand.content.parts) {
        if (part.text) channel.push('token', { delta: part.text });
        if (part.functionCall) channel.push('tool-call', {
          id: part.functionCall.name, name: part.functionCall.name, args: part.functionCall.args,
        });
      }
    }
    if (cand?.finishReason === 'STOP') channel.push('done', { finish: 'stop' });
  };
}

module.exports = { EventChannel, openaiAdapter, geminiAdapter };
```

### EK-C.2 `src/main/agents/loop.js` — AgentLoop (araç döngüsü)

```js
const { EventChannel } = require('./event-channel');
const { executeTool, getToolManifest } = require('../tools/executor');

const MAX_TOOL_STEPS = 25;

class AgentLoop {
  constructor({ session, provider, model, messages, tools, win }) {
    this.session = session;
    this.channel = new EventChannel(session);
    this.messages = [...messages];
    this.tools = tools; // ajanın izinli araç isimleri
    this.win = win;
    this.steps = 0;
    this.aborted = false;
  }

  abort() { this.aborted = true; }

  async run() {
    let stepLimitHit = false;
    while (this.steps < MAX_TOOL_STEPS && !this.aborted) {
      this.steps += 1;
      const finished = await new Promise((resolve) => {
        let toolCall = null;
        const onDone = (d) => { this.channel.off('tool-call', onToolCall); finished = true; resolve(true); };
        const onToolCall = (tc) => { toolCall = tc; this.channel.off('done', onDone); resolve(false); };
        this.channel.on('done', onDone);
        this.channel.on('tool-call', onToolCall);
        this.startProviderStream(this.messages);
      });

      if (finished) break;
      if (!toolCall) break;

      // Onay mekanizması: write-tier araçlar kullanıcı onayı ister
      const manifest = getToolManifest(toolCall.name);
      if (!manifest) {
        this.channel.push('error', { msg: `Bilinmeyen araç: ${toolCall.name}` });
        break;
      }
      const approved = manifest.tier === 'write'
        ? await this.requestApproval(manifest, toolCall.args)
        : true;
      if (!approved) {
        this.messages.push({ role: 'tool', name: toolCall.name, content: '[Kullanıcı reddetti]' });
        continue;
      }

      // Araç çalıştırma + sonuç
      const result = await executeTool(manifest, toolCall.args, { session: this.session });
      this.messages.push({ role: 'tool', name: toolCall.name, content: result.content });
      this.channel.push('tool-result', { name: toolCall.name, content: result.content });

      // Checkpoint: her adımda state kaydedilir
      this.saveCheckpoint();
    }

    if (this.steps >= MAX_TOOL_STEPS) {
      this.channel.push('error', { msg: `Maksimum adım sınırına (${MAX_TOOL_STEPS}) ulaşıldı.` });
    }
    this.channel.push('done', { finish: this.aborted ? 'abort' : 'stop' });
  }

  async requestApproval(manifest, args) {
    return new Promise((resolve) => {
      const listener = (decision) => {
        this.win.webContents.removeListener('tool-approval-response', listener);
        resolve(decision.approved);
      };
      this.win.webContents.on('tool-approval-response', listener);
      this.win.webContents.send('tool-approval-request', {
        tool: manifest.display_name, args, sessionId: this.session,
      });
    });
  }

  startProviderStream(messages) {
    // provider adapter'ı channel.push çağrılarıyla çalışır
    // (OpenAI: fetch + stream reader; Gemini/Anthropic/Ollama benzer)
  }

  saveCheckpoint() {
    // userData/Krevyx/sessions/{session}/checkpoints/step-{n}.json
  }
}

module.exports = { AgentLoop, MAX_TOOL_STEPS };
```

### EK-C.3 `src/main/tools/registry.js` — Araç kataloğu ve güvenlik profili

```js
const { resolveReadablePath } = require('../main-security');

const READ_ONLY_TOOLS = ['read_file', 'list_dir', 'scan_project', 'search_memory', 'git_info'];
const WRITE_TOOLS = ['create_file', 'edit_file', 'append_file'];
const EXEC_TOOLS = ['terminal_execute', 'git_clone'];

const manifestById = new Map([
  ['read_file', {
    name: 'read_file', display_name: 'Dosya Oku', tier: 'read',
    description: 'Workspace içindeki bir dosyanın içeriğini okur (max 2MB)',
    sandbox: { roots: ['home', 'workspace', 'user_selected'] }, timeout_ms: 30000,
    input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  }],
  ['create_file', {
    name: 'create_file', display_name: 'Dosya Oluştur', tier: 'write',
    description: 'Workspace kökü altında yeni dosya oluşturur. Kullanıcı onayı gerekir.',
    sandbox: { roots: ['workspace'] }, timeout_ms: 60000,
    input_schema: { type: 'object', properties: {
      path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  }],
  ['terminal_execute', {
    name: 'terminal_execute', display_name: 'Terminal Komutu', tier: 'exec',
    description: 'Ayrıcalıklı PTY oturumunda komut çalıştırır. Tehlikeli komutlar engellenir.',
    sandbox: { roots: ['workspace'] }, timeout_ms: 300000,
    input_schema: { type: 'object', properties: { command: { type: 'string' }, args: { type: 'array', items: { type: 'string' } } }, required: ['command'] },
  }],
]);

function getToolManifest(name) {
  return manifestById.get(name) || null;
}

function validateToolArgs(manifest, args) {
  if (!manifest || !args) return false;
  for (const req of manifest.input_schema.required) {
    if (args[req] === undefined || args[req] === null) return false;
  }
  return true;
}

module.exports = { getToolManifest, validateToolArgs, READ_ONLY_TOOLS, WRITE_TOOLS, EXEC_TOOLS };
```

---

## EK-D — IPC Yüzeyi v3 Tam Kataloğu (Faz 1–2 referansı)

Aşağıdaki tablo, v3.0+ sistemin hedeflenen tam IPC yüzeyini listeler. **Kalın** olanlar yenidir; diğerleri v2.7'den korunur.

| IPC | Yön | Açıklama | Güvenlik sınıfı |
|---|---|---|---|
| get-model-catalog | renderer→main | Model kataloğu okuma | Read |
| ipc:3:get-model-catalog | renderer→main | v3 sürümlü | Read |
| chat, openai-chat, anthropic-chat, gemini-chat | renderer↔main | Streaming sohbet (mevcut) | Read |
| ipc:3:agent-loop-start | renderer→main | **Ajan döngüsü başlatır (tool-use dahil)** | Exec |
| ipc:3:agent-loop-abort | renderer→main | **Döngüyü durdurur** | Exec |
| ipc:3:agent-loop-status | renderer↔main | **Durum/ilerleme sorgusu** | Read |
| ipc:3:tool-approval-response | renderer→main | **Onay kararı** | Exec |
| ipc:3:mcp-list-servers, ipc:3:mcp-add-server, ipc:3:mcp-remove-server | renderer↔main | **MCP sunucu yönetimi** | Exec |
| persist-save, persist-load | renderer↔main | Config kalıcılığı (migration destekli) | Read/Write |
| ipc:3:config-get, ipc:3:config-set | renderer↔main | **Alan bazlı config** | Read/Write |
| get-models, pull-model | renderer↔main | Ollama model listesi/pull | Read |
| github-search, git-clone | renderer↔main | GitHub arama/clone (whitelist) | Exec |
| list-dir, read-file, open-folder-dialog | renderer↔main | Dosya erişimi (sandbox) | Read |
| ipc:3:create-file, ipc:3:edit-file | renderer↔main | **Write-tier araçlar (onay gerekli)** | Write |
| scan-project, write-project-doc | renderer↔main | Proje tarama/doküman yazma | Read/Write |
| terminal-create, terminal-input, terminal-resize, terminal-close | renderer↔main | PTY terminal | Exec |
| ipc:3:memory-search, ipc:3:memory-add, ipc:3:memory-candidates | renderer↔main | **Bellek işlemleri** | Read/Write |
| ipc:3:compact-context | renderer→main | **Bağlam sıkıştırma** | Read |
| ipc:3:media-add, ipc:3:media-generate, ipc:3:media-list | renderer↔main | **Medya giriş/üretim/liste** | Read/Write |
| ipc:3:plugin-list, ipc:3:plugin-install, ipc:3:plugin-uninstall | renderer↔main | **Eklenti yönetimi** | Exec |
| ipc:3:workflow-run | renderer→main | **Workflow çalıştırma** | Exec |
| app-health, get-stats, hardware-profile | renderer→main | Sağlık/istatistik | Read |
| ipc:3:audit-log-query | renderer→main | **Denetim logu sorgu** | Read |
| ipc:3:fleet-scan | renderer→main | **Ollama fleet tarama** | Read |
| open-path, export-to-path, set-window-opacity | renderer→main | OS entegrasyonu | Read |
| normalize-ollama-host | renderer→main | Host normalizasyon (SSRF guard) | Read |

---

## EK-E — Haftalık Sprint Ayrımı (Faz 1–2 detayı)

### Hafta 1
- `docs/ARCHITECTURE.md` yazımı (mevcut IPC envanteri, modül haritası, veri akış diyagramları).
- `src/renderer/lib/event-bus.js` implementasyonu; `app.js` bootstrap yeniden yazımı iskeleti.
- Jest coverage altyapısı: `test:ci` scripti, coverage raporu artifact.

### Hafta 2
- `chat` modülü bölünmesi (render.js virtualization, stream.js, markdown.js).
- Config migration prototipi (`config-migrations.js` v2→v3 up/down).
- `ipc-bridge.js` iskeleti (eski↔yeni IPC yönlendirmesi).

### Hafta 3
- `providers` modülü (model seçimi, API key yönetimi, health bar).
- `settings` modülü (ayarlar paneli, workspace seçim).
- Unit testler: migration (up/down çift yönlü), event-bus, ipc-bridge map'leri.

### Hafta 4
- `agents` modülü (ajan CRUD, takım presetleri, delegasyon UI v2).
- Çoklu sohbet sekmeleri ve oturum deposu (`sessions/{id}.json`).
- Electron-updater entegrasyonu; `release.yml` taslağı.

### Hafta 5
- Performans: markdown cache, throttle batching, ghost mode GPU test matrisi.
- Hata raporu + crash recovery checkpoint sistemi.
- UI e2e testleri (Playwright): sohbet gönderme, sekme, ayarlar kalıcılığı.

### Hafta 6
- RC1: üç platformda build, smoke test, CHANGELOG, release draft.
- Toplum beta duyurusu (public repo ise).

### Hafta 7–8 (F2 başlangıcı)
- `EventChannel` + 4 provider adapter'ı (openai, anthropic, gemini, ollama).
- `tools/registry.js` + `tools/executor.js` (read-tier araçlar: read_file, list_dir, scan_project).
- Unit testler: adapter map doğruluğu, registry validasyonu.

### Hafta 9–10
- Write-tier araçlar + onay modalı (`tool-approval-request/response`).
- `AgentLoop` implementasyonu (döngü, adım sınırı, checkpoint).
- Terminal/güvenlik blacklist testleri.

### Hafta 11–12
- MCP client (`mcp/client.js` stdio tabanlı), sunucu allowlist, graceful degrade.
- Ajan şablon editörü + template değişkenleri.
- Workflow engine (YAML adım zinciri) + `//RUN:` sentaksı.

### Hafta 13–14
- F2 bütünleşik testler (6 kabul kriteri).
- RC → v3.1.0 release, dokümanlar (`docs/AGENT-DEV.md`).

---

## EK-F — Performans Bütçesi (Tüm Fazlar İçin Tavan Değerler)

| İşlem | Tavan Süre | Ölçüm Koşulu |
|---|---|---|
| Sohbet render (10.000 mesaj) | <100ms scroll | 15" FHD, i5/Ryzen 5 |
| Markdown parse + purify (10KB içerik) | <5ms | Cache miss senaryosu |
| Bellek arama (100.000 öğe) | <500ms | sqlite-vss HNSW |
| Ollama model listesi pull | <3s | localhost:11434 |
| Provider model listesi (↻ API) | <5s | HTTPS |
| Tool execution başlatma (onay dahil) | <200ms | Modal gösterimi |
| Context compaction | <10s | 500 mesajlık geçmiş |
| Eklenti başlatma | <100ms | 5 eklenti paralel |
| Fleet health scan (5 host) | <5s | Paralel istek |
| Uygulama soğuk açılış | <2s | SSD, Electron 43 |

---

## EK-G — Veri Modeli Şeması (v3, Tam)

```
userData/Krevyx/
├── config.json                 # schemaVersion 3 (EK-B yapısı)
├── agents/
│   └── custom-templates/       # kullanıcı ajan şablonları (.json)
├── sessions/
│   └── {uuid}/
│       ├── session.json        # meta: created, agentId, model, provider, title
│       ├── messages.jsonl      # mesajlar (append-only)
│       └── checkpoints/        # agent loop checkpoint'leri
├── memory/
│   ├── memory.db               # SQLite: messages, memories, sources
│   └── index/                  # vektör index
├── media/
│   └── {uuid}.ext              # medya varlıkları
├── generated/                  # üretlen görseller/sesler
├── plugins/
│   └── {id}/                   # eklenti klasörleri
├── workflows/                  # YAML workflow tanımları
├── logs/
│   └── audit.jsonl             # denetim kayıtları (hash zinciri)
├── profiles/                   # v4.0 çoklu profil
└── license/                    # kurumsal lisans
```

Bu şema hem Faz 1'in migration planını hem Faz 3'ün bellek/mimari planını hem de Faz 6'nın kurumsal katmanını destekler. Her klasör, `main-security.js`'deki `registerUserFolder` mekanizmasının tanıdığı kökler altında yaşar.
