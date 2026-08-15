# Krevyx Ultra — Windows kurulumu

## Gereksinimler

- **Windows 10/11** (64 bit).
- **[Node.js](https://nodejs.org/)** LTS — sadece kaynak koddan çalıştıracaksanız.
- **Git for Windows** — depoyu klonlamak için (isteğe bağlı).
- **Ollama for Windows** — yerel modeller için: [ollama.com](https://ollama.com)

## A) Kaynak koddan çalıştırma

1. **PowerShell** veya **cmd** ile proje klasörüne gidin:

```powershell
cd C:\path\to\Krevyx
npm install
npm start
```

2. Güvenlik duvarı Node/Electron için soru sorarsa **erişime izin ver** deyin (yerel ağ / Ollama için `localhost`).

## B) Taşınabilir (.exe) paket

```powershell
npm install
npm run build:win
```

Çıktı: **`dist/`** altında portable `.exe` ( `package.json` içindeki `electron-builder` hedefiyle uyumludur).

- İlk çalıştırmada **Windows Defender SmartScreen** uyarısı çıkabilir: *Daha fazla bilgi → Yine de çalıştır* (imzasız derleme için normaldir).
- Kurumsal ortamda: IT politikası `.exe` çalıştırmayı kısıtlıyorsa MSI/Imza için [docs/DEPLOY.md](DEPLOY.md) bölümüne bakın.

## Donanım bilgisi

Uygulama RAM kullanımını üst çubuda gösterir. Windows’ta CPU adı için `wmic` kullanılır; bu komut bazı sürümlerde kısıtlı olabilir — o durumda genel CPU etiketi gösterilir.

## API anahtarları

1. **Araçlar** paneli → **APIs**.
2. Anahtarları yapıştırın → **Kaydet** (model listeleri otomatik yenilenir).
3. Üstte **↻ API** ile bulut sağlayıcı listesini tekrar çekebilirsiniz.

## Sorun giderme

- `npm` tanınmıyorsa: Node.js kurulumundan sonra terminali kapatıp yeniden açın; `PATH` içinde `node` ve `npm` olduğunu doğrulayın (`where npm`).
- Ollama yok: sadece bulut sağlayıcılarını kullanın veya [Ollama Windows](https://ollama.com/download) kurun.
