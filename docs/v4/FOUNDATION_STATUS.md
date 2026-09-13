# Krevyx v4 Foundation Checkpoint

Status: **implementation checkpoint — candidate for merge after exact-head CI**

This file records what is actually implemented in the first long-lived v4 branch. It does not claim that the full v4 product is complete.

## Wave 0 — migration safety

Implemented:

- measured v3.26 baseline and migration notes;
- config schema v4 with explicit v3 -> v4 migration;
- `features.v4Workspace` default-off feature flag;
- legacy migration regression coverage;
- process-tree cleanup for timed-out lifecycle hooks;
- deterministic cleanup for mocked Manus polling sessions in tests;
- normal CI restored to lint + full Jest coverage suite.

The existing product path remains the default. No unfinished v4 UI is enabled by this checkpoint.

## Wave 1 — domain spine

Implemented foundation:

- canonical Workspace, Mission, Task, AgentRun, ToolCall, Artifact, Evidence and VerificationRun contracts;
- stable v4 error codes;
- Mission and Task state machines with illegal-transition rejection;
- durable JSON state store with revisioning, atomic temp writes, backup recovery and corrupt-state quarantine;
- append-only NDJSON run journal with replay and restart-safe sequencing;
- IPC-safe serializers;
- create -> persist -> restart -> resume integration coverage.

## Wave 2 — workspace intelligence

Implemented foundation:

- read-only repository inventory;
- hard exclusions for Git metadata, dependencies, build output and secret-like paths;
- `.gitignore` support layered below hard security exclusions;
- per-file SHA-256 inventory hashes;
- language/category/relevance hints;
- incremental refresh that reuses unchanged hashes;
- bounded, inspectable context packs with file/byte budgets and binary/path-boundary checks.

## Wave 3 — capability-aware model routing

Implemented foundation:

- normalized model capability records;
- availability registry;
- local-only, lowest-cost, best-coding, balanced and manual routing policies;
- explicit privacy-class and capability filters;
- pre-authorized fallback chains that cannot silently loosen privacy/capability requirements;
- legacy provider normalization adapter.

This layer selects a route; it does not replace the existing v3 provider execution path yet.

## Wave 4 — task graph and scheduler

Implemented foundation:

- dependency validation and cycle rejection;
- deterministic topological ordering;
- ready-task calculation;
- failed-dependency blocking;
- bounded parallel capacity;
- hierarchical write-scope conflict detection and serialization;
- workspace-scope boundary validator.

Actual agent execution/tool isolation remains a later wave.

## Evidence gate

A checkpoint is mergeable only when the exact branch head satisfies all of the following:

1. dependency install succeeds with the frozen lockfile;
2. ESLint reports zero errors;
3. all Jest suites pass under the normal `pnpm run test:ci` command;
4. Jest exits naturally without the worker force-exit warning;
5. GitHub runner cleanup does not terminate an orphan hook child process;
6. the PR diff contains no diagnostic-only CI command or temporary force-exit workaround.

## Next execution slice

After this checkpoint lands, continue with one long-lived branch for the next cohesive slice rather than creating one branch per micro-task. Priority order:

1. tool runtime + permission profiles + workspace confinement;
2. agent runtime/cancellation and scheduler execution integration;
3. evidence + verification gates;
4. project memory;
5. skills;
6. `ipc:4:*` application services and the first feature-flagged v4 workspace UI.
