# Krevyx v3.25 — Yazım Kuralları (TÜM YAZARLAR İÇİN)

Bu proje, Krevyx (yasinkaya701/OllamaX) Electron uygulamasıdır. Sürüm 3.25.0'a yükseltme yapılıyor. Aşağıdaki kurallar kesindir.

## Genel kurallar

- Pure JavaScript (CommonJS, `require`/`module.exports`), Node 18+ uyumlu. TypeScript KULLANMA.
- Her dosya `'use strict';` ile başlar. Üstte JSDoc tarzı başlık bloğu: modül adı, sürüm etiketi (v3.25), ne yaptığı, örnek kullanım.
- Türkçe yorum ve değişken/alan adları proje standardıdır (örn. `gorevler`, `onayla`, `durum`). Fonksiyon adları Türkçe, export edilen API İngilizce/Türkçe karışık olabilir ama tutarlı olsun; bu doküman hangi modülün hangi adları export ettiğini belirler — ona sadık kal.
- Electron bağımlılığı YOK: main modülleri saf Node.js olmalı (`child_process`, `fs`, `path`, `os`, `crypto`, `events`, `http/https` serbest). Electron'a erişim lazy require ile yapılır: `try { require('electron') } catch { /* cli */ }` gerekirse; mümkünse hiç.
- Döngü kırmak için lazy require: modüller birbirini gerektirirse `module.exports` üzerinden alın.
- Testlenebilirlik: her dış bağımlılık (fs, http get, spawn, LLM çağrısı) opsiyonel `options` objesi ile inject edilebilmeli. Varsayılanlar modül içinde.
- Hata yönetimi: asla throw etme; `{ ok: false, error: 'mesaj' }` döndür. Beklenmeyen hatada yakala-döndür.
- Zamanlayıcılar her testte temizlenebilsin diye `setInterval/setTimeout` referanslarını sakla; modülde `stop()`/`destroy()` fonksiyonu olsun.
- `Buffer`, `crypto` (Node dahili) serbest. `child_process.spawn` kullanılırsa `shell: false`, argüman listesi array.
- Yollar: `~/.krevyx/` dizini `path.join(os.homedir(), '.krevyx')` ile. Dosya yazmadan önce dizin yoksa `fs.mkdirSync(..., { recursive: true })`.
- JSONL formatı audit loglar için standarttır: satır başına tek JSON, `JSON.stringify` + `\n`.

## IPC entegrasyon noktası (main modülleri için)

ipc-v3-handlers.js'te `handler(name, fn)` kullanılır. Yeni modüller kendi `registerIpcHandlers(mainWindow)` fonksiyonu export etmeli (ipcMain kullanıyorsa lazy). Renderer preload'un `INVOKE` kümesi `ipc:3:*` prefix'ini zaten serbest bıraktığı için yeni handler adları `plan-*`, `queue-*`, `hooks-*`, `trust-*` prefix'leriyle tanımlansın.

## Renderer modüller (src/renderer/modules/*)

- Global kapsam: `api` (window.krevyxApi), `q(sel)` (document.querySelector), `toast(msg, type)`, `log(msg, level)`, `esc(str)` (HTML escape), `save()`/`load()` yerel durum fonksiyonları app.js'te tanımlı.
- Her modül `async function initXxx()` export eder ve `window.addEventListener('DOMContentLoaded', () => void initXxx())` ile kendini başlatır.
- DOM elemanları `q('#id')` ile; yoksa sessizce dön (app.js'te placeholder olmasa da modül çalışır kalmalı).
- HTML enjeksiyonu `innerHTML` yerine `document.createElement` + `esc()` ile.
- Stil sınıfları projenin mevcut desenlerini takip etsin: `-panel`, `-row`, `-btn`, `-badge`, `-empty`, `osc-*`, `rc-*` gibi küçük ön ekler; kendi ön ekinle tutarlı ol (örn. plan modülü: `pl-*`, kuyruk: `qu-*`, hook: `hk-*`, trust: `tr-*`, diff: `df-*`).
- Tema: koyu zemin + zümrüt aksan (`--primary` CSS değişkeni). `bg-[oklch...]` hardcode yapma; sınıf adları tanımla, renkler index.css'teki token'larla.

## Testler (tests/v325-*.test.js)

- Jest 29, `@jest-environment node` (renderer testi `@jest-environment jsdom`).
- Electron mock gerektiğinde dosyanın EN ÜSTÜNDE `jest.mock('electron', ...)` kurulmalı.
- Her `describe` bloğunda 10-25 arası `test()`, anlamlı isimler: "geçerli girdide X", "boş girdide ok=false", "edge case Y toleransı".
- inject edilebilir bağımlılıklarla gerçek fs/http/spawn OLMADAN test et.
- Jest zamanlayıcıları gerektiğinde `jest.useFakeTimers()`.
- Dosya başında JSDoc bloğu: modül adı, v3.25, kapsam listesi.

## Git/commit notu

Yeni dosyalar `src/main/plans/*`, `src/main/agents-ext/*`, `src/main/trust/*`, `src/renderer/modules/*`, `src/main/cli/*` altına. package.json version 3.25.0 yapılırken tek bir commit atılacak; sen sadece kodunu yaz, sürüm numarasını değiştirme.
