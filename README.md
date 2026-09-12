# Krevyx

Krevyx is a local-first desktop AI agent studio built with Electron. It brings Ollama, configurable model providers, multi-agent workflows, MCP integrations, project context, audit tooling, and a headless CLI into one application.

![Krevyx preview](assets/preview.png)

[![Release](https://img.shields.io/github/v/release/yasinkaya701/OllamaX?label=release)](https://github.com/yasinkaya701/OllamaX/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Highlights

- Local Ollama model discovery and execution
- Reusable agents, teams, delegation, and orchestration
- MCP server management and per-agent tool sets
- Multi-step Composer workflows with project context
- Browser tooling, templates, plugins, and command palette
- Audit exports and workflow cost visibility
- Headless `krevyx` CLI for automation-oriented use cases

## Getting started

Requirements: Node.js 22+, pnpm 11+, Git, and optionally Ollama for local models.

```bash
git clone https://github.com/yasinkaya701/OllamaX.git
cd OllamaX
corepack enable
corepack prepare pnpm@11 --activate
pnpm install --frozen-lockfile
pnpm start
```

Build packages with `pnpm run build:win`, `pnpm run build:mac`, or `pnpm run build:linux`. The current macOS packaging target is Apple Silicon (`arm64`).

## CLI

```bash
node bin/krevyx.js run "Summarize this project" --mode local
```

Profiles can also be exported and imported with `node bin/krevyx.js profile export` and `node bin/krevyx.js profile import`.

## Development

Run `pnpm run lint`, `pnpm test`, and `pnpm run test:ci` before opening a pull request.

```text
src/        Electron main process, preload bridge, renderer, shared modules
bin/        headless CLI
tests/      Jest and integration tests
scripts/    development and verification utilities
docs/       architecture, setup, deployment, and feature documentation
```

More documentation:

- [Architecture](docs/ARCHITECTURE.md)
- [Feature catalog](docs/FEATURES.md)
- [API notes](docs/API.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Project status

Krevyx is an independent personal open-source project maintained by [Yasin Kaya](https://github.com/yasinkaya701). It is actively evolving and should be evaluated before use in sensitive or production-critical environments.

Krevyx is not affiliated with Ollama or with any model-provider vendor.

## License

Released under the [MIT License](LICENSE).

Copyright © 2026 Yasin Kaya.
