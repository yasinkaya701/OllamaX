# Eski Sunucu Dosyaları (Legacy Servers)

Bu dizindeki iki dosya, Krevyx Ultra'nın ilk dönemlerinde kullanılan **eski (deprecated)** araçlardır ve artık uygulamanın çalışması için gerekli değildir.

## `proxy_server.js` (Node.js)

Ollama yerel uç noktasına (`localhost:11434`) tarayıcı tabanlı arayüzün CORS kısıtlamalarını aşarak ulaşmasını sağlayan basit bir ters proxy idi. **Artık kullanılmıyor** çünkü Krevyx Ultra, Electron ana süreci üzerinden (`src/main.js`) doğrudan ve güvenli biçimde Ollama ile iletişim kurmaktadır. Ana süreç zaten SSRF koruması (`src/main-security.js`) içerdiği için bu eski proxy'ye gerek yoktur.

## `stats_server.py` (Python)

Sistem belleği istatistiklerini (`vm_stat` üzerinden macOS) JSON olarak sunan küçük bir HTTP sunucusuydu. **Artık kullanılmıyor** çünkü bu işlevsellik Electron ana sürecindeki `get-stats` / `app-health` IPC uç noktalarına taşınmıştır ve tüm platformlarda (Windows/macOS/Linux) çalışır.

## Öneri

Bu dosyalar yalnızca tarihsel referans olarak saklanmıştır. Geliştirme sırasında bunları kullanmayın; gerekirse silinebilirler.
