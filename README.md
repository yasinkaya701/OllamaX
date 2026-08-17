<div align="center">


# 🤖 Krevyx — Open-Source AI Agent Studio
### Local Ollama + 18 Cloud Providers, Tek Stüdyoda Agent Orkestrasyonu

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Release](https://img.shields.io/github/v/release/yasinkaya701/OllamaX?label=Latest&color=green)](https://github.com/yasinkaya701/OllamaX/releases/latest)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](https://github.com/yasinkaya701/OllamaX/releases/latest)

**Krevyx**, yerel gücü (Ollama) ve bulut zekasını (OpenAI, Claude, Gemini, 18+ sağlayıcı) hibrit bir mimaride birleştiren, tamamen açık kaynak (MIT) bir yapay zeka ajan stüdyosudur. Ajanlar, ekipler, Composer modu, MCP sunucuları ve CLI modu tek uygulamada birleşir.

[Özellikler](#-özellikler) • [CLI](#-krevyx-cli-v318) • [Kurulum Rehberi](#-kurulum-rehberi) • [Windows](#-windows-kurulum) • [macOS](#-macos-kurulum) • [Kullanım](#-kullanım-kılavuzu)

</div>

---

## ✨ Özellikler

- **🎭 Ajan Orkestrasyonu:** Çoklu ajanlar, ekipler ve Head-Agent tabanlı zincir yürütme (v3.16+).
- **🔗 18+ Bulut Sağlayıcı + Ollama:** Tek stüdyoda yerel ve bulut modelleri, anahtarsız Ollama keşfi.
- **🖼️ Composer Modu:** Proje dosyalarını bağlayan, çok adımlı görev yürüten kompozisyon katmanı.
- **🔌 MCP Ekosistemi:** Sunucu yönetimi + ajan başına MCP setleri (her ajan kendi araç kümesini taşır).
- **📦 Şablon & Eklenti Sistemi:** Prompt şablonları (CRUD + import/export) ve JS eklenti yükleyici (v3.17).
- **🖥️ Krevyx CLI:** Penceresiz (headless) `krevyx run` ile CI/CD entegrasyonu (v3.18).
- **📋 Audit Log:** Zincir doğrulaması + JSON/CSV/SARIF export (v3.18).
- **🌐 Browser Control:** Headless Chromium CDP ile ajanlara tarayıcı kontrolü (v3.18).
- **🔒 Keychain Vault & Air-Gapped Mod:** Anahtar kasası + ağ modları (v3.14).
- **📜 Quest Log:** Ajanlara atanan görevlerin gerçek zamanlı takibi.

---

## 🖥️ Krevyx CLI (v3.18)

Uygulamayı açmadan terminalden ajan çalıştırın — CI/CD boru hatlarına ve sunucu ortamlarına uygundur.

```bash
# Doğrudan klon ile
pnpm install
cd OllamaX && node bin/krevyx.js run "projenin README'sini özetle" --mode local

# Profil paketi paylaşımı
node bin/krevyx.js profile export my-studio.krevyxprofile
node bin/krevyx.js profile import /tmp/my-studio.krevyxprofile
```

**`.krevyxprofile`** formatı; ajan profillerini, şablonları, provider (anahtarsız) config'lerini ve MCP tanımlarını tek dosyada paketler. API anahtarları asla paketlenmez.

---

## 🛡️ Enterprise / Denetim (v3.18)

- **Ajan–MCP Broker:** Her ajana ayrı MCP sunucu seti atanır; baş ajan (Head-Agent) diğer ajana promt yönlendirir.
- **Denetim Export:** Etkinlik günlüğü `JSON`, `CSV` veya GitHub Actions ile uyumlu `SARIF` olarak dışa aktarılabilir; zincir bütünlüğü hash doğrulamasıyla garantilenir.

---

## 🚀 Kurulum Rehberi

Aşağıdaki adımları sırasıyla takip ederek Krevyx Ultra'yı 5 dakika içinde çalıştırabilirsiniz.

### 📋 Önkoşullar
Uygulamayı çalıştırmak için bilgisayarınızda şunların kurulu olması gerekir:
1. **Node.js (v18+):** [İndir](https://nodejs.org/)
2. **Git:** [İndir](https://git-scm.com/)
3. **Ollama (Opsiyonel):** Yerel modeller için [İndir](https://ollama.com/)

---

### 🪟 Windows Kurulum

Windows kullanıcıları için adım adım görsel rehber:

#### 1. Projeyi İndirin
GitHub sayfasındaki yeşil **"Code"** butonuna basın ve **"Download ZIP"** deyin. Dosyayı masaüstüne çıkartın.

#### 2. Terminali Açın (Yönetici Olarak)
`Windows Tuşu`na basın, `cmd` yazın ve **"Yönetici Olarak Çalıştır"** deyin.

#### 3. Klasöre Gidin ve Kurun
```cmd
cd Desktop\Krevyx
npm install
```
*Bu aşamada bağımlılıklar internetten indirilecektir.*

#### 4. Uygulamayı Başlatın
```cmd
npm start
```

---

### 🍎 macOS Kurulum

Mac kullanıcıları için hızlı kurulum adımları:

#### 1. Homebrew ile Gerekli Araçları Kurun
Eğer kurulu değilse:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node git
```

#### 2. Klonlayın ve Çalıştırın
```bash
git clone https://github.com/yasinkaya701/Krevyx.git
cd Krevyx
npm install
npm start
```

---

## 🛠️ Kullanım Kılavuzu

### 1. API Anahtarlarını Ayarlama
Sağ üstteki **Tools (⚙️)** butonuna basın. **APIs** sekmesine gidin ve OpenAI, Anthropic veya Gemini anahtarınızı girip **Save** deyin.

### 2. Ajan Orkestrasyonu
`⭐ Agentic Orchestrator (Lead)` ajanı ile başlayın. O, diğer uzman ajanları (Coder, Security, Architect) otomatik olarak yönetecektir.

**Örnek Komut:**
> "Yeni bir e-ticaret sitesi için güvenlik analizi yap ve ardından Python ile basit bir backend iskeleti oluştur."

---

## 📦 Build (Uygulama Dosyası Oluşturma)

Kendi `.exe` veya `.app` dosyanızı oluşturmak isterseniz:

- **Windows:** `npm run build:win`
- **Mac:** `npm run build:mac`

Çıktılar `dist/` klasöründe oluşacaktır.

---

## 🔑 API Anahtarları Nasıl Alınır?

Uygulamayı tam kapasite kullanmak için AI servislerinden API anahtarı almanız gerekir. İşte seçenekleriniz:

### 1. Google Gemini (🎁 Önerilen - Ücretsiz Seçenek)
En cömert ücretsiz tarifeye sahiptir.
- **Nasıl Alınır?** [Google AI Studio](https://aistudio.google.com/apikey) adresine gidin.
- **Ücret:** "Free Tier" seçeneği ile (belirli limitler dahilinde) **tamamen ücretsizdir.**
- **Kurulum:** Aldığınız anahtarı uygulamada `Tools > APIs > Gemini` kısmına yapıştırın.

### 2. OpenAI (GPT-4o)
Dünyanın en popüler modeli, ancak genellikle ücretlidir.
- **Nasıl Alınır?** [OpenAI Platform](https://platform.openai.com/api-keys) adresine gidin.
- **Ücret:** Yeni hesaplara bazen 5$ kredi tanımlanır, ancak genellikle hesabınıza minimum 5$ yüklemeniz gerekir (Kullandıkça Öde).
- **Kurulum:** `Tools > APIs > OpenAI` kısmına yapıştırın.

### 3. Anthropic (Claude 3.5 Sonnet)
Kodlama ve mantık yürütmede en iyisidir.
- **Nasıl Alınır?** [Anthropic Console](https://console.anthropic.com/) adresine gidin.
- **Ücret:** Genellikle ücretlidir (Kullandıkça Öde). Bazı durumlarda başlangıç kredisi verilebilir.
- **Kurulum:** `Tools > APIs > Anthropic` kısmına yapıştırın.

---

### 🗃️ API Anahtarları Nereye Girilir?
1. Uygulamanın sağ üst köşesindeki **Tools (⚙️)** butonuna basın.
2. Açılan panelde en üstteki **🔑 APIs** sekmesine tıklayın.
3. İlgili kutucuğa anahtarınızı yapıştırın.
4. Alt kısımdaki **💾 Save API Keys** butonuna basmayı unutmayın!

---

## 🔐 Güvenlik ve Gizlilik
- API anahtarlarınız asla uzak sunuculara gönderilmez, sadece sizin yerel makinenizde saklanır.
- CSP (Content Security Policy) ile XSS saldırılarına karşı tam koruma sağlanmıştır.
- Zero-Trust mimarisi ile terminal komutları denetlenir.

---

## 📄 Lisans

Copyright © 2026 **Yasin Kaya**. Tüm Hakları Saklıdır.

Bu yazılımın izinsiz kopyalanması, dağıtılması veya ticari amaçla kullanılması kesinlikle yasaktır. Bu proje Yasin Kaya'nın özel mülkiyetindedir.

---

<div align="center">
  <p>Made with ❤️ by <b>Yasin Kaya</b></p>
  <p>Industrializing AI for the next generation of engineers.</p>
</div>
