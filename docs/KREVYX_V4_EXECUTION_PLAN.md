# Krevyx v4 — Execution Plan

**Status:** implementation blueprint  
**Baseline:** v3.26.0  
**Target:** evolve the existing OllamaX/Krevyx desktop application into a local-first, evidence-backed AI engineering workspace without discarding the current product.  
**Primary rule:** migration must be incremental; existing chat, providers, agents, MCP, CLI, audit, workflows, plugins, cost controls, and packaging remain usable while v4 is introduced.

---

## 1. Product north star

Krevyx v4 is not another chat client with agents attached to it. It is a **local-first engineering workspace** where a user can open a project, define a mission, let multiple agents plan and execute work, inspect every action, and accept only results that have evidence.

The flagship workflow is:

> Open an unfamiliar repository → understand it → create a mission → decompose work → assign agents/models/tools → execute in isolated workspaces → test and review the changes → attach evidence → present a verified diff/PR for human approval.

The core product loop becomes:

```text
Workspace
   ↓
Mission
   ↓
Plan / Task graph
   ↓
Agent runs
   ↓
Tool calls + artifacts
   ↓
Verification gates
   ↓
Evidence bundle
   ↓
Human approval / Git action
```

A task is never considered complete simply because an LLM says that it is complete.

---

## 2. Current baseline that must be preserved

The current application already contains meaningful building blocks:

- Electron desktop shell and preload bridge.
- Local Ollama plus configurable cloud providers.
- Agent and orchestration code under `src/main/agents*`.
- MCP integration.
- Guard/security, cost and audit subsystems.
- CLI entry point in `bin/krevyx.js`.
- Renderer surfaces including chat, agent canvas, agent console, orchestrator view, command palette, onboarding and v3 UI modules.
- Existing lint/test CI on Node 22 + pnpm 11.

v4 therefore uses a **strangler migration**: new domain modules and `ipc:4:*` contracts are introduced beside the existing v3 surfaces, then old paths are retired only after functional parity and migration tests exist.

### Non-goals for the first v4 release

- Rewriting the entire app in a new UI framework.
- Replacing Electron.
- Building a proprietary foundation model.
- Shipping autonomous destructive actions without explicit permissions.
- Making the system cloud-dependent.
- Removing existing providers, CLI workflows, plugins or MCP compatibility.
- Claiming full autonomous software engineering without measurable verification.

---

## 3. Product principles

### 3.1 Evidence over claims
Every important agent conclusion must point to machine-readable evidence: changed files, command output, test results, reviewer findings, artifacts, hashes or user approvals.

### 3.2 Local-first, provider-optional
Ollama remains a first-class path. Cloud providers are optional accelerators, not architectural requirements.

### 3.3 Human authority is explicit
Users can inspect the plan, permissions, diff, evidence and final action. Git pushes, destructive shell operations and sensitive network actions must remain policy controlled.

### 3.4 Tasks, not chats, are the primary unit
Chat remains useful, but project work is modeled as durable missions and tasks with state, history and ownership.

### 3.5 Isolation before autonomy
More autonomy is allowed only after the task runtime has safe working-directory boundaries, permission checks, cancellation and rollback.

### 3.6 Backwards-compatible migration
New v4 modules are introduced behind adapters and feature flags. A single giant rewrite PR is explicitly prohibited.

---

## 4. Canonical v4 data model

The runtime and UI must use the same vocabulary.

### Workspace
Represents an opened local project/repository.

Required fields:

```text
id
name
rootPath
repositoryMetadata
activeBranch
indexState
createdAt
lastOpenedAt
settings
```

### Mission
A durable high-level user goal.

```text
id
workspaceId
title
goal
constraints
status
priority
createdBy
createdAt
updatedAt
budget
policyProfileId
```

Mission states:

```text
DRAFT → PLANNING → READY → RUNNING → BLOCKED → VERIFYING → COMPLETE
                                           ↘ FAILED / CANCELLED
```

### Task
An executable node in a mission graph.

```text
id
missionId
parentTaskId
title
description
status
dependencies[]
assigneeAgentId
requiredCapabilities[]
inputs[]
expectedOutputs[]
acceptanceCriteria[]
riskLevel
```

### AgentRun
One concrete execution of one agent against one task.

```text
id
taskId
agentProfileId
modelRoute
status
startedAt
finishedAt
contextSnapshotId
usage
resultSummary
```

### ToolCall
A recorded interaction with filesystem, shell, git, browser, MCP or another tool.

```text
id
agentRunId
toolId
argumentsDigest
permissionDecision
startedAt
finishedAt
exitState
outputArtifactId
```

### Artifact
A durable output: patch, file, report, screenshot, test log, generated document or structured JSON.

### Evidence
A typed assertion support record.

```text
id
subjectType
subjectId
kind
sourceArtifactId
summary
hash
createdAt
```

Initial evidence kinds:

```text
file-change
test-result
lint-result
build-result
command-result
review-finding
security-scan
git-state
user-approval
benchmark-result
```

### VerificationRun
Executes one or more gates against a task/mission.

```text
id
subjectId
gates[]
status
startedAt
finishedAt
evidenceIds[]
```

### Skill
A versioned reusable execution recipe combining prompts, roles, tools, gates and policies.

---

## 5. Target module architecture

Do not move every existing file immediately. Create the v4 spine first and migrate behavior into it over time.

```text
src/
  main/
    v4/
      workspace/
        workspace-service.js
        workspace-repository.js
        repo-inspector.js
        ignore-rules.js
      missions/
        mission-service.js
        task-graph.js
        scheduler.js
        state-machine.js
      runtime/
        agent-runtime.js
        run-controller.js
        cancellation.js
        context-builder.js
      models/
        model-router.js
        capability-registry.js
        provider-adapters/
      tools/
        tool-registry.js
        permission-engine.js
        execution-context.js
        adapters/
          filesystem.js
          shell.js
          git.js
          mcp.js
          browser.js
      verification/
        verification-service.js
        evidence-store.js
        gates/
          tests.js
          lint.js
          build.js
          diff-review.js
          security.js
      memory/
        project-memory.js
        decision-log.js
        context-retriever.js
      skills/
        skill-registry.js
        skill-loader.js
        skill-validator.js
      observability/
        event-bus.js
        run-journal.js
        metrics.js
      persistence/
        store.js
        migrations/
      ipc/
        handlers.js
        serializers.js

  renderer/
    v4/
      app-shell.js
      state/
      views/
        workspace-view.js
        mission-view.js
        task-board.js
        run-view.js
        evidence-view.js
        diff-view.js
        settings-view.js
      components/
        agent-status.js
        permission-card.js
        evidence-badge.js
        gate-result.js
        activity-timeline.js

  shared/
    v4/
      contracts.js
      enums.js
      errors.js
      schemas.js
```

Existing modules stay operational while adapters connect them to this spine.

---

## 6. IPC strategy

Create a new versioned namespace rather than extending v3 indefinitely.

Examples:

```text
ipc:4:workspace:open
ipc:4:workspace:index
ipc:4:mission:create
ipc:4:mission:start
ipc:4:mission:cancel
ipc:4:task:update
ipc:4:run:subscribe
ipc:4:tool:approve
ipc:4:verification:run
ipc:4:evidence:list
ipc:4:skill:list
ipc:4:skill:run
```

Rules:

1. Renderer receives serializable DTOs only.
2. Renderer never receives raw privileged Node objects.
3. All write actions validate workspace, mission, task and permission scope.
4. All subscriptions return an unsubscribe path.
5. IPC errors use stable error codes, not string matching.
6. v3 IPC remains until the corresponding v4 surface has parity tests.

---

## 7. Execution phases

The phases below are ordered by dependency. UI polish does not precede the runtime spine.

### Phase 0 — Freeze the baseline and define measurable gates

**Goal:** make v3.26 a known-good migration baseline.

Tasks:

- Add a `docs/v4/BASELINE.md` generated from verified repository facts.
- Record current test count, CI duration, package size, startup path and known warnings.
- Add smoke tests for app boot, provider settings, local Ollama discovery, one agent execution, MCP loading, CLI execution and audit verification.
- Add a migration feature flag: `features.v4Workspace`.
- Document the compatibility contract for v3 settings and sessions.
- Investigate and fix the existing Jest open-handle warning before expanding asynchronous runtime complexity.

Exit criteria:

- Main CI green.
- Smoke suite exists.
- No unexplained process leak in tests.
- Baseline metrics committed.
- v4 can be disabled without changing existing behavior.

### Phase 1 — Domain spine and persistence

**Goal:** introduce Workspace, Mission, Task, AgentRun, ToolCall, Artifact, Evidence and VerificationRun as stable domain objects.

Tasks:

- Add enums and validation helpers under `src/shared/v4/`.
- Add persistence interface and schema migrations.
- Implement mission/task state machine with illegal transition rejection.
- Add append-only run journal for debugging and recovery.
- Add IDs that are stable across app restarts.
- Build serializers for IPC boundaries.
- Add repository tests for CRUD, migrations, state transitions and corrupted state recovery.

Critical invariant:

> A mission must be reconstructable after application restart without relying on chat history.

Exit criteria:

- Mission/task lifecycle passes unit tests.
- Restart/resume integration test passes.
- Invalid state transitions cannot silently mutate state.

### Phase 2 — Workspace intelligence

**Goal:** make Krevyx understand a repository before asking an LLM to reason over arbitrary file dumps.

Subcomponents:

1. **Repository inventory** — files, sizes, language hints, git state, ignore rules.
2. **Structure map** — package manifests, entry points, test locations, workflows, docs.
3. **Symbol/index layer** — incremental index of relevant source symbols/text chunks.
4. **Change-aware refresh** — index only changed files after initial scan.
5. **Context packs** — deterministic bundles for architecture, task, diff and review contexts.

Implementation tasks:

- Create `repo-inspector.js` and ignore rules compatible with `.gitignore` plus Krevyx-specific exclusions.
- Never index `.git`, build output, dependency caches, secrets or files above configured size by default.
- Add content hashing so unchanged files do not re-index.
- Add file relevance ranking.
- Create a project summary artifact generated from repository facts before model interpretation.
- Expose index health and last refresh time in the UI.

Exit criteria:

- Opening a medium repository does not send the entire repository to any model.
- Re-index after one-file change is incremental.
- Sensitive-path exclusion tests pass.
- User can inspect exactly which files were included in a context pack.

### Phase 3 — Capability-aware model router

**Goal:** separate "which agent should act" from "which model should serve that run".

Model capability dimensions:

```text
local/cloud
context size
reasoning
coding
tool calling
vision
structured output
latency tier
estimated cost
privacy class
availability
```

Tasks:

- Normalize current provider implementations behind provider adapters.
- Create `ModelCapability` records.
- Add routing policies: `local-only`, `lowest-cost`, `best-coding`, `balanced`, `manual`.
- Add explicit fallback chains.
- Never silently cross a privacy boundary (for example local-only → cloud).
- Record the chosen route on every AgentRun.
- Add route explanation to the UI: "selected because...".

Exit criteria:

- Same task can execute against Ollama or a configured cloud provider without changing mission logic.
- Provider outage triggers only policy-allowed fallback.
- Route choice is visible and auditable.

### Phase 4 — Agent runtime and task scheduler

**Goal:** replace ad-hoc delegation semantics with a durable runtime.

Runtime responsibilities:

- consume ready tasks from a dependency graph;
- select an agent profile and model route;
- build bounded context;
- stream events;
- execute tools through the permission layer;
- persist checkpoints;
- handle cancellation/timeouts;
- return structured outputs;
- trigger verification.

Initial built-in roles:

```text
Planner
Implementer
Tester
Reviewer
Researcher
Release Engineer
```

Avoid dozens of cosmetic personas. Roles should differ by allowed capabilities, prompts, tools and verification responsibilities.

Scheduler rules:

- A task runs only when dependencies are satisfied.
- Parallel execution is allowed only if declared write scopes do not conflict.
- A failed dependency blocks downstream tasks.
- User can pause or cancel a mission.
- Cancellation propagates to child tool processes.

Exit criteria:

- 3-task dependency graph executes in the correct order.
- Two non-conflicting tasks can run in parallel.
- Conflicting write scopes are serialized or blocked.
- Restart after app termination can recover mission status safely.

### Phase 5 — Tool runtime, isolation and permissions

**Goal:** make autonomy safe enough to expand.

Every tool declares:

```text
id
capabilities
riskLevel
readScopes
writeScopes
networkRequirement
requiresApproval
supportsCancellation
```

Permission profiles:

- `observe` — read-only project inspection.
- `edit` — scoped file writes, no destructive git/network actions.
- `developer` — build/test/shell in workspace with guarded commands.
- `trusted-automation` — configurable high-autonomy profile; never default.

Execution controls:

- workspace-root path confinement;
- path traversal protection;
- environment allowlist/redaction;
- shell command timeout;
- process-tree cancellation;
- output size caps;
- secret masking in persisted logs;
- explicit network policy;
- git worktree/sandbox option for write-heavy missions.

Exit criteria:

- Tool cannot write outside permitted workspace scope.
- Denied permission produces a structured event and blocks the action.
- Cancel terminates child command execution.
- Sensitive environment values do not appear in run journals.

### Phase 6 — Evidence and verification engine

**Goal:** make evidence-backed autonomy the product differentiator.

Verification gates initially supported:

```text
Tests
Lint
Build
Diff review
Security checks
Git cleanliness / expected changes
Custom command
Human approval
```

Task completion states shown to users:

```text
UNVERIFIED → TESTED → REVIEWED → VERIFIED
```

A green VERIFIED state requires all required gates for that task/skill to pass.

Evidence bundle example:

```text
Claim: "Authentication regression fixed"

Evidence:
- src/auth/session.js modified
- tests/auth/session.test.js added
- test gate: 42/42 passed
- lint gate: passed
- reviewer: no high-risk finding
- diff hash: ...
```

Tasks:

- Implement gate interface.
- Persist command, exit code, bounded stdout/stderr and artifact hashes.
- Add diff-aware test selection hook, with full-suite fallback.
- Add reviewer findings with severity and file/line references.
- Add verification policy per skill/mission.
- Prevent task completion when mandatory gates fail.

Exit criteria:

- A deliberately broken implementation cannot become VERIFIED.
- Evidence survives restart.
- UI can navigate from claim → evidence → source artifact.

### Phase 7 — Project memory and decision log

**Goal:** remember durable project knowledge without treating all chat text as equal.

Memory classes:

1. **Repository facts** — generated from source/index.
2. **Decisions** — user/agent decisions with rationale.
3. **Conventions** — test commands, style rules, directory policies.
4. **Mission outcomes** — successful/failed approaches and evidence.
5. **User preferences** — scoped, editable, never inferred as project facts.

Tasks:

- Build project-scoped memory API.
- Add explicit provenance to every memory item.
- Add TTL/staleness where appropriate.
- Make retrieved memory visible in run context inspection.
- Add "forget/update" UI.
- Never let stale memory override current repository facts.

Exit criteria:

- User can see why a memory was retrieved.
- Repository change invalidates stale derived facts.
- Project memories do not leak into another workspace.

### Phase 8 — Skills system

**Goal:** package repeatable engineering workflows instead of multiplying agent personas.

Skill manifest draft:

```yaml
name: dependency-upgrade
version: 1
entry: planner
roles:
  - planner
  - implementer
  - tester
  - reviewer
tools:
  - filesystem.read
  - filesystem.write
  - shell.exec
  - git.diff
gates:
  - lint
  - tests
  - build
policy:
  network: prompt
  writeScope: workspace
```

Built-in v4 launch skills:

- Repository audit.
- Bug fix with regression test.
- Dependency upgrade.
- Test coverage improvement.
- Security review.
- Performance investigation.
- Release preparation.
- Documentation synchronization.

Tasks:

- Define versioned manifest schema.
- Validate requested tools against permissions.
- Add import/export.
- Add built-in signed/known-source metadata field without pretending community code is trusted.
- Make skill execution produce a Mission, not bypass the mission runtime.

Exit criteria:

- A skill is reproducible from manifest + workspace state.
- Skill cannot request undeclared privileged tools silently.

### Phase 9 — v4 workspace UI

**Goal:** change the application mental model from chat-first to task-first while retaining chat as a supporting surface.

Primary layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Workspace / branch / model policy / budget                  │
├───────────────┬────────────────────────────┬─────────────────┤
│ PROJECT       │ MISSION                    │ AGENTS / RUNS   │
│ file tree     │ task graph / board         │ live statuses   │
│ index status  │ plan + acceptance criteria │ model + tools   │
├───────────────┴────────────────────────────┴─────────────────┤
│ Activity timeline / terminal / diff / evidence / context     │
└──────────────────────────────────────────────────────────────┘
```

Required views:

- Workspace chooser and recent projects.
- Mission creation.
- Task graph/board.
- Agent run inspector.
- Permission inbox.
- Diff inspector.
- Evidence inspector.
- Verification summary.
- Context inspector.
- Provider/model routing settings.

UX rules:

- Important state must not exist only in toast notifications.
- Every long-running action exposes cancel/pause state.
- Every model/tool action shows origin and current status.
- Evidence badges are clickable.
- Destructive approval text states exactly what will happen.
- Empty states teach the flagship workflow.

Migration strategy:

- Build v4 UI in `src/renderer/v4/`.
- Mount it behind the feature flag.
- Reuse existing renderer utilities only through explicit adapters.
- Do not add more global state to `app.js` or `v3-ui.js`.

Exit criteria:

- User can complete the flagship mission without opening the legacy chat surface.
- Existing chat remains accessible during migration.
- Keyboard navigation covers core mission controls.

### Phase 10 — Git workflow and artifact delivery

**Goal:** make repository work safe, inspectable and reversible.

Capabilities:

- detect current branch and dirty state;
- optionally create a mission branch/worktree;
- show file/diff ownership by task;
- stage selected changes;
- create commit with user approval;
- prepare PR body artifact;
- integrate with GitHub only when configured and permitted.

Rules:

- Never overwrite uncommitted user work.
- Never force-push by default.
- Never merge without an explicit policy/user action.
- Save exact base/head SHA in mission evidence.
- PR descriptions include verification evidence, not generic "done" text.

Exit criteria:

- Dirty-worktree protection test passes.
- Worktree sandbox cleanup is deterministic.
- Final mission can produce a reviewable patch even without GitHub credentials.

### Phase 11 — Observability, cost and debugging

**Goal:** make a multi-agent system diagnosable.

Required runtime events:

```text
mission.created
mission.status.changed
task.ready
task.started
task.blocked
task.completed
run.started
run.model.selected
run.context.built
tool.requested
tool.approved
tool.denied
tool.completed
verification.started
verification.gate.completed
verification.completed
run.failed
run.cancelled
```

UI metrics:

- elapsed time;
- tokens when provider exposes them;
- estimated/actual cloud cost;
- local vs cloud model usage;
- tool calls;
- gate duration;
- retry count;
- context size.

Tasks:

- Use one event envelope with timestamp, mission/task/run IDs and sequence number.
- Add bounded run logs.
- Add exportable diagnostic bundle with secrets removed.
- Add trace view for one task.

Exit criteria:

- A failed run can be reconstructed from its journal without reading arbitrary console logs.
- Cost attribution is per run/task/mission where data is available.

### Phase 12 — Security hardening

**Goal:** treat v4 autonomy as a privilege escalation relative to ordinary chat.

Threat model areas:

- malicious repository prompt injection;
- tool-command injection;
- path traversal;
- secret exfiltration;
- MCP server trust;
- malicious skill/plugin manifests;
- renderer → main privilege escalation;
- unsafe browser/network access;
- log leakage;
- untrusted generated shell commands.

Required controls:

- content from repository files is marked untrusted data, not system instruction;
- permission engine executes policy independent of model output;
- IPC allowlist and payload validation;
- no direct Node access in renderer;
- network policy visible to user;
- secrets redacted before persistence;
- plugin/skill provenance shown;
- default-deny for new privileged tool types;
- dedicated security regression suite.

Exit criteria:

- security tests cover traversal, command denial, secret redaction, untrusted context and renderer privilege boundaries.
- threat model document is part of release review.

### Phase 13 — Performance and reliability

**Goal:** keep the desktop app responsive while indexing and running agents.

Tasks:

- Move expensive indexing/analysis off the renderer thread.
- Bound file reads, model context and tool output.
- Add incremental/cached repository scan.
- Backpressure event streaming.
- Add retry policies only for idempotent operations.
- Add crash-safe persistence checkpoints.
- Add startup recovery for interrupted missions.
- Measure memory use on a large repository.

Performance policy:

- Phase 0 establishes real baselines first.
- Any >10% regression in startup or idle memory requires explanation.
- Index operations need progress and cancellation.
- Renderer must remain interactive during long operations.

Exit criteria:

- cancellation works during indexing and model runs.
- large logs cannot freeze the renderer.
- interrupted mission recovery is tested.

### Phase 14 — Release, demo and documentation

**Goal:** ship a credible v4, not only internal architecture.

Required artifacts:

- updated README with real v4 screenshots;
- 60–120 second flagship demo;
- architecture document;
- threat model;
- skill authoring guide;
- provider/model-routing guide;
- migration notes from v3;
- release notes with known limitations;
- reproducible release packages.

Flagship demo acceptance flow:

1. Open a public repository.
2. Krevyx indexes it and shows repository facts.
3. Enter: "Find and fix one real bug; add a regression test."
4. Planner creates tasks.
5. Implementer changes code in a controlled workspace.
6. Tester runs relevant tests.
7. Reviewer inspects diff.
8. Verification produces an evidence bundle.
9. User reviews diff and approves the final Git action.

The demo must not hide failed/denied steps; observability is part of the product.

---

## 8. PR-by-PR delivery sequence

The following sequence is designed to keep reviews small enough to understand and revert.

| PR | Scope | Depends on | Must prove |
| --- | --- | --- | --- |
| V4-01 | baseline metrics + smoke tests + feature flag | — | v3 baseline stable |
| V4-02 | shared contracts/enums/errors | V4-01 | canonical objects validated |
| V4-03 | persistence + migrations + mission repository | V4-02 | restart durability |
| V4-04 | mission/task state machine | V4-03 | legal transitions only |
| V4-05 | v4 event bus/run journal | V4-03 | ordered replayable events |
| V4-06 | workspace inventory + ignore rules | V4-02 | safe bounded scan |
| V4-07 | incremental index/context packs | V4-06 | changed-file refresh |
| V4-08 | provider adapters + capability registry | V4-02 | normalized model interface |
| V4-09 | model router + policy UI contract | V4-08 | no privacy-boundary fallback |
| V4-10 | agent runtime + cancellation | V4-04,V4-05,V4-09 | durable run lifecycle |
| V4-11 | task scheduler + dependency graph | V4-10 | parallel safe tasks |
| V4-12 | tool registry + permission engine | V4-10 | default-deny privilege model |
| V4-13 | filesystem/shell/git adapters | V4-12 | workspace confinement |
| V4-14 | worktree sandbox | V4-13 | reversible isolated edits |
| V4-15 | evidence store + gate interface | V4-03,V4-05 | durable evidence |
| V4-16 | test/lint/build/custom gates | V4-15 | deterministic gate results |
| V4-17 | diff reviewer + VERIFIED policy | V4-16 | failed gate blocks completion |
| V4-18 | project memory + decision log | V4-07,V4-10 | provenance-aware context |
| V4-19 | skill schema + registry | V4-12,V4-17 | reproducible skill execution |
| V4-20 | v4 shell + workspace UI | V4-06 | feature-flagged workspace |
| V4-21 | mission/task board + run timeline | V4-11,V4-20 | live durable task state |
| V4-22 | permissions/diff/evidence views | V4-17,V4-20 | review loop usable |
| V4-23 | Git delivery flow | V4-14,V4-22 | safe patch/commit prep |
| V4-24 | observability/cost dashboard | V4-05,V4-09 | per-run attribution |
| V4-25 | security hardening suite | V4-12,V4-19 | threat model gates |
| V4-26 | performance/recovery pass | all runtime PRs | cancellation/recovery |
| V4-27 | flagship built-in skills | V4-19 | end-to-end missions |
| V4-28 | v3 compatibility/migration cleanup | parity reached | no feature regression |
| V4-29 | docs/screenshots/demo/release candidate | V4-28 | public release quality |

Do not merge V4-28 until the v4 path has parity tests for every v3 capability being retired.

---

## 9. Ready-to-assign engineering backlog

These can be converted directly into GitHub issues.

### Runtime foundation

- **V4-R01:** shared domain contracts and status enums.
- **V4-R02:** mission/task transition validator.
- **V4-R03:** persistence abstraction and first migration.
- **V4-R04:** run journal/event envelope.
- **V4-R05:** cancellation token and child-process propagation.
- **V4-R06:** crash/restart recovery integration test.

### Workspace intelligence

- **V4-W01:** repository inventory scanner.
- **V4-W02:** ignore/sensitive path policy.
- **V4-W03:** content hashing and incremental refresh.
- **V4-W04:** context pack builder.
- **V4-W05:** index status/health API.
- **V4-W06:** context inspection UI.

### Models

- **V4-M01:** provider adapter interface.
- **V4-M02:** migrate Ollama provider first.
- **V4-M03:** migrate cloud providers behind same interface.
- **V4-M04:** capability registry.
- **V4-M05:** routing policy engine.
- **V4-M06:** fallback/privacy boundary tests.

### Agents/orchestration

- **V4-A01:** agent profile schema.
- **V4-A02:** AgentRun controller.
- **V4-A03:** dependency graph scheduler.
- **V4-A04:** write-scope conflict detection.
- **V4-A05:** planner structured-output contract.
- **V4-A06:** pause/resume/cancel behavior.

### Tools/security

- **V4-T01:** tool manifest schema.
- **V4-T02:** permission engine.
- **V4-T03:** filesystem adapter.
- **V4-T04:** shell adapter.
- **V4-T05:** git adapter.
- **V4-T06:** MCP adapter.
- **V4-T07:** network/browser policy adapter.
- **V4-T08:** secret redaction.
- **V4-T09:** worktree sandbox.

### Verification/evidence

- **V4-E01:** artifact/evidence storage.
- **V4-E02:** gate interface.
- **V4-E03:** test gate.
- **V4-E04:** lint gate.
- **V4-E05:** build gate.
- **V4-E06:** custom command gate.
- **V4-E07:** diff review findings.
- **V4-E08:** verified-state policy.
- **V4-E09:** evidence bundle export.

### UX

- **V4-U01:** v4 app shell and feature flag mount.
- **V4-U02:** workspace/repository header.
- **V4-U03:** mission composer.
- **V4-U04:** task graph/board.
- **V4-U05:** agent/run list.
- **V4-U06:** activity timeline.
- **V4-U07:** permission inbox.
- **V4-U08:** diff view.
- **V4-U09:** evidence/gate inspector.
- **V4-U10:** context inspector.
- **V4-U11:** recovery/blocker states.
- **V4-U12:** keyboard/accessibility pass.

### Skills/release

- **V4-S01:** manifest validator.
- **V4-S02:** built-in bug-fix skill.
- **V4-S03:** repository audit skill.
- **V4-S04:** dependency upgrade skill.
- **V4-S05:** release preparation skill.
- **V4-L01:** demo repository and golden mission.
- **V4-L02:** migration guide.
- **V4-L03:** architecture/threat-model docs.
- **V4-L04:** real release screenshots/video.

---

## 10. Testing strategy

### Unit tests

Required for:

- state machines;
- routing policies;
- permission decisions;
- path/scoping helpers;
- manifest validation;
- evidence policies;
- serializers/migrations.

### Integration tests

Required flows:

- mission create → task execution → verification → complete;
- cancelled tool process;
- app restart/resume;
- provider failure + allowed fallback;
- provider failure + forbidden privacy fallback;
- dirty git workspace protection;
- sandbox worktree creation/cleanup;
- permission denial;
- failed tests block VERIFIED state;
- skill manifest → mission execution.

### End-to-end smoke tests

At minimum:

- launch Electron shell;
- open fixture workspace;
- start one local mocked mission;
- render task/run state;
- produce evidence;
- cancel a second mission;
- verify existing v3 chat surface still opens during migration.

### Golden fixtures

Keep small deterministic repositories under `tests/fixtures/` for indexing, git, permission and orchestration tests. Never depend on network access for core CI.

---

## 11. CI and merge gates

Current CI already installs with frozen lockfile, lints and runs Jest coverage. v4 raises the merge bar gradually.

Required gates before v4 release candidate:

```text
install --frozen-lockfile
lint
test:unit
test:integration
test:security
test:smoke
audit-chain verification
package smoke (at least one supported platform per release path)
```

PR rules:

1. Every PR declares which v4 invariant it changes.
2. Runtime PRs include tests in the same PR.
3. New privileged tools require security tests.
4. New persisted fields require a migration test.
5. New renderer IPC calls require contract tests.
6. No merge with failing exact-head CI.
7. Large refactors cannot also introduce unrelated product behavior.

---

## 12. Migration map from current code

This is a migration guide, not an instruction to delete the old files immediately.

| Current area | v4 destination | Strategy |
| --- | --- | --- |
| `src/main/agents*` | `src/main/v4/runtime`, `missions`, `tools` | wrap existing useful logic, then move capability by capability |
| `src/main/ipc-v3-handlers.js` and later versioned handlers | `src/main/v4/ipc` | keep v3 active; add new `ipc:4:*` namespace |
| current MCP modules | `src/main/v4/tools/adapters/mcp.js` | adapter over current broker behavior |
| current guard modules | `src/main/v4/tools/permission-engine.js` + verification/security gates | reuse proven checks behind policy interface |
| current cost modules | `src/main/v4/observability` | feed normalized run usage events |
| audit modules | `src/main/v4/observability/run-journal.js` | preserve audit export, add mission/run correlation |
| `src/renderer/app.js` | legacy compatibility surface | freeze feature growth |
| `src/renderer/v3-ui.js` | legacy compatibility surface | freeze feature growth |
| agent canvas/console/orchestrator renderer modules | `src/renderer/v4/views` | reuse concepts; bind to mission/run domain state |
| CLI | v4 mission runtime adapter | CLI should invoke same mission engine as desktop |

**Freeze rule:** once a v4 replacement exists, new feature work goes to the v4 module, not the equivalent legacy global file.

---

## 13. Risk register

### Risk: giant rewrite stalls
Mitigation: strangler architecture, feature flag, 29 reviewable PRs, no early deletion.

### Risk: agent concurrency corrupts user files
Mitigation: declared write scopes, conflict detection, git worktrees, permission engine, dirty-state checks.

### Risk: context/indexing sends secrets to models
Mitigation: exclusion rules, context inspector, local-first routing, explicit privacy policies.

### Risk: "verified" becomes marketing language
Mitigation: stable gate semantics and machine-readable evidence; failed required gate cannot render VERIFIED.

### Risk: provider APIs change
Mitigation: adapters and capability registry; mission runtime does not depend on provider-specific payloads.

### Risk: Electron main process becomes another monolith
Mitigation: v4 domain directories, dependency boundaries, no new large global handler file.

### Risk: UI becomes a dashboard that hides execution detail
Mitigation: timeline, context, tool call, diff and evidence drill-down from every task.

### Risk: plugins/skills become arbitrary code execution
Mitigation: manifest validation, declared capabilities, provenance, permission engine; no implicit trust.

### Risk: local models cannot reliably emit structured plans
Mitigation: schema-repair loop with bounded retries, simpler planner contracts, manual edit path, stronger model route when policy permits.

---

## 14. Definition of done for Krevyx v4.0

v4.0 is not complete until all of the following are true:

### Product

- User can open a local repository as a Workspace.
- User can create a durable Mission with constraints and acceptance criteria.
- Planner produces editable structured tasks.
- Scheduler executes dependencies and safe parallel tasks.
- At least Ollama plus one cloud-provider path use the same runtime abstraction.
- Tool permissions are visible and enforceable.
- Task progress survives application restart.
- User can inspect context, tool calls, artifacts and model route.
- Verification gates create evidence.
- Required failed gate prevents VERIFIED status.
- User can inspect a final diff and prepare a Git result.

### Security

- Renderer remains unprivileged.
- Workspace path confinement is tested.
- Secret redaction is tested.
- Network/tool permission policies are tested.
- Prompt injection from repository content does not override tool policy.
- Threat model is published.

### Quality

- CI is green on exact release head.
- No known hanging Jest worker/open-handle warning.
- Mission recovery tests pass.
- Golden flagship workflow passes repeatedly on fixture repos.
- Existing v3 features either remain available or have documented v4 parity.

### Presentation

- README contains real application screenshots, not concept renders presented as product UI.
- Architecture and execution model are documented.
- Demo shows plan → execution → verification → evidence → diff.
- Known limitations are stated.

---

## 15. First implementation sprint

The first coding sprint should **not** start with a visual redesign. It should create the v4 spine.

Recommended order:

1. Fix the existing Jest open-handle warning.
2. Add `features.v4Workspace` flag.
3. Add `src/shared/v4/{contracts,enums,errors,schemas}.js`.
4. Implement Mission/Task state machine.
5. Implement persistence interface + migration test.
6. Implement v4 event envelope/run journal.
7. Add a fixture workspace and integration test for create → persist → restart → resume.
8. Add read-only repository inventory scanner.
9. Expose `ipc:4:workspace:*` and `ipc:4:mission:*` read/create paths.
10. Mount a minimal v4 Workspace screen behind the flag.

The sprint is complete only when a mission can be created, persisted, restored after restart, and displayed in the new workspace surface with CI green.

---

## 16. Success metric

The strongest v4 success metric is not number of agents or supported models.

It is:

> **Can a user hand Krevyx a real repository and receive a reviewable, reproducible, evidence-backed engineering result without losing control of the machine or the codebase?**

Every architectural decision in this plan should move that metric forward.
