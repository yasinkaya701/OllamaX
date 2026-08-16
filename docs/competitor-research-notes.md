# Rakip Araştırma Notları — Ağustos 2026

## Pazar boyutu
- AI Code Tools pazarı: ~7,34 milyar $ (2025), 2026–2034 CAGR %26 (Polaris)
- Cursor tek başına 2026 başında 2 milyar $ ARR
- Gartner: 2025 AI code-asistan pazarı 3–3,5 milyar $
- Merge edilen kodun %22'si artık AI üretimi; AI-eşli PR'larda ~1,7x daha fazla issue

## Rakip durumları (doğrulanmış: 2026 Ağustos)

### Cursor (Anysphere)
- IDE (VS Code fork), Composer + background agents + Bugbot (agentic review)
- Model: çoklu (Claude Opus 4.8, GPT-5.5, Gemini, kendi Composer modeli) — model router
- Fiyat: Free / Pro $20 / Pro+ $60 / Ultra $200 / Teams $40 kullanıcı. Kredi tabanlı faturalama.
- Cloud agents, MCP (paid), team marketplace (iç kurallar + skill paylaşımı), shared team context
- Değerleme: ~$29,3B (Nvidia+Google yatırımcı), $50B tur konuşuluyor

### Claude Code (Anthropic)
- Terminal-native CLI agent; VS Code/JetBrains eklentisi + desktop
- Sadece Claude modelleri; CLAUDE.md proje talimatları; permission-gated
- Fiyat: Claude Pro $20 (17 yıllık) / Max 5x $100 / Max 20x $200 / Team Standard $25 ($20 yıllık, Claude Code erişimi belirsiz!) / Team Premium $125/seat — asıl ekip fiyatı 5x
- Context: 200K standard, Max/Team Premium'da 500K
- Agent orchestration: subagent + hooks (head-agent konsepti kısmen)

### Codex (OpenAI)
- CLI + VS Code/Cursor/Windsurf eklentisi + desktop + web + iOS; cloud sandbox task queue
- Modeller: GPT-5.6 Sol/Terra/Luna, GPT-5.5, `/model` ile oturum içi geçiş
- ChatGPT planına gömülü: Free/Go $8/Plus $20/Pro $100/Pro 20x $200/Business $25
- `/permissions` izin hiyerarşisi; sandboxed varsayılan
- Cloud: otomatik code review, Slack entegrasyonu, kuyruklu unattended cloud tasks

### Antigravity (Google DeepMind)
- Agent-first platform: editör+terminal+browser tek yüzey; plan-execute-verify
- Public preview ÜCRETSİZ — agresif büyüme hamlesi; AI Pro ~$20 / AI Ultra $100-200
- Modeller: Gemini 3 Pro + Claude Sonnet 4.5 + GPT-OSS (3 laboratuvar tek arayüzde — eşsiz)
- Browser control native (tek rakipte var); I/O 2026'da Antigravity 2.0 (desktop+CLI+SDK)

### Windsurf (Cognition tarafından satın alındı — $2,4B)
- Mart 2026 fiyat artışı: $15→$20 Pro, $30→$40 Teams; avantajı yitirdi

### GitHub Copilot
- En ucuz giriş: Pro $10/ay; Enterprise $39; Business $19/seat

## Trendler / boşluklar
1. Tüm büyük oyuncular terminal-IDE-cloud üçlüsüne yakınsıyor; fiyatlar $200'ta birleşti → fiyat artık farklılaşıcı DEĞİL
2. "Çoklu araç kullanımı" yaygın: IDE + terminal agent paralel kullanılıyor → CodeAgentSwarm gibi "swarm" arayüzleri doğuyor (Krevyx'in baş-agent orkestrasyonu TAM bu trend)
3. Kurumsal güven: Claude Code Team Standard'da erişim muğlaklığı; gizlilik/şeffaflık sorunu var → yerel-önce + air-gapped fark
4. Maliyet görünürlüğü: tüm araçlar kredi tabanlı belirsiz faturalama → Krevyx Cost Engine'de şeffaf maliyet kontrolü fark (token başına, bütçe kapatma, çok sağlayıcılı karşılaştırma)
5. Anti-lock-in: tüm vendor'lar kendi model ailesine zorluyor (Claude Code) veya plan karmaşası (Codex/ChatGPT gömülü) → Krevyx: model/model-lab bağımsız, herhangi bir OpenAI-uyumlu API uç noktasına bağlanır
6. Eklenti ekosistemi: Cursor'ın team marketplace'i kapalı; Krevyx açık kaynak MIT + plugin marketplace açık kapak farkı
7. Offline/yerel model desteği (Ollama kökeni) — Antigravity/Cursor/Claude Code tamamen cloud
8. Browser-native kontrol yalnızca Antigravity'de → Krevyx'e eklenebilir
9. Agent orkestrasyonu (baş-ajan + zincir) hiçbir rakipte GUI'li olarak YOK
10. Air-gapped mod + keychain vault kurumsal/security segmentte boşluk
