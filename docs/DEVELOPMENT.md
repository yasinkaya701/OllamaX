# Developer setup

## Prerequisites

- Node.js 18+ recommended
- Git
- [Ollama](https://ollama.com/) (optional, for local models)

## Commands

```bash
npm install
npm start          # Electron dev
npm test           # Unit tests
npm run lint       # ESLint
npm run format     # Prettier write
npm run build:mac  # Pack DMG (macOS)
npm run build:win  # Portable (Windows)
```

## Architecture

1. **Main** (`src/main.js`): Node-only — HTTP(S) to Ollama, OpenAI, Anthropic, Gemini; git; filesystem; session file.
2. **Preload** (`src/preload.js`): Exposes `krevyxApi` to the renderer with a strict channel whitelist.
3. **Renderer** (`src/renderer/app.js`): UI, orchestration, markdown + DOMPurify + highlight.js, delegation queue.

## Adding an IPC channel

1. Add handler or `ipcMain.on` in `src/main.js`.
2. Whitelist `send` / `on` / `invoke` in `src/preload.js`.
3. Document in `docs/API.md`.
