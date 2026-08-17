# Rakip Öncül Özellik Araştırması — Kaynak Notları (2026-08-17)

## Cursor (kaynak: deployhq.com/guides/cursor, daily.dev review, artificialintelligence-news)
- **Composer (multi-file diff)**: birden çok dosyaya adım adım değişiklik, diff review paneli. Agent Mode: uzun döngü — kod tabanını okur, düzenler, test çalıştırır, döngüde kalır.
- **Parallel Agents**: birçok ajan aralarında çakışmadan paralel çalışır (Cursor 2.0).
- **Background Agent**: bulut sandbox'ta uyurken iş yapan ajan; issue okur, branch açar, PR taslağı.
- **BugBot**: PR'lara otomatik inline kod review (GitHub webhooks).
- **Cursor Rules (.cursor/rules/*.mdc)**: YAML frontmatter (description, globs, alwaysApply) ile koşullu, dosya kapsamalı kurallar; agents.md standart fallback; `.claude/CLAUDE.md` tarzı project memory.
- **Tab autocomplete (Sonic)**: sub-100ms düşük gecikmeli tamamlama, kendi hızlı modeli.
- **Composer-1**: kendi multi-file edit uzmanı modeli; görev başına model seçimi (sonnet/opus/gpt/gemini).
- **MCP GUI + mcp.json**: global ve proje kapsamı MCP sunucuları, stdio/SSE, marketplace.
- **Headless CLI**: CI için `cursor --headless "..." --branch ...`, MCP/kuralları paylaşır.
- **Privat Modu**: kodu sunucularda saklamama, telemetry opt-out.

## Claude Code (kaynak: mindstudio.ai Code with Claude 2026, swanbase.co guide, prg.sh slash commands)
- **Dreaming**: oturumlar arasında çalışan zamanlanmış hafıza kürasyonu — örüntüleri çıkarır, hafızayı yüksek-sinyal tutar; ajanlar işletildikçe daha iyi olur.
- **Outcomes (grading agent)**: görevi bitirdikten sonra ayrı bir puanlama ajanı rubrik'e göre çıktıyı değerlendirir; yetersizse geri atar; webhook ile bildirim. Yalnızca yapısal değişimle +8.4–10.1% kalite.
- **Multi-agent orchestration**: lead ajan işi böler, uzman alt-ajanlara (farklı model/prompt/araç) paralel dağıtır; ortak dosya sistemi; lead orta işte kontrol edebilir; Claude Console'da denetlenebilir.
- **Sub-agents**: `.claude/agents/` (proje) + `~/.claude/agents/` (kullanıcı); markdown+YAML; rol kısıtı (sadece okuma, sadece test vb.). `/agents` ile oluşturulur.
- **Hooks**: `PreToolUse`/`PostToolUse`/`Notification`/`SessionStart`/`SessionEnd` olaylarında otomatik shell komutu (örn .env koruması, her düzenleme sonrası prettier).
- **Skills**: tekrarlanabilir iş akışı tarifleri — `/review-pr`, `/deploy-staging` gibi takımla paylaşılan komutlar.
- **Pluginler**: önceden yapılandırılmış skill+subagent+hook+MCP paketleri, marketplace.
- **CLAUDE.md**: proje kökünde otomatik okunan hafıza/kurallar; iki katman (repo + ~/.claude/CLAUDE.md). 2026: otomatik hafıza (çalışırken öğrenme).
- **Plan Mode**: salt-okuma, keşif yap, plan sun, onayla, uygula (Shift+Tab).
- **Slash komutları**: /compact (bağlam özetleme+değiştirme), /review, /security-review, /diff, /permissions, /plan, /Advisor (farklı model ajan çağırma).
- **MCP + Channels**: Linear/GitHub/Slack MCP sunucuları; Telegram/Discord/webhook kanalları dış olayları oturuma iter.
- **Add-ins**: ajan yazılımın içine gömülü çalışır (ör. Word içi).

## Codex CLI (önceden bilinen + araştırma)
- **Sandbox (bubblewrap/bwrap)**: read-only rootfs + network izole; dosya değişiklikleri otomatik git diff+commit; --approval-model (auto/on-request/off).
- **TUI + headless**: `codex exec` non-interaktif, stdin'den prompt; `codex prompt` interaktif.
- **Session resume**: `codex resume <id>` — oturum kimliğiyle devam; çoklu oturum yönetimi.
- **Approval model**: onay politikaları (auto, on-request, off); sandbox önkoşulu bubblewrap; read-only sandbox varsayılan.
- **WebSocket transport**: responses API üzerinden gerçek zamanlı akış; hata retry (2/5).

## Gemini CLI / Antigravity (önceden bilinen)
- `-p` prompt modu; auth: GEMINI_API_KEY/VertexAI/GCA; exit 41 auth eksik; IDE entegrasyonu, Google Cloud iş akışları, slash komutları.

## Windsurf (genel bilgi)
- **Cascade**: adımlı çoklu edit ajanı; editor + terminal + file context farkındalığı.
- **Supercomplete**: sekme basmaya gerek kalmadan akıllı next-edit tahmini (ghost edit).
- **Memory**: proje bağlamını öğrenen persistent memory.

## Zed (genel bilgi)
- **Agent Mode**: kod tabanı bağlamı + plan-onay döngüsü.
- **Speed**: GPU hızlandırma, Rust; supermaven-benzeri ultra hızlı completion.

## Krevyx'in mevcut envanteri (v3.20 itibarıyla)
- ÇOKLU SAĞLAYICI: 19+ provider (Ollama, OpenAI, Anthropic, Manus...), multi-chat, agent orkestrasyonu (lead→worker zinciri), MCP setleri, profiller/ekipler, /prompt oluşturma ajan, slash komut sistemi, repo entegrasyonu, başsız CLI (krevyx run), .krevyxprofile paketleri, SARIF audit, keychain vault, air-gap mod, gerçek süreç ajan köprüsü (Claude/Codex/Antigravity: spawn, stream, IPC, CWD, stop, --resume), headless kod ajanları.

## Boşluk Haritası (Krevyx'te OLMAYAN öncül özellikler)
1. **Plan Mode** (Claude Code) — uygulama öncesi salt-okuma plan + onay → yüksek etki, uygun (UI'da /plan toggle).
2. **Slash komut yetkisi/skills** (Claude Code skills, /compact, /review) — mevcut / sistemi var, yetkilendirme+şablon eksik.
3. **Hooks** (Claude Code PreToolUse/PostToolUse) — orta etki, bridge'e eklenebilir.
4. **Persistent memory / CLAUDE.md benzeri KREXYX.md** (Claude Code, Cursor rules) — hafıza katmanı yok → orta etki.
5. **Outcomes/grading loop** (Anthropic) — görev sonrası öz değerlendiren grading ajanı → yüksek etki, Krevyx'in orkestrasyonuna çok uygun.
6. **Auto-review / PR diff özeti** (Cursor BugBot, Claude /review) — mevcut kod ajanları için diff çıkarımı + özet.
7. **Prompt tamamlama / ghost (Windsurf Supercomplete)** — UI'da prompt yazarken şablon/öneri → düşük-orta etki.
8. **Paralel alt-ajan fan-out** (Cursor parallel agents, Anthropic multi-agent) — zincir var, fan-out paralel yok.

## Uygulama Sırası (önerilen, Faz 2'de netleşecek)
1. KREYX.md / .krevyxprofile hafıza + kurallar (proje kökü otomatik yükleme)
2. Plan Mode toggle + /plan slash komutu
3. Grading ajanı (Outcomes benzeri: görev bitince öz değerlendirme raporu)
4. Hooks (task-start/task-done/step olayları; sarif audit entegre)
5. Diff review (kod ajanları bitince yapılan değişikliklerin özet raporu)
