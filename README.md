<div align="center">

# 🤖 OllamaX Ultra Pro
### AI Agent Studio — Yerel & Bulut Modelleri · Çoklu Ajan Orkestrasyonu

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green.svg)]()
[![Electron](https://img.shields.io/badge/Built%20with-Electron-47848F.svg)](https://www.electronjs.org/)
[![Version](https://img.shields.io/badge/Version-2.5.0-purple.svg)]()

**OllamaX Ultra**, yerel Ollama modellerini ve bulut AI servislerini (OpenAI, Anthropic, Gemini) tek bir masaüstü uygulamasında birleştiren, çoklu ajan orkestrasyonu yapabilen premium bir AI geliştirme stüdyosudur.**

</div>

---

## ✨ Özellikler

| Özellik | Açıklama |
|---|---|
| 🤖 **Multi-Agent Orchestration** | Birden fazla AI ajanı paralel veya sıralı çalıştır |
| ⚡ **Yerel + Bulut** | Ollama, OpenAI GPT, Anthropic Claude, Google Gemini |
| 📁 **Dosya Sistemi Erişimi** | Projeyi aç, dosyaları gör ve AI'ya analiz ettir |
| 🐙 **GitHub Entegrasyonu** | Repo ara, klonla, otomatik proje analizi yap |
| ⌨️ **Gömülü Terminal** | Tam PTY terminal (xterm.js + node-pty) |
| 🌐 **LAN Orkestrasyon** | Birden fazla Ollama makinesini yönet |
| 💾 **Oturum Kalıcılığı** | Sohbet geçmişi ve ayarlar disk'e kaydedilir |
| 🔒 **Güvenlik Odaklı** | CSP başlığı, DOMPurify, git URL doğrulama |

---

## 🖥️ Windows'a Kurulum Kılavuzu (Arkadaşın İçin)

### Adım 1 — Önkoşulları Kur

> **Sırayla kur, atlamadan devam et!**

#### 1.1 Node.js (v18 veya üzeri)
1. [https://nodejs.org](https://nodejs.org) adresine git
2. **"LTS" (Long Term Support)** yazan yeşil butona tıkla
3. İndirilen `.msi` dosyasını çalıştır → "Next → Next → Install" (varsayılanları değiştirme)
4. Kurulum bitince **bilgisayarı yeniden başlat**

> Kurulumu doğrulamak için: `Windows Tuşu + R` → `cmd` yaz → Enter
> ```
> node --version
> npm --version
> ```
> Her ikisi de versiyon numarası göstermeli.

#### 1.2 Git
1. [https://git-scm.com/download/win](https://git-scm.com/download/win) adresine git
2. En üstteki 64-bit installer'ı indir
3. Kurulumda **tüm seçenekleri varsayılan** bırak → Install

#### 1.3 Ollama (Yerel AI için — İsteğe Bağlı)
> Eğer sadece OpenAI/Anthropic/Gemini kullanacaksan bu adımı atlayabilirsin.

1. [https://ollama.com](https://ollama.com) adresine git
2. **"Download for Windows"** butonuna tıkla
3. İndirilen `.exe` dosyasını çalıştır
4. Kurulumdan sonra bir model çek:
   ```
   ollama pull llama3.2:1b
   ```

---

### Adım 2 — OllamaX Ultra Pro'yu İndir

#### Seçenek A: GitHub'dan Kaynak Kod (Önerilen)
1. Bu sayfanın sağ üstündeki yeşil **"Code"** butonuna tıkla
2. **"Download ZIP"** seçeneğini seç
3. ZIP dosyasını `C:\Users\KULLANICI_ADI\Desktop\` gibi kolay bir yere çıkart
4. Klasörün adı `OllamaX-Ultra-Proje` olmalı

#### Seçenek B: Git ile Klonla (Daha iyi)
```
git clone https://github.com/yasinkaya701/OllamaX-Ultra-Pro.git
cd OllamaX-Ultra-Pro
```

---

### Adım 3 — Bağımlılıkları Yükle

> **ÖNEMLİ:** Komut İstemi'ni (`cmd`) veya **PowerShell**'i **yönetici olarak** aç.

1. `Windows Tuşu + R` → `cmd` yaz → `Ctrl+Shift+Enter` (yönetici olarak açar)
2. OllamaX klasörüne git:
   ```
   cd C:\Users\KULLANICI_ADI\Desktop\OllamaX-Ultra-Proje
   ```
   > **Not:** `KULLANICI_ADI` yerine kendi kullanıcı adını yaz
3. Bağımlılıkları yükle:
   ```
   npm install
   ```
   > Bu işlem 2-5 dakika sürebilir, internet bağlantısına göre değişir.

4. (İsteğe bağlı) Gömülü terminal için native bağımlılığı derle:
   ```
   npm run rebuild-pty
   ```
   > Bu olmadan terminal sekmesi çalışmaz, ama diğer tüm özellikler çalışır.

---

### Adım 4 — Uygulamayı Başlat

```
npm start
```

> İlk açılışta güvenlik uyarısı çıkabilir → **"Yine de çalıştır"** veya **"Allow"** de.

---

### Adım 5 — API Anahtarlarını Ekle (İsteğe Bağlı)

Uygulama açıldıktan sonra:

1. Sağ üstteki **"Tools"** butonuna tıkla
2. **"🔑 APIs"** sekmesini seç
3. Kullanmak istediğin servis için anahtarı gir:
   - **OpenAI:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - **Anthropic:** [console.anthropic.com](https://console.anthropic.com)
   - **Gemini:** [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
4. **"💾 Save API Keys"** butonuna tıkla

---

## 🍎 macOS'ta Kurulum

```bash
# 1. Önkoşullar (Homebrew ile)
brew install node git

# 2. Repo'yu klonla
git clone https://github.com/yasinkaya701/OllamaX-Ultra-Pro.git
cd OllamaX-Ultra-Pro

# 3. Bağımlılıkları yükle
npm install

# 4. (İsteğe bağlı) Gömülü terminal
npm run rebuild-pty

# 5. Başlat
npm start
```

---

## 🐧 Linux'ta Kurulum

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install -y nodejs npm git

# Fedora
sudo dnf install -y nodejs npm git

# Repo ve kurulum
git clone https://github.com/yasinkaya701/OllamaX-Ultra-Pro.git
cd OllamaX-Ultra-Pro
npm install
npm start
```

---

## ⚙️ Kullanım Kılavuzu

### İlk Adımlar

1. **Ajan Ekle:** Sol panelden `+ Add` → isim, model ve provider seç → `Create Agent`
2. **Mesaj Gönder:** Alt kısımdaki kutuya yaz → `Enter`
3. **Sağ Panel:** `Tools` butonu → API anahtarları, GitHub, dosyalar, modeller

### Klavye Kısayolları

| Kısayol | İşlev |
|---|---|
| `⌘/Ctrl + K` | Mesaj kutusuna odaklan |
| `⌘/Ctrl + L` | Sağ araçlar panelini aç/kapat |
| `⌘/Ctrl + ,` | Ayarlar |
| `⌘/Ctrl + \`` | Gömülü terminali aç/kapat |
| `Shift + Enter` | Mesajda satır atla (göndermeden) |

### Çoklu Ajan Orkestrasyonu

Lead Agent, diğer ajanları şu komutlarla yönlendirebilir:

```
//CALL:AjanAdı görev açıklaması
//CALL_PARALLEL:AjanAdı paralel görev
```

**Örnek:** Bir Lead Agent, önce `Code Expert` ajanına kod yazmasını, sonra `Code Reviewer` ajanına incelemesini söyleyebilir.

### Prompt Şablonları

Sol panelde hazır şablonlar var:
- 🔬 Research Assistant
- 💻 Coding Expert
- ✍️ Writing Assistant
- 📊 Data Analyst
- 🚀 DevOps Engineer
- 🎓 Learning Tutor
- 🎨 Creative Thinker
- 🔍 Code Reviewer
- ⭐ Orchestrator (Lead Agent)

---

## 🗂️ Proje Yapısı

```
OllamaX-Ultra-Proje/
├── src/
│   ├── main.js              # Electron ana süreç
│   ├── main-security.js     # Güvenlik yardımcıları
│   ├── preload.js           # IPC köprüsü
│   ├── shared/
│   │   ├── model-catalog.json
│   │   └── team-presets.json
│   └── renderer/
│       ├── index.html       # Ana UI
│       ├── app.js           # Tüm UI mantığı (~1700 satır)
│       ├── styles.css       # Tüm stiller (~700 satır)
│       └── lib/
│           └── delegate-parse.js  # Ajan delegasyon ayrıştırıcı
├── assets/
│   ├── icon.png
│   └── logo.png
├── docs/
│   └── DEPLOY.md
├── GEMINI_SECURITY.md       # Güvenlik ve mimari dökümantasyonu
├── package.json
└── README.md
```

---

## 🔧 Sorun Giderme

### "npm start" çalışmıyor
```
# Bağımlılıkları sil ve yeniden yükle
rmdir /s /q node_modules  (Windows)
rm -rf node_modules       (Mac/Linux)
npm install
npm start
```

### Ollama bağlanmıyor
- Ollama'nın çalışıp çalışmadığını kontrol et: [http://localhost:11434](http://localhost:11434)
- Başlatmak için: `ollama serve`
- Ayarlar panelinden host:port değiştirilebilir (LAN makineleri için)

### Terminal sekmesi çalışmıyor
```
npm run rebuild-pty
```
Visual Studio C++ araçları gerekebilir:
```
npm install -g windows-build-tools
```

### Uygulama gri/boş açılıyor
- Node.js v18+ kullandığından emin ol
- `npm install` tekrar çalıştır

### Antivirus uyarısı veriyor
- Electron uygulamaları bazı antivirüsleri tetikleyebilir
- Windows Defender'da `OllamaX-Ultra-Proje` klasörünü istisna listesine ekle

---

## 📦 Kurulabilir Uygulama (.exe) Oluşturma

> **Sadece kendi bilgisayarında build al, bu build yalnızca kendi PC'nde çalışır.**

```bash
# Windows .exe (Portable)
npm run build:win

# macOS .dmg
npm run build:mac

# Linux AppImage
npm run build:linux
```

Çıktı `dist/` klasöründe oluşur.

---

## 🔐 Güvenlik Notları

- API anahtarları yerel olarak saklanır (uygulama veri klasörü)
- Ağ istekleri yalnızca güvenilir sunuculara yapılır (CSP koruması)
- Git clone yalnızca github.com, gitlab.com, bitbucket.org ve codeberg.org'dan izin verilir
- Terminal komutları korumalı çalışır

---

## 🤝 Katkıda Bulunma

1. Fork et
2. Branch oluştur: `git checkout -b feature/yeni-ozellik`
3. Değişikliklerini commit et
4. Pull Request aç

---

## 📄 Lisans

MIT License — Detaylar için [LICENSE](LICENSE) dosyasına bak.

---

<div align="center">
Yasin Kaya tarafından ❤️ ile yapıldı
</div>
