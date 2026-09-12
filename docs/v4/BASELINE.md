# Krevyx v4 Migration Baseline

**Program:** Krevyx v4 Master Execution Program / Wave 0  
**Baseline product:** Krevyx v3.26.0  
**Baseline main SHA:** `67aa8803602e10fdb208fd4ea0ccca8f21d57adc`  
**Purpose:** freeze measurable facts before the v4 runtime spine changes product behavior.

## Runtime and packaging

| Item | Baseline |
| --- | --- |
| Node in CI | 22.23.2 |
| pnpm in CI | 11.27.0 |
| Electron | 43.4.0 |
| Package version | 3.26.0 |
| Windows target | portable |
| macOS target | DMG + ZIP, arm64 |
| Linux target | AppImage |
| Desktop entry | `src/main.js` |
| Preload bridge | `src/preload.js` |
| Headless CLI | `bin/krevyx.js` |

## Verified CI baseline

Measured from the exact-head CI that preceded Wave 0 implementation:

| Metric | Baseline |
| --- | ---: |
| Jest suites | 28 passed / 28 total |
| Tests | 533 passed, 3 skipped, 536 total |
| Jest runtime | 5.325 s |
| Statement coverage | 54.21% |
| Branch coverage | 45.03% |
| Function coverage | 52.86% |
| Line coverage | 59.12% |
| ESLint | 0 errors, 125 warnings |
| CI quality job wall time | ~29 s |

The CI gate is currently:

```text
pnpm install --frozen-lockfile
pnpm run lint
pnpm run test:ci
```

## Known Wave 0 blocker

The baseline Jest run passes all tests but does **not** exit cleanly:

```text
A worker process has failed to exit gracefully and has been force exited.
```

GitHub runner cleanup also terminates an orphan `sleep` process. Investigation traced this to lifecycle-hook timeout behavior: the hook runner killed the shell process but could leave a shell child process alive. Wave 0 fixes this by owning and terminating the full process group on POSIX and by adding descendant-cleanup regression coverage.

## Current configuration baseline

Before Wave 0, persisted application config uses schema version 3. Wave 0 introduces schema version 4 for the first v4 migration primitive:

```text
features.v4Workspace = false
```

The flag is default-deny. Missing, malformed or non-boolean values must never enable the v4 workspace.

## Current architecture that must remain functional

The v4 migration must preserve the current product while the flag is disabled:

- local Ollama discovery/execution;
- configured cloud providers;
- current chat/session behavior;
- existing agent and orchestration flows;
- MCP integration;
- workflows/plugins/templates;
- audit and cost tooling;
- browser/tool paths already present;
- headless CLI;
- release packaging.

Important current implementation areas include:

```text
src/main/agents*
src/main/mcp/
src/main/guard/
src/main/cost/
src/main/orch/
src/main/plans/
src/main/config/
src/main/ipc-v3-handlers.js
src/main/ipc-v325-handlers.js
src/main/ipc-v326-handlers.js
src/renderer/app.js
src/renderer/v3-ui.js
src/renderer/agent-canvas.js
src/renderer/agent-console.js
src/renderer/orchestrator-view.js
```

## Wave 0 promotion gate

Wave 0 is promotable only when all of these are true on the exact PR head:

- [ ] install succeeds with frozen lockfile;
- [ ] lint has zero errors;
- [ ] all Jest suites pass;
- [ ] child-process regression test passes;
- [ ] Jest no longer prints the worker force-exit warning;
- [ ] runner cleanup no longer terminates the leaked `sleep` process;
- [ ] v3 config migrates to schema v4 with v4 workspace disabled;
- [ ] legacy/current functionality remains unchanged while v4 flag is off.

After this gate, Wave 1 may begin with shared domain contracts and durable mission persistence.
