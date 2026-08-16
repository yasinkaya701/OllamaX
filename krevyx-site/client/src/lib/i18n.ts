/*
 * Krevyx — i18n dictionary (TR + EN)
 * All static strings for the landing page in both languages.
 */

export type Lang = "tr" | "en";

export const translations = {
  tr: {
    // Nav
    nav_features: "Özellikler",
    nav_providers: "Sağlayıcılar",
    nav_downloads: "İndir",
    nav_faq: "SSS",
    nav_changelog: "Sürüm notları",
    nav_github: "GitHub",
    nav_download_cta: "Uygulamayı İndir",
    nav_version: "v3.12",

    // Hero
    hero_badge: "AI Agent Studio — Windows · macOS · Linux",
    hero_title_1: "Yapay zekânın",
    hero_title_2: "orkestra şefi",
    hero_title_3: "masaüstünde.",
    hero_sub: "Krevyx, yerel Ollama'nızla 18 bulut sağlayıcıyı tek stüdyoda birleştirir. Ajanlar, ekipler, Composer modu ve canlı GitHub keşfi — anahtarınıza dokunmadan.",
    hero_cta_primary: "Ücretsiz indir",
    hero_cta_secondary: "Kaynak kodu",
    hero_screenshot_label: "Gerçek ekran görüntüsü · v3.12.0",

    // Stats
    stats_1_value: "18+",
    stats_1_label: "AI sağlayıcı, tek arayüz",
    stats_2_value: "19",
    stats_2_label: "zengin ajan rolü (Markdown)",
    stats_3_value: "7",
    stats_3_label: "hazır ekip ön ayarı",
    stats_4_value: "5",
    stats_4_label: "kategorili canlı GitHub keşfi",
    stats_5_value: "0",
    stats_5_label: "kilitlenme — yerel çalışır",

    // Features
    features_index: "— 01",
    features_label: "Özellikler",
    features_title: "Araç değil, stüdyo.",
    features_sub: "Tek pencerede yerel modeller, bulut API'leri, ajanlar, terminal ve dosya sistemi. Her katman mühendis titizliğiyle örüldü.",

    features: [
      {
        index: "01",
        title: "Agent Studio",
        desc: "19 kıdemli ajan rolü ve 7 profesyonel ekip ön ayarı. Kıdemli mühendis, red-team denetçisi, ürün yöneticisi ve stratejik orkestra şefi — hepsi titiz Markdown profilleriyle. Ekipleri tek tıkla yükleyin, lider ajan görevi atomik parçalara bölsün.",
        meta: "ROL TABANLI · EKİP ÖN AYARLARI",
        artifact: [
          "$ krevyx teams --load 'startup-5'",
          "→ orchestrator + senior-engineer + red-team + pm + strategist",
          "✓ 5 ajan yüklendi · görev parçalandı (14 atomik)",
        ],
      },
      {
        index: "02",
        title: "Cursor-benzeri Composer",
        desc: "Sohbetin ötesinde: dosya bağlamı ekleyin, projeyi klasör seçimiyle kapsayın, görev listesini yönetin. Kod üreten ajan, dosyalarınızı bağlamında görür.",
        meta: "DOSYA BAĞLAMI · GÖREV LİSTESİ",
        artifact: [
          "context: ./src/**/*.ts (142 dosya)",
          "plan: ▸ parse config → ▸ generate adapter → ▸ test",
          "tasklist: 2/3 tamamlandı",
        ],
      },
      {
        index: "03",
        title: "Prompt Builder & Slash Komutları",
        desc: "/prompt ile metaprogramlama mühendisi bir ajan, talebinizi kilitli, sızdırmaz bir sistem promptuna çevirir. /improve, /summarize, /extract ve /translate akışı hızlandırır.",
        meta: "/prompt · /improve · /summarize",
        artifact: [
          "/prompt 'satış özeti yaz'",
          "→ system prompt derlendi (locked)",
          "komutlar: /improve /summarize /extract /translate",
        ],
      },
      {
        index: "04",
        title: "Canlı GitHub Keşfi",
        desc: "Karpathy'nin nanoGPT'sinden llama.cpp'ye — 5 kategoride 20+ öne çıkan depo GitHub'dan otomatik çekilir, anahtar kelimelerle kategoriye atanır ve 4 saatte bir arka planda yenilenir. Tek tıkla arama paneline akar.",
        meta: "KAYNAK: GITHUB SEARCH API · TTL 4 SAAT",
        artifact: [
          "$ featured-discover --refresh",
          "→ 24 repo · 5 kategori · cache güncellendi",
          "sonraki yenileme: 03:42 sonra",
        ],
      },
      {
        index: "05",
        title: "Otonom Orkestrasyon",
        desc: "AgentLoop: hedef → plan → araç → onay → gözlem döngüsü. 12 araç manifesti, tier tabanlı onay akışları ve sandbox'lı workspace ile güvenli otonomi.",
        meta: "AGENTLOOP · 12 ARAÇ",
        artifact: [
          "goal → plan → tool → approve → observe",
          "onay tier'ları: 1-2 otomatik · 3 manuel",
          "sandbox: workspace izole ✓",
        ],
      },
      {
        index: "06",
        title: "Anlamsal Bellek & Denetim",
        desc: "Saf-JS vektör indeksi + SQLite: ajanlarınız bağlamınızı hatırlar. SHA-256 hash zincirli audit log'la her karar izlenebilir; bütünlük tek komutla doğrulanır.",
        meta: "VEKTÖR İNDEKS · HASH ZİNCİRİ",
        artifact: [
          "memory: 1,204 vektör · sqlite:// ~/.krevyx",
          "audit: chain #4021 sha256 8f3a…c19e",
          "$ krevyx audit --verify ✓ intact",
        ],
      },
    ],

    // Providers
    providers_index: "— 02",
    providers_label: "Sağlayıcılar",
    providers_title: "18 sağlayıcı. Sıfır kilitlenme.",
    providers_sub: "Yerel Ollama'dan bulut API'lerine kadar, her anahtarı yerel ayarlar panelinde yapılandırın. Hiçbirisi sunucuya gitmez.",

    // Downloads
    downloads_index: "— 03",
    downloads_label: "İndir",
    downloads_title: "Üç platform. Tek stüdyo.",
    downloads_sub: "Üç platform da hazır — Windows kurucusu, macOS DMG ve Linux AppImage doğrudan site üzerinden indirilebilir.",
    downloads_ready: "Hazır",
    downloads_soon: "Yakında",
    downloads_cta: "Release sayfası",
    downloads_git: "git clone",

    // Changelog
    changelog_index: "— 04",
    changelog_label: "Sürüm notları",
    changelog_title: "Hızla olgunlaşıyor.",
    changelog_sub: "Yol haritası açık ve kamuya açık repoda ilerliyor: orkestra şefi modülü, çoklu ajan arası koordinasyon ve daha fazlası sıradaki.",

    changelog: [
      { v: "3.11.0", d: "Otomatik GitHub repo keşif motoru: canlı API çekimi, disk cache, periyodik yenileme." },
      { v: "3.10.0", d: "Kategorili keşif kartları: nanoGPT ve llama2.c dahil 5 kategori, canlılık rozeti." },
      { v: "3.9.0", d: "Prompt Builder ajanı ve slash komutları (/prompt, /improve, /summarize)." },
      { v: "3.8.0", d: "Cursor-benzeri Composer modu; dosya bağlamı ve görev listesi." },
      { v: "3.7.0", d: "19 zengin ajan rolü, 7 ekip ön ayarı, gelişmiş model parametreleri." },
    ],

    // FAQ
    faq_index: "— 05",
    faq_label: "Sıkça Sorulan Sorular",
    faq_title: "Merak edilenler.",
    faq_sub: "Kurulum, yapılandırma ve günlük kullanım hakkında en sık sorulan sorular.",

    faq: [
      {
        q: "Krevyx'i nasıl kurarım?",
        a: "Linux'ta: Krevyx.Ultra-3.12.0.AppImage dosyasını indirin, çalıştırılabilir yapın (chmod +x), çift tıklayın. Windows'ta: Krevyx.Ultra.3.12.0.exe kurucusunu indirin ve çalıştırın. macOS'ta: Krevyx.Ultra-3.12.0-arm64.dmg dosyasını açın ve uygulamayı Applications'a sürükleyin. Ayrıca npm ile de kurabilirsiniz: git clone + npm install + npm start.",
      },
      {
        q: "Sistem gereksinimleri nelerdir?",
        a: "Minimum: 4 GB RAM, 500 MB disk, 64-bit işletim sistemi (Windows 10+, macOS 12+, Ubuntu 20.04+). Önerilen: 8 GB RAM. Yerel Ollama kullanacaksanız model boyutuna göre ek RAM gerekir. İnternet bağlantısı yalnızca bulut API'leri için gereklidir.",
      },
      {
        q: "API token'larını nasıl ve nereye girerim?",
        a: "Uygulamayı açın → sağ üstteki Araçlar (⌘L / Ctrl+L) panelini açın → 'APIs' sekmesine geçin. Her sağlayıcı için kendi alanında token'ınızı girin ve 'Save API Keys' butonuna tıklayın. Token'lar yalnızca yerel veri klasörünüzde şifreli olarak saklanır; asla sunucuya gönderilmez.",
      },
      {
        q: "Yerel Ollama'yı nasıl bağlarım?",
        a: "Ollama'yı kurduysanız (ollama.com), Krevyx otomatik olarak localhost:11434 üzerindeki modelleri algılar. Araçlar panelindeki 'Ollama' sekmesinde model listesini görebilirsiniz. 'No models loaded' görürseniz Ollama servis olarak çalışmıyor demektir — 'ollama serve' komutuyla başlatın.",
      },
      {
        q: "Ajanlar ve ekipler nasıl çalışır?",
        a: "Sol paneldeki AGENTS bölümünden bir rol seçin (örn. 'Master AI'). Alternatif olarak EKİP ÖN AYARI dropdown'undan hazır bir ekip yükleyin — lider ajan görevi atomik parçalara böler ve üye ajanlara dağıtır. 7 profesyonel ekip ön ayarı mevcut: Red Team, Cloud Architecture, DevOps vb.",
      },
      {
        q: "Composer modu nedir, ne işe yarar?",
        a: "Cursor-benzeri bir çalışma modudur. Sohbetin ötesinde: dosya bağlamı ekleyin, projeyi klasör seçimiyle kapsayın, görev listesini yönetin. Kod üreten ajan dosyalarınızı bağlamında görür ve doğrudan workspace'e yazar.",
      },
      {
        q: "GitHub keşfi nasıl güncellenir?",
        a: "Tamamen otomatik: GitHub Search API'den 5 kategori sorgusu paralel çekilir, disk cache'e yazılır ve her 4 saatte bir arka planda yenilenir. Çevrimdışıysanız son cache kullanılır. Kategoriler: AI Foundations, Agents, Local Inference, Learning Path, Tools.",
      },
      {
        q: "Verilerim ve API anahtarlarım güvende mi?",
        a: "Evet. Tüm API anahtarları yerel veri klasöründe saklanır (tarayıcı + uygulama klasörü). Hiçbir anahtar uzaktaki sunucuya gönderilmez. Audit log'lar SHA-256 hash zinciriyle bütünlük garantisi sunar — 'Verify' butonuyla tek komutla doğrulanabilir.",
      },
      {
        q: "Açık kaynak mı? Nasıl katkı yapabilirim?",
        a: "Evet, GitHub'da açık kaynak. GitHub reposundan issue açabilir, PR gönderebilir veya feature request'te bulunabilirsiniz. Roadmap kamuya açık olarak ilerliyor.",
      },
    ],

    // Footer
    footer_version: "AI Agent Studio · v3.12.0",
    footer_changelog: "Changelog",
    footer_architecture: "Mimari",
    footer_copyright: "© 2026 yasinkaya701 — açık kaynak",
    footer_edition: "Ultra Edition",

    // Docs
    docs_title: "Dokümantasyon",
    docs_subtitle: "Kurulum, yapılandırma ve günlük kullanım — A'dan Z'ye.",
    docs_intro: "Krevyx, yapay zekâyı tek bir bulut hesabına bağımlı olmaktan kurtaran masaüstü orkestra stüdyosudur. Yerel Ollama modellerinizle bulut sağlayıcılarını aynı pencerede birleştirir, Claude Code, Codex ve Antigravity gibi ajanları tek zincirde yönetir. Bu belge, sıfırdan kurulumdan token yapılandırmasına kadar ihtiyacınız olan her şeyi kapsar — başlayın ve stüdyoyu kurun.",
    docs_intro_start: "Kurulumdan başlayın",
    docs_intro_start_link: "#install",
    docs_search_placeholder: "Belgelerde ara…",
    docs_search_noresult: "Sonuç bulunamadı — farklı bir kelime deneyin.",
    docs_sidebar_title: "İçindekiler",
    docs_nav_install: "Kurulum",
    docs_nav_token: "Token Yapılandırması",
    docs_nav_settings: "Ayarlar",
    docs_nav_shortcuts: "Kısa Yollar",
    docs_nav_troubleshoot: "Sorun Giderme",
    docs_nav_faq: "SSS",

    docs_install: [
      { title: "Windows", steps: [
        "GitHub Releases sayfasından Krevyx.Ultra.3.12.0.exe dosyasını indirin.",
        "İndirilen dosyayı çift tıklayarak çalıştırın.",
        "Windows SmartScreen uyarısı çıkarsa 'Yine de çalıştır' seçeneğine tıklayın.",
        "Kurulum sihirbazındaki adımları takip edin.",
        "Masaüstünde oluşturulan kısayol ile Krevyx'i başlatın.",
      ] },
      { title: "macOS", steps: [
        "GitHub Releases sayfasından Krevyx.Ultra-3.12.0-arm64.dmg dosyasını indirin.",
        "DMG dosyasını çift tıklayarak bağlayın.",
        "Krevyx uygulamasını Applications klasörüne sürükleyin.",
        "İlk açılışta 'Uygulama doğrulanamadı' uyarısı çıkarsa: Sistem Ayarları → Gizlilik ve Güvenlik → 'Yine de Aç' seçeneğine tıklayın.",
        "Dock'tan veya Launchpad'den Krevyx'i başlatın.",
      ] },
      { title: "Linux", steps: [
        "GitHub Releases sayfasından Krevyx.Ultra-3.12.0.AppImage dosyasını indirin.",
        "Terminali açın ve şu komutu çalıştırın: chmod +x Krevyx.Ultra-3.12.0.AppImage",
        "Dosyayı çift tıklayın veya ./Krevyx.Ultra-3.12.0.AppImage komutuyla başlatın.",
        "İsteğe bağlı: sudo mv Krevyx.Ultra-3.12.0.AppImage /usr/local/bin/krevyx ile PATH'e ekleyin.",
      ] },
      { title: "Kaynak Koddan", steps: [
        "Node.js 22+ kurulu olduğundan emin olun.",
        "git clone https://github.com/yasinkaya701/OllamaX.git krevyx",
        "cd krevyx",
        "npm install",
        "npm start",
        "(Build almak için: npx electron-builder --linux)",
      ] },
    ],

    docs_token_title: "Token Yapılandırması",
    docs_token_desc: "API anahtarlarınızı uygulamadan çıkmadan, güvenli ve yerel olarak yapılandırın. Hiçbir anahtar sunucuya gönderilmez.",
    docs_token_steps: [
      { label: "Araçlar panelini açın", desc: "Sağ üstteki ⌘L (Mac) veya Ctrl+L (Windows/Linux) kısayoluyla Araçlar panelini açın. Alternatif olarak sağ üstteki araç ikonuna tıklayın." },
      { label: "APIs sekmesine geçin", desc: "Panel açıldığında üstteki sekmelerden 'APIs' sekmesine tıklayın. Tüm desteklenen sağlayıcılar listelenir." },
      { label: "Token'larınızı girin", desc: "Kullandığınız her sağlayıcı için ilgili alana API token'ınızı yapıştırın. Birden fazla sağlayıcı aynı anda aktif olabilir." },
      { label: "Kaydedin", desc: "'Save API Keys' butonuna tıklayın. Anahtarlar yalnızca yerel veri klasörünüzde saklanır." },
      { label: "Doğrulayın", desc: "Her sağlayıcı alanında 'Test Connection' butonu ile bağlantıyı anında test edebilirsiniz." },
    ],
    docs_token_providers_title: "Desteklenen Sağlayıcılar",
    docs_token_providers: "Ollama (yerel) · OpenAI · Anthropic · Gemini · OpenRouter · xAI · Mistral · DeepSeek · Groq · Cohere · Perplexity · Together · Cerebras · Fireworks · Replicate · Azure OpenAI · AWS Bedrock · LM Studio",
    docs_token_security: "API anahtarları uygulama yerel veri klasöründe saklanır. Sunucuya veya buluta gönderilmez. İsterseniz Audit Log → Verify ile SHA-256 hash zincirini doğrulayabilirsiniz.",

    docs_settings_title: "Ayarlar",
    docs_settings_items: [
      { title: "Genel", desc: "Tema (koyu/açık), dil, varsayılan ajan rolü ve ekip ön ayarı." },
      { title: "Model", desc: "Varsayılan model, temperature, top_p, max_tokens, top_k ve sistem promptu." },
      { title: "Composer", desc: "Varsayılan workspace klasörü, otomatik bağlam ekleme ve görev listesi davranışı." },
      { title: "GitHub Keşfi", desc: "Keşif yenileme sıklığı, favori kategoriler ve otomatik arama açma." },
      { title: "Güvenlik", desc: "API anahtarları, audit log doğrulama, hash zinciri kontrolü." },
    ],

    docs_shortcuts_title: "Kısa Yollar",
    docs_shortcuts: [
      { keys: "⌘L / Ctrl+L", desc: "Araçlar panelini aç/kapat" },
      { keys: "⌘K / Ctrl+K", desc: "Komut paletini aç" },
      { keys: "Ctrl+Enter", desc: "Gönder (Composer modunda)" },
      { keys: "Ctrl+Shift+P", desc: "Ajan rolünü değiştir" },
      { keys: "Ctrl+N", desc: "Yeni sohbet" },
      { keys: "Ctrl+.", desc: "Sorun giderme konsolu" },
      { keys: "/prompt", desc: "Prompt Builder'ı çağır" },
      { keys: "/improve", desc: "Prompt'u iyileştir" },
      { keys: "/summarize", desc: "Metni özetle" },
      { keys: "/translate", desc: "Metni çevir" },
    ],

    docs_troubleshoot_title: "Sorun Giderme",
    docs_troubleshoot: [
      { q: "Uygulama açılmıyor", a: "Windows'ta: Sağ tık → Yönetici olarak çalıştır. macOS'ta: Sistem Ayarları → Gizlilik ve Güvenlik → 'Yine de Aç'. Linux'ta: FUSE kurulu mu kontrol edin (sudo apt install libfuse2)." },
      { q: "Modeller görünmüyor", a: "Ollama'nın çalıştığından emin olun: ollama serve. Araçlar → Ollama sekmesinde 'Refresh' butonuna tıklayın." },
      { q: "API bağlantı hatası", a: "Token'ınızın doğru olduğundan emin olun. 'Test Connection' butonuyla her sağlayıcıyı tek tek test edin. Firewall/proxy kullanıyorsanız HTTPS çıkışına izin verin." },
      { q: "GitHub keşfi boş", a: "İlk açılışta cache oluşuyor — 10-30 saniye bekleyin. İnternet bağlantınızı kontrol edin. Offline modda son cache kullanılır." },
      { q: "Composer dosya yazmıyor", a: "Workspace klasörünün yazılabilir olduğundan emin olun. Ayarlar → Composer → varsayılan workspace klasörünü kontrol edin." },
      { q: "Audit log doğrulaması başarısız", a: "Hash zinciri dosyaları bozulmuş olabilir. Audit Log → Clear ile temizleyin ve yeni oturum başlatın." },
    ],

    // Yol Haritası
    roadmap_index: "— Yol Haritası",
    roadmap_label: "Gelecek",
    roadmap_title: "v3.13.0 yolda.",
    roadmap_sub: "Orkestrasyon katmanından sonra sırada tam sürüm çıkışı var. Yaklaşan hedefler, planlanan sürümlerle birlikte burada.",
    roadmap_items: [
      { version: "v3.12.x", title: "Orkestrasyon genişlemesi", desc: "Claude Code → Codex → Antigravity zincirlerinin ayar ve geri alma desteği; yerel ajan keşfinde otomatik uyum algılama.", status: "developing", goals: ["Zincir adımları arasında parametre ayarı (sıcaklık, model seçimi)", "Geri alma (undo) ve zincir checkpoint kaydı", "Yerel ajan keşfinde otomatik sürüm uyum algılama"], note: "Orkestratör katmanı zaten çalışıyor; bu sürümde üretim kalitesine taşınıyor." },
      { version: "v3.13.0", title: "Windows & macOS release", desc: "NSIS kurucusu ve DMG paketleri GitHub release'e eklendi — üç platformda da tek tıkla kurulum canlı.", status: "done", goals: ["Windows NSIS kurucusu ve otomatik güncelleme kanalı", "macOS DMG imzalı paket (Apple Silicon + Intel)", "Her platformda tek tıkla kurulum deneyimi"], note: "Tamamlandı: üç platformun installer'ları da site üzerinden indirilebilir durumda." },
      { version: "v3.14.0", title: "Ajan pazarı ve şablonlar", desc: "Topluluk ajan rollerini tek tıkla içe aktarma, profil şablon galerisi ve dışa aktarma.", status: "idea", goals: ["Topluluk tarafından paylaşılan ajan profillerini içe aktarma", "Rol ve ekip şablon galerisi", "Profillerin JSON olarak dışa aktarılması"], note: "Araştırma aşamasında — topluluk geri bildirimiyle şekillenecek." },
      { version: "2026 Q3", title: "Marka evrimi", desc: "Krevyx kimliği, krevyx.com domaini ve ilk sürüm notları yayınlandıktan sonra tanıtım kampanyası.", status: "idea", goals: ["krevyx.com domaininin yayına alınması", "Tanıtım videosu ve lansman içeriği", "İlk topluluk geri bildirimi ve roadshow"], note: "Krevyx kimliği tamamlandı; alan adı ve lansman planlanıyor." },
    ],
    roadmap_status_done: "Tamamlandı",
    roadmap_status_developing: "Geliştiriliyor",
    roadmap_status_planned: "Planlandı",
    roadmap_status_idea: "Araştırılıyor",
    roadmap_detail: "Ayrıntılar",
    roadmap_roadmap_hint: "Ayrıntılar için tıklayın",

    // Vizyon
    vision_index: "— Neden",
    vision_label: "Vizyon",
    vision_title: "Tek stüdyo, sınır tanımayan zekâ.",
    vision_sub: "Krevyx'in amacı, yapay zekâyı tek bir bulut hesabına bağımlı olmaktan kurtarmak. Hem yerelinizi hem bulutu tek bir orkestrada birleştirir; veri sizde kalır, güç sizde kalır.",
    vision_1_title: "Yerel önce gelir",
    vision_1_desc: "Modelleriniz kendi makinenizde çalışır. Kodunuz, sohbetleriniz ve belleğiniz sunucuya gitmez — mühendislik verisi evde kalır.",
    vision_2_title: "Bulut, seçimin kadar",
    vision_2_desc: "18+ sağlayıcı tek listede. OpenAI'dan DeepSeek'e, Azure'dan LM Studio'ya — token'larınızı siz yönetirsiniz, kilitlenme olmaz.",
    vision_3_title: "Orkestrasyon, tek standart",
    vision_3_desc: "Claude Code, Codex ve Antigravity dahil lokal ajanları tek zincirde koşun. Bir orkestra şefi, onlarca solist — standart bir protokol.",

    // Misc
    lang_tr: "TR",
    lang_en: "EN",
    aria_download: "Krevyx'i indir",
    aria_github: "GitHub deposu",
    aria_faq: "Sıkça sorulan sorular",
    downloads_recommended: "Sistemine önerilir",

    // Geri Bildirim
    feedback_index: "— 04",
    feedback_label: "Geri Bildirim",
    feedback_title: "Fikrini duyur.",
    feedback_sub: "Krevyx topluluk geri bildirimiyle şekilleniyor. Önerin, hatan veya övgün — doğrudan geliştiriciye ulaşır. E-posta zorunlu değil.",
    feedback_name: "Ad (opsiyonel)",
    feedback_email: "E-posta (opsiyonel)",
    feedback_subject: "Konu",
    feedback_subject_placeholder: "Öneri · Hata · Genel",
    feedback_message: "Mesajın",
    feedback_message_placeholder: "Düşüncelerini yaz…",
    feedback_submit: "Gönder",
    feedback_sending: "Gönderiliyor…",
    feedback_sent: "Teşekkürler! Geri bildirimin ulaştı.",
    feedback_error: "Bir şeyler ters gitti — lütfen tekrar dene.",
    aria_feedback: "Geri bildirim gönder",
  },

  en: {
    // Nav
    nav_features: "Features",
    nav_providers: "Providers",
    nav_downloads: "Download",
    nav_faq: "FAQ",
    nav_changelog: "Changelog",
    nav_github: "GitHub",
    nav_download_cta: "Download App",
    nav_version: "v3.12",

    // Hero
    hero_badge: "AI Agent Studio — Windows · macOS · Linux",
    hero_title_1: "The conductor of AI",
    hero_title_2: "on your desktop.",
    hero_title_3: "",
    hero_sub: "Krevyx unifies your local Ollama with 18 cloud providers in a single studio. Agents, teams, Composer mode and live GitHub discovery — without touching your keys.",
    hero_cta_primary: "Download free",
    hero_cta_secondary: "Source code",
    hero_screenshot_label: "Real screenshot · v3.12.0",

    // Stats
    stats_1_value: "18+",
    stats_1_label: "AI providers, single UI",
    stats_2_value: "19",
    stats_2_label: "rich agent roles (Markdown)",
    stats_3_value: "7",
    stats_3_label: "ready team presets",
    stats_4_value: "5",
    stats_4_label: "categorized live GitHub discovery",
    stats_5_value: "0",
    stats_5_label: "lock-in — runs locally",

    // Features
    features_index: "— 01",
    features_label: "Features",
    features_title: "Not a tool. A studio.",
    features_sub: "Local models, cloud APIs, agents, terminal and file system — in one window. Every layer woven with engineering rigor.",

    features: [
      {
        index: "01",
        title: "Agent Studio",
        desc: "19 senior agent roles and 7 professional team presets. Senior engineer, red-team auditor, product manager and strategic conductor — all with meticulous Markdown profiles. Load teams in one click; the lead agent decomposes tasks into atomic units.",
        meta: "ROLE-BASED · TEAM PRESETS",
        artifact: [
          "$ krevyx teams --load 'startup-5'",
          "→ orchestrator + senior-engineer + red-team + pm + strategist",
          "✓ 5 agents loaded · task split (14 atomic)",
        ],
      },
      {
        index: "02",
        title: "Cursor-like Composer",
        desc: "Beyond chat: add file context, scope the project with folder selection, manage a task list. The code-generating agent sees your files in context.",
        meta: "FILE CONTEXT · TASK LIST",
        artifact: [
          "context: ./src/**/*.ts (142 files)",
          "plan: ▸ parse config → ▸ generate adapter → ▸ test",
          "tasklist: 2/3 complete",
        ],
      },
      {
        index: "03",
        title: "Prompt Builder & Slash Commands",
        desc: "With /prompt, a metaprogramming engineer agent turns your request into a locked, leak-proof system prompt. /improve, /summarize, /extract and /translate accelerate the flow.",
        meta: "/prompt · /improve · /summarize",
        artifact: [
          "/prompt 'write sales summary'",
          "→ system prompt compiled (locked)",
          "commands: /improve /summarize /extract /translate",
        ],
      },
      {
        index: "04",
        title: "Live GitHub Discovery",
        desc: "From Karpathy's nanoGPT to llama.cpp — 20+ featured repos across 5 categories are auto-pulled from GitHub, keyword-classified and refreshed every 4 hours in the background. One click flows into the search panel.",
        meta: "SOURCE: GITHUB SEARCH API · 4H TTL",
        artifact: [
          "$ featured-discover --refresh",
          "→ 24 repos · 5 categories · cache updated",
          "next refresh: in 03:42",
        ],
      },
      {
        index: "05",
        title: "Autonomous Orchestration",
        desc: "AgentLoop: goal → plan → tool → approval → observation cycle. 12-tool manifest, tier-based approval flows and sandboxed workspace for safe autonomy.",
        meta: "AGENTLOOP · 12 TOOLS",
        artifact: [
          "goal → plan → tool → approve → observe",
          "approval tiers: 1–2 auto · 3 manual",
          "sandbox: workspace isolated ✓",
        ],
      },
      {
        index: "06",
        title: "Semantic Memory & Audit",
        desc: "Pure-JS vector index + SQLite: your agents remember context. SHA-256 hash-chained audit log makes every decision traceable; integrity verified with one command.",
        meta: "VECTOR INDEX · HASH CHAIN",
        artifact: [
          "memory: 1,204 vectors · sqlite:// ~/.krevyx",
          "audit: chain #4021 sha256 8f3a…c19e",
          "$ krevyx audit --verify ✓ intact",
        ],
      },
    ],

    // Providers
    providers_index: "— 02",
    providers_label: "Providers",
    providers_title: "18 providers. Zero lock-in.",
    providers_sub: "From local Ollama to cloud APIs — configure every key in the local settings panel. None of them leave your machine.",

    // Downloads
    downloads_index: "— 03",
    downloads_label: "Download",
    downloads_title: "Three platforms. One studio.",
    downloads_sub: "All three platforms are ready — the Windows installer, macOS DMG and Linux AppImage download directly from the site.",
    downloads_ready: "Ready",
    downloads_soon: "Coming soon",
    downloads_cta: "Release page",
    downloads_git: "git clone",

    // Changelog
    changelog_index: "— 04",
    changelog_label: "Changelog",
    changelog_title: "Rapidly maturing.",
    changelog_sub: "The roadmap is public and progressing in the open repo: conductor module, multi-agent coordination and more are next.",

    changelog: [
      { v: "3.11.0", d: "Automatic GitHub repo discovery engine: live API fetch, disk cache, periodic refresh." },
      { v: "3.10.0", d: "Categorized discovery cards: 5 categories incl. nanoGPT & llama2.c, freshness badge." },
      { v: "3.9.0", d: "Prompt Builder agent and slash commands (/prompt, /improve, /summarize)." },
      { v: "3.8.0", d: "Cursor-like Composer mode; file context and task list." },
      { v: "3.7.0", d: "19 rich agent roles, 7 team presets, advanced model parameters." },
    ],

    // FAQ
    faq_index: "— 05",
    faq_label: "FAQ",
    faq_title: "Questions answered.",
    faq_sub: "The most frequently asked questions about setup, configuration and daily use.",

    faq: [
      {
        q: "How do I install Krevyx?",
        a: "Linux: download Krevyx.Ultra-3.12.0.AppImage, make it executable (chmod +x), double-click. Windows: download the Krevyx.Ultra.3.12.0.exe installer and run it. macOS: open Krevyx.Ultra-3.12.0-arm64.dmg and drag the app to Applications. Alternatively install via npm: git clone + npm install + npm start.",
      },
      {
        q: "What are the system requirements?",
        a: "Minimum: 4 GB RAM, 500 MB disk, 64-bit OS (Windows 10+, macOS 12+, Ubuntu 20.04+). Recommended: 8 GB RAM. If using local Ollama, additional RAM depends on model size. Internet is only needed for cloud APIs.",
      },
      {
        q: "How and where do I enter API tokens?",
        a: "Open the app → open the Tools panel (⌘L / Ctrl+L) → switch to the 'APIs' tab. Enter your token in each provider's field and click 'Save API Keys'. Tokens are stored encrypted only in your local data folder; never sent to any server.",
      },
      {
        q: "How do I connect local Ollama?",
        a: "If you have Ollama installed (ollama.com), Krevyx auto-detects models on localhost:11434. You can see the model list in the 'Ollama' tab of the Tools panel. If you see 'No models loaded', Ollama isn't running as a service — start it with 'ollama serve'.",
      },
      {
        q: "How do agents and teams work?",
        a: "Select a role from the AGENTS section in the left panel (e.g., 'Master AI'). Alternatively load a preset team from the TEAM PRESET dropdown — the lead agent decomposes the task into atomic units and distributes them to member agents. 7 professional team presets available: Red Team, Cloud Architecture, DevOps etc.",
      },
      {
        q: "What is Composer mode?",
        a: "A Cursor-like working mode. Beyond chat: add file context, scope the project with folder selection, manage a task list. The code-generating agent sees your files in context and writes directly to the workspace.",
      },
      {
        q: "How does GitHub discovery update?",
        a: "Fully automatic: 5 category queries are fetched in parallel from the GitHub Search API, written to disk cache, and refreshed every 4 hours in the background. If offline, the last cache is used. Categories: AI Foundations, Agents, Local Inference, Learning Path, Tools.",
      },
      {
        q: "Are my data and API keys safe?",
        a: "Yes. All API keys are stored in your local data folder (browser + app folder). No key is ever sent to a remote server. Audit logs are integrity-guaranteed with SHA-256 hash chains — verifiable with one command via the 'Verify' button.",
      },
      {
        q: "Is it open source? How can I contribute?",
        a: "Yes, open source on GitHub. You can open an issue, submit a PR or file a feature request from the GitHub repo. The roadmap is publicly visible.",
      },
    ],

    // Footer
    footer_version: "AI Agent Studio · v3.12.0",
    footer_changelog: "Changelog",
    footer_architecture: "Architecture",
    footer_copyright: "© 2026 yasinkaya701 — open source",
    footer_edition: "Ultra Edition",

    // Docs
    docs_title: "Documentation",
    docs_subtitle: "Installation, configuration and daily use — A to Z.",
    docs_intro: "Krevyx is a desktop orchestration studio built to free AI from single-cloud dependence. It unifies your local Ollama models and cloud providers in one window, and runs agents like Claude Code, Codex and Antigravity in a single chain. This documentation covers everything you need — from a fresh install to token configuration. Start here and set up the studio.",
    docs_intro_start: "Start with installation",
    docs_intro_start_link: "#install",
    docs_search_placeholder: "Search docs…",
    docs_search_noresult: "No results — try a different word.",
    docs_sidebar_title: "Contents",
    docs_nav_install: "Installation",
    docs_nav_token: "Token Configuration",
    docs_nav_settings: "Settings",
    docs_nav_shortcuts: "Shortcuts",
    docs_nav_troubleshoot: "Troubleshooting",
    docs_nav_faq: "FAQ",

    docs_install: [
      { title: "Windows", steps: [
        "Download Krevyx.Ultra.3.12.0.exe from the GitHub Releases page.",
        "Double-click the downloaded file to run it.",
        "If Windows SmartScreen warns, click 'Run anyway'.",
        "Follow the steps in the installation wizard.",
        "Launch Krevyx from the desktop shortcut.",
      ] },
      { title: "macOS", steps: [
        "Download Krevyx.Ultra-3.12.0-arm64.dmg from the GitHub Releases page.",
        "Double-click the DMG file to mount it.",
        "Drag the Krevyx application to the Applications folder.",
        "If 'App cannot be verified' appears on first launch: System Settings → Privacy & Security → click 'Open Anyway'.",
        "Launch Krevyx from the Dock or Launchpad.",
      ] },
      { title: "Linux", steps: [
        "Download Krevyx.Ultra-3.12.0.AppImage from the GitHub Releases page.",
        "Open a terminal and run: chmod +x Krevyx.Ultra-3.12.0.AppImage",
        "Double-click the file or launch with ./Krevyx.Ultra-3.12.0.AppImage",
        "Optional: sudo mv Krevyx.Ultra-3.12.0.AppImage /usr/local/bin/krevyx to add to PATH.",
      ] },
      { title: "From Source", steps: [
        "Make sure Node.js 22+ is installed.",
        "git clone https://github.com/yasinkaya701/OllamaX.git krevyx",
        "cd krevyx",
        "npm install",
        "npm start",
        "(To build: npx electron-builder --linux)",
      ] },
    ],

    docs_token_title: "Token Configuration",
    docs_token_desc: "Configure your API keys locally and securely without leaving the app. No key is ever sent to any server.",
    docs_token_steps: [
      { label: "Open the Tools panel", desc: "Use ⌘L (Mac) or Ctrl+L (Windows/Linux) from the top-right to open the Tools panel. Alternatively click the tools icon in the top-right." },
      { label: "Switch to the APIs tab", desc: "Once the panel opens, click the 'APIs' tab. All supported providers are listed." },
      { label: "Enter your tokens", desc: "Paste your API token into each provider's field. Multiple providers can be active simultaneously." },
      { label: "Save", desc: "Click 'Save API Keys'. Keys are stored only in your local data folder." },
      { label: "Verify", desc: "Use the 'Test Connection' button in each provider field to test the connection instantly." },
    ],
    docs_token_providers_title: "Supported Providers",
    docs_token_providers: "Ollama (local) · OpenAI · Anthropic · Gemini · OpenRouter · xAI · Mistral · DeepSeek · Groq · Cohere · Perplexity · Together · Cerebras · Fireworks · Replicate · Azure OpenAI · AWS Bedrock · LM Studio",
    docs_token_security: "API keys are stored in the app's local data folder. Never sent to any server or cloud. You can verify the SHA-256 hash chain via Audit Log → Verify.",

    docs_settings_title: "Settings",
    docs_settings_items: [
      { title: "General", desc: "Theme (dark/light), language, default agent role and team preset." },
      { title: "Model", desc: "Default model, temperature, top_p, max_tokens, top_k and system prompt." },
      { title: "Composer", desc: "Default workspace folder, auto-context addition and task list behavior." },
      { title: "GitHub Discovery", desc: "Refresh frequency, favorite categories and auto-open search." },
      { title: "Security", desc: "API keys, audit log verification, hash chain check." },
    ],

    docs_shortcuts_title: "Shortcuts",
    docs_shortcuts: [
      { keys: "⌘L / Ctrl+L", desc: "Toggle Tools panel" },
      { keys: "⌘K / Ctrl+K", desc: "Open command palette" },
      { keys: "Ctrl+Enter", desc: "Send (Composer mode)" },
      { keys: "Ctrl+Shift+P", desc: "Change agent role" },
      { keys: "Ctrl+N", desc: "New chat" },
      { keys: "Ctrl+.", desc: "Troubleshooting console" },
      { keys: "/prompt", desc: "Invoke Prompt Builder" },
      { keys: "/improve", desc: "Improve the prompt" },
      { keys: "/summarize", desc: "Summarize text" },
      { keys: "/translate", desc: "Translate text" },
    ],

    docs_troubleshoot_title: "Troubleshooting",
    docs_troubleshoot: [
      { q: "App won't launch", a: "Windows: Right-click → Run as administrator. macOS: System Settings → Privacy & Security → 'Open Anyway'. Linux: check if FUSE is installed (sudo apt install libfuse2)." },
      { q: "Models not visible", a: "Ensure Ollama is running: ollama serve. Click 'Refresh' in the Tools → Ollama tab." },
      { q: "API connection error", a: "Verify your token is correct. Use 'Test Connection' for each provider individually. If behind a firewall/proxy, allow outbound HTTPS." },
      { q: "GitHub discovery is empty", a: "Cache is building on first launch — wait 10-30 seconds. Check your internet connection. In offline mode, the last cache is used." },
      { q: "Composer won't write files", a: "Ensure the workspace folder is writable. Check Settings → Composer → default workspace folder." },
      { q: "Audit log verification failed", a: "Hash chain files may be corrupted. Clear via Audit Log → Clear and start a new session." },
    ],

    // Roadmap
    roadmap_index: "— Roadmap",
    roadmap_label: "Future",
    roadmap_title: "v3.13.0 is on the way.",
    roadmap_sub: "After the orchestration layer comes the full release. Upcoming goals and planned versions live here.",
    roadmap_items: [
      { version: "v3.12.x", title: "Orchestration expansion", desc: "Chain tuning and rollback for Claude Code → Codex → Antigravity flows; automatic compatibility detection in local agent discovery.", status: "developing", goals: ["Per-step chain parameters (temperature, model selection)", "Undo support and chain checkpoint logging", "Automatic version compatibility detection in local agent discovery"], note: "The orchestration layer already works — this release hardens it for production." },
      { version: "v3.13.0", title: "Windows & macOS release", desc: "The NSIS installer and DMG packages landed on GitHub releases — one-click install is live on all three platforms.", status: "done", goals: ["Windows NSIS installer with auto-update channel", "Signed macOS DMG (Apple Silicon + Intel)", "One-click install experience on every platform"], note: "Completed: installers for all three platforms are now directly downloadable from the site." },
      { version: "v3.14.0", title: "Agent marketplace & templates", desc: "One-click import of community agent roles, a profile template gallery, and export.", status: "idea", goals: ["Import community-shared agent profiles with one click", "Role and team template gallery", "JSON export of profiles"], note: "In research — will be shaped by community feedback." },
      { version: "2026 Q3", title: "Brand evolution", desc: "After the Krevyx identity, krevyx.com domain and first release notes, a launch campaign follows.", status: "idea", goals: ["krevyx.com domain goes live", "Launch video and campaign content", "First community feedback round and roadshow"], note: "The Krevyx identity is done; domain and launch are being planned." },
    ],
    roadmap_status_done: "Completed",
    roadmap_status_developing: "In development",
    roadmap_status_planned: "Planned",
    roadmap_status_idea: "Exploring",
    roadmap_detail: "Details",
    roadmap_roadmap_hint: "Click for details",

    // Vision
    vision_index: "— Why",
    vision_label: "Vision",
    vision_title: "One studio, boundless intelligence.",
    vision_sub: "Krevyx exists to free AI from single-cloud dependence. It unifies your local stack and the cloud in one orchestra — your data stays yours, the power stays yours.",
    vision_1_title: "Local first",
    vision_1_desc: "Your models run on your own machine. Code, conversations and memory never leave the desk — engineering data stays at home.",
    vision_2_title: "Cloud, on your terms",
    vision_2_desc: "18+ providers in one list. From OpenAI to DeepSeek, Azure to LM Studio — you manage your tokens, no lock-in.",
    vision_3_title: "Orchestration, one standard",
    vision_3_desc: "Run local agents including Claude Code, Codex and Antigravity in a single chain. One conductor, many soloists — one standard protocol.",

    // Misc
    lang_tr: "TR",
    lang_en: "EN",
    aria_download: "Download Krevyx",
    aria_github: "GitHub repository",
    aria_faq: "Frequently asked questions",
    downloads_recommended: "Recommended for your system",

    // Feedback
    feedback_index: "— 04",
    feedback_label: "Feedback",
    feedback_title: "Make your voice heard.",
    feedback_sub: "Krevyx is shaped by community feedback. Your suggestion, bug report or praise — it reaches the developer directly. Email is optional.",
    feedback_name: "Name (optional)",
    feedback_email: "Email (optional)",
    feedback_subject: "Subject",
    feedback_subject_placeholder: "Suggestion · Bug · General",
    feedback_message: "Your message",
    feedback_message_placeholder: "Write your thoughts…",
    feedback_submit: "Send",
    feedback_sending: "Sending…",
    feedback_sent: "Thanks! Your feedback reached us.",
    feedback_error: "Something went wrong — please try again.",
    aria_feedback: "Send feedback",
  },
};

export type TranslationKey = keyof typeof translations.tr;
