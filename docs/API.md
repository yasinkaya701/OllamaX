# OllamaX Ultra — IPC & persistence API

## Renderer bridge (`window.ollamaxApi`)

Exposed from `src/preload.js` (context isolation). Only listed channels are allowed.

### `send(channel, ...args)`

| Channel | Payload | Reply events |
|--------|-----------|----------------|
| `get-models` | `host` string (Ollama `host:port`) | `models-list` |
| `pull-model` | `{ host, model }` | `pull-progress`, `pull-done` |
| `chat` | `{ host, model, messages, agentId }` | `chat-chunk`, `chat-done` |
| `openai-chat` | `{ model, messages, apiKey, agentId }` | `chat-chunk`, `chat-done` |
| `anthropic-chat` | same shape | same |
| `gemini-chat` | same shape | same |
| `github-search` | `{ query }` | `github-results` |
| `git-clone` | `{ url }` — yalnızca `https://` github.com / gitlab.com / bitbucket.org / codeberg.org `.git` | `exec-output`, `git-done` |
| `list-dir` | path string (yalnızca kullanıcı ana dizini, `OllamaX-Projects` veya seçilen klasör altı) | `dir-contents` |
| `read-file` | path string (aynı sınır; önizleme max ~2 MB) | `file-content` |
| `open-folder-dialog` | — | `folder-selected` |
| `get-workspaces` | — | `workspaces-list` |
| `get-stats` | — | `stats` |
| `terminal-input` | `{ id, data }` | — |
| `terminal-resize` | `{ id, cols, rows }` | — |
| `terminal-close` | `{ id }` | — |

### `invoke(channel, data)`

| Channel | Description |
|---------|-------------|
| `fetch-provider-models` | `{ provider, apiKey? }` → `{ ok, models?, error? }` |
| `persist-save` | Full session object (agents, settings, history) |
| `persist-load` | Returns saved JSON or `null` |
| `export-to-path` | `{ defaultName, content }` → `{ ok, path?, canceled?, error? }` |
| `app-health` | `{ ollamaHost }` → Ollama `/api/tags` pingi, `userData`, `version`, `platform` |
| `open-path` | Dosya veya klasör yolu — sistem varsayılanıyla açar |
| `get-model-catalog` | `model-catalog.json` öneri listeleri (OpenAI / Anthropic / Gemini) |
| `normalize-ollama-host` | Girdi string → `{ ok, host? }` veya `{ ok:false, error }` (SSRF / enjeksiyon riskini azaltır) |
| `hardware-profile` | `{ totalRamGb, freeRamGb, cpuCount, platform }` — RAM/CPU özeti |
| `get-team-presets` | `{ ok, data }` — `src/shared/team-presets.json` içeriği (`presets[]`) |
| `scan-project` | `rootPath` string — güvenli kök altında manifest dosyalarını tarar → `{ ok, markdown?, root?, error? }` |
| `write-project-doc` | `{ rootPath, filename, content }` — yalnızca `.md` ve çözümlenmiş proje kökü altına yazar |
| `terminal-create` | `{ cwd? }` — izin verilen dizinde PTY başlatır → `{ ok, id?, cwd?, error? }` (`node-pty` yoksa hata mesajı) |

### `on(channel, listener)` → unsubscribe fn

| Channel | Payload |
|---------|---------|
| `terminal-data` | `{ id, data? }` veya `{ id, exit: true }` — PTY çıktısı veya oturum sonu |

**Kaldırılan kanallar (güvenlik):** `exec-command`, `write-file` — ana süreçte rastgele komut / dosya yazımı yok.

## On-disk session

Stored under Electron `userData` as `chat-session.json` (see `persistPath()` in `src/main.js`).

## Yerel terminal (`node-pty`)

- `optionalDependencies` içinde `node-pty`; kurulumdan sonra Electron ABI için: `npm run rebuild-pty`.
- PTY yalnızca `resolveReadablePath` ile onaylı `cwd` altında başlar; pencere kapanınca ve `terminal-close` ile süreç sonlandırılır.

## Smoke (manuel)

1. `npm install` — ardından macOS/Windows’ta PTY için gerekirse `npm run rebuild-pty`.
2. `npm test` ve `npm run lint`.
3. `npm start` — Ollama sağlığı, model listesi, araçlar paneli (Models + RAM önerisi), isteğe bağlı terminal sekmesi ve `Ctrl`+`` ` `` kısayolu.
