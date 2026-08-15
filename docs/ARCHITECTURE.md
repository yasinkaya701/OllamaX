# Krevyx v3.0 — Architecture Overview

Krevyx is a local-first AI agent studio built on Electron. It wraps local LLM inference (Ollama) and cloud APIs (OpenAI, Anthropic, Gemini) behind a unified IPC layer, and adds autonomous agent capabilities, persistent semantic memory, executable workflows, a plugin system, and a full audit trail.

## High-Level Structure

```
Krevyx (Electron 43)
├── Main Process (Node)
│   ├── ipc-v3-handlers.js     — v3 IPC endpoint registry (ipc:3:*)
│   ├── config/config-store.js — schema-versioned settings & sessions
│   ├── config/migrations.js   — config schema migrations (v1 → v2)
│   ├── agents/loop.js         — autonomous AgentLoop (plan → act → observe)
│   ├── agents/memory.js       — semantic memory store (HNSW + SQLite)
│   ├── agents/compaction.js   — context window compaction / summarization
│   ├── agents/tools.js        — tool registry, sandboxed executor, approvals
│   ├── agents/workflows.js    — prompt/workflow template runner
│   ├── agents/plugins.js      — plugin discovery, activation, config
│   ├── agents/audit.js        — hash-chained JSONL audit log
│   └── agents/event-channel.js— unified streaming channel (tokens/thinking/tools)
├── Renderer (Vanilla JS, no frameworks)
│   ├── index.html             — shell layout + Content-Security-Policy
│   ├── app.js                 — legacy surface: chat, providers, search, agents
│   ├── v3-ui.js               — v3 UI layer: sessions, memory, workflows,
│   │                            plugins, audit, image generation, approvals
│   └── styles.css             — unified professional theme
└── tests/                     — 74 Jest suites (unit + integration)
```

## IPC Contract

All v3 features are exposed through a versioned namespace: `ipc:3:<feature>:<action>`
(e.g., `ipc:3:session:load`, `ipc:3:memory:search`, `ipc:3:tool:approve`).
This isolates new endpoints from the legacy handlers and allows future
`ipc:4:*` evolution without breaking the renderer.

| Namespace | Responsibility |
| --- | --- |
| `ipc:3:session` | save/load/delete/list conversations with schema versioning |
| `ipc:3:config` | typed get/set with schema validation and migration |
| `ipc:3:memory` | ingest/query/forget semantic memory vectors |
| `ipc:3:workflow` | template CRUD and execution |
| `ipc:3:plugin` | discovery, enable/disable, per-plugin settings |
| `ipc:3:audit` | append/query log entries, integrity verification |
| `ipc:3:tool` | list tools, request approval, respond to approval requests |
| `ipc:3:image` | generate images via available backend |
| `ipc:3:stream` | EventChannel subscription for agent events |

## Security Model

1. **Content-Security-Policy**: strict policy with `object-src 'none'`, `frame-ancestors 'none'`, and `base-uri 'none'` (see the `meta` tag in `index.html`).
2. **Input sanitation**: all renderer-injected text passes `DOMPurify.sanitize` (`ALLOWED_TAGS: []`) or the escaping helper `esc()`.
3. **Tool approvals**: destructive tools (file writes, shell execution, web access) require explicit renderer-side approval unless the user enables auto-approval per tool.
4. **Audit integrity**: each audit entry includes the hash of the previous entry (`prevHash`), forming a tamper-evident hash chain; `npm run audit:verify` replays the chain.
5. **No remote code execution surface**: Electron's `nodeIntegration` remains off and CSP blocks all external script hosts except the pinned CDNs.
6. **Zero audit vulnerabilities** (`npm audit` clean).

## Memory Subsystem

`agents/memory.js` implements semantic memory as a pure-JS HNSW graph backed by
`better-sqlite3` for persistence. Embeddings are computed by the local Ollama
model (configurable, default `nomic-embed-text`). The renderer panel performs
on-the-fly similarity search over the user's history.

## Agent Loop

`agents/loop.js` implements an autonomous plan → act → observe cycle:

1. The user's goal is broken into a numbered plan.
2. For each step, the loop selects a registered tool, builds arguments, and
   requests approval if the tool is not in the auto-approve set.
3. Tool results are fed back as observations; the loop re-plans on failure.
4. Every event is emitted through `EventChannel` and rendered live in the UI.
5. Relevant observations are ingested into semantic memory for future reuse.

## Rendering Pipeline

`v3-ui.js` is a dependency-free UI layer. It defines a tiny `h()` DOM builder
and injects panels into the legacy layout at runtime; no framework build step
is required. Icons are inline SVG paths (no emoji, no icon-font downloads at
runtime except the pinned highlight.js/DOMPurify CDNs).
