# Krevyx Professionalization Task Specifications

These specifications define the minimum scope and acceptance criteria for the campaign tasks in `INDEX.md`. The canonical GitHub task issue may narrow scope when evidence shows a safer smaller change, but it must not silently weaken acceptance criteria or security invariants.

## T001 — Repository truth/status baseline

**OWNS:** `docs/PROJECT_STATUS.md`, campaign-facing status/readiness documentation, contributor truth wording.
**MAY_TOUCH:** `CONTRIBUTING.md`, PR template, `docs/v4/RELEASE_READINESS.md`.
**MUST_NOT_TOUCH:** runtime source, packaging behavior.
**SEMANTIC_HOTSPOTS:** implemented vs tested vs packaged vs stable truth.
**ACCEPTANCE:** establish one capability matrix that distinguishes implementation, unit/integration evidence, packaged evidence, and stable status; reconcile stale status claims without overstating v4 readiness.

## T002 — Agent/tool runtime wiring correctness

**OWNS:** `src/main/agents/loop.js`, `src/main/agents-core/tools.js`, directly related regression tests.
**MAY_TOUCH:** `src/main/tools/registry.js`, `src/main/tools/executor.js` only for wiring-compatible changes.
**MUST_NOT_TOUCH:** MCP, plugin, release systems.
**SEMANTIC_HOTSPOTS:** manifest lookup, tool result success/failure semantics.
**ACCEPTANCE:** AgentLoop obtains tool manifests from the correct source; a handler result with `ok:false` cannot become top-level success; a real assembled tool-call path regression test covers the behavior.

## T003 — Secrets vault and Manus key correctness

**OWNS:** `src/main/config-store.js`, `src/main/secrets-vault.js`, vault-related portions of `src/main/ipc-v3-handlers.js`, related tests.
**MAY_TOUCH:** provider adapters only when required to prove resolved secrets are strings rather than unresolved promises/references.
**MUST_NOT_TOUCH:** unrelated provider behavior, MCP environment policy.
**SEMANTIC_HOTSPOTS:** `ENV:` / `VAULT:` resolution, async secret retrieval, secret redaction.
**ACCEPTANCE:** vault store API is exported and reachable; Manus vault resolution awaits async retrieval; plain/env/vault/missing/unavailable cases are tested; plaintext secrets do not appear in logs/audit/error serialization.

## T004 — Persistence size contracts and atomic writes

**OWNS:** shared atomic JSON persistence helpers, session/config size-limit logic, related tests.
**MAY_TOUCH:** callers that must pass explicit size limits.
**MUST_NOT_TOUCH:** v4 artifact-storage redesign beyond the immediate contract bug.
**SEMANTIC_HOTSPOTS:** maximum byte policy, atomic replacement, recovery after failed write.
**ACCEPTANCE:** persistence helpers accept explicit per-domain limits; config and session limits no longer contradict one another; boundary tests cover just-below/just-above limits; failed writes preserve the prior valid state.

## T005 — MCP lifecycle and protocol handshake

**OWNS:** `src/main/mcp/client.js`, MCP lifecycle fixtures/tests.
**MAY_TOUCH:** MCP IPC startup wiring when needed for lifecycle correctness.
**MUST_NOT_TOUCH:** plugin runtime, global filesystem policy.
**SEMANTIC_HOTSPOTS:** process state machine, initialize/initialized semantics, negotiated protocol, crash/timeout behavior.
**ACCEPTANCE:** lifecycle has explicit states; initialized notification can actually be sent; unsupported/malformed protocol fails safely; fake stdio server tests cover handshake, tools/list, tools/call, timeout, crash, restart, and shutdown.

## T006 — MCP capability confinement

**OWNS:** MCP process environment construction, MCP root/capability policy, related security tests.
**MAY_TOUCH:** MCP configuration schema and IPC startup arguments.
**MUST_NOT_TOUCH:** general plugin runtime.
**SEMANTIC_HOTSPOTS:** inherited environment, workspace roots, executable authorization, network/process capability.
**ACCEPTANCE:** child MCP processes do not inherit the full host environment by default; allowed roots/capabilities are enforced rather than decorative; arbitrary executables/package launchers require explicit policy; secret leakage and root escape tests exist.

## T007 — V3 filesystem boundary hardening

**OWNS:** V3 path authorization/root resolution including `src/main/main-security.js` and relevant executor policy/tests.
**MAY_TOUCH:** tool registry metadata needed to express real read/write scope.
**MUST_NOT_TOUCH:** V4 workspace implementation except compatibility assertions.
**SEMANTIC_HOTSPOTS:** implicit home-directory access, path traversal, symlink escape, explicit user grants.
**ACCEPTANCE:** workspace tools cannot read/write arbitrary home paths merely because they are under `os.homedir()`; reads are limited to workspace plus explicit grants/internal roots; adversarial path and symlink tests pass cross-platform where applicable.

## T008 — Preload IPC allowlist and Electron sandbox boundary

**OWNS:** preload IPC exposure, BrowserWindow security settings, shared IPC contract/tests.
**MAY_TOUCH:** handlers that must be adapted to an explicit invoke allowlist.
**MUST_NOT_TOUCH:** feature redesign unrelated to sandbox compatibility.
**SEMANTIC_HOTSPOTS:** renderer trust, invoke allowlist, Electron sandbox, CSP/runtime compatibility.
**ACCEPTANCE:** wildcard `ipc:3:` invocation is removed; renderer-invokable channels are explicit and testable; Electron sandbox is enabled where compatible or any narrowly documented exception is isolated with evidence; existing critical UI flows remain functional.

## T009 — V4 workspace grants/capabilities

**OWNS:** `src/main/v4/ipc/application-service.js`, V4 workspace authorization/grant code, workspace tests.
**MAY_TOUCH:** `src/main/v4/workspace/**`, IPC contract needed to replace raw trusted paths.
**MUST_NOT_TOUCH:** unrelated renderer redesign.
**SEMANTIC_HOTSPOTS:** renderer-provided paths, native folder authorization, workspaceId/capability lifetime, symlink escape.
**ACCEPTANCE:** renderer cannot authorize arbitrary filesystem roots by sending raw paths; main process creates and owns workspace grants; subsequent privileged calls resolve trusted workspace IDs; forged/revoked/escaped grants fail closed.

## T010 — Mission cancellation and approval correlation

**OWNS:** V4 mission runner, agent runtime correlation fields, approval correlation tests.
**MAY_TOUCH:** approval broker/executor interfaces solely for mission/task/run/tool-call identity propagation.
**MUST_NOT_TOUCH:** approval policy meaning unrelated to correlation.
**SEMANTIC_HOTSPOTS:** cancellation state transitions, pending approvals, scheduler selection, trace identity.
**ACCEPTANCE:** cancelling a mission prevents new scheduling, aborts active runs, resolves/cancels pending approvals, cancels non-started tasks, reaches a truthful terminal mission state, and preserves mission/task/run/tool-call correlation in approval/journal evidence.

## T011 — Audit-log integrity and rotation

**OWNS:** `src/main/audit-log.js`, audit verification/rotation tests, `scripts/verify-audit-chain.js` when required.
**MAY_TOUCH:** audit storage layout migration code.
**MUST_NOT_TOUCH:** unrelated persistence formats.
**SEMANTIC_HOTSPOTS:** hash-chain continuity, rotation, tamper evidence, append performance.
**ACCEPTANCE:** rotation cannot create a chain that immediately fails verification; deleted/reordered/truncated/corrupt segments are detectable; append does not reread the entire growing log on every write; restart validation is covered.

## T012 — Unsafe plugin runtime lockdown

**OWNS:** `src/main/plugins/loader.js`, plugin enablement/warnings/policy tests.
**MAY_TOUCH:** plugin IPC/settings-panel sanitization needed to reduce current risk.
**MUST_NOT_TOUCH:** new capability runtime implementation (T013).
**SEMANTIC_HOTSPOTS:** untrusted JavaScript execution, `node:vm` security claims, plugin HTML injection, default enablement.
**ACCEPTANCE:** current JS plugin execution is not described or treated as a security sandbox; unsafe legacy execution is disabled by default or equivalently guarded with explicit risk acknowledgement; plugin UI injection is sanitized; tests verify safe default behavior.

## T013 — Capability-brokered plugin runtime

**OWNS:** new isolated plugin runtime/broker, plugin RPC/capability tests.
**MAY_TOUCH:** legacy loader only for compatibility adapter/migration.
**MUST_NOT_TOUCH:** MCP lifecycle.
**SEMANTIC_HOTSPOTS:** plugin process isolation, host environment, filesystem/process/network capabilities, typed RPC.
**ACCEPTANCE:** plugins do not receive direct unrestricted host APIs; privileged operations pass through a main-process capability broker; crash/timeout/oversized-message/unauthorized-capability/malicious-plugin tests demonstrate containment to the documented boundary.

## T014 — V4 canonical execution path

**OWNS:** V4 execution service/runtime/tool/approval integration and legacy adapters.
**MAY_TOUCH:** V3 entrypoints only to route through the canonical execution path.
**MUST_NOT_TOUCH:** wholesale unrelated UI redesign.
**SEMANTIC_HOTSPOTS:** single approval/tool/policy execution semantics, compatibility boundary.
**ACCEPTANCE:** new execution work has one canonical V4 path; legacy surfaces are compatibility adapters rather than competing policy engines; duplicated approval/tool semantics are retired or explicitly deprecated; regression tests cover adapter behavior.

## T015 — Isolation-review feature recovery

**OWNS:** V4 worktree/isolation review implementation and tests.
**MAY_TOUCH:** renderer review surface needed to expose read-only review information.
**MUST_NOT_TOUCH:** unrelated features from the historical PR.
**SEMANTIC_HOTSPOTS:** source-workspace immutability, bounded diff preview, untracked-content privacy.
**ACCEPTANCE:** recover the valuable behavior from historical PR #24 onto current architecture without blindly merging the stale branch; expose worktree head/base/ahead/dirty/untracked-name/diff-stat/bounded-preview information; do not disclose untracked file contents; supersede the stale PR after equivalent behavior is merged.

## T016 — Golden engineering mission E2E

**OWNS:** deterministic E2E fixtures and golden mission harness.
**MAY_TOUCH:** small testability hooks that do not weaken production boundaries.
**MUST_NOT_TOUCH:** production feature expansion unrelated to making the documented flow testable.
**SEMANTIC_HOTSPOTS:** end-to-end mission truth, worktree isolation, evidence freshness.
**ACCEPTANCE:** fixture repository flow covers workspace open -> mission -> plan -> isolated edit -> failing verification -> repair -> passing verification -> diff/evidence review; source workspace remains untouched; resulting evidence hashes/state match the final tested head; test is deterministic and does not require uncontrolled external network access.

## T017 — Packaged Electron smoke tests

**OWNS:** packaged-app smoke harness/workflow and packaging test fixtures.
**MAY_TOUCH:** startup health hooks needed for deterministic smoke testing.
**MUST_NOT_TOUCH:** distribution signing policy (T021).
**SEMANTIC_HOTSPOTS:** package-to-runtime parity, preload health, clean startup/shutdown.
**ACCEPTANCE:** built app can be launched in CI or documented supported runners, renders/initializes preload, opens a workspace/mission bootstrap path, and exits cleanly; platform evidence is recorded rather than inferred from builder success alone.

## T018 — CI/security/SBOM/provenance gates

**OWNS:** CI workflows and security/release verification jobs.
**MAY_TOUCH:** scripts used exclusively by CI validation.
**MUST_NOT_TOUCH:** product runtime semantics.
**SEMANTIC_HOTSPOTS:** required checks, dependency/security analysis, source-to-artifact identity.
**ACCEPTANCE:** lint/tests/integration/golden/packaged evidence are wired appropriately; add dependency/security scanning, SBOM generation, artifact checksums/provenance where supported; no workflow silently publishes from validation-only jobs; exact head identity is recorded.

## T019 — Release pipeline exact-SHA promotion

**OWNS:** release/RC workflows and release assembly scripts.
**MAY_TOUCH:** package metadata required to make release identity deterministic.
**MUST_NOT_TOUCH:** updater client behavior (T020).
**SEMANTIC_HOTSPOTS:** tag/manual version source, matrix races, asset deletion, exact-SHA release identity.
**ACCEPTANCE:** one validated SHA produces one release set; matrix jobs cannot destructively race over release assets; RC remains artifact-only; final release creation happens after required gates and records source SHA.

## T020 — Updater/release-manifest contract

**OWNS:** `src/main/update/updater.js`, release-manifest schema/generation, updater tests.
**MAY_TOUCH:** release workflow output required to publish the manifest.
**MUST_NOT_TOUCH:** code-signing setup beyond manifest verification.
**SEMANTIC_HOTSPOTS:** platform asset selection, SHA256/signature metadata, fallback behavior.
**ACCEPTANCE:** updater and releases share one explicit contract; absent `latest.yml` is not treated as a primary path unless it is actually produced; selected assets are bound to version/platform/source SHA and verified hashes before execution/install handoff.

## T021 — Signed/notarized cross-platform distribution

**OWNS:** packaging configuration and signing/notarization workflow integration.
**MAY_TOUCH:** installer smoke tests and artifact naming.
**MUST_NOT_TOUCH:** commit secrets/certificates into the repository.
**SEMANTIC_HOTSPOTS:** macOS signing/notarization, Windows signing, architecture coverage, checksums/SBOM.
**ACCEPTANCE:** release policy defines and automates supported signed artifacts where credentials are available; macOS architecture coverage is explicit; Windows installer/signing path is explicit; release set includes deterministic names, checksums, SBOM, and release manifest; missing credentials produce a truthful blocked release rather than unsigned artifacts presented as production-ready.

## T022 — Website, brand, architecture, and README truth cleanup

**OWNS:** `README.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`, `krevyx-site/**`, repo-facing brand/docs consistency.
**MAY_TOUCH:** package/product naming only when migration compatibility is preserved.
**MUST_NOT_TOUCH:** invent unsupported capabilities or fake release evidence.
**SEMANTIC_HOTSPOTS:** Krevyx/OllamaX/Krevyx Ultra identity, stable-vs-preview claims, reproducible Pages build.
**ACCEPTANCE:** use one coherent Krevyx product identity; website builds from source in CI rather than trusting committed prebuilt output; architecture matches current code; README uses real product evidence and clearly separates stable from preview capabilities; migrations preserve existing user data paths where naming changes could affect them.

## T023 — Final campaign integration and promotion

**OWNS:** campaign integration evidence and campaign-to-main promotion only.
**MAY_TOUCH:** minimal conflict-resolution edits required to preserve already-approved task behavior.
**MUST_NOT_TOUCH:** unrelated new features.
**SEMANTIC_HOTSPOTS:** entire campaign invariant ledger, exact-SHA promotion, release readiness truth.
**ACCEPTANCE:** verify T001-T022 completion records and reachable integration SHAs; inspect full campaign diff; run G4; create promotion PR; resolve conflicts without losing validated invariants; validate exact promotion head; merge to `main`; fetch/verify resulting main SHA; record `CAMPAIGN_COMPLETE`.
