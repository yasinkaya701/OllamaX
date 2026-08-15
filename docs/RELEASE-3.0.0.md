# Krevyx v3.0.0 — Launch Summary

## Branch & Commit
All v3.0 work is pushed to the GitHub repository branch:

> **Branch:** `renovate/improvements-2026-08`
> **Commit:** `72048be` — "v3.0.0: AI Agent Studio — autonomous agent loop, tools w/ approvals, semantic memory, workflows, plugins, MCP, audit chain, v3 UI redesign"
> **Files:** 29 files changed, +5,572 insertions

The branch is ready to be reviewed and merged into `main` on GitHub.

## What Changed (ROADMAP Faz 1–6, implemented end-to-end)

### Backend / Main Process
| Module | Purpose |
| --- | --- |
| `src/main/config/config-store.js` + `config-migrations.js` | Schema-versioned config & sessions (v2 → v3 auto-migration), atomic writes, `ENV:` API keys |
| `src/main/ipc-v3-handlers.js` + `ipc-bridge.js` | Versioned `ipc:3:*` endpoint registry covering all new features |
| `src/main/tools/registry.js` + `executor.js` | 12-tool registry, tier-based approval flows, workspace sandbox, dangerous-command blacklist |
| `src/main/agents/event-channel.js` | Unified streaming channel with OpenAI / Anthropic / Ollama / Gemini adapters (incl. thinking) |
| `src/main/agents/loop.js` | Autonomous AgentLoop: goal → plan → tool select → approval → observe → replan |
| `src/main/memory/store.js` + `compaction.js` | HNSW vector index (pure JS) + SQLite persistence; context compaction |
| `src/main/workflow/engine.js` | JSON/YAML workflow engine with `{{step_n.output}}` interpolation |
| `src/main/plugins/loader.js` | Plugin manifests, load-time limits, enable/disable |
| `src/main/mcp/client.js` | MCP bridge for external tool servers |
| `src/main/audit-log.js` | SHA-256 hash-chained JSONL audit log with integrity verification |

### Renderer / UI
- **`src/renderer/v3-ui.js`** — new UI layer (works alongside legacy `app.js` without modifying it):
  - Sessions, Memory, Workflows, Plugins, and Audit panels
  - Tool approval modal (agent write/exec requests)
  - Live agent event streaming bubbles
  - `/image` image generation command
- **AI slop eliminated** — every emoji removed across `index.html`, `app.js`, and `v3-ui.js`; replaced with a 30+ icon inline-SVG system.
- **Professional theme** — unified typography hierarchy and consistent panel styling in `styles.css`.

### Docs
- `docs/ARCHITECTURE.md` — full architecture, IPC contract, security model
- `docs/FEATURES.md` — user-facing feature guide and slash commands
- `CHANGELOG.md` — v3.0.0 release notes

## Quality Gate (all green)
- **Tests:** 74 passing (41 new roadmap-module tests), including tool sandbox, approval tiers, vector index, workflow engine, plugin loader, MCP client, and audit chain integrity
- **ESLint v9 (flat config):** clean, 0 warnings
- **`npm audit`:** 0 vulnerabilities (Electron 43.4.0)
- **Syntax check:** all main/renderer modules verified
- **Version:** `package.json` bumped to `3.0.0`; new `audit:verify` script added

## Launch Checklist for You
1. On GitHub, open the branch `renovate/improvements-2026-08` and merge it into `main` (or review the changes and merge via the web UI).
2. `npm install` then `npm start` locally — everything is self-contained.
3. Open **Settings** in the app and paste your API tokens (OpenAI / Anthropic / Gemini); local Ollama models need no token at all.
4. Run `npm test`, `npm run lint`, `npm run audit:verify` to reproduce the green state.

## Notes
- The provided PAT had fine-grained repo access sufficient for **pushing** (the v3.0 commit is live on the branch) but **does not expose the repository through the GitHub REST API** (repo endpoints return 404). Therefore the **pull request was not created automatically** — the merge into `main` takes one click from your side on GitHub, or you can ask me to create the PR once a repo-scoped token is provided.
- v4.0 roadmap (curated plugin marketplace, distributed agent clusters, team workspaces) remains documented in `docs/ROADMAP.md` as the next phase.
