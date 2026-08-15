# OllamaX — Arayüz ve Özellik Upgrade Planı (v3.1 → v5.0)

> **Doküman tipi:** Teknik gelişim planı (uygulama öncesi tasarım dokümanı)
> **Referans dokümanlar:** `docs/ROADMAP.md` (ana yol haritası), `docs/ARCHITECTURE.md` (mimari),
> `docs/FEATURES.md` (kullanıcı kılavuzu), `docs/RELEASE-3.0.0.md` (v3.0 lansman özeti)
> **Yazar:** Manus AI
> **Tarih:** 2026-08-15
> **Sürüm:** 1.0 — Draft v1

---

# Bölüm 0 — Nasıl Okunur

Bu doküman, OllamaX'in v3.0 "AI Agent Studio" sürümünden v5.0 "Market-Leading AI Agent Platform"
sürümüne geçişini sağlayan **arayüz (UI/UX)** ve **özellik (feature)** upgrade'lerinin tam
tasarımını içerir. `docs/ROADMAP.md` 1.200 satırlık stratejik yol haritasıdır; bu doküman ise o
yol haritasındaki arayüz ve özellik maddelerini **implementasyona hazır mühendislik seviyesine**
indirir. Her madde; motivasyon, mimari tasarım, şema/arayüz tanımları, kabul kriterleri ve referans
kod kalıpları içerir, böylece uygulama sırasında ek soruya gerek kalmamalıdır.

Doküman beş ana bölümden oluşur:

| Bölüm | İçerik | Hedef sürüm |
| --- | --- | --- |
| Bölüm 1 | Arayüz tasarım sistemi ve platform düzeyi UI (Design System, Command Palette, Workspace Layout, tema, erişilebilirlik) | v3.1 |
| Bölüm 2 | Ajan deneyimi arayüzü (Agent Canvas, canlı plan/araç görselleştirme, klavye kompozisyonu) | v3.2 |
| Bölüm 3 | Özellik upgrade'leri — bellek, bilgi tabanı, iş akışları, eklenti mağazası, ses, medya, ekip | v4.0 |
| Bölüm 4 | Platform ve dağıtım upgrade'leri (auto-updater, telemetri, crash recovery, fleet, CI) | v4.0 → v5.0 |
| Bölüm 5 | Ekler: tam IPC kataloğu, veri şemaları, sprint ayrımı, performans bütçesi, test planı | — |

## 0.1 Tasarım ilkeleri (değişmezler)

Bu plandaki tüm tasarım kararları aşağıdaki değişmezlere (invariants) bağlanır. ROADMAP
Bölüm 10'daki güvenlik değişmezleriyle birlikte okunmalıdır:

1. **Vanilla JS kalır.** ADR-001 gereği framework eklenmez; tüm arayüz `h()` DOM builder üzerine
   inşa edilmeye devam eder. Karmaşıklık arttıkça modül sınırları sertleşir, platform değişmez.
2. **Yerellik önceliklidir.** Her özellik, yerel Ollama ile tam çalışır; bulut API'leri opt-in'dir.
3. **Geriye uyumluluk.** IPC'de yeni sürüm (`ipc:4:*`) eklenir; `ipc:3:*` dokunulmaz kaldırılmaz.
4. **Şema disiplini.** Her yeni kalıcı veri yapısı şema versiyonuyla ve migration'la tanımlanır.
5. **Test kapısı.** Her bölümün sonunda kabul testleri tanımlıdır; Yeşil olmadan merge yok.
6. **Profesyonel görünüm.** "AI slop" geri dönmez; emoji-free, SVG ikon, nötr tipografi kuralı
   tüm yeni yüzeylerde geçerlidir.

## 0.2 Sürüm takvimi özeti

| Sürüm | Odak | Süre (kişi-gün, tek geliştirici) | Çıkış hedefi |
| --- | --- | --- | --- |
| v3.1 | Arayüz çekirdeği: design system, command palette, yeni workspace düzeni, tema altyapısı | 14 | 2026-09 |
| v3.2 | Ajan deneyimi: Agent Canvas, plan görselleştirme, klavye kompozisyonu, bildirim merkezi | 16 | 2026-10 |
| v4.0 | Özellik dalgası: bilgi tabanı, görsel iş akışı editörü, eklenti mağazası, ses, medya | 30 | 2026-12 |
| v5.0 | Platform: ekip profilleri, fleet, auto-updater, telemetri, CI/CD olgunluğu | 20 | 2027-02 |

---

# Bölüm 1 — Arayüz Çekirdeği (v3.1)

Bu bölüm, v3.0'ın tek araç çubuğu tab'ları altında sıkışmış panellerini (bellek, iş akışları,
eklentiler, denetim, oturumlar) **profesyonel bir çok-pane workspace düzenine** taşıyan
temeldir. Rakip ürünler (Continue, LobeChat, Cline) bu düzeni zaten sunuyor; farkımızı
yerellik + agent-first deneyiminden alacağız.

## 1.1 Gap analizi — mevcut arayüzün eksikleri

v3.0 arayüzü `app.js` (1.803 satır) + `v3-ui.js` (682 satır) + `styles.css` (1.107 satır)
üzerinde kuruludur. Fonksiyoneldir ancak yedi yapısal eksiği vardır:

| # | Eksik | Etki | Çözüm (bu bölüm) |
| --- | --- | --- | --- |
| U1 | Paneller tek araç çubuğunda tab olarak yaşar | Ajan/bellek/iş akışı birlikte çalışılamaz; ekran kullanımı verimsiz | Bölüm 1.2 — Workspace Layout |
| U2 | Tema sabit tek renktir; light/dark yok | Kullanıcı tercihine kapalı; kurumsal kullanımda engel | Bölüm 1.3 — Tema altyapısı |
| U3 | Komut paleti ve fuzzy arama yok | Güç kullanıcıları menülerde boğulur | Bölüm 1.4 — Command Palette |
| U4 | Klavye kısayolları az ve sistemsiz | Verimlilik iddiası zayıf kalır | Bölüm 1.5 — Kısayol katmanı |
| U5 | Boş durumlar ve onboarding turu yok | İlk deneyim soğuk; feature keşfi düşük | Bölüm 1.6 — Onboarding ve boş durumlar |
| U6 | Erişilebilirlik kısmi (aria, focus-trap, kontrast) | Erişilebilirlik iddiası tutulamaz | Bölüm 1.7 — Erişilebilirlik |
| U7 | Performans katmanı yok (sanal liste, tembel render) | 10k+ mesajda kayma; Bellek panelinde 100k vektörde donma | Bölüm 1.8 — Performans |

## 1.2 U1 — Workspace Layout (yeniden düzenlenen yerleşim)

### 1.2.1 Hedef düzen

Yeni yerleşim dört bölgeye ayrılır ve `workspace-layout` CSS grid'i ile tanımlanır:

```
+----------------+--------------------------------------------------+----------------+
|  Oturum        |                                                  |  Bilgi          |
|  kenar çubuğu  |        Ana alan: Sohbet / Agent Canvas           |  kenar çubuğu  |
|  (sessions)    |                                                  |  (context)      |
|                |                                                  |                 |
|  260px         |   +------------------------------------------+   |  280px          |
|                |   | Üst bar: model seçici, oturum başlığı,    |   |  Bellek özet   |
|  - Oturum list |   |        ayarlar, pencere kontrolleri        |   |  Bağlı araçlar  |
|  - Yeni sohbet |   +------------------------------------------+   |  Bilgi kartları  |
|  - Arama       |                                                  |  İlgili bellek   |
|  - Etiketler   |   +------------------------------------------+   |                 |
|                |   | Mesaj akışı (kanban/balon karışık mod)     |   +----------------+
+----------------+                                                  |  Alt panel       |
|  Araç çubuğu   |   +------------------------------------------+   |  (collapsible)   |
|  (sol, ikon)   |   | Kompozisyon kutusu (genişleyen)            |   |  Terminal /     |
|                |   +------------------------------------------+   |   Dosyalar /      |
|  Çekirdek      |                                                  |   Denetim         |
|  Araçlar      |                                                  +----------------+
|  Bellek        |
|  İş Akışları  |
|  Eklentiler   |
|  Denetim      |
+----------------+
```

**Davranış kuralları:**

1. Sol araç çubuğu her zaman görünür; araç ikonuna tıklamak kenar çubuğunu (panel) açar/kapatır.
   İki panel aynı anda açık olabilir (örn. Bellek + Denetim) — sağ kenar çubuğuna taşınır.
2. Oturum kenar çubuğu `Ctrl/Cmd+Shift+S` ile gizlenebilir; gizli durumda ana alan genişler.
3. Alt panel (terminal/dosya/denetim) yüksekliği kullanıcı tarafından sürükleyle ayarlanır ve
   `workspace.altPanelHeight` olarak şema-sürümlü config'de saklanır.
4. Tüm bölge boyutları `localStorage` + config store'da persist edilir; yeniden başlatmada geri
   yüklenir. Yeni kullanıcıda varsayılan: sol 260px, sağ 280px, alt 220px.
5. Küçük ekranlarda (< 1100px) sağ kenar çubuğu overlay (drawer) moduna geçer.

### 1.2.2 Veri şeması

```json
{
  "schemaVersion": 4,
  "workspace": {
    "leftWidth": 260,
    "rightWidth": 280,
    "altPanelHeight": 220,
    "altPanelMode": "terminal",
    "leftCollapsed": false,
    "rightCollapsed": false,
    "density": "comfortable",
    "layoutPreset": "agent"
  }
}
```

`layoutPreset` değerleri: `chat` (tek panel odak), `agent` (varsayılan), `lab` (alt panel sabit
açık + geniş composer), `compact` (alt panel kapalı, minimum padding).

### 1.2.3 Migration (F1.2'ye eklenti)

`config-migrations.js`'e v3 → v4 migration eklenir: mevcut `workspaces` dizisi oturum
kenar çubuğuna taşınır, `tools` tab içeriği sol araç çubuğuna harmanlanır. Eski tab DOM'u
`v3-ui.js`'de feature flag (`ui.legacyTabs`) arkasında bir dönem saklanır.

### 1.2.4 Kabuller (AC)

- AC-1: Dört bölge bağımsız olarak daraltılabilir, taşınabilir ve persist edilir.
- AC-2: Sağ kenar çubuğunda iki panel birlikte açıkken birbirini gölgemez (stack davranışı).
- AC-3: `< 1100px` genişlikte sağ çubuk drawer olur; `Escape` ile kapanır.
- AC-4: Layout değişiklikleri denetim günlüğüne `ui:layout-change` olarak düşer.
- AC-5: Legacy tab davranışı `ui.legacyTabs: true` ile geri kazanılabilir (en fazla 2 sürüm).

## 1.3 U2 — Tema altyapısı (Design System çekirdeği)

### 1.3.1 CSS değişken katmanı

`styles.css` mevcut ~1.107 satırlık tek renk temasını **değişken katmanı + tema şablonları**
mimarisiyle yeniden düzenler. Tema, runtime'da JavaScript ile değil, `data-theme` özniteliği ve
CSS değişkenleriyle yönetilir (performans + CSP uyumu):

```css
:root {
  /* Nötr palet — GitHub Dark ilhamlı, salt beyaz değil */
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #21262d;
  --border-subtle: #30363d;
  --border-strong: #484f58;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #6e7681;

  /* Accent — kullanıcı özelleştirilebilir */
  --accent: #2f81f7;
  --accent-hover: #388bfd;
  --accent-soft: rgba(47, 129, 247, 0.12);

  /* Durum renkleri — semantik, duygusal değil */
  --ok: #3fb950;
  --warn: #d29922;
  --danger: #f85149;
  --info: #58a6ff;

  /* Ölçek */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --spacing-1: 4px;
  --spacing-2: 8px;
  --spacing-3: 12px;
  --spacing-4: 16px;
  --spacing-5: 24px;

  /* Tipografi */
  --font-sans: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
  --font-mono: "Cascadia Code", "Fira Code", "SF Mono", Menlo, Consolas, monospace;
  --size-1: 12px;
  --size-2: 13px;
  --size-3: 14px;
  --size-4: 16px;
  --size-5: 20px;
  --line-height: 1.55;
}

[data-theme="light"] {
  --bg-primary: #ffffff;
  --bg-secondary: #f6f8fa;
  --bg-tertiary: #f0f2f5;
  --border-subtle: #d0d7de;
  --text-primary: #1f2328;
  --text-secondary: #656d76;
}

[data-theme="high-contrast"] {
  /* WCAG AAA uyumlu kontrast katmanı */
  --bg-primary: #000000;
  --text-primary: #ffffff;
  --border-subtle: #ffffff;
}
```

### 1.3.2 Tema kaydı ve özel tema desteği

Tema sistemi `renderer/theme-registry.js` modülüne çıkarılır:

```js
// renderer/theme-registry.js (tasarım)
const ThemeRegistry = {
  register(name, vars) { /* themeDefs[name] = vars; persist */ },
  apply(name) { document.documentElement.setAttribute('data-theme', name); },
  customThemes() { return [...themeDefs.entries()].filter(([k]) => k.startsWith('custom:')); },
  importFromJSON(json) { /* v3-theme.json içe aktar */ },
};
```

Kullanıcı **accent rengini** renk çarkından seçer; seçim `config.theme.accent`'a yazılır ve
`:root` CSS değişkenine runtime'da (tek bir `setProperty` çağrısıyla) uygulanır.

### 1.3.3 Yoğunluk modları

`workspace.density` üç değer alır: `comfortable` (varsayılan, mevcut padding), `compact`
(mesajlar arası 8px, daha küçük avatar), `cozy` (16px+). Yoğunluk, font ölçeğini değil yalnızca
spacing'i değiştirir — tipografik hiyerarşi korunur.

### 1.3.4 Kabuller (AC)

- AC-1: Dark/light/high-contrast geçişi tek değişken değişimiyle, sayfa yeniden yüklemeden olur.
- AC-2: Özel tema `theme-registry` üzerinden kaydedilir, silinir, JSON olarak paylaşılır.
- AC-3: Accent rengi tüm yüzeylerde (buton, link, seçim vurgusu) tutarlı uygulanır.
- AC-4: Kontrast modunda tüm metin/ararka plan çiftleri WCAG AAA'yi geçer (otomatik test).
- AC-5: Varsayılan tema işletim sistemi tercihini (`prefers-color-scheme`) izler; ilk açılışta
  manuel seçim sorulur.

## 1.4 U3 — Command Palette

### 1.4.1 Tasarım

`Ctrl/Cmd+K` ile açılan, fuzzy arama destekli komut paleti `renderer/command-palette.js` olarak
yeni modül olur. Kaynaklar dört kanaldan beslenir:

| Kanal | Örnek girdiler |
| --- | --- |
| Komutlar | `Ayarlar`, `Denetim kaydı aç`, `Belleği tara`, `İş akışı çalıştır…` |
| Oturumlar | Oturum başlığına fuzzy arama → geç |
| Bellek | Bellek kaydına semantik arama → detay |
| Modeller | Kurulu/uzak modeller → aktif model olarak ayarla |

### 1.4.2 Fuzzy arama motoru

Kendi motorumuz yazılır (bağımlılık eklenmez). Skorlama: eşleşen karakterler sıralı olmalı;
kesintisiz alt dizge bonusu; baştaki eşleşme bonusu; kısaltma eşleşmesi (örn. `oa` →
"Oturumları Aç").

```js
function fuzzyScore(query, target) {
  // Dönüş: { score, indices } | null
}
```

10.000 girdiye kadar `O(q·n)` tarama 16ms altında kalmalıdır (referans donanımda).

### 1.4.3 Genişleme noktası

Modüller palet'e kayıt fonksiyonuyla bağlanır:

```js
window.OllamaX.palette.register({
  group: 'actions',
  label: 'Denetim kaydını doğrula',
  keywords: ['audit', 'denetim', 'zincir'],
  run: async () => { const r = await api.invoke('ipc:3:audit:verify'); toast(r.ok ? 'Zincir sağlam' : 'Zincir bozuk'); }
});
```

Bölüm 3'teki her özellik palet'e kendini kaydeder; bu, navigasyonun merkezi sözleşmesi olur.

### 1.4.4 Kabuller (AC)

- AC-1: `Ctrl/Cmd+K` açar, `Escape` kapatır, `Enter` seçer, `↑/↓` gezinir.
- AC-2: Son 5 komut "son kullanılanlar" olarak üstte listelenir.
- AC-3: Fuzzy skorlama belgelenen kurallara uyar; test suite'te 20 sabit vaka vardır.
- AC-4: Palet, focus-trap'li modal davranışı gösterir (Bölüm 1.7 ile birlikte).
- AC-5: `ipc:3:*` ve `ipc:4:*` kayıtlı uçlarının tamamı komut olarak görünür.

## 1.5 U4 — Klavye kompozisyonu katmanı

### 1.5.1 Kısayol kaydı

Kısayollar `renderer/keymap.js`'de merkezi kayıt altında toplanır:

```js
const KEYMAP = {
  'mod+k':        'palette.open',
  'mod+shift+s':  'sidebar.sessions.toggle',
  'mod+l':        'sidebar.tools.toggle',   // legacy davranış korunur
  'mod+,':       'settings.open',
  'mod+/':       'composer.focus',
  'mod+shift+m': 'memory.search',
  'mod+shift+a': 'agent.goal.new',
  'mod+shift+d': 'theme.toggle',
  'mod+enter':   'composer.send',
  'ctrl+tab':    'session.next',
  'ctrl+shift+tab': 'session.prev',
};
```

### 1.5.2 Kurallar

1. Tek platform farkı: `mod` = `Cmd` (macOS) / `Ctrl` (Windows/Linux). `event.metaKey` ve
   `event.ctrlKey` birleşik kontrol edilir.
2. Çakışmada daha spesifik bağlam kazanır (sohbet içinde `mod+enter` gönderir; palet açıkken
   aynı tuş paleti kapatmaz).
3. Kullanıcı kısayolları `config.keymap.overrides` ile yeniden bağlayabilir; çakışma UI'da
   uyarılır.
4. Tüm kısayollar Ayarlar → Klavye sayfasında listelenir ve değiştirilebilir.

### 1.5.3 Kabuller (AC)

- AC-1: Yukarıdaki 12 kısayolun tamamı hem macOS hem Linux'ta çalışır (CI'da başsız test).
- AC-2: Kısayol çakışması kullanıcıya kaydetme anında bildirilir.
- AC-3: Klavye sayfasında "başka bir komuta bağlı" uyarısı gösterilir.

## 1.6 U5 — Onboarding ve boş durumlar

### 1.6.1 İlk açılış akışı

İlk açılışta (`config.onboardingCompleted` yoksa) dört ekranlı tur gösterilir:

1. **Karşılama:** Ollama sağlık durumu; yerel model yoksa kurulum rehberi (indirme butonu).
2. **Araçlar:** Sol çubuk + panellerin tanıtımı; bir paneli açma demo'su.
3. **Ajanlar:** `/goal` ile otonom döngüye örnek hedef; araç onay modalının tanıtımı.
4. **Bellek ve denetim:** Bellek paneli + hash zincirli günlüğün tek cümlelik değeri.

Tur, `onboarding` pencere parametresi ve `?skip-onboarding=1` ile atlanabilir.

### 1.6.2 Boş durumlar (empty states)

Her yüzey için SVG ikonlu + tek cümle + birincil aksiyon butonlu boş durum tasarlanır:

| Yüzey | Boş durum mesajı (örnek) | Birincil aksiyon |
| --- | --- | --- |
| Oturum listesi | "Henüz oturum yok. Sohbetle başla veya bir hedef ver." | `+ Yeni sohbet` / `Hedef belirle` |
| Bellek | "Bellek boş. Sohbet ettikçe bilgiler burada birikir." | `Belleğe not ekle` |
| İş akışları | "Tekrar eden işler için şablon oluştur." | `+ Yeni iş akışı` |
| Eklentiler | "Eklenti yok. Yerel klasörden yükle veya mağazaya göz at." | `Yükle` / `Mağaza` |
| Denetim | "Bu kullanıcıda henüz kayıt yok." | `Yenile` |
| Sohbet | "Bir hedef tanımla; araçlar, bellek ve plan senin için çalışsın." | `/goal` örneği |

### 1.6.3 Kabuller (AC)

- AC-1: Onboarding tek seferlik; tamamlandı flag'i config'e yazılır ve denetimlenir.
- AC-2: Her listede boş durum, 0 öğe koşulunda deterministik olarak görünür (test).
- AC-3: Tur ekranları klavyeyle (`Tab`, `Enter`, `Escape`) tam gezinilebilir.

## 1.7 U6 — Erişilebilirlik (a11y) sistemi

### 1.7.1 Kapsam

1. **Focus yönetimi:** tüm modal/palet/drawer bileşenleri focus-trap uygular; kapanınca focus
   tetikleyiciye döner. `roving tabindex` liste bileşenlerinde (oturum listesi, bellek sonuçları)
   standarttır.
2. **ARIA:** `role="dialog"`, `aria-modal`, `aria-live="polite"` (canlı olay akışı),
   `aria-expanded` (açılır paneller), `aria-current="page"` (aktif panel).
3. **Kontrast:** normal metin ≥ 4.5:1, büyük metin ≥ 3:1; high-contrast tema ≥ 7:1.
4. **Klavye-only akışı:** fare kullanmadan tüm işlevler tamamlanabilir (cihap başsız test).
5. **Ekran okuyucu:** mesaj balonları `aria-label` ile "kullanıcı/yardımcı/araç çağrısı" ayrımı
   yapar; canlı akış `aria-live` bölgesine özet düşer (her token değil, cümle başına).
6. **Azaltılmış hareket:** `prefers-reduced-motion` saygısında geçişler kapalıdır.

### 1.7.2 Otomatik a11y testi

Jest tarafına `a11y-axe.test.js` değil, kendi statik denetleyicimiz eklenir: renderer'ın
üretilen HTML örneklemleri (jsdom) taranır; eksik `aria-label`, trap ihlali, kontrast altı
değişkenleri raporlanır. Playwright kurulumu Bölüm 4'teki CI çalışması için planlanır.

### 1.7.3 Kabuller (AC)

- AC-1: Focus-trap ihlali olan tek modal kalmaz; her modal testte kanıtlanır.
- AC-2: Kontrast kontrolleri tema matrisinin (3 tema × 12 yüzey) tamamında geçer.
- AC-3: Ekran okuyucu taramasında 3 ana akış (sohbet, bellek arama, hedef verme) tamamlanır.

## 1.8 U7 — Performans katmanı

### 1.8.1 Sanal liste

Oturum listesi, bellek sonuçları ve denetim kaydı `renderer/virtual-list.js` ile sanallaştırılır.
Sabit satır yüksekliği varsayımıyla basit iki-yönlü sanallaştırma; 100.000 satırda görünür
pencere ±50 satır render edilir.

```js
class VirtualList {
  // constructor(root, { rowHeight, render, estimatedCount })
  // scrollTo(index), setItems(items), dispose()
}
```

### 1.8.2 Tembel render ve IDLE işleme

- Mesaj akışında görünmeyen balonlar `IntersectionObserver` ile tembel markdown render alır.
- Bellek panelindeki vektör araması `requestIdleCallback` içine sarılır; ana thread 60fps
  korur. Arama sonucu 500ms tavanı (100k kayıt, referans donanım) EK-F bütçesine eklenir.
- Büyük kod blokları (`> 200 satır`) varsayılan katlanır; `highlight.js` yalnızca görünür
  bloklarda çalışır.

### 1.8.3 Streaming verimliliği

EventChannel token akışında DOM güncellemesi **batch'lenir** (raf başına en fazla bir
`textContent` güncellemesi; `requestAnimationFrame` ile). Düşünce akışı ayrı `aria-live`
bölgesine saniyede en fazla 2 kez yazılır.

### 1.8.4 Ölçüm altyapısı

`renderer/perf.js` modülü: navigasyon süresi, liste kaydırma fps'i, arama gecikmesi
`ipc:4:telemetry:ui-metrics` ile main'e düşer (kullanıcı opt-in). Bölüm 4.3 telemetri detayı.

### 1.8.5 Kabuller (AC)

- AC-1: 100k bellek kaydında panel açılışı < 500ms, kaydırma 60fps (profille kanıtlanır).
- AC-2: 10k mesajlık oturumda ilk render < 300ms (mock verili test).
- AC-3: Token akışında ani tokenlar tek frame'e birleşir; jank < %1 frame (Performanc API ölçümü).
- AC-4: `requestIdleCallback` desteklenmeyen ortamlarda `setTimeout(..., 50)` fallback.

---

# Bölüm 2 — Ajan Deneyimi Arayüzü (v3.2)

v3.0 AgentLoop'u çalışıyor ancak deneyimi "sohbet içinde metin akışı" ile sınırlı. Bu bölüm,
ajanın **planını, araç çağrılarını, onaylarını ve ilerlemesini** birinci sınıf UI öğeleriyle
sunan Agent Canvas'i tasarlar. Hedef: kullanıcı ajanın "ne yaptığını" okumak yerine
**izlemek** ister.

## 2.1 Gap analizi — ajan deneyiminin eksikleri

| # | Eksik | Etki | Çözüm |
| --- | --- | --- | --- |
| A1 | Plan, metin içi numaralı liste olarak yaşıyor | Adım durumu takip edilemez | 2.2 — Agent Canvas |
| A2 | Araç çağrıları küçük balon; argüman detayı gömük | Onay kararları kör veriliyor | 2.3 — Araç çağrısı kartları |
| A3 | Onay modalı tek çağrı odaklı; toplu onay yok | Uzun görevlerde her adımda kesinti | 2.4 — Onay modları |
| A4 | Ajan durumu (bekliyor/onay bekliyor/hata) belirsiz | Kullanıcı ne yapacağını bilmiyor | 2.5 — Durum makinesi + bar |
| A5 | Sub-agent orkestrasyonu görünmez | `//CALL` çıktısı karışık | 2.6 — Orkestrasyon görünümü |
| A6 | Görev geçmişi/geri alma yok | Hatalı ajan kararından dönüş zor | 2.7 — Görev zaman çizelgesi |

## 2.2 A1 — Agent Canvas

### 2.2.1 Konsept

Agent Canvas, sohbetin üstünde (veya yanında, yerleşime göre) açılan **yaşayan görev yüzeyi**dir.
Üç yatay banttan oluşur:

```
+-------------------------------------------------------------+
| Plan bantı:  [✓] Adım 1: depoyu klonla   [▶] Adım 2: analiz  |
|              [ ] Adım 3: rapor yaz          • • • kalan 2    |
+-------------------------------------------------------------+
| Çalışma bantı: aktif araç çağrısı kartı + çıktı önizlemesi   |
+-------------------------------------------------------------+
| Bağlam bantı: bellek eşleşmeleri, dosya değişiklikleri özeti |
+-------------------------------------------------------------+
```

### 2.2.2 Plan durumu makinesi

Her plan adımı şu durumları taşır: `pending → in-progress → awaiting-approval → done | failed |
skipped`. Durum geçişleri EventChannel olaylarıyla (`plan:step:start`, `tool:approval:request`,
`tool:result`, `plan:step:done`, `plan:replan`) canvas'a bağlanır. Replan olayında eski adımlar
`skipped` işaretlenir ve yeni adımlar eklenir; kullanıcıda **"plan revize edildi"** notu düşer.

### 2.2.3 Veri sözleşmesi (ipc:4:agent)

```json
{ "id": "plan-8f21", "goal": "...", "model": "qwen3-coder",
  "steps": [
    { "seq": 1, "text": "depoyu klonla", "status": "done", "tool": "git_clone",
      "tookMs": 4120, "artifact": { "type": "path", "value": "ws/repo" } },
    { "seq": 2, "text": "...", "status": "awaiting-approval",
      "pending": { "tool": "create_file", "args": { "path": "...", "contentPreview": "..." } } }
  ],
  "budget": { "maxSteps": 25, "usedSteps": 7, "maxDurationSec": 600, "elapsedSec": 98 }
}
```

### 2.2.4 Kabuller (AC)

- AC-1: Canvas, aktif görev başladığında açılır; görev bitince özet kartına daralır (açılabilir).
- AC-2: Plan revizyonu UI'da fark edilir; eski/yeni adım ilişkisi gösterilir.
- AC-3: Bütçe göstergesi (adım + süre) dolarken renk değiştirir (warn → danger).
- AC-4: Canvas `Escape` ile kapatılabilir; görev yürütme etkilenmez.

## 2.3 A2 — Araç çağrısı kartları

Araç çağrıları artık satırlık metin değil **kart**tır:

```
┌──────────────────────────────────────────────┐
│ [dosya-yaz] workspace/rapor.md          42ms │
│ Boyut: 12.4 KB · Önceki sürüm: none          │
│ ───────────────────────────────────────────  │
│ 1 │ # OllamaX İnceleme                       │
│ 2 │                                          │
│ 3 │ ## Yöntem                                │
│     ⋮ +142 satır (genişlet)                  │
└──────────────────────────────────────────────┘
```

1. Kart başlığı: araç adı (SVG ikon), hedef, süre.
2. Meta satırı: tier rozeti (read yeşil / write mavi / exec turuncu), boyut, diff özeti.
3. İçerik: ilk 6 satır preview; `create_file`/`edit_file` için **inline diff görünümü**
   (eski → yeni, satır bazlı, renk körü dostu desenli).
4. Sonuç satırı: başarı/hata rozeti + çıktı özeti; hatalarda "tekrar dene" aksiyonu (loop'a
   `tool:retry` sinyali).

## 2.4 A3 — Onay modları

Tek modal yerine üç mod:

| Mod | Davranış | Kullanım |
| --- | --- | --- |
| **Tek tek** (varsayılan) | Her write/exec/terminal çağrısı modal bekletir | İlk görevler |
| **Oturum onayı** | "Bu oturumda [araç]+[glob desen] için onay verme" | Güvenilen workspace |
| **Sessiz + denetim** | Onaysız çalış, her çağrı denetim günlüğüne + geri alınabilir kuyruğa | Güçlü kullanıcı |

Onay modalında üç düğme: `Reddet` (ajana hata sonucu), `Onayla`, `Kalıcı onay` (bu araç+desen
için config'e `toolAutoApprove` kuralı ekler — regex desen `files/*.txt` gibi).

Kalıcı onay kuralları şeması:

```json
{ "rules": [
  { "tool": "create_file", "pathGlob": "workspace/**", "created": "2026-08-15T12:00:00Z" }
], "schemaVersion": 1 }
```

## 2.5 A4 — Ajan durum çubuğu

Üst barda ajan durumu renk kodlu gösterilir: `idle` (gri), `planning` (mavi), `working` (accent
pulse), `awaiting-approval` (turuncu + rozet sayacı), `error` (kırmızı + yeniden dene),
`done` (yeşil + özet). `awaiting-approval` durumunda kompozisyon kutusu **onay odaklı** olur;
`mod+enter` bekleyen onayı onaylar.

## 2.6 A5 — Orkestrasyon görünümü

`//CALL:AgentName` ve `//CALL_PARALLEL` çağrılarında:

1. Ana canvas'ta alt görev kartları: her sub-agent için durum rozeti + mini ilerleme.
2. Paralel çağrılarda kartlar yan yana; sıralı çağrılarda zincir halinde.
3. Sub-agent çıktıları ana akışta **içe geçmiş (nested)** balon olarak verilir; kullanıcı
   istediği seviyeye kadar açar (expand/collapse).
4. Loop'un kendi ajanları (`src/main/agents/loop.js`'teki iç döngü) için `agent:spawn`,
   `agent:complete` olayları EventChannel'a eklenir (ipc:4 genişletmesi).

## 2.7 A6 — Görev zaman çizelgesi ve geri alma

1. Her görev, oturum dosyasında `tasks/{goalHash}.json` olarak checkpoint'lenir (loop'un mevcut
   checkpoint dizisi üzerine). Görevler listesi "son görevler" panelinde görünür.
2. **Geri alma:** araç kuyruğu ters oynatılabilir değildir; bunun yerine **telafi (compensation)
   önerisi** sunulur: `delete_file(workspace/rapor.md)` gibi karşıt çağrı önerilir, kullanıcı
   onaylar, loop uygular. Denetim günlüğünden `tool:*` kayıtları okunarak öneri üretilir.
3. Hatalı görevler "yeniden çalıştır" ile yeni plan olarak başlatılır; geçmiş görevin adımı
   sonuçlarıyla birlikte kopyalanır.

## 2.8 Bölüm 2 kabul testleri (toplu)

| # | Test | Beklenen |
| --- | --- | --- |
| T-A1 | 30 adımlık mock görevde canvas adım durumları doğru işlenir | Tüm rozetler sırasıyla güncellenir |
| T-A2 | Replan olayı eski adımları skipped yapar | Canvas'da "revize edildi" notu görünür |
| T-A3 | Kalıcı onay kuralı eklenip aynı araç çağrıldığında modal açılmaz | Denetimde `approval:permanent` kaydı oluşur |
| T-A4 | Paralel sub-agent çağrısında 3 kart yan yana render edilir | Durumlar bağımsız güncellenir |
| T-A5 | Görev checkpoint'i app crash sonrası geri yüklenir | Canvas aynı adımdan devam eder |

---

# Bölüm 3 — Özellik Upgrade'leri (v4.0)

Bu bölüm, v3.0'ın iskeletini kas ve organlara dönüştüren özellik dalgasını tasarlar: bellek ve
bilgi tabanı, görsel iş akışı editörü, eklenti mağazası, ses, medya ve ekip altyapısı.

## 3.1 Bellek sistemi 2.0 (`src/main/memory/`)

### 3.1.1 Bugünkü durum ve eksikler

v3.0 bellek: saf-JS HNSW indeks + SQLite, Ollama embedding'e (`nomic-embed-text` varsayılan)
bağımlı, kayıt girişi pasif. Eksikler: (1) embedding servisi tek model, fallback yok;
(2) kullanıcı "bu bilgiyi hatırla/unut" diyemiyor; (3) bilgi kartları (knowledge cards) kavramı
yok; (4) ilgili belleğin ajana enjeksiyonuheuristik.

### 3.1.2 Mimari genişletme

```
┌──────────────┐   embed   ┌────────────────────┐   store   ┌───────────────┐
│ EmbeddingSvc ├───fallback──► ProviderChain (ollama│──────────►│ VectorStore   │
│ (yerel+bulut)│            │ → fallback listesi) │           │ (HNSW+SQLite) │
└──────────────┘            └────────────────────┘           └───────────────┘
        ▲                                                              │
        │ rerank                                                       ▼
┌──────────────┐   query  ┌────────────────────┐  cards  ┌───────────────┐
│ LLM servisi  ├──────────►│ MemoryService      ├────────►│ CardStore     │
└──────────────┘          │ (ingest/approve/   │         │ (bilgi kartları)│
                          │  forget/compact)   │         └───────────────┘
                          └────────────────────┘
```

1. **Sağlayıcı zinciri:** Embedding için `ollama → openai(text-embedding-3-small) → gemini`
   zinciri; ilki erişilemezse sonrakine düşer. Zincir `config.embeddingProviders` ile
   sıralanır. Bulut provider'ı için gizlilik notu UI'da açıkça gösterilir (Bölüm 3.1.4).
2. **Yerel-only mod:** `config.privacyMode: 'local-only'` etkinse zincir Ollama ile sınırlıdır;
   Ollama kapalıysa bellek yazılmaz (kuyruğa alınır), okuma son index'ten çalışmaya devam eder.
3. **Bilgi kartları:** Kullanıcının onayladığı, ajana otomatik enjekte edilen doğrulanmış
   bilgiler. Kart yaşam döngüsü: `draft → pending-review → approved → archived`. Bellek
   panelinden tek tıkla karta dönüştürme; kartlar `cards.jsonl`'de hash zinciriyle saklanır.
4. **Unutma hakkı:** `memory:forget` IPC; kayıt silinir, indeksten çıkar, denetimlenir.
   Toplu unutma: `memory:forget-matching {query}` semantik aramaya dayalı önerir.
5. **Reranking:** İlk k-20 geri çağırma, LLM ile `memory:rerank` (yerel küçük model)
   skorlanır; en üst 5 ajana enjekte edilir. Gizlilik modunda rerank atlanır.

### 3.1.3 Kart şeması

```json
{ "id": "card-0a1f", "content": "Projede TypeScript yerine vanilla JS kullanılır.",
  "category": "tercih", "confidence": 0.92, "sourceSession": "sess-442",
  "status": "approved", "created": "2026-08-15T…", "reviewedAt": "2026-08-15T…",
  "prev_hash": "…" }
```

### 3.1.4 Kabuller (AC)

- AC-1: Ollama kapalıyken yerel-only modda bellek yazımı kuyruğa alınır; Ollama dönünce işlenir.
- AC-2: Bir kartın unutulması tüm indeks ve kart kayıtlarından geri döndürülemez şekilde silinir
  (denetim kaydı hariç; denetim `memory:forget` eylemini hash zincirinde tutar).
- AC-3: Rerank, gizlilik modunda sessizce devre dışı kalır; UI'da "rerank kapalı" rozeti görünür.
- AC-4: Embedding zinciri fallback'inde geçiş denetimlenir (`memory:provider-fallback`).

## 3.2 Bilgi tabanı (Knowledge Base) (`src/main/knowledge/`)

### 3.2.1 Kavram

Bellek sohbetlerden doğar; **bilgi tabanı** kullanıcının bilinçli olarak yüklediği dokümanlardan
doğar: PDF, Markdown, kod dizinleri, web arşivi (kullanıcı başlatır). Amaç: "bu klasördeki
dokümanlara göre cevap ver" senaryosu.

### 3.2.2 Mimarisi

1. **Kaynak kaydı:** `knowledge:sources` IPC; `type: file|folder|url-archive`.
2. **Ayrıştırma:** Markdown doğrudan; PDF `pdf-parse` (zaten `pdf2image`/`poppler` bağımlılığı
   yok — sandbox'a kurulmuş araçlar yerine hafif JS ayrıştırıcı tercih edilir); URL arşivi
   `node-fetch` ile metin çıkarma + CSP'ye ek host yok (yalnızca kullanıcının verdiği URL).
3. **Parçalama (chunking):** 512 token hedefi, 64 token örtüşme; paragraf sınırı korunur.
4. **İndeksleme:** aynı `VectorStore`'a `namespace: 'kb'` ile yazılır; oturum belleğinden
   ayrı tutulur.
5. **Sorgu:** sohbet bağlamında ilgili KB parçaları otomatik çekilir; kaynak atıf (citation)
   mesaj balonunda küçük referans chip olarak gösterilir → tıklanınca kaynak paneli açılır.

### 3.2.3 Kabuller (AC)

- AC-1: 10 MB'lık bir PDF < 10 saniyede indekslenir (referans donanım, profille).
- AC-2: Atıf chip'leri her KB kaynaklı cümlede görünür; yanlış atıf test vakalarıyla kontrol
  edilir (sahte kaynak ID reddedilir).
- AC-3: Silinen kaynak namespace'ten tamamen çıkar; index yeniden derlenir (incremental).

## 3.3 Görsel iş akışı editörü (v4.0 başlık özelliği)

### 3.3.1 Neden

`workflow/engine.js` JSON/YAML yürütür; ancak iş akışı **yazmak** metin editöründe zordur.
Hedef: sürükle-bırak akış editörü, çıktısı yine aynı JSON şemaya.

### 3.3.2 Editör mimarisi (framework'suz)

1. **Tuval:** `canvas` değil SVG + absolute div; düğümler `workflow-node` div'leri, bağlantılar
   SVG `<path>` (bezier). Fare olayları vanilla; pan/zoom `transform` CSS ile (2D matris, kendi
   mini-implementasyon).
2. **Düğüm tipleri:** `trigger` (mesaj/görev), `agent` (ajan seçici), `tool` (araç çağrısı),
   `condition` (çıktı koşulu), `merge`, `output`. Her tip `workflow/node-types.js` registry'si
   ile tanımlanır; eklentiler yeni düğüm tipi kaydedebilir.
3. **Şema:** mevcut `{name, steps}` şemasına `graph` katmanı eklenir:

```json
{ "name": "Rapor", "trigger": { "type": "goal", "pattern": "*rapor*" },
  "nodes": [ { "id": "n1", "type": "agent", "config": { "agent": "arastirmaci" } },
             { "id": "n2", "type": "condition", "config": { "expr": "step_1.tokens < 500" } },
             { "id": "n3", "type": "agent", "config": { "agent": "yazar" } } ],
  "edges": [ { "from": "n1", "to": "n2" }, { "from": "n2", "to": "n3", "when": "false" } ] }
```

4. **Doğrulama:** editörden çıkan her graf `validateWorkflow`'tan geçer; döngü tespiti (DFS),
   erişilemeyen düğüm uyarısı, 20 adım sınırı.
5. **Kaydet/çalıştır:** tuval kaydı hem görsel hem JSON çift yönlü senkron; `ipc:4:workflow:run`
   mevcut `ipc:3:workflow:run`'ı sarmalar.

### 3.3.3 Kabuller (AC)

- AC-1: JSON → tuval → JSON dönüşümü yuvarlama hatası vermez (test suite'te 10 şema örneği).
- AC-2: 50 düğümlü graf, pan/zoom'da 60fps korur.
- AC-3: Geçersiz bağlantı (ajan→trigger) tuvalde kırmızıya döner ve kaydet engellenir.

## 3.4 Eklenti mağazası (v4.0)

### 3.4.1 Paket formatı

```
eklenti-adı/
  manifest.json      { id, name, version, description, icon(svg), tools:[], ui:[],
                       permissions:[], requires:{ ollamax: '>=4.0.0' } }
  main.js            vanilla JS; OllamaX eklenti API'si ile sınırlı
  assets/            (opsiyonel) küçük görseller, max 2 MB
```

İzinler: `tools.read`, `tools.write`, `tools.exec`, `memory.read`, `memory.write`,
`ui.panel`, `ui.composer-action`, `network.external`. `tools.exec` ve `network.external`
kombinasyonu mağazada **yüksek risk** rozeti alır ve kurulumda iki aşamalı onay ister.

### 3.4.2 API yüzeyi (OllamaX Plugin API v1)

```js
// eklenti main.js — sandbox proxy üzerinden
ollamax.tools.register({ name: 'ceviri', tier: 'read',
  schema: { path: 'string' },
  execute: async (args) => ({ translated: await ollamax.llm('gpt-5-mini', args.text) }) });
ollamax.ui.registerPanel({ id: 'ceviri-panel', title: 'Çeviri', render: (root) => { ... } });
ollamax.memory.get('ilgili sorgu');
ollamax.events.on('tool:result', (e) => { ... });
```

Sandbox: eklenti `require`'suz, `Function`/`eval` engelli, 500ms CPU zaman tavanı, kendi
`console`'u denetimlenir (mevcut `plugins/loader.js` yükleyicisi bu API'yi verecek şekilde
yeniden yazılır; ADR-003 korunur).

### 3.4.3 Mağaza deneyimi (topluğun ilk sürümü)

1. **Yerel mağaza:** kullanıcının `~/.ollamax/plugins-market` klasöründeki eklentileri tarar;
   kategori, arama, izin özet kartı.
2. **Güvenilir listeden kurulum:** ilk sürümde merkezi sunucu yok; `docs/COMMUNITY-PLUGINS.md`
   listesi (repo içinde) + kullanıcının kendi klasörü. Güvenilir liste, hash + imza (Ed25519,
   kurucu anahtar çifti) ile doğrulanır.
3. **Mağaza UI:** panel kartları; izin satırı rozetlerle; kurulum → yükleme → aktifleştirme;
   güncelleme kontrolü (manifest sürüm karşılaştırması).

### 3.4.4 Kabuller (AC)

- AC-1: Kötü niyetli eklenti (eval denemesi, 600ms CPU, izin dışı API) yükleyicide düşer;
  denetim kaydı `plugin:blocked` oluşur.
- AC-2: Mağaza kartı, eklentinin tüm izinlerini kurulum öncesi listeler (tek tıkla görülebilir).
- AC-3: Güvenilir liste dosyası imzasızsa mağaza boş döner (fail-closed).

## 3.5 Ses: TTS ve STT (v4.0)

### 3.5.1 Mimari

1. **STT (konuşmayı yazıya):** whisper.cpp tabanlı Ollama'nın `whisper` modeli veya
   `faster-whisper` JNI alternatifi yerine — bağımlılık disiplini gereği — Ollama üzerinden
   `ollama run whisper` çağrısı (ses dosyasını base64 yerine geçici dosyaya yazıp argümanla
   vererek). Cloud fallback: OpenAI Whisper API (opt-in, token gerekli).
2. **TTS (yazıyı sese):** yerel: Ollama desteklemiyorsa Chromium'un gömülü `speechSynthesis`
   (Electron renderer, sıfır bağımlılık); cloud fallback: API provider TTS uçları (opt-in).
3. **UI yüzeyleri:**
   - Kompozisyon kutusunda mikrofon düğmesi (basılı tut → kaydet → serbest bırak → STT).
   - Her asistan mesajında "oku" düğmesi (TTS); okuma sırasında dalga formu animasyonu
     (azaltılmış harekette statik).
   - Sesli mod: `mod+shift+v` ile açılan ses oturumu; konuş → yanıt okunur.

### 3.5.2 Kabuller (AC)

- AC-1: 30 saniyelik kayıt STT sonrası < 5 sn'de metne dönüşür (whisper mevcutken).
- AC-2: TTS cloud fallback'siz tamamen çevrimdışı çalışır (speechSynthesis).
- AC-3: Mikrofon izni yalnızca kullanıcı düğmeye bastığında istenir; otomatik istenmez.

## 3.6 Medya varlık yönetimi (v4.0)

1. `/image` çıktısı ve eklentilerin ürettiği görseller `generated/` altında
   `generated/{sessionId}/{uuid}.png` olarak kaydedilir; metadata `generated/manifest.jsonl`'de.
2. **Medya paneli:** sol araç çubuğuna `Medya` sekmesi; grid görünüm (sanal), oturum filtresi,
   arama (caption metadata), sağ tık → kopyala/aç/klasörde göster.
3. **Görsel sohbet:** mesaj balonuna gömülü küçük resim (thumbnail, tıklanınca lightbox).
4. `/image` komutu stil ön ekleri alır: `/image --style sketch --size 1024x1024 bir kedi`.
5. Kabuller: 1 GB tavan, dolunca en eski %25 budanır (denetimlenir); thumbnail < 100ms render.

## 3.7 Ekip altyapısı hazırlığı (v4.0 temel, v5.0 açılım)

v4.0'da ekip özelliğinin **yerel tek kullanıcılı temeli** atılır:

1. **Kullanıcı profili:** `config.profile` (ad, avatar-initials SVG, rol etiketi `owner`).
2. **Politika çerçevesi:** `config.policies` — özellik bayrakları (örn. `allowCloudProviders`,
   `allowPluginExec`, `maxWorkflowSteps`) tek merkezden. v5.0'da bu dosya takımda paylaşılır.
3. **Profil değiştirici:** Ayarlar'da profil kartı; çoklu profil desteği (kişisel/iş) — her
   profilin kendi config.overlay'i.
4. Kabuller: politika ihlali (örn. bulut provider çağrısı, `allowCloudProviders: false` iken)
   reddedilir ve denetimlenir; test suite'te 5 ihlal senaryosu.

## 3.8 Bölüm 3 toplu kabul testleri

| # | Kapsam | Beklenen |
| --- | --- | --- |
| T-K1 | Embedding zinciri fallback'leri (mock provider'larla) | Zincir sırasıyla dener, sonu başarılı |
| T-K2 | Kart yaşam döngüsü draft→approved→archived | Her geçiş denetimlenir |
| T-K3 | KB: 3 PDF indeksle + sorgu + atıf | Atıflar doğru kaynaklara işaret eder |
| T-K4 | İş akışı editörü: JSON↔graf yuvarlama | 10 şema örneği birebir döner |
| T-K5 | Eklenti sandbox: 6 kötü niyet senaryosu | Hepsi bloklanır, denetimlenir |
| T-K6 | Ses: STT mock, TTS speechSynthesis | Modlar bağımsız çalışır |
| T-K7 | Medya: 200 görsel panel, tavan budama | Grid akıcı, budama denetimlenir |
| T-K8 | Politika: 5 ihlal senaryosu | Hepsi reddedilir |

---

# Bölüm 4 — Platform ve Dağıtım Upgrade'leri (v4.0 → v5.0)

## 4.1 Otomatik güncelleme (F1.4'ün nihai uygulaması)

1. **electron-updater** v6 kurulur; `build.win/portable` hedefi auto-update desteklemez —
   dağıtım hedefi platform bazında revize edilir: Windows `nsis`, macOS `dmg` + `zip`,
   Linux `AppImage` (zaten var; auto-update AppImage'da çalışır).
2. **Güncelleme kanalları:** `stable` ve `beta`; `config.updateChannel`. Beta kullanıcıları
   `docs/RELEASE-NOTES.md` akışını izler.
3. **UI:** Ayarlar → Güncelleme sayfası: sürüm, kanal, "kontrol et" düğmesi, indirme ilerleme
   çubuğu, "yeniden başlat" önerisi. Güncelleme indikten sonra bildirim merkezi uyarısı düşer.
4. **Güvenlik:** güncellemeler code-sign ile doğrulanır (bölüm 4.4); imzasız paket reddedilir.
5. Kabuller: güncelleme kontrolü manuel tetiklenebilir; indirme kesilirse kaldığı yerden devam
   eder; rollback (önceki sürüm klasörü korunur) ilk sürümde yarı-otomatiktir.

## 4.2 Hata raporlama ve crash recovery (F1.7)

1. **Main process crash recovery:** `uncaughtException` / `unhandledRejection` yakalanır; son
   oturum + aktif görev checkpoint'i `crash-state.json`'a yazılır. Bir sonraki açılışta
   "OllamaX beklenmedik kapandı; kaldığın yerden devam edilsin mi?" banner'ı gösterilir.
2. **Renderer crash:** `webContents` `render-process-gone` dinlenir; pencere yeniden yüklenir,
   oturum geri yüklenir.
3. **Hata günlüğü:** `logs/app.log` (rotating, 5×2MB); hata ekranında (yerel, kullanıcı
   onayıyla) log özetini kopyalama. **Uzaktan gönderim yok**; ilk sürümde telemetri tamamen
   yereldir (4.3).
4. Kabuller: main crash sonrası kayıp mesaj sayısı 0 (checkpoint kanıtı); renderer toparlama
   < 3 sn.

## 4.3 Telemetri (opt-in, yerel-öncelikli)

1. `ipc:4:telemetry:*` — UI metrikleri (1.8.4), ajan metrikleri (adım sayısı, onay oranı,
   hata oranı), performans metrikleri (render fps, arama gecikmesi).
2. **Yerel pano:** Ayarlar → Telemetri sayfasında son 7 günün trend grafikleri (saf SVG,
   bağımlılıksız çizim).
3. **Dışa aktarım:** JSON/CSV dışa aktarım; uzak sunucu yok.
4. Kabuller: varsayılan kapalı; açıldığında hangi metriklerin toplandığı şeffaf listelenir;
   `local-only` gizlilik modu telemetriyi de sınırlandırır (uzak çağrı yok zaten).

## 4.4 Profesyonel dağıtım zinciri (F5.4'ün tamamlanması)

1. **Code signing:** macOS Developer ID + Windows Authenticode (sertifika kullanıcı tarafından
   sağlanır; `docs/SIGNING.md` rehberi yazılır). Sertifikasız build yine çalışır (uyarı rozeti
   `docs/DEPLOY.md`'de belgelenir).
2. **Notarization:** macOS için `electron-builder` `notarize` plugin'i; Apple ID app-specific
   parola ile.
3. **GitHub Releases:** `scripts/release.js` — sürüm etiketi + draft release + varlık yükleme
   (PAT ile; Bölüm 4.6 CI). `CHANGELOG.md`'den sürüm notu otomatik çekilir.
4. **Platform matrisi:**

| Platform | Hedef | Güncelleme |
| --- | --- | --- |
| Windows | NSIS + portable | electron-updater (NSIS) |
| macOS | DMG + zip | electron-updater (DMG) + notarize |
| Linux | AppImage | AppImage auto-update |

## 4.5 CI/CD olgunluğu

1. **GitHub Actions:** `ci.yml` — lint, test, audit, derleme (Linux headless + Windows)
   her push'ta; `release.yml` tag'de dağıtım.
2. **E2E test:** Playwright (Electron modu) — 10 temel akış: açılış, sohbet, model değiştirme,
   bellek arama, iş akışı çalıştırma, eklenti kurma, tema değişimi, komut paleti, kısayollar,
   crash toparlama.
3. **Görsel regresyon:** Playwright screenshot + `pixelmatch` ile temel ekranların (sohbet,
   canvas, palet) regresyon kontrolü; eşik %0.5.
4. **Kalite kapısı:** PR'da lint+test+audit yeşil olmadan merge engeli (branch protection
   önerisi `docs/DEVELOPMENT.md`'ye eklenir).

## 4.6 Ollama Fleet Yönetimi (F6.4)

1. **Çoklu Ollama uç noktası:** `config.ollamaEndpoints` dizisi; her uç `alias + host +
   health` tutar. Sağlık probu arka planda (30 sn).
2. **Model dağılımı:** uç bazında model listesi; sohbet/model seçicide `uç · model` formatı.
3. **Yük dağılımı:** `routing: 'round-robin' | 'least-loaded' | 'manual'`.
4. **UI:** Ayarlar → Ollama uçları kartları; ekle/kaldır/prob-geçmişi.
5. Kabuller: bir uç düşerken aktif sohbetler diğer uca taşınmaz (kesintisizlik), yeni istekler
   sağlıklı uca yönlenir; uç ekleme denetimlenir.

## 4.7 Güvenlik upgrade'leri

1. **İzin bütçeleri:** her araca oturum başı kota (`config.toolBudgets`): max çağrı, max yazım
   boyutu, max terminal süresi. Aşım → ajan hata alır, kullanıcıya bilgi verilir.
2. **Gizli tarama:** `create_file`/`append_file` içeriklerinde olası API anahtarı desenleri
   (regex: `sk-[A-Za-z0-9]{20,}`, `ghp_...` vb.) tespit edilirse **yerel** uyarı gösterilir
   (dışarıya hiçbir şey gitmez); kullanıcı onayıyla devam.
3. **CSP güncellemesi:** `ipc:4` yüzeyi eklendikçe CSP dokunulmaz kalır; yeni CDN ihtiyacı
   olursa (örn. ikon) yerine iç SVG kalır (kural).
4. **Bağımlılık denetimi:** `npm audit` CI kapısı; `overrides` ile transitif düzeltmeler
   `docs/DEPENDENCY-POLICY.md` ile belgelenir.

## 4.8 Bölüm 4 toplu kabul testleri

| # | Kapsam | Beklenen |
| --- | --- | --- |
| T-P1 | Update UI akışı (mock updater) | Kanal/kontrol/ilerleme doğru |
| T-P2 | Main crash → toparlama banner → devam | Mesaj kaybı 0 |
| T-P3 | Telemetri opt-in kapısı | Varsayılan kapalı; açılınca şeffaf liste |
| T-P4 | CI: lint+test+audit hepsi CI'da yeşil | Kapı çalışır |
| T-P5 | Fleet: 2 mock uç, biri düşer | Yeni istekler sağlıklı uca |
| T-P6 | Araç bütçesi aşımı | Red + denetim kaydı |
| T-P7 | Gizli tarama: anahtar desenli içerik | Yerel uyarı, dış sızıntı yok |

---

# Bölüm 5 — Ekler

## EK-A — IPC Yüzeyi v4 Tam Kataloğu

`ipc:3:*` yüzeyi değişmez (geriye uyumluluk). Aşağıdaki uçlar **yeni** eklenen `ipc:4:*`
kataloğudur. Her uç `src/main/ipc-v4-handlers.js` altında registry'ye kaydedilir; preload
whitelist'ine (`src/preload.js`) simetrik olarak eklenir.

| Uç | Yön | Payload | Kaynak bölüm |
| --- | --- | --- | --- |
| `ipc:4:workspace:layout:get` | renderer→main | — | 1.2 |
| `ipc:4:workspace:layout:set` | renderer→main | `{key, value}` | 1.2 |
| `ipc:4:palette:register` | renderer→main | `{group, label, keywords, ...}` | 1.4 |
| `ipc:4:theme:get` / `set` | ↔ | `{name, accent}` | 1.3 |
| `ipc:4:agent:plan:get` | renderer→main | `{sessionId}` | 2.2 |
| `ipc:4:agent:approval:mode` | renderer→main | `{mode, rule?}` | 2.4 |
| `ipc:4:agent:approval:respond` | renderer→main | `{requestId, decision, remember?}` | 2.4 |
| `ipc:4:agent:task:history` | renderer→main | `{limit}` | 2.7 |
| `ipc:4:agent:task:undo` | renderer→main | `{taskId}` | 2.7 |
| `ipc:4:memory:providers` | renderer→main | — | 3.1 |
| `ipc:4:memory:card:create` / `list` / `update` | ↔ | kart şeması | 3.1 |
| `ipc:4:memory:forget` / `forget-matching` | renderer→main | `{id}` / `{query, limit}` | 3.1 |
| `ipc:4:memory:rerank` | main→(llm) | `{query, candidates}` | 3.1 |
| `ipc:4:knowledge:sources:list` / `add` / `remove` | ↔ | kaynak şeması | 3.2 |
| `ipc:4:knowledge:search` | renderer→main | `{query, limit}` | 3.2 |
| `ipc:4:workflow:graph:save` / `load` | ↔ | graf şeması | 3.3 |
| `ipc:4:workflow:run:v2` | renderer→main | `{workflowId, vars}` | 3.3 |
| `ipc:4:plugin:market:list` / `install` / `update` | ↔ | paket meta | 3.4 |
| `ipc:4:speech:stt` | renderer→main | `{audioPath}` | 3.5 |
| `ipc:4:speech:tts:start` / `stop` | ↔ | `{text, voice?}` | 3.5 |
| `ipc:4:media:list` / `thumbnail` / `prune` | ↔ | `{filter}` | 3.6 |
| `ipc:4:profile:get` / `set` / `switch` | ↔ | profil şeması | 3.7 |
| `ipc:4:policy:get` / `set` | ↔ | politika şeması | 3.7 |
| `ipc:4:update:check` / `download` / `status` | renderer→main | — | 4.1 |
| `ipc:4:telemetry:ui-metrics` | renderer→main | `{metric, value}` | 1.8/4.3 |
| `ipc:4:ollama:endpoints:list` / `add` / `probe` | ↔ | uç şeması | 4.6 |
| `ipc:4:tool:budget:get` / `set` | ↔ | bütçe şeması | 4.7 |

## EK-B — Veri Modeli Şeması (v4 Tam)

v3 şeması `docs/ROADMAP.md` EK-G'dedir; v4'e eklenen varlıklar:

| Varlık | Dosya | Şema versiyonu | Not |
| --- | --- | --- | --- |
| `workspace.json` | userData/ollamax/config.json içi | 4 | Bölüm 1.2.2 |
| `cards.jsonl` | userData/ollamax/memory/ | 1 | Bilgi kartları, hash zinciri |
| `kb/{sourceId}/manifest.json` | userData/ollamax/knowledge/ | 1 | KB kaynağı meta |
| `tasks/{goalHash}.json` | userData/ollamax/checkpoints/ | 1 | Görev checkpoint |
| `generated/manifest.jsonl` | userData/ollamax/generated/ | 1 | Medya meta |
| `plugins-market/{id}/manifest.json` | userData/ollamax/plugins-market/ | 1 | Mağaza meta |
| `telemetry/{date}.jsonl` | userData/ollamax/telemetry/ | 1 | Yerel metrik |
| `logs/app.log` | userData/ollamax/logs/ | 1 | Uygulama günlüğü |

Tüm yeni şemalar `config-migrations.js`'e v4 migration bloğu olarak eklenir; okuma zamanında
şema doğrulaması zorunludur, bozuk şema varsayılan değerle onarılır ve `config:repaired`
denetim kaydı düşer.

## EK-C — Haftalık Sprint Ayrımı (v3.1–v4.0)

Tek geliştirici varsayımıyla 12 sprintlik plan (hafta = 5 iş günü):

| Sprint | Odak | Teslimat |
| --- | --- | --- |
| W1–W2 | 1.2 Workspace Layout + 1.3 tema altyapısı | Dört bölge düzeni, 3 tema |
| W3 | 1.4 Command Palette + 1.5 kısayollar | Palet, 12 kısayol |
| W4 | 1.6 onboarding + 1.7 a11y + 1.8 performans | Tur, a11y raporu, sanal liste |
| W5–W6 | 2.2–2.5 Agent Canvas, araç kartları, onay modları, durum çubuğu | Canvas v1 |
| W7 | 2.6 orkestrasyon + 2.7 görev zaman çizelgesi | Sub-agent görünümü, undo |
| W8–W9 | 3.1 Bellek 2.0 + 3.2 Bilgi tabanı | Embedding zinciri, kartlar, KB |
| W10 | 3.3 Görsel iş akışı editörü | Graf editörü v1 |
| W11 | 3.4 eklenti mağazası + 3.5 ses | Mağaza v1, STT/TTS |
| W12 | 3.6 medya + 3.7 profil/politika | Medya paneli, profil |
| W13–W14 | Bölüm 4 platform: updater, crash, telemetri | Update UI, recovery |
| W15–W16 | CI/E2E, fleet, güvenlik, signing, ilk yayın hazırlığı | CI kapısı, release |

Her sprint sonundaROADMAP Bölüm 11.3 sürüm öncesi kontrol listesinin o sprint'e indirgenmiş
hali koşar: test yeşil, lint temiz, audit 0, doküman güncel.

## EK-D — Performans Bütçesi (EK-F güncellemesi)

ROADMAP EK-F'ye v4 bütçesi eklenir:

| Metrik | Tavan | Ölçüm noktası |
| --- | --- | --- |
| Uygulama soğuk açılış | < 2.5 sn | ilk pencere görünürlüğü |
| Oturum değişimi | < 300 ms | 10k mesajlık oturum |
| Bellek arama (100k kayıt) | < 500 ms | palet açılışından sonuca |
| Fuzzy arama (10k girdi) | < 16 ms | palet yazma |
| Graf editörü pan/zoom | 60 fps | 50 düğüm |
| Token akışı jank | < %1 frame | raf başına 1 DOM güncelleme |
| PDF indeksleme | < 10 sn / 10 MB | KB ekleme |
| Araç onay modalı gecikmesi | < 50 ms | çağrıdan görünürlüğe |

## EK-E — Test Stratejisi Güncellemesi

1. **Birim (Jest, mevcut):** 74 → hedef 220+ test; her bölümün AC'leri jest modülleriyle
   örtülür (`tests/ui-layout.test.js`, `tests/agent-canvas.test.js`, `tests/memory-v2.test.js`,
   `tests/workflow-graph.test.js`, `tests/plugin-sandbox.test.js`, `tests/speech.test.js`,
   `tests/policy.test.js`).
2. **E2E (Playwright-Electron, yeni):** Bölüm 4.5'teki 10 akış; CI'da `test:e2e` scripti.
3. **Görsel regresyon:** temel ekran screenshot'ları `tests/visual/baseline/` altında;
   `pixelmatch` %0.5 eşik.
4. **A11y statik:** `tests/a11y-static.test.js` — üretilen HTML örneklemleri taranır.
5. **Performans:** `tests/perf/` — mock verili benchmark'lar; tavan ihlali CI'yı kırar.
6. **Mutasyon testi (isteğe bağlı, v5.0):** `stryker` ile kritik modüllerde (audit-log,
   policy) mutant coverage hedefi %60.

## EK-F — Geriye Dönüş Stratejisi (v4 sürümleri için)

Her v4 özelliği `config.features.{feature}: boolean` bayrağı arkasında başlar. Bayraklar
varsayılan `true` (canvas, palet) ve `false` (mağaza, sesli mod) olarak ayarlanır. Bayrak
`false` iken o özelliğin IPC uçları `feature-disabled` hatası döner. Sürüm stabilleşince
bayrak kaldırılır; **en fazla 3 sürüm** bayraklı yaşar, sonra koddan çıkar (temizlik sprinti).

## EK-G — Riskler ve Azaltmalar

| Risk | Olasılık | Etki | Azaltma |
| --- | --- | --- | --- |
| Framework'suz graf editörü karmaşıklaşır | Orta | Yüksek | Düğüm tipleri registry'de; ilk sürümde sadece 6 tip; zoom/pan minimal |
| Ollama embedding kalitesi yetersiz | Orta | Orta | Zincir fallback; rerank; kullanıcı provider seçimi |
| Electron-updater portable hedef çakışması | Yüksek | Orta | Hedef matrisi 4.1'de revize edildi |
| Eklenti sandbox kaçışı | Düşük | Kritik | eval/Function engeli + zaman tavanı + izin proxy'si; kod incelemesi zorunlu |
| v4 IPC yüzeyinin CSP/whitelist eşiği | Düşük | Orta | Preload whitelist simetrik güncelleme kuralı; otomatik test |
| Tek geliştirici darboğazı | Yüksek | Orta | Sprint planı öncelik sıralı; v4.0 çekirdeği (bellek+canvas) ilk |

## EK-H — Sözlük

| Terim | Anlam |
| --- | --- |
| Agent Canvas | Ajan görevinin plan/araç/bağlam bantlarıyla canlı yüzeyi |
| Bilgi kartı | Kullanıcı onaylı, ajana otomatik enjekte edilen doğrulanmış bilgi |
| Bilgi tabanı (KB) | Kullanıcının bilinçli yüklediği dokümanların indekslenmiş hali |
| Command Palette | Komut/oturum/bellek/model aramasının merkezi fuzzy arayüzü |
| Embedding zinciri | Yerel→bulut fallback'li gömme sağlayıcı sırası |
| Kalıcı onay kuralı | Araç+glob desen için oturumlar arası onay atlaması |
| Sanal liste | Görünür pencere dışındaki satırları render etmeyen liste bileşeni |
| Telafi (compensation) | Geri alınamayan araç eylemine karşı önerilen karşıt eylem |

---

# Sonuç ve İlk Adımlar

Bu plan, OllamaX'i v3.0 "çalışan ajan stüdyosu"ndan v5.0 "pazar lideri ajan platformu"na
taşıyan arayüz ve özellik yolunun mühendislik dokümanıdır. ROADMAP'in stratejik katmanıyla
çelişmez; onu implementasyon seviyesine indirir. Uygulama sırası EK-C sprint planında
belirtilmiştir ve ilk blok (W1–W2: workspace layout + tema altyapısı) diğer tüm blokların
temelidir.

Plan üzerinde çalışmaya başlamak için: bu dokümanı onaylayıp "uygula" demeniz yeterlidir;
EK-C sırasına göre sprint sprint ilerleyip her teslimatta yeşil kapı koşulları sağlanır.
