# Contributing to Krevyx Ultra

## Development

1. Install [Node.js](https://nodejs.org/) LTS and clone this repository.
2. Run `npm install`.
3. Start the app with `npm start` (Electron loads `src/main.js` and `src/renderer/`).

## Checks before a PR

- `npm test` — Jest unit tests (e.g. delegate parsing).
- `npm run lint` — ESLint on `src/**/*.js`.
- `npm run format` — Prettier (optional locally; keep style consistent).

## Project layout

- `src/main.js` — Electron main process (IPC, HTTP to Ollama / cloud APIs, persistence).
- `src/preload.js` — Context-isolated bridge (`window.krevyxApi`).
- `src/renderer/` — UI (`index.html`, `app.js`, `styles.css`, `lib/`).

## Security

Do not enable `nodeIntegration` in the renderer. New IPC channels must be whitelisted in `src/preload.js`.

## Questions

Open a discussion or issue with reproduction steps and your OS / Electron version.
