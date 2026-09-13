# Krevyx v4 compatibility matrix

Status: implementation truth for the v4 feature-gated workspace.

The v4 runtime is additive. Legacy v3 remains available while v4 reaches parity or an explicit deprecation decision is made.

| Capability | v3 status | v4 status | Migration / parity note |
| --- | --- | --- | --- |
| General chat UI | Available | Not replaced | v4 is mission-first; legacy chat remains the general chat surface. |
| Ollama local inference | Available | Available for structured planning | v4 planner uses local Ollama structured JSON output. |
| Cloud provider chat | Available | Router contract only | v4 capability registry/router models cloud candidates, but the current planner invoker is intentionally local Ollama only. |
| Workspace/project open | Available | Available | v4 adds repository inventory, hashing and bounded context packs. |
| Mission/task orchestration | Partial/legacy agents | Available | Durable Mission, Task, AgentRun and ToolCall entities with scheduler state. |
| Filesystem read/write | Available | Available with stricter controls | v4 applies workspace confinement, secret-path protection and optimistic concurrency. |
| Shell execution | Available | Available with stricter controls | v4 uses executable + argv, `shell:false`, bounded output, timeout and cancellation. |
| Git status/diff/read | Available | Available | v4 exposes guarded read operations. |
| Git stage/commit | Available | Available behind permission policy | No automatic remote delivery. |
| Git push / merge / force-push | Available in legacy workflows where configured | Not exposed by v4 tool runtime | Requires a later explicit product decision; current v4 delivery is review-only. |
| Mission worktree isolation | Not canonical | Available | Planning, execution and verification share a mission-scoped detached worktree. |
| Tool approvals | Available in legacy flows | Available | v4 approval decisions are main-process brokered; renderer booleans are not trusted. |
| Test/lint/build verification | Available through tools | Available as required gates | Required gate failure blocks completion. |
| Evidence/provenance | Limited | Available | Evidence, verification runs and event journal are durable. |
| Project memory | Legacy persistence patterns | Available | v4 memory has provenance and ACTIVE / STALE / RETRACTED lifecycle. |
| Skills/workflows | Legacy workflows/plugins | Available as declarative Skills | v4 Skills are versioned, DAG-validated and cannot execute arbitrary JavaScript. |
| MCP / external tool ecosystem | Available in legacy product | Not yet ported to v4 tool runtime | Keep legacy capability until a v4 permission-aware adapter exists. |
| Cost tracking | Available in legacy product | Available for v4 planner/run usage attribution | Local Ollama cost defaults to zero; external model cost requires adapter-provided usage/cost. |
| Diagnostics | Available in legacy logs | Available | v4 diagnostic bundle exports entity counts and sanitized recent events. |
| Updater / installer / packaging | Available | Reuses existing application packaging | v4 has no separate installer path. |
| v4 workspace UI | N/A | Feature-gated | `features.v4Workspace` remains default-off. |

## Compatibility rule

A legacy capability must not be removed merely because a v4 module exists. Retirement requires either:

1. demonstrated v4 parity with tests/evidence; or
2. an explicit deprecation decision recorded in release notes.

## Current intentional gaps

- v4 does not silently route local-only work to cloud providers.
- v4 does not expose automatic remote Git push/merge/force-push.
- v4 does not yet replace the legacy general chat surface.
- MCP/external-tool parity remains a later migration item.
- release screenshots, packaged-app smoke and soak evidence must come from a real packaged build, not repository-only tests.
