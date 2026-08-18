# STYLE-326 — v3.26 modül yazım sözleşmesi

Tüm yeni modüller bu kurallara uyar. STYLE-325.md kuraları aynen geçerlidir; aşağıdakiler eklenir.

1. **Başlık**: `'use strict';` ile başla; üstte 15-30 satırlık JSDoc bloğu: dosya adı, kısım (Kapsam), davranış kuralları (Davranış), dönüş şekilleri (Dönüş), test notu (Test).
2. **Dönüş şekli**: her API `{ ok: boolean, ... }` döndürür; hata durumunda `{ ok: false, error: 'TR mesaj' }`. ASLA throw etme (test beklenmeyen hatalar için).
3. **Dil**: hata ve durum mesajları Türkçe, anahtar adları (role, action, step types) İngilizce.
4. **Yol/portability**: Windows uyumlu ol — asla `.*\//` benzeri slash regex'le yol ayrıştırma; `path.basename`, `path.join`, `path.dirname` kullan. `os.homedir()` ile `~` genişletme.
5. **Persist**: veri dosyaları `os.homedir()` altındaki `.krevyx/<modül>` dizininde; mkdirSync recursive; yazma try/catch.
6. **Test temizleyici**: her modül `testOnlyClear()` (veya benzeri ad) export eder; test dosyası `afterEach` ile çağırır.
7. **Timer**: setInterval kurarsa temizle; uzun bekleyen zamanlayıcılar `unref()` alınsın (jest open handle önler).
8. **Eslint**: 0 hata; `no-unused-vars`, `no-constant-condition`, `no-unreachable`, `no-useless-escape` kontrolü; `??` sabit-nullish kullanma.
9. **Regex**: `/i` flag'li derle; dosya içi `(?i)` YASAK. `new RegExp(pattern, 'i')` kullan.
10. **Bağımlılık**: yalnızca Node built-in'leri + repo içindeki modüller. electron/3rd-party gerektirme.
11. **Test dosyası**: `tests/test-v326-<kısım>.test.js`; describe blokları modül adıyla; her test bağımsız (testOnlyClear sayesinde); async işler `await` ile; timeout testlerinde jest fake timers.
12. **Satır hedefi**: her modül ~350-700 satır; toplam ~52k yeni satır + 490 test.
13. **Version**: modül üst bilgisi `@version 3.26.0`.
