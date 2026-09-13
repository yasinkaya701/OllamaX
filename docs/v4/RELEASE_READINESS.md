# Krevyx v4 release readiness

Status: truth ledger for the current v4 implementation. This file deliberately distinguishes repository implementation from release evidence.

## Implemented and test-backed

- feature-gated/default-off v4 runtime bootstrap;
- canonical Workspace / Mission / Task / AgentRun / ToolCall / Evidence / VerificationRun contracts;
- durable state, backup recovery and append-only journal;
- repository inventory, sensitive-path exclusion, hashing and bounded context packs;
- capability registry and privacy-aware model routing;
- local Ollama structured planner;
- dependency scheduler, cancellation and write-scope conflict handling;
- confined filesystem, shell and Git tool runtime;
- main-process approval broker;
- mission-scoped detached worktree isolation;
- evidence-backed verification gates;
- provenance-aware project memory;
- declarative versioned Skills with built-in audit/bug-fix/release-prep flows;
- mission-first renderer shell, task execution controls, approval inbox and task evidence inspector;
- read-only Git delivery summary and PR-body artifact formatting;
- planner/run cost attribution primitives;
- secret-free diagnostic bundle;
- consolidated security regression and recovery packs;
- v3/v4 compatibility matrix and implementation threat model.

## Implemented but still needing stronger product evidence

| Area | Current state | Missing evidence |
| --- | --- | --- |
| Diff review | Worktree diff hash/stat/preview and delivery artifact exist | Dedicated reviewer findings engine + full file-navigation UI |
| Stale evidence invalidation | Verification is evidence-backed and task-state gated | Explicit content-hash invalidation test across a post-verification mutation |
| Context inspector | Context is bounded/provenance-aware | Complete renderer provenance navigation for every context entry |
| Cloud model execution | Capability registry/router models cloud providers | v4 provider execution adapters; local planner intentionally does not fall back to cloud |
| Artifact storage | Durable Artifact entity exists in the v4 store | Dedicated large/binary artifact storage policy if needed |
| Performance | Bounded scans/context/output limits exist | Measured baseline comparison on real repositories and packaged app |
| Legacy cleanup | v4 feature growth has moved into v4 modules | Formal freeze enforcement and selective retirement after parity review |

## Release-candidate evidence not yet produced

These require executing the real application/build environment and must not be inferred from repository tests:

- real v4 screenshots captured from the running product;
- end-to-end golden mission recorded in the packaged desktop app;
- packaged Electron smoke on supported OS targets;
- installer/updater smoke;
- RC soak/restart testing;
- measured startup/index/mission latency against the v3 baseline;
- exact release-SHA packaging evidence;
- signed/tagged v4.0 release artifacts.

## Canonical PR-train status near the release end

| Program item | Status |
| --- | --- |
| V4-056 Git delivery | Implemented as isolated worktree inspection + explicit-review delivery data; no automatic remote Git action |
| V4-057 PR artifact generator | Implemented as pure title/body formatter backed by delivery/evidence summary |
| V4-058 Cost attribution | Implemented for planner and AgentRun usage supplied by adapters |
| V4-059 Diagnostic bundle | Implemented with secret/path redaction |
| V4-060 Security regression pack | Implemented |
| V4-061 Recovery pack | Implemented |
| V4-062 Performance pass | **Not release-proven**; requires measurement |
| V4-063 v3 compatibility matrix | Implemented in `docs/v4/COMPATIBILITY_MATRIX.md` |
| V4-064 Legacy freeze/cleanup | Partial; no capability removed in this work |
| V4-065 Real v4 screenshots/docs | Docs in progress; **real screenshots still required** |
| V4-066 Golden demo | Procedure documented; **real packaged-app run still required** |
| V4-067 RC packaging | **Not yet release-proven** |
| V4-068 v4.0 release | **Not done** |

## Promotion rule

Do not label the current repository state “v4.0 released” until the release-candidate evidence above is produced on an exact release SHA. The implementation can be merge-ready while release promotion remains blocked by real-product validation.
