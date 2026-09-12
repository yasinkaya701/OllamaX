# v3.18 Mimari Notları

## Mevcut durum
- `package.json`: bin YOK; main src/main.js; scripts: start/build:/test/lint/audit:verify
- `src/main/mcp/client.js`: stdio MCP istemcisi, ALLOWED_COMMANDS allowlist (npx/node/uvx/bun/deno/uv/pipx), McpClient class, validateConfig static, graceful degrade
- `src/main/tools/registry.js`: ~22 yerleşik araç; tier read/write/exec; approval mekanizması; manifestById Map; tool listesi getToolManifests benzeri export var (doğrula)
- `src/main/agents/orchestrator.js`: ajan registry (claude-code, codex, antigravity, ollama, shell); evrensel dispatcher run(); zincir handoff; 271 satır
- `src/main/workflow/engine.js`: 189 satır; adım zinciri; renderer'dan ipc:3:workflow-run
- `src/main/audit-log.js`: 134 satır; JSONL hash zinciri; logEntry(actor,action,detail,durationMs,customPath); auditLogPath config-store'da; MAX_AUDIT_BYTES 50MB
- `src/renderer/app.js`: 3656 satır, ~4 bölüm ayrıcı; v3.17 ekosistem panelleri (Şablonlar+Eklentiler) en sonda
- Config MCP ayarları: config-store'da "mcp" anahtarı yok — settings modal'ında MCP sunucu ekleniyor olmalı (ipc handler'a bak)

## v3.18 Tasarımı
1. **profile-package.js** (src/main/): .krevyxprofile = JSON (schemaVersion 1: profiles[], templates[], providers[], settings{}) + validate/kPackage/unpackage; IPC: profile-export, profile-import; UI: Şablonlar panelinde "Profil olarak dışa/İçe aktar"
2. **krevyx run CLI** (src/main/cli/run.js + bin/krevyx): headless mod; `krevyx run "prompt" --agent claude-code --dir . --output json`; electron olmadan doğrudan orchestrator + registry kullanır (node src/main/cli/run.js); package.json bin: "krevyx": "bin/krevyx.js"
3. **MCP broker genişletme** (src/main/mcp/broker.js): ajan başına MCP seti — config store'a mcp.agentSets {agentId: [serverName]} eklenecek; McpBroker.listForAgent() filtreler; IPC: mcp-agent-sets-get/set
4. **Browser tool** (src/main/tools/browser.js): puppeteer-core DEĞİL (ağır native) — child_process ile platform-native browser launch (chromium --headless=new CDP) yerine hafif: playwright yok; alternatif: node fetch + cheerio (web_fetch güçlendirme) + CDP basit client... Karar: src/main/tools/browser.js basit CDP client (websocket) — chromium'u spawn edip CDP üzerinden navigate/click/type/screenshot. Ajan aracı olarak registry'ye: browser_navigate, browser_click, browser_type, browser_screenshot
5. **Audit export** (src/main/audit-export.js): toJSON, toCSV, toSARIF; IPC: audit-export; UI: Ayarlar > "Denetim Günlüğü" export butonları
6. Testler: tests/v318-*.test.js
7. Site: roadmap v3.18 (CLI, profile, MCP, browser, audit export), changelog otomatik

## config-store gerçek yapısı (doğrulandı)
- defaultConfig(): { schemaVersion, app: {theme, language, ghostMode, defaultProvider, network:{mode}}, providers: {ollama:{hosts,defaultHostId,pollInterval}, openai:{apiKey,modelFallback}, anthropic:{apiKey}, gemini:{apiKey}}, agents: [], workspaces: [] }
- providers DICTIONARY (id -> config objesi), ARRAY değil! profile-package.js collectProviders fix gerekli: Object.entries(config.providers || {}).map(([id,p])=>({id,...stripSecrets(p)}))
- MCP sunucular: config.mcp.servers dizisi olarak saklanıyor (ipc handler startServer(name,config) — kalıcı storage nerede? mcp-servers-get gibi bir handler yok; sadece runtime listServers). MCP config kalıcı olarak config-store'da değilse import yalnızca runtime'ı etkileyecek — basitlik için MCP sunucu tanımını da config.mcp.servers'a yaz
- readConfig/updateConfig/resolvedProviders(config) mevcut; profiles key config'de YOK (agents var) — profile paketinde profiles yerine config.agents kullan
- templates module export: interpolatePrompt, templateDir, bundledTemplateDir, readTemplateFile, listTemplates, saveTemplate, deleteTemplate
- registry.js: manifestById Map; araçlar: read_file, list_dir, scan_project, create_file, edit_file, append_file, delete_file, terminal_execute, git_clone, search_memory, memory_add, generate_image, web_fetch
- ipc-v3-handlers.js: handler() helper; mcp-servers/mcp-server-start/mcp-server-stop var; line 332-336
- mcp/client.js: startServer/stopServer/listServers + McpClient class + ALLOWED_COMMANDS; validateConfig static

## İlerleme (güncel)
- TAMAMLANDI: profile-package.js (exportProfile/importProfile; CLI profile.js ile uyumlu API: export {name,templates,includeProviders}, import -> {ok, imported:{templates,agents,providers,mcpServers}})
- TAMAMLANDI: bin/krevyx.js (run + profile alt komutları), src/main/cli/run.js (orchestrator.runAgent/runChain + REGISTRY + normalizeOutput/normalizeFullOutput kullanır), src/main/cli/profile.js
- TAMAMLANDI: package.json bin ekli + license MIT; workflow package.json version-bump adımı commitlendi
- TAMAMLANDI: src/main/mcp/broker.js (getAgentMcpSets/setAgentMcpSets/serversForAgent/filterMcpToolsForAgent) — config.mcp.agentSets
- TAMAMLANDI: src/main/audit-export.js (exportAs json/csv/sarif; sarif 2.1.0) — NOT: auditLogPath config-store export'unu gerektiriyor, doğrula
- TAMAMLANDI: src/main/tools/browser.js (findChromium/navigate/screenshot/click/typeText/closeBrowser/isValidUrl CDP)
- TAMAMLANDI: tools/registry.js browser manifest eklendi (4 araç; EXEC_TOOLS + browser_screenshot READ_ONLY)
- TAMAMLANDI: ipc-v3-handlers.js: profile-export/import, audit-export, mcp-agent-sets-get/set handlerları + require'lar

## KALAN İŞLER
1. browser araçlarını executor'a bağla: src/main/tools/executor.js browse_* case'leri ekle
2. orchestrator zincirinde MCP araç filtresini entegre et (broker.filterMcpToolsForAgent çağrısı — orchestrator'da mcp tool enjeksiyon yerini bul)
3. Renderer UI: Ayarlar modal'ına v3.18 panelleri — (a) Eklentiler paneli üstüne "Profil Paketi" (dışa/İçe aktar), (b) MCP bölümüne ajan-MCP atama (checkbox grid), (c) Denetim sekmesine export butonları (json/csv/sarif indirme), (d) ekosistem panellerinde şablon paylaşımına profil export'u değil — profile export ayrı buton
4. Testler: tests/v318-*.test.js (profile-package, mcp/broker, audit-export, cli/run parseArgs, tools/registry browser manifest)
5. commit, push, tag v3.18.0, CI doğrula, site Changelog/roadmap güncelle (otomatik çekiliyor — release body'ye detay yaz)
