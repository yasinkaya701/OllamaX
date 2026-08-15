# OllamaX v3.0 — Feature Guide

OllamaX v3.0 turns the local Ollama client into a complete AI agent studio.
The only setup required is entering your API tokens in **Ayarlar**; everything
else works out of the box with local Ollama models.

## Core Features

### Multi-Provider Chat
Unified interface for **Ollama (local)**, **OpenAI**, **Anthropic**, and **Gemini**.
Models are auto-discovered from each provider; fallback lists keep premium
models (GPT-5.x, Claude Sonnet/Opus, Gemini 3.x) selectable by name. Local
privacy is the default; cloud providers are opt-in.

### AI Agents
Pre-built expert agents (Lead/Orchestrator, Principal Architect, Code Auditor,
Product Manager, Meta-Prompt Architect) with structured role prompts. The
Lead agent can orchestrate sub-agents through the `//CALL:AgentName` and
`//CALL_PARALLEL:AgentName` delegation syntax.

### Autonomous Agent Loop (new in v3.0)
Type a goal (e.g., "analyze this repo and produce a refactoring plan") and
the AgentLoop autonomously plans, picks tools, requests approvals, and
iterates until the goal is met. All actions stream live into the chat.

### Tool System with Approvals (new in v3.0)
Registered tools: file read/write, directory operations, shell execution, and
web access. Destructive tools trigger an approval modal; individual tools can
be added to an auto-approve set per user preference.

### Semantic Memory (new in v3.0)
Every conversation is embedded and stored in a local HNSW vector index
(backed by SQLite). The **Bellek** panel lets you search your own knowledge
base semantically, and the agent pulls relevant memories into context
automatically. Nothing leaves your machine.

### Workflows (new in v3.0)
Reusable prompt/workflow templates with parameter slots. Create once, run
many times, and manage them from the **İş Akışları** panel.

### Plugins (new in v3.0)
A lightweight plugin manifest system: plugins declare tools, UI hooks, and
settings. The **Eklentiler** panel handles discovery, activation, and
configuration.

### Audit Log (new in v3.0)
Every significant action (session, config change, tool call, plugin event) is
written to a hash-chained JSONL log. The **Denetim** panel displays the log
and an integrity verify function detects tampering.

### Image Generation (new in v3.0)
Use `/image <prompt>` in chat to generate images through the connected
provider (Ollama image models or API backends).

### Slash Commands
| Command | Action |
| --- | --- |
| `/model <name>` | switch the active model |
| `/image <prompt>` | generate an image |
| `/agent <name>` | hand control to an agent |
| `/goal <text>` | start an autonomous agent loop |
| `/clear` | clear current conversation |

## Professional UI (new in v3.0)
The v2 "AI slop" (emoji-heavy interface) has been replaced by a cohesive
professional design: inline SVG icon system, neutral typographic hierarchy,
distinct panel styles for sessions/memory/workflows/plugins/audit, and
consistent modal/approval components.

## Privacy & Security
- Local-first: Ollama runs on your machine; cloud keys are stored only in
  your local config.
- Content-Security-Policy enforced; no arbitrary remote scripts.
- All user input sanitized through DOMPurify before DOM insertion.
- Hash-chained, tamper-evident audit log.
- Zero known vulnerabilities (`npm audit` clean).
