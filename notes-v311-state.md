# v3.11 Çalışma Notları (iç durum — dev notu)

## Kullanıcı isteği (mevcut oturum)
1. Repo entegrasyonunu otomatik yap (canlı GitHub keşif, statik katalog yerine).
2. OllamaX tanıtım/indirme web sitesi: Windows, Linux, macOS sürümleriyle.

## Gerçekleşen durum
- v3.10.0 tamamlandı, push edildi (commit 9b12689, main).
- Yeni modül: `src/main/featured-discover.js` — canlı GitHub search (5 kategori sorgusu, keyword tabanlı kategori eşleme `bestCategoryFor`, disk cache `.ollamax/featured-cache.json`, statik yedek, 4 saat TTL, 60sn sonra + 4 saatte periyodik refresh).
- `src/main.js` satır ~27: `require('./main/featured-discover')`; get-featured-repos IPC artık `await loadFeaturedReposAuto()`; refresh timer'lar eklendi.
- `src/renderer/app.js`: kartlara `.rcr-open` ↗ link (isLive + r.url), `renderFeaturedRepoFreshness()` (#repo-freshness gösterir: "X dk önce · canlı/yedek"), featured-repos listener'ına eklendi.
- `src/renderer/index.html` satır 53: summary içine `<span class="repo-freshness" id="repo-freshness">● yedek</span>` eklendi.
- `src/renderer/styles.css` sonuna .repo-freshness ve .rcr-open CSS eklendi.
- Testler: `tests/featured-discover.test.js` eklendi; suite 133 test. Son başarısızlık: learnRepo `karpathy/nn-zero-to-hero` desc "Zero to hero..." → ai-foundations'a düşüyor çünkü ilk kategori ai-foundations ve 'hero'/'zero'...' course' yok; sıralı keyword eşleşmede ai-foundations keywords arasında 'zero' olmadığı halde... GERÇEK NEDEN: `CATEGORY_QUERIES[0].keywords` içinde yok; ama learnRepo adında 'nn' yok, 'zero to hero' ifadesi CATEGORY_QUERIES'de hiçbir yerde yok → ai-foundations varsayılan döner. Düzeltme: learning-path keywords'e 'zero to hero' yerine 'zero to' veya 'nn-' eklemek (repo adı 'nn-zero-to-hero').

## Kalan işler
1. `src/main/featured-discover.js` learning-path keywords: 'zero to' / 'nn-' ekle → test geçmeli (veya test beklentisini değiştirmek).
2. CDP doğrulaması (scripts/verify-discover.js hâlâ çalışıyor; Chromium --remote-debugging-port=9222 port 9393'te serve-ui-test açık).
3. Mock'a featuredRepos mock'ları eklendi (scripts/mock-api.js ve serve-ui-test.js — fakeData.featuredRepos).
4. Jest 132/133, lint temiz (eslint src/**/*.js).
5. package.json sürüm 3.10.0 → 3.11.0 yap; CHANGELOG.md'ye 3.11.0 bölümü ekle (format: "## 3.11.0 — 2026-08-16").
6. Commit: "v3.11.0: otomatik GitHub repo keşif motoru (featured-discover)" + push origin main (PAT ortamda github_pat_11B46TPHY...@github.com/yasinkaya701/OllamaX.git).

## Landing page web sitesi (faz 4-5)
- webdev_init_project ile başlatılacak (kullanıcı web sitesi istedi → web-static uygun; indirme butonları OllamaX GitHub releases + kod/kaynak linki: https://github.com/yasinkaya701/OllamaX).
- Repo'da release yok (releases API 404) → indirme butonları "soon" + repo'ya yönlendirme veya manuel dosya isimleri: Win: OllamaX-Ultra-Setup.exe / portable, Mac: .dmg, Linux: AppImage (.AppImage). electron-builder config: win target portable, mac dmg, linux AppImage; dist/ output.
- Site içeriği: hero (logo assets/logo.png kullan), Tricolor Pro tema (#00a878 emerald, siyah/beyaz), özellikler (Agent Studio, Multi-provider, Composer, Prompt Builder, GitHub Discovery, Audit), indirme kartları Win/Mac/Linux, footer repo linki.
- Siteyi publish et (WebDev Publish) ve kullanıcıya URL ver.

## Teknik notlar
- GitHub search API auth'suz: 10 req/1dk rate limit (search resource), User-Agent zorunlu: "OllamaX-Ultra/3.11".
- GITHUB_TOKEN = yasinkaya701 kullanıcısı, repo push erişimi var.
- CDP test komutu: `node scripts/verify-discover.js 9393` (Chromium 9222 açıkken).
- CDP sayfa WS: http://localhost:9222/json → webSocketDebuggerUrl. Sayfa: http://localhost:9393/ (OllamaX — AI Agent Studio).
- Server çalıştırma: `node scripts/serve-ui-test.js 9393` (port 9393, fuser kontrolü: 24976).
- Jest: `npm test`; Lint: `npm run lint`.
