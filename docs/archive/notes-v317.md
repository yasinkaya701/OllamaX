# v3.17 Uygulama İçi Geliştirme Notları

## Mimari kurallar (mevcut)
- Main ↔ Renderer: `window.krevyxApi.invoke('ipc:3:<kanal>', payload)` — preload `ipc:3:*` ad alanını otomatik izin verir (INVOKE kontrolü: `channel.startsWith('ipc:3:')`)
- Yeni handler'lar `src/main/ipc-v3-handlers.js` içinde `handler('...', ...)` ile; kanal adı `ipc:3:xxx`
- Renderer script'leri CDN'li (dompurify, hljs, xterm) + local app.js; vanilla JS
- Şablon motoru: `src/main/agents/templates.js` (listTemplates, saveTemplate, interpolatePrompt, templateDir, bundledTemplateDir)
- Eklenti loader: `src/main/plugins/loader.js` (listPlugins, uninstallPlugin, validateManifest, sandbox)
- UI konvansiyonları: `.modal`, `.modal-box`, `.sec-header`, `.theme-chips`, `.theme-chip`, `.ghost-btn`, `.primary-btn`, `.small-btn`, `.empty-note`, ayar modalı `#settings-modal`

## v3.17 özellik seti
1. **Şablon yönetimi UI** (settings modalına "Şablonlar" sekmesi / panel):
   - `ipc:3:templates-list` → canlı liste (gömülü + kullanıcı), kategori filtresi
   - Şablonu prompt alanına uygulama (mevcut click davranışı korunur)
   - Yeni şablon kaydetme (ad, kategori, prompt) + düzenleme (user şablonları) + silme (yalnız user)
2. **Şablon paylaşımı:**
   - Dışa aktarma: `JSON.stringify` + kopyala (`navigator.clipboard`, fallback)
   - İçe aktarma: dosya seçici (input type=file) veya yapıştır, doğrulama (id, label, prompt)
3. **Eklenti yönetimi UI** (settings modalına "Eklentiler" paneli):
   - `ipc:3:plugins-list` → id, ad, sürüm, durum, hata sayacı, panel listesi
   - Ayar panelleri render (plugin tarafından eklenen HTML) — sandboxlı
   - Kaldırma butonu
4. **Gömülü şablon paketi:** `src/shared/agent-templates/starter/` altında 3 gömülü şablon (kod-inceleme, refactor, daily-standup) — TR/EN label

## Yeni IPC kanalları
- `ipc:3:templates-list` (var, yeniden kullanılacak — renderer kullanmıyordu)
- `ipc:3:templates-save` (var)
- YENİ: `ipc:3:templates-delete` → deleteTemplate(id)
- YENİ: `ipc:3:plugins-install` → installPlugin({manifest, code}) loader'a

## Test stratejisi
- Jest testleri (jest var: `pnpm test`) → templates.js + loader için birim testleri
- UI: app.js içinde renderTemplatesModern() fonksiyonu settings açılışında çağrılır
- Versiyon: v3.17.0 etiketi → CI release

## İlerleme (tamamlanan backend, 16 Ağu 12:55)
- `src/main/agents/templates.js`: `deleteTemplate(id)` eklendi ✓
- `src/main/plugins/loader.js`: `installPlugin({manifest, code})` eklendi + `globalIpcInvoke` tutucu (loadAll'da set edilir) ✓
- `src/main/ipc-v3-handlers.js`: yeni handler'lar — `templates-delete`, `templates-import` ({id,label,category,prompt}), `plugins-install` ({manifest, code}) ✓
- `src/shared/agent-templates/starter/`: 3 gömülü şablon (code-review, refactoring, daily-standup) ✓
- TODO YOK: bunlar yapıldı — kontrol: git status ile doğrula

## Kalan UI işi (renderer)
app.js içinde YENİ modül: `renderEcosystemPanels()` fonksiyonu settings modalı açılışında çağrılacak.
Settings modal markup: `#settings-modal` (index.html ~519. satır), footer `#btn-save-settings`, modal açma: settings-btn id'li buton (94. satır) → app.js'te `openModal('settings-modal')` çağrısı var mı kontrol et.
UI planı: modal içinde iki yeni panel:
1. "Şablonlar" paneli: `#settings-templates` — canlı liste (ipc:3:templates-list), kategori piller, şablonu prompt'a uygulama, yeni şablon formu (id, label, category, prompt textarea), sil butonu (user/imported), dışa aktarma (JSON kopyala), içe aktarma (dosya seçici + yapıştır).
2. "Eklentiler" paneli: `#settings-plugins` — yüklü eklentiler listesi (ipc:3:plugins-list), durum badge, eklenti ayar panelleri (DOMPurify ile insert), kurulum formu (manifest JSON + kod textarea veya dosya), kaldır butonu.
- DOMPurify CDN yüklü: `window.DOMPurify`
- Stil: mevcut `.theme-chips`/`.theme-chip`, `.ghost-btn`, `.primary-btn`, `.small-btn`, `.empty-note`, `.cost-summary-card` kullan
- app.js sonundaki init zincirine hook: `bindSettings()` fonksiyonunu bulup içine ekle veya modal açma dinleyicisine.

## Test + yayın
- pnpm test (jest) → templates.js ve loader.js için yeni test dosyası `test/templates.test.js` ve `test/plugins.test.js`
- pnpm lint + eslint fix
- Git commit → `v3.17.0` etiketi → push → CI otomatik derler
- Web sitesi: todo.md Faz 14
