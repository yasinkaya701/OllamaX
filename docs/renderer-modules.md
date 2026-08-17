# Renderer modülerleştirme planı (v3.22)

Öz-eleştiri raporu maddesi 4: `src/renderer/app.js` (3708 satır) fonksiyonel alanlara ayrıldı.
İşlevsellik değişmez; tüm fonksiyonlar aynı dosyada script yüklemesiyle global olarak erişilebilir kalır
(app.js içindeki `<script>` etiketleri doğrudan `window` globalinde fonksiyon tanımlar,
bu yüzden modüller global alana yüklenir).

## Modül haritası

| Modül | Satır aralığı (yaklaşık) | İçerik |
|---|---|---|
| `core.js` | 1–570, 788–880 | DOM helpers (el, esc, escHtml, toast, error banner, safeCopy), init, model katalog, klavye kısayolları |
| `session.js` | 947–1120 | loadState/save/schedulePersist/loadPersistedSession, model rows |
| `agents.js` | 1120–1250 | renderAgentList/Strip, project onboarding, team presets |
| `chat.js` | 2883–3280 | sendMessage, runAgent, bubbles, delegation queue, chat history, md, scrollChat |
| `composer.js` | 1661–1800, 2087–2114 | composer modu, bağlam dosyaları, görevler, quest, global stream |
| `github.js` | 574–745, 2279–2340 | featured repos, repo tazeleme, GitHub arama sonuçları |
| `terminal.js` | 1286–1380 | gömülü terminal |
| `orchestration.js` | 2358–2523 | orkestrasyon ajan keşfi, zincir, head seçimi |
| `settings.js` | 2523–2883 | saveAgent, API anahtarları, maliyet, güvenlik, güvenlik görünümü, profiller |
| `ecosystem.js` | 3356–3708 | şablonlar, eklentiler, ekosistem panelleri |
| `ipc.js` | 2114–2279 | IPC binding |

## Kurallar
1. Fonksiyonlar fonksiyon bildirimi (function declaration) olduğu için modül script'leri
   aynı global kapsamı paylaşır — yeniden bağlama gerekmez.
2. Modüller `src/renderer/modules/` altında, index.html'e sırayla eklenir (dependency order).
3. app.js artık yalnızca çekirdek + `loadState`/`bindAll`/`bindIPC` zincirini tutar.
4. Her modül başında stil yorumu: Emerald Ledger renk dili (siyah/emerald/mono).

## Doğrulama
- Tam test suite (jest 18 paket) + `npm run lint`/build sonrası Electron'la görsel kontrol.
