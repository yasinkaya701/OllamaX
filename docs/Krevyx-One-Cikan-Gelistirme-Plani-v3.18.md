# Krevyx — Rakiplerin Önüne Geçme Geliştirme Planı (v3.18 → v3.20)

**Tarih:** 16 Ağustos 2026 · **Durum:** Onay bekliyor · **Önceki plan:** Krevyx-Master-Plan.md (v3.14–v3.18)

Bu plan, Ağustos 2026 itibarıyla güncellenen rakip görüntüsüne dayanarak Krevyx'in v3.18 ve sonraki sürümleri için stratejik bir gelişim yolunu tanımlar. Master Plan'daki orijinal v3.18 tanımı ("Team & Enterprise Entry") korunmuş, üzerine üç ek faz (v3.19, v3.20) ve her faz için rakip kaynaklı gerekçeler eklenmiştir. Kullanıcı talebi üzerine Pro/monetizasyon katmanı iptal edildiği için plan tamamen **açık kaynak topluluk büyüme modeli** üzerinden yeniden kurgulanmıştır; gelir stratejisi bölümü ayrıca bu doğrultuda güncellenmiştir.

---

## 1. Güncel Rakip Görüntüsü (Ağustos 2026)

AI kodlama araçları pazarı 2025'te ~7,3 milyar dolardan yola çıkarak %26 yıllık büyümeyle genişliyor; Cursor tek başına 2026 başında 2 milyar dolar ARR barajını geçti ve değerlemesi 30–50 milyar dolar aralığında konuşuluyor [1] [2]. Pazar artık tek kazanan değil, **beş kategori** barındırıyor: AI IDE'ler (Cursor, Windsurf, Antigravity), terminal agent'ları (Claude Code, Codex CLI, Gemini CLI, Aider), bulut agent'ları (Devin, Jules), GitHub-native araçlar (Copilot) ve açık kaynak/model-esnek araçlar (Cline, Kilo Code, OpenCode).

Ağustos 2026 itibarıyla kritik rakip hareketleri şunlardır:

| Rakip | Ağustos 2026 durumu | Krevyx için anlamı |
|---|---|---|
| **Cursor** | $2B ARR; Pro $20 / Pro+ $60 / Ultra $200; kredi tabanlı faturalama; çoklu model (Claude Opus 4.8, GPT-5.5, Gemini, kendi Composer modeli); team marketplace kapalı | Fiyat kilit noktası $200'da — fiyat artık farklılaşıcı değil. Kapalı marketplace açık kaynak karşıtı boşluk |
| **Claude Code** | Terminal-native; CLAUDE.md; Team Standard $25 ama tam erişim Team Premium $125/seat'e bağlı — erişim belirsizliği kurumsal güveni aşındırıyor | "Şeffaf lisans" hikayesi güçlü: Krevyx tek katman, MIT, her şey dahil |
| **Codex** | GPT-5.6 Sol/Terra/Luna ailesi; oturum içi `/model` geçişi; cloud sandbox kuyruğu; ChatGPT planına gömülü | Model-geçiş akıcılığı kullanıcı beklentisi yükseltti; kodu bilmeli |
| **Antigravity** | Public preview ÜCRETSİZ; Gemini 3 Pro + Claude Sonnet 4.5 + GPT-OSS üç laboratuvar tek arayüzde; native browser kontrolü; I/O 2026'da desktop+CLI+SDK | En agresif rakip. Ücretsiz olması fiyat rekabetini öldürür; ama cloud-only — yerel/gizlilik tarafı boş |
| **Windsurf** | Cognition satın aldı ($2,4B); fiyat artışı ($20 Pro) ile avantajını kaybetti | Zayıf konum — kullanıcısı kaçış potansiyeli |
| **Aider** | Açık kaynak, git-native CLI | Basitlik odağı — GUI katmanı yok; Krevyx'in GUI'li chain'ine karşı |
| **Cline / Kilo Code** | Açık kaynak VS Code uzantıları | Model-esneklik paylaşılan alan; farklılaşma orkestrasyon + güven katmanında |

İki yapısal trend doğrudan Krevyx'in lehine çalışıyor. Birincisi, fiyatların $200'da birleşmesiyle **farklılaşma eksenleri fiyat dışına** (güven, orkestrasyon, yerel çalışma, ekosistem) kaydı. İkincisi, geliştiriciler artık tek araç değil **çoklu araç stack'i** kullanıyor ve CodeAgentSwarm gibi "swarm arayüzü" ürünleri ortaya çıkmaya başladı [3]. Bu, Krevyx'in baş-ajan orkestrasyon stratejisinin doğru tahmin olduğunu doğruluyor — ancak swarm araçları da henüz açık kaynak değil.

## 2. Farklılaşma Stratejisi: "Swarm Studio, Yerel Önce"

Rakiplerin hiçbiri şu kombinasyonu sunmuyor: **grafik arayüzlü çapraz agent orkestrasyonu + model laboratuvarı bağımsızlığı + yerel-önce/gizlilik + açık kaynak MIT lisans**. Plan, bu dört eksen etrafında kurgulanır.

| Eksen | Rakip boşluğu | Krevyx cevabı | Sürüm |
|---|---|---|---|
| **Orkestrasyon** | Hiçbir rakipte GUI'li baş-ajan + zincir görünümü yok; swarm araçları kapalı kaynak | Mission Control + paralel ajanlar zaten shipped; sırada: kuyruk/görev defteri, cron otomasyon, swarm şablon paylaşımı | v3.18–v3.19 |
| **Yerel/Gizlilik** | Antigravity/Cursor/Claude Code tamamen cloud; kurumsal güven açığı (SO'nun güveni %40→%29) | Air-gapped + keychain + local models; sırada: yerel model otomatik keşif, sandbox izolasyonu, kurumsal denetim paketi | v3.18 |
| **Ekosistem** | Cursor marketplace kapalı; Cline/Roo eklenti ekosistemi dağınık | MIT + plugin marketplace + şablon pazarı; v3.17 temeli atıldı; sırada: katalog sunucu + kurulum akışı | v3.19 |
| **Maliyet** | Kredi/kotaya bağlı belirsiz faturalama; Copilot'ta $29→$750 örnekleri | Cost Engine zaten var; sırada: gerçek zamanlı bütçe, proje bazlı raporlama, otomatik model düşürme | v3.19 |

## 3. Sürüm Planı

### v3.18 — "CLI Companion & Enterprise Entry" (3 hafta)

Master Plan'daki Faz C'dir; açık kaynak modeline uyarlandı. **C-1 Ekip/Kullanıcı Paketleri:** `.krevyxprofile` formatı — profiller + prompt şablonları + provider config'leri tek dosyada import/export; topluluk paylaşımının taşıyıcı formatı (5 gün). **C-2 Denetim Log Export:** JSON/CSV/SARIF + SIEM webhook; kurumsal güvenlik ekipleri için satın alma sebebinin kanıtı (4 gün). **C-3 MCP Broker Genişletme:** ajan başına ayrı MCP sunucu seti + uzak proxy mod (5 gün). **C-4 CLI Companion:** penceresiz `krevyx run` modu — CI'da aynı orchestrator; Antigravity'nin CLI+IDE ikilisine cevap (5 gün). Ayrıca: Antigravity'nin eşsiz olduğu **browser kontrol** özelliği eklenir — headless tarayıcıyı ajan araç setine bağlama (agent tool olarak `browser_navigate`/`browser_click`/`browser_screenshot`).

### v3.19 — "Swarm & Autonomy" (4 hafta)

Planın tırmanış evresi. **D-1 Görev Defteri (Task Queue):** "10 issue'yu işle, biteni PR'a koy" — kuyruklu otonom iş; Codex'in cloud kuyruğuna yerel cevap (6 gün). **D-2 Zamanlanmış Ajans (Cron Jobs):** gece çalıştırmaları — "her gece test + refactor + sabah rapor" (4 gün). **D-3 Swarm Şablonları:** v3.17 şablon mekanizmasının chain versiyonu — 3-ajanlık hazır swarm reçeteleri (Bug Detective + Test Engineer + Review Sentinel) tek tıkla çağrılır (5 gün). **D-4 Şablon Kataloğu Sunucusu:** topluluk şablonlarını listeleyen gömülü katalog; `featured-sharms.json` ile başlar, zamanla gerçek katalog sunucusuna evrilir (4 gün). **D-5 Yerel Model Otomatik Keşfi:** Ollama/LM Studio'daki modelleri otomatik tarar, öneri olarak sunar — "yerel-önce" vaadinin bir tıkla deneyimi (3 gün). **D-6 Maliyet 2.0:** proje bazlı raporlama + proje limitleri + "bu işi bitirmek ~$0.42" ön-kestirme (6 gün).

### v3.20 — "Trust & Scale" (4 hafta)

Kurumsal ve ölçek evresi. **E-1 Ajan Sandbox İzolasyonu:** ajan işlerini sandbox dizininde, git worktree ile çalıştırma; "deney/geri al" garanti (5 gün). **E-2 Gerçek Zamanlı Bütçe:** token tüketimi canlı izleme + soft-stop anında (3 gün). **E-3 Şifreli Ekip Paylaşımı:** `.krevyxprofile` + şablonları uçtan uca şifreli paylaş; air-gapped kurumsal dağıtım desteği (6 gün). **E-4 Kurumsal Denetim Paketi:** SARIF export + denetim API + imzalı log; SOC 2 yolculuğunun adımı (5 gün). **E-5 Plugin Marketplace v2:** şablon/eklenti keşif akışı, doğrulanmış yayıncı rozeti (5 gün).

### Bilinçli Dışlamalar (güncellendi)

Inline/autocomplete (Cursor Tab'e karşı) V8'e kadar ertelendi: yeni LSP katmanı gerektirir, çekirdek farklılaşma değil. Kendi bulut modeli dışarıda — BYO-key ekonomisini bozar. Mobil ve sosyal login plan dışı. **Kilitli lisans katmanı** iptal edildi (kullanıcı kararı) — tüm özellikler topluluk katmanında.

### Yol Haritası Özet Tablosu

| Faz | Sürüm | Tema | Süre | Rakip hedefi |
|---|---|---|---|---|
| A1–B1 | v3.14–v3.16 | Trust → Cost → Orkestrasyon | tamamlanan | Claude Code/Cursor |
| (B2 iptal) | v3.17 | Topluluk & Ekosistem temeli | tamamlanan | Cline/Roo boşluğu |
| C | v3.18 | CLI + Enterprise Entry | 3 hf | Antigravity CLI+IDE ikilisi |
| D | v3.19 | Swarm & Autonomy | 4 hf | Codex kuyruğu + swarm trendi |
| E | v3.20 | Trust & Scale | 4 hf | Kurumsal güven açığı |

## 4. Güncellenmiş Gelişim Modeli

Pro katmanı iptal edildiği için büyüme mekanizması açık kaynak topluluk modeline evrilir. Büyüme üç kanaldan gelir: (1) **GitHub stars ve katkı** — şablon/eklenti katkıları doğrudan ürün değerini artırır, her katkıcı pazarlamaya dönüşür; (2) **Kurumsal destek sözleşmeleri** — denetim paketi + öncelikli güvenlik yamaları için yıllık destek (sponsorluk modeli); (3) **Kredilendirme/sponsorluk** — OpenCollective/GitHub Sponsors ile topluluk finansı. Bu model Cursor'un 2 milyar dolar ARR'ını hedeflemez; hedef, **kurumsal güven boşluğunu dolduran, kurumsal destek geliriyle sürdürülen bağımsız bir açık kaynak markası** olmaktır — Roo Code kapatılması (Mayıs 2026) piyasanın bağımsız açık kaynak alternatiflere aç olduğunu gösteriyor [4].

## 5. Hemen Sonraki Adımlar

İlk öncelik v3.18'dir ve sırası şudur: `krevyx run` CLI modu, `.krevyxprofile` paket formatı, MCP broker genişletme, ardından denetim log export'u. Paralel olarak site yol haritasına bu fazlar işlenmeli ve topluluk iletişiminde "v3.18 CLI" bir erken haber olarak kullanılmalıdır.

## Kaynaklar

[1]: https://www.polarismarketresearch.com/industry-analysis/ai-code-tools-market "Polaris Market Research — AI Code Tools Market 2026–2034"
[2]: https://uvik.net/blog/ai-coding-assistant-statistics/ "UViK — AI Coding Assistant Statistics 2026"
[3]: https://www.codeagentswarm.com/en/guides/claude-code-vs-cursor-vs-codex "CodeAgentSwarm — Claude Code vs Cursor vs Codex CLI (Ağustos 2026)"
[4]: https://github.com/RooCodeInc/Roo-Code "Roo Code GitHub — Mayıs 2026 kapatılması"

- [1] Polaris Market Research — AI Code Tools Market: https://www.polarismarketresearch.com/industry-analysis/ai-code-tools-market
- [2] UViK — AI Coding Assistant Statistics 2026: https://uvik.net/blog/ai-coding-assistant-statistics/
- [3] CodeAgentSwarm — Claude Code vs Cursor vs Codex CLI: https://www.codeagentswarm.com/en/guides/claude-code-vs-cursor-vs-codex
- [4] Roo Code GitHub: https://github.com/RooCodeInc/Roo-Code
