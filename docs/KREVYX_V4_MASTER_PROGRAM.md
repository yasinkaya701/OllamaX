# Krevyx v4 — Master Execution Program

**Status:** execution master plan  
**Baseline:** Krevyx v3.26 on `main`  
**North-star release:** Krevyx v4.0  
**Program rule:** preserve the working v3 product while introducing v4 through additive, testable, reversible slices.  
**Primary differentiator:** evidence-backed autonomous engineering: agents may propose and execute work, but only verified evidence can promote a task to complete.

---

## 0. How to use this document

This is the program-level plan above `docs/KREVYX_V4_EXECUTION_PLAN.md`.

The execution plan defines the target technical architecture. This master program defines **how to deliver it without losing features, corrupting user work, or turning the repository into a long-lived rewrite branch**.

Use this document to answer:

- What are the parallel workstreams?
- What can be built at the same time?
- What must be serialized?
- Which files are semantic hotspots?
- What is the merge order?
- What evidence does each PR need?
- Which tasks are safe for separate agents?
- When does a milestone become promotable?
- What blocks the release?
- How do v3 and v4 coexist during migration?

The program is designed so that each agent can claim an isolated task, work on a dedicated branch, satisfy exact-head gates, and integrate without taking another agent's files or semantic hotspot.

---

# 1. Product mission

Krevyx v4 becomes a **local-first AI engineering workspace** rather than a desktop chat client with extra agent features.

A user should be able to open a repository and say:

> Make this production-ready. Do not overwrite my work. Explain the plan, execute only permitted actions, test every important change, review the diff, and show me evidence before asking me to approve the final Git action.

The complete user loop is:

```text
OPEN WORKSPACE
      ↓
UNDERSTAND REPOSITORY
      ↓
DEFINE MISSION
      ↓
PLAN TASK GRAPH
      ↓
ROUTE AGENTS + MODELS
      ↓
REQUEST / APPLY PERMISSIONS
      ↓
EXECUTE IN CONTROLLED WORKSPACE
      ↓
GENERATE ARTIFACTS
      ↓
VERIFY TEST / LINT / BUILD / REVIEW / SECURITY
      ↓
BUILD EVIDENCE BUNDLE
      ↓
USER REVIEWS DIFF + EVIDENCE
      ↓
APPROVE GIT DELIVERY
```

The product must feel closer to:

```text
VS Code project awareness
+ Linear task state
+ Claude Code / Codex execution
+ local Ollama runtime
+ evidence-backed CI review
```

without trying to clone any one competitor.

---

# 2. v4 launch contract

v4.0 is considered a product release only when the following flagship scenario is real and repeatable.

## Flagship scenario

1. User opens a local Git repository.
2. Krevyx identifies repository structure, branch, dirty state, manifests, tests, build commands and important files.
3. User creates a Mission with a goal and constraints.
4. Planner proposes an editable task graph.
5. Scheduler assigns ready tasks to appropriate roles.
6. Model router chooses a model according to capability, privacy, availability and budget policy.
7. Agents can inspect files and run approved tools.
8. Write-heavy work can use an isolated Git worktree.
9. Every tool action is recorded.
10. Implementation produces artifacts and a diff.
11. Tester runs required tests.
12. Reviewer evaluates changed code.
13. Verification engine evaluates mandatory gates.
14. Evidence is attached to each important completion claim.
15. Failed mandatory evidence blocks VERIFIED state.
16. User sees final diff, test evidence, reviewer findings, model/tool history and risk summary.
17. User explicitly approves any final commit/push/PR action.
18. Mission remains inspectable after restart.

## Launch statement that must be true

> Krevyx can take a real repository from goal to reviewable engineering result while keeping the user in control and showing evidence for what actually passed.

If this sentence is not demonstrably true, v4.0 is not done.

---

# 3. Program success metrics

Do not optimize for number of agents, number of providers or number of UI panels.

## 3.1 Reliability metrics

- **Mission recovery rate:** 100% for supported persisted mission states in integration tests.
- **Illegal state transition rate:** 0 accepted transitions in tests.
- **Permission escape rate:** 0 writes outside permitted workspace roots.
- **Silent privacy-boundary fallback:** 0.
- **Untracked destructive actions:** 0.
- **Verified-with-failed-required-gate:** 0.

## 3.2 Product metrics

- Time from workspace open to first repository summary.
- Time from mission creation to editable plan.
- Percentage of missions reaching a reviewable diff.
- Percentage of completed tasks with attached evidence.
- Percentage of user approvals that show exact action scope.
- Mission completion rate without manual recovery.
- Cancellation success rate.

## 3.3 Performance budgets

Phase 0 records real baselines first. Until then, these are guardrails rather than invented promises.

- Renderer remains interactive during indexing and tool execution.
- Long-running operations expose progress and cancellation.
- No unbounded tool stdout/stderr retained in memory or UI.
- Incremental index avoids rescanning unchanged files.
- Startup and idle-memory regression over 10% from measured baseline requires explicit review.
- Large-repository tests must have bounded file count, file size and output policies.

## 3.4 Quality metrics

- Exact-head CI required before integration.
- Runtime PRs ship tests in the same PR.
- Persisted schema changes ship migration tests.
- New privileged tool types ship security regression tests.
- User-visible completion claims map to typed evidence.
- No known hanging Jest worker at release candidate.

---

# 4. Architectural invariants

These rules override local implementation convenience.

## INV-01 — v3 must remain usable during migration

Do not delete or rewrite working v3 surfaces until v4 parity exists and is tested.

## INV-02 — the renderer is not trusted

Renderer never receives direct Node privileges. Privileged operations cross validated IPC boundaries.

## INV-03 — policy is not controlled by the model

A model can request a tool. It cannot grant itself permission.

## INV-04 — completion is not a text response

A task status is controlled by runtime state and verification policy, not by a model saying "done".

## INV-05 — mission state survives restart

Mission/task/run state must not exist only in in-memory JavaScript objects or chat history.

## INV-06 — every privileged action has provenance

Tool calls must correlate to mission, task and agent run IDs.

## INV-07 — no silent privacy downgrade

Local-only policy can never silently fall back to a cloud provider.

## INV-08 — repository content is untrusted input

README files, comments, source code and generated text may contain prompt injection. They are data, not authority.

## INV-09 — write conflict must be explicit

Parallel agents cannot mutate overlapping scopes without conflict handling.

## INV-10 — existing user work wins

Krevyx does not overwrite dirty user changes, force-reset branches or force-push by default.

## INV-11 — exact-head validation

A green run on an earlier SHA is not evidence for a later SHA.

## INV-12 — no giant rewrite branch

The program lands through reviewable slices that can be reverted independently.

---

# 5. Program workstreams

The v4 program is split into 14 long-running workstreams. They do not all start at once.

```text
W0  Program / Baseline
W1  Domain + Persistence
W2  Workspace Intelligence
W3  Models + Routing
W4  Agent Runtime + Scheduler
W5  Tools + Permissions + Isolation
W6  Verification + Evidence
W7  Memory + Context
W8  Skills
W9  Desktop UX
W10 Git Delivery
W11 Observability + Cost
W12 Security + Reliability
W13 Release + Docs + Demo
```

---

# 6. Workstream W0 — Program, baseline and repository control

## Objective

Make the current v3.26 product a measurable, frozen migration baseline.

## Deliverables

### W0-01 Baseline report

Create `docs/v4/BASELINE.md` with verified facts:

- current version;
- current Node/pnpm/Electron versions;
- package targets;
- test counts;
- known skipped tests;
- lint warning count;
- CI duration;
- startup behavior;
- current known open-handle warning;
- supported providers and paths;
- current agent/orchestration entry points;
- current renderer surfaces;
- current persistence locations.

### W0-02 Feature flag

Introduce `features.v4Workspace` default-off.

Requirements:

- persisted configuration;
- explicit migration/default behavior;
- tests for default value;
- no v3 behavior change when disabled.

### W0-03 Smoke suite

Add smoke coverage for:

- Electron shell boot path;
- current provider settings;
- Ollama model discovery path;
- one existing agent action;
- MCP initialization;
- current CLI basic command;
- audit verification;
- renderer v3 surface mount.

### W0-04 Async leak cleanup

Investigate and resolve the current Jest open-handle/worker teardown warning before adding more persistent schedulers and child processes.

### W0-05 Repository integration protocol

Document:

- task claim protocol;
- branch naming;
- semantic hotspot ownership;
- exact-head CI gate;
- integration branch rules;
- conflict resolution ownership;
- completion evidence format.

## Exit gate W0

- CI green.
- Feature flag works.
- Smoke suite exists.
- Async test teardown has no unexplained leak.
- Baseline committed.

---

# 7. Workstream W1 — Domain model, persistence and state machines

## Objective

Create the durable spine all other v4 systems depend on.

## Canonical entities

```text
Workspace
Mission
Task
AgentProfile
AgentRun
ToolCall
Artifact
Evidence
VerificationRun
Skill
ContextSnapshot
PolicyProfile
ModelRoute
RunEvent
```

## Epic W1-A — Shared contracts

Create `src/shared/v4/`:

```text
contracts.js
enums.js
errors.js
schemas.js
ids.js
version.js
```

Requirements:

- stable enums;
- explicit status values;
- serializable DTO shapes;
- schema validation;
- error codes;
- versioned contracts.

## Epic W1-B — Persistence

Create `src/main/v4/persistence/`:

```text
store.js
repositories/
migrations/
backup.js
recovery.js
```

Requirements:

- atomic writes or transactional persistence where appropriate;
- schema version;
- migration path;
- backup before destructive migration;
- corrupt-record handling;
- test fixtures for previous schema versions.

## Epic W1-C — Mission state machine

Mission states:

```text
DRAFT
PLANNING
READY
RUNNING
PAUSED
BLOCKED
VERIFYING
COMPLETE
FAILED
CANCELLED
```

Illegal transitions must fail with stable errors.

## Epic W1-D — Task state machine

Task states:

```text
DRAFT
BLOCKED
READY
RUNNING
WAITING_APPROVAL
WAITING_DEPENDENCY
VERIFYING
UNVERIFIED
TESTED
REVIEWED
VERIFIED
FAILED
CANCELLED
```

Do not conflate execution status and evidence quality internally. If necessary model lifecycle and verification state as separate fields while presenting a combined UI state.

## Epic W1-E — Run journal

Every state-changing event gets an ordered envelope:

```text
id
sequence
timestamp
workspaceId
missionId
taskId
agentRunId
type
payloadVersion
payload
```

Requirements:

- replay-friendly ordering;
- bounded payloads;
- sensitive-value redaction;
- exportable diagnostics.

## Exit gate W1

- create/persist/load Workspace;
- create/persist/load Mission;
- task graph survives restart;
- illegal transitions rejected;
- journal replay reconstructs key status;
- migration tests pass.

---

# 8. Workstream W2 — Workspace intelligence

## Objective

Understand repositories deterministically before sending selected context to models.

## Epic W2-A — Repository inventory

Capture:

- root path;
- Git repository status;
- active branch;
- HEAD SHA;
- dirty files;
- file tree;
- language hints;
- package manifests;
- test directories;
- CI workflows;
- docs;
- entry-point candidates.

## Epic W2-B — Ignore and sensitive-path policy

Default exclude:

```text
.git/
node_modules/
dist/
build/
coverage/
cache directories
large binaries
known credential files
.env*
private keys
provider credentials
```

Allow users to inspect and override safe exclusions where appropriate, but never silently ingest secrets.

## Epic W2-C — Content hashing

Each indexed file gets:

```text
path
size
mtime
contentHash
language
indexVersion
```

Only changed files re-index.

## Epic W2-D — Structural understanding

Deterministically identify:

- package scripts;
- dependencies;
- source roots;
- test roots;
- application entry points;
- Electron main/preload/renderer boundaries;
- GitHub Actions;
- build outputs;
- documentation map.

## Epic W2-E — Symbol/chunk index

Begin simple and deterministic.

Priorities:

1. file-level metadata;
2. text chunks with line ranges;
3. language-aware symbols where reliable;
4. dependency/reference graph later.

Do not block v4 on building a perfect code intelligence engine.

## Epic W2-F — Context packs

Generate typed packs:

```text
workspace-summary
architecture
implementation-task
bug-investigation
review-diff
security-review
release
```

Every context item records provenance and exact file/line origin.

## Epic W2-G — Context inspector UI contract

Users must see:

- files included;
- excluded files;
- why an item was selected;
- token/size estimate;
- local/cloud destination policy.

## Exit gate W2

- safe bounded scan;
- incremental one-file refresh;
- secret exclusion tests;
- context pack provenance;
- no full-repo blind prompt dump.

---

# 9. Workstream W3 — Provider normalization and model router

## Objective

Separate mission logic from vendor-specific model APIs.

## Capability model

Each model/provider registration includes:

```text
provider
modelId
locality
contextWindow
reasoningTier
codingTier
toolCalling
vision
structuredOutput
streaming
latencyClass
estimatedCostClass
privacyClass
availability
```

## Built-in routing policies

```text
manual
local-only
privacy-first
lowest-cost
balanced
best-coding
best-reasoning
fastest-available
```

## Requirements

- Ollama first-class adapter.
- Current cloud providers migrate behind normalized interface.
- Route explanation persisted.
- Fallback chain explicit.
- No local-only → cloud fallback.
- Rate-limit/provider errors normalized.
- Structured-output repair bounded.
- Model selection visible in AgentRun UI.

## Route decision inputs

```text
required capabilities
privacy policy
user model preferences
provider availability
context size
cost ceiling
latency preference
task risk
skill requirements
```

## Exit gate W3

- same mission runtime can use Ollama and at least one cloud adapter;
- privacy boundary tests pass;
- route reason visible;
- fallback is deterministic and policy constrained.

---

# 10. Workstream W4 — Agent runtime and scheduler

## Objective

Replace informal delegation with a durable dependency-aware execution engine.

## Built-in roles

Keep roles functional, not cosmetic:

```text
Planner
Implementer
Tester
Reviewer
Researcher
Release Engineer
```

Each role differs through:

- system contract;
- allowed tools;
- expected structured output;
- model capability requirements;
- verification responsibility.

## Epic W4-A — AgentRun controller

Responsibilities:

- create run;
- lock task ownership;
- resolve route;
- build context;
- stream events;
- invoke model;
- request tools;
- checkpoint;
- cancel;
- summarize output;
- trigger next lifecycle step.

## Epic W4-B — Task graph

Support:

- dependencies;
- parent/child tasks;
- ready calculation;
- blocked reasons;
- cycle rejection;
- user edits before execution.

## Epic W4-C — Scheduler

Scheduler rules:

1. only READY tasks run;
2. dependency failures block downstream nodes;
3. max concurrency configurable;
4. high-risk tasks can require explicit start;
5. write-scope conflicts serialize;
6. cancellation propagates;
7. retries are bounded;
8. retries preserve evidence of failed attempts.

## Epic W4-D — Pause / resume

Pause must prevent new work from starting while preserving safe state.

Resume must recalculate dependency readiness instead of blindly replaying old assumptions.

## Epic W4-E — Structured outputs

Planner produces machine-validated tasks:

```text
title
description
dependencies
acceptanceCriteria
expectedOutputs
requiredCapabilities
suggestedWriteScope
risk
```

Implementer returns:

```text
summary
artifacts
claimedAcceptanceCriteria
knownLimitations
nextAction
```

But claimed criteria do not become verified until gates run.

## Exit gate W4

- three-node dependency graph works;
- safe parallel tasks work;
- conflicting writes do not race;
- pause/resume/cancel work;
- restart does not orphan active mission state.

---

# 11. Workstream W5 — Tool runtime, permissions and isolation

## Objective

Make autonomy enforceable at runtime rather than prompt-only.

## Tool descriptor

```text
id
version
riskLevel
readScopes
writeScopes
networkScopes
requiresApproval
supportsCancellation
supportsDryRun
outputLimit
```

## Initial adapters

```text
filesystem.read
filesystem.write
filesystem.list
shell.exec
git.status
git.diff
git.branch
git.commit
mcp.call
browser.navigate
browser.extract
```

Not every adapter is enabled at v4 launch. Add only what can be governed safely.

## Permission profiles

### Observe

- repository read;
- index/query;
- no writes;
- no shell mutation;
- no external network unless explicitly allowed.

### Edit

- scoped file writes;
- read-only Git state;
- no commit/push;
- no arbitrary external network.

### Developer

- scoped writes;
- build/test/lint commands;
- guarded Git operations;
- prompted network access.

### Trusted automation

- configurable broader autonomy;
- never default;
- still subject to forbidden operations and workspace boundary.

## Enforcement controls

- canonical path resolution;
- traversal rejection;
- workspace root confinement;
- symlink escape checks;
- child process timeout;
- process-tree kill;
- environment allowlist;
- secret redaction;
- network allowlist/prompt;
- bounded output capture;
- command audit record.

## Isolation

For mutation-heavy missions, support Git worktree execution:

```text
base workspace (user)
        ↓
mission worktree
        ↓
agent edits
        ↓
verification
        ↓
reviewable patch
```

Requirements:

- dirty user workspace never overwritten;
- worktree base SHA recorded;
- deterministic cleanup;
- failed mission leaves recoverable artifact/diff;
- user can inspect before application.

## Exit gate W5

- path escape tests pass;
- permission denial blocks tool;
- cancellation kills child process tree;
- secret redaction passes;
- isolated edit mission produces reversible patch.

---

# 12. Workstream W6 — Verification and evidence

## Objective

Turn verification into the central trust system of the product.

## Verification gates

Launch gates:

```text
tests
lint
build
custom command
diff review
security checks
git-state check
human approval
```

## Evidence types

```text
file-change
test-result
lint-result
build-result
command-result
review-finding
security-scan
git-state
model-route
permission-decision
user-approval
benchmark
```

## Evidence requirements

Every evidence object should contain enough information to reproduce or inspect the claim:

```text
id
subjectType
subjectId
kind
summary
source
command
exitCode
artifactId
hash
createdAt
producer
```

Not every kind uses every field.

## Verification policy

A Task/Skill declares mandatory gates.

Example:

```text
bug-fix:
  required:
    - regression-test
    - relevant-tests
    - lint
    - diff-review
  optional:
    - full-build
    - security
```

## Verified state rules

- Required gate failed → never VERIFIED.
- Required gate not run → never VERIFIED.
- Gate result stale after relevant file change → invalidate it.
- Evidence from another HEAD/diff hash → invalid for current change.
- Reviewer finding marked blocking → task cannot promote until addressed or explicitly waived by user policy.

## Evidence UI

User can navigate:

```text
Task claim
  → gate
    → command/result
      → artifact/log
        → changed file/diff
```

## Exit gate W6

- deliberately failing test blocks VERIFIED;
- changed diff invalidates stale evidence;
- evidence persists after restart;
- UI/DTO can trace claim to source evidence.

---

# 13. Workstream W7 — Project memory and context

## Objective

Persist useful project knowledge while preventing stale chat memory from overriding source truth.

## Memory classes

```text
repository-fact
decision
convention
mission-outcome
failed-approach
user-preference
architecture-note
known-risk
```

## Every item needs provenance

```text
source type
source id
created time
last validated time
workspace scope
staleness policy
confidence / authority class
```

## Authority order

When facts conflict:

```text
current repository facts
> explicit current user instruction
> current mission decisions
> project conventions
> historical mission memory
> conversational summaries
```

Do not let a stale memory claim override present code.

## Memory controls

- inspect;
- edit;
- forget;
- pin;
- invalidate;
- show retrieval reason.

## Exit gate W7

- workspace isolation;
- provenance visible;
- stale derived facts invalidate after source change;
- context inspector identifies memory contribution.

---

# 14. Workstream W8 — Skills

## Objective

Make reusable engineering workflows first-class and versioned.

## Skill format

```yaml
name: bug-fix
version: 1
entry: planner
roles:
  - planner
  - implementer
  - tester
  - reviewer
capabilities:
  - code-read
  - code-write
  - tests
  - git-diff
tools:
  - filesystem.read
  - filesystem.write
  - shell.exec
  - git.diff
gates:
  required:
    - tests
    - lint
    - diff-review
policy:
  network: deny
  writeScope: workspace
  isolation: worktree
```

## Launch skills

1. Repository audit.
2. Bug fix + regression test.
3. Test coverage improvement.
4. Dependency upgrade.
5. Security review.
6. Performance investigation.
7. Documentation synchronization.
8. Release preparation.

## Skill security

- manifest schema validation;
- tool declaration required;
- no undeclared privilege escalation;
- source/provenance shown;
- imported skill is not trusted merely because it exists;
- future signing support can be additive.

## Exit gate W8

- skill → mission compilation works;
- same skill is reproducible against fixture workspace;
- undeclared privileged request rejected.

---

# 15. Workstream W9 — Desktop UX

## Objective

Move the user's mental model from chat-first to mission-first without removing chat during migration.

## Primary application frame

```text
┌──────────────────────────────────────────────────────────────────┐
│ Workspace · Branch · Mission · Model policy · Budget · Status    │
├────────────────┬──────────────────────────────┬──────────────────┤
│ PROJECT        │ MISSION                      │ RUNS             │
│ file tree      │ task graph / board           │ agents           │
│ index status   │ acceptance criteria          │ models           │
│ context packs  │ blockers / approvals         │ tools            │
├────────────────┴──────────────────────────────┴──────────────────┤
│ Timeline · Diff · Terminal · Evidence · Context · Diagnostics    │
└──────────────────────────────────────────────────────────────────┘
```

## Required views

### Workspace Home

- open folder;
- recent projects;
- Git status;
- index status;
- health summary.

### Mission Composer

Fields:

- goal;
- constraints;
- acceptance criteria;
- permission profile;
- model policy;
- budget;
- isolation mode.

### Plan Review

- editable tasks;
- dependency graph;
- task risks;
- write scopes;
- estimated models/tools;
- start/pause/cancel.

### Task Board

Columns may map to lifecycle:

```text
Blocked
Ready
Running
Verifying
Verified
Failed
```

### Run Inspector

- role;
- model;
- route reason;
- context size;
- tool calls;
- output;
- retries;
- cost/tokens;
- duration.

### Permission Inbox

Each request says exactly:

- agent/task;
- requested tool;
- target path/host/command;
- risk;
- approve once / approve scope / deny.

### Diff Inspector

- task ownership;
- file changes;
- additions/deletions;
- reviewer findings;
- evidence badges;
- base/head SHA.

### Evidence Inspector

- required gates;
- pass/fail/stale;
- exact command;
- logs/artifacts;
- source hash.

### Context Inspector

- repository files;
- memory items;
- user constraints;
- skill instructions;
- system policy;
- size estimate;
- destination privacy class.

## UX rules

- Never hide important state only in a toast.
- Long-running operations expose cancellation.
- Permission decisions are persistent records.
- Failed states explain recovery options.
- VERIFIED is visually distinct from agent-completed.
- Model routing is inspectable.
- Keyboard-first core workflow.
- Accessibility semantics for task state and approvals.

## Exit gate W9

A user can perform the flagship mission without needing the old chat UI, while the old chat remains available during migration.

---

# 16. Workstream W10 — Git delivery

## Objective

Make final code delivery safe, inspectable and reversible.

## Capabilities

- inspect repository status;
- record base SHA;
- create mission branch/worktree;
- compute diff;
- stage selected files;
- prepare commit;
- prepare PR description artifact;
- optional GitHub integration when configured.

## Non-negotiable rules

- no force push default;
- no automatic merge default;
- no overwrite of dirty user work;
- no branch reset without explicit destructive approval;
- commit action requires exact diff preview;
- PR body includes verification evidence;
- Git action stores resulting SHA as evidence.

## Exit gate W10

- dirty-worktree protection passes;
- worktree cleanup passes;
- reviewable patch can be exported without GitHub credentials;
- commit is user-authorized and exact diff is known.

---

# 17. Workstream W11 — Observability, cost and diagnostics

## Objective

Make a multi-agent runtime debuggable rather than mysterious.

## Event taxonomy

```text
workspace.opened
workspace.index.started
workspace.index.completed
mission.created
mission.status.changed
plan.generated
plan.edited
task.ready
task.started
task.blocked
task.completed
run.created
run.started
run.context.built
run.model.selected
run.model.failed
tool.requested
tool.approved
tool.denied
tool.started
tool.completed
tool.failed
verification.started
verification.gate.started
verification.gate.completed
verification.completed
evidence.created
run.cancelled
run.failed
mission.completed
```

## Metrics

Per AgentRun:

- elapsed time;
- model/provider;
- input/output tokens when available;
- estimated cost;
- tool count;
- retry count;
- context size;
- gate duration;
- local/cloud classification.

Per Mission:

- total duration;
- total cost;
- tasks completed/failed;
- approval count;
- denied actions;
- retry count;
- verification summary.

## Diagnostic bundle

Export:

- version;
- OS/runtime versions;
- mission state;
- sanitized run journal;
- errors;
- provider status without secrets;
- relevant configuration flags;
- hashes/IDs.

Never export API keys, raw secret environment variables or full private files automatically.

## Exit gate W11

A failed run can be reconstructed enough to diagnose its failure without relying on ad-hoc console history.

---

# 18. Workstream W12 — Security and reliability

## Objective

Treat autonomy as a security-sensitive privilege system.

## Threat areas

1. Repository prompt injection.
2. Malicious comments/docs instructing agent to exfiltrate secrets.
3. Path traversal.
4. Symlink escape.
5. Shell injection.
6. Dangerous command generation.
7. Secret leakage to cloud providers.
8. MCP server trust.
9. Browser/network exfiltration.
10. Malicious imported Skills/plugins.
11. Renderer-main privilege escalation.
12. Log leakage.
13. Race conditions between parallel agents.
14. Stale verification evidence.
15. Dirty-worktree loss.
16. Crash during write operation.

## Mandatory controls

- default-deny new privileged tools;
- policy engine outside model authority;
- IPC schema validation;
- renderer remains sandboxed/unprivileged;
- secrets redacted before persistence;
- network policy explicit;
- context privacy destination visible;
- prompt-injection content labels;
- file root confinement;
- write-scope locking;
- transactional/recoverable mission state;
- exact-head evidence binding.

## Security test suite

Add deterministic tests for:

- `../` traversal;
- symlink outside workspace;
- denied shell command;
- cancellation;
- secret redaction;
- local-only cloud fallback rejection;
- malicious repository instruction;
- untrusted Skill requesting undeclared tool;
- renderer forged IPC payload;
- stale evidence after file modification;
- concurrent conflicting write requests.

## Reliability tests

- app restart during PLANNING;
- app restart during RUNNING;
- process crash during tool call;
- provider timeout;
- tool timeout;
- index cancellation;
- worktree cleanup after failed mission;
- corrupted persistence record;
- journal replay after partial write.

## Exit gate W12

Security regression suite and recovery suite are release gates, not optional hardening after launch.

---

# 19. Workstream W13 — Release, documentation and public presentation

## Objective

Ship a product that is understandable and demonstrable.

## Release artifacts

- real v4 screenshots;
- README update;
- 60–120 second flagship demo;
- architecture document;
- security/threat model;
- migration guide;
- Skill authoring guide;
- model routing guide;
- tool permission guide;
- diagnostics guide;
- known limitations;
- changelog;
- signed/tagged release where supported;
- packaged binaries through existing release workflow.

## Demo rule

Do not fake success by editing out denied actions, retries or failed verification. The visible trust loop is part of the product.

## Golden demo mission

```text
Open fixture/public repository
→ index
→ create "Find and fix one real bug; add a regression test"
→ review generated plan
→ execute in worktree
→ approve necessary command
→ run tests
→ review diff
→ reviewer findings
→ evidence bundle
→ approve final Git action
```

---

# 20. Dependency graph

The major dependency path is:

```text
W0 Baseline
   ↓
W1 Domain + Persistence
   ├───────────────┐
   ↓               ↓
W2 Workspace      W11 Event/Observability foundation
   ↓               ↓
W3 Model Router   W5 Permission primitives
   └──────┬────────┘
          ↓
W4 Agent Runtime + Scheduler
          ↓
W5 Full Tool Runtime + Isolation
          ↓
W6 Verification + Evidence
     ┌────┼─────────┐
     ↓    ↓         ↓
W7 Memory W8 Skills W10 Git Delivery
     └────┬─────────┘
          ↓
W9 Mission-first UX
          ↓
W12 Security/Reliability hardening
          ↓
W13 RC / Demo / Release
```

Some foundational slices of W5/W11 start earlier because runtime needs policy and events, but full workstreams depend on W1.

---

# 21. Delivery waves

## Wave 0 — Stabilize the runway

### Purpose

Freeze and measure v3.26 before touching the architecture.

### Scope

- baseline document;
- smoke suite;
- open-handle fix;
- feature flag;
- integration protocol;
- branch/task conventions.

### Promotion gate

No unexplained test leak, exact-head CI green.

---

## Wave 1 — Build the v4 spine

### Scope

- shared contracts;
- IDs;
- persistence;
- migrations;
- Mission/Task state machines;
- run event envelope;
- basic v4 IPC namespace.

### Visible result

A mission can be created, persisted, closed, app restarted and mission restored.

### Promotion gate

Restart/recovery integration test green.

---

## Wave 2 — Make Krevyx understand a repository

### Scope

- Workspace service;
- safe inventory;
- Git metadata;
- ignores;
- hashing;
- incremental index;
- context packs;
- minimal workspace UI.

### Visible result

User opens a repository and sees factual project summary, branch/dirty state and index health.

### Promotion gate

Secret exclusion + incremental scan tests green.

---

## Wave 3 — Controlled execution

### Scope

- provider adapters;
- capability registry;
- model router;
- AgentRun controller;
- dependency scheduler;
- cancellation;
- permission engine;
- filesystem/shell/git read adapters.

### Visible result

A read-only or low-risk Mission can plan and execute multiple tasks with route/tool visibility.

### Promotion gate

No privacy fallback, cancellation and permission-denial tests pass.

---

## Wave 4 — Safe mutation and evidence

### Scope

- scoped writes;
- worktree isolation;
- test/lint/build gates;
- evidence store;
- diff reviewer;
- VERIFIED policy;
- stale-evidence invalidation.

### Visible result

Krevyx can implement a fixture bug fix in an isolated worktree and prove test/lint/review evidence.

### Promotion gate

Intentionally broken patch cannot become VERIFIED.

---

## Wave 5 — Mission-first desktop experience

### Scope

- app shell;
- Mission Composer;
- task board;
- run list;
- permission inbox;
- timeline;
- diff inspector;
- evidence inspector;
- context inspector.

### Visible result

Flagship workflow works without depending on legacy chat as the main navigation surface.

### Promotion gate

Golden UI mission completes from workspace open to reviewable diff.

---

## Wave 6 — Skills, memory and Git delivery

### Scope

- project memory;
- decisions/conventions;
- Skill manifests;
- built-in skills;
- staged Git delivery;
- PR artifact generation;
- observability/cost dashboard.

### Visible result

User can run repeatable engineering Skills that produce evidence-backed Missions.

### Promotion gate

Bug-fix Skill and repository-audit Skill pass golden fixtures.

---

## Wave 7 — Hardening and compatibility migration

### Scope

- security suite;
- reliability/recovery;
- performance pass;
- v3 adapter parity;
- legacy feature freeze enforcement;
- selective retirement of duplicated paths.

### Promotion gate

No v3 capability is removed without parity evidence or explicit deprecation release note.

---

## Wave 8 — Release candidate and launch

### Scope

- docs;
- real screenshots;
- demo;
- packaging;
- release notes;
- threat model;
- migration guide;
- RC soak testing.

### Promotion gate

All v4 Definition of Done requirements satisfied on exact release SHA.

---

# 22. PR train

Each row represents a reviewable integration unit. Do not combine unrelated rows just to reduce PR count.

| PR | Name | Core files | Depends on | Required evidence |
| --- | --- | --- | --- | --- |
| V4-001 | Baseline report | docs/v4 | — | measured baseline |
| V4-002 | Smoke tests | tests | V4-001 | CI pass |
| V4-003 | Async teardown fix | touched runtime/tests | V4-002 | no open handle |
| V4-004 | v4 feature flag | config/tests | V4-002 | default-off compatibility |
| V4-005 | Shared v4 contracts | src/shared/v4 | V4-004 | schema tests |
| V4-006 | IDs + errors | src/shared/v4 | V4-005 | deterministic tests |
| V4-007 | Persistence base | src/main/v4/persistence | V4-005 | CRUD tests |
| V4-008 | Schema migrations | persistence/tests | V4-007 | migration fixtures |
| V4-009 | Mission state machine | missions/tests | V4-007 | transition matrix |
| V4-010 | Task graph/state | missions/tests | V4-009 | cycle + transition tests |
| V4-011 | Event envelope/journal | observability | V4-007 | replay test |
| V4-012 | v4 IPC base | ipc/shared | V4-009 | contract tests |
| V4-013 | Workspace service | workspace | V4-005 | open/close tests |
| V4-014 | Repo inventory | workspace | V4-013 | fixture scan |
| V4-015 | Ignore/sensitive rules | workspace/security | V4-014 | secret exclusion |
| V4-016 | Git metadata | workspace/git | V4-014 | dirty state fixture |
| V4-017 | Content hashing | indexing | V4-014 | incremental test |
| V4-018 | Context packs | indexing | V4-017 | provenance test |
| V4-019 | Ollama adapter | models | V4-005 | mocked adapter tests |
| V4-020 | Cloud adapter interface | models | V4-019 | normalized errors |
| V4-021 | Capability registry | models | V4-019 | capability tests |
| V4-022 | Model router | models | V4-021 | privacy/fallback tests |
| V4-023 | Agent profile contract | runtime | V4-005 | schema tests |
| V4-024 | AgentRun controller | runtime | V4-011,V4-022 | lifecycle test |
| V4-025 | Cancellation | runtime/tools | V4-024 | child kill test |
| V4-026 | Scheduler | missions/runtime | V4-010,V4-024 | dependency test |
| V4-027 | Write-scope locks | scheduler/security | V4-026 | conflict test |
| V4-028 | Tool descriptors | tools | V4-005 | schema tests |
| V4-029 | Permission engine | tools/security | V4-028 | policy matrix |
| V4-030 | Filesystem adapter | tools | V4-029 | path escape tests |
| V4-031 | Shell adapter | tools | V4-029,V4-025 | timeout/cancel tests |
| V4-032 | Git read adapter | tools | V4-029 | repository fixture |
| V4-033 | Worktree isolation | tools/git | V4-032 | cleanup/recovery |
| V4-034 | Artifact store | verification | V4-007 | persistence test |
| V4-035 | Evidence store | verification | V4-034 | provenance test |
| V4-036 | Gate interface | verification | V4-035 | gate contract test |
| V4-037 | Test gate | verification | V4-036 | pass/fail fixture |
| V4-038 | Lint/build gates | verification | V4-036 | command evidence |
| V4-039 | Diff review | verification | V4-035 | findings fixture |
| V4-040 | VERIFIED policy | verification | V4-037,V4-039 | broken patch blocked |
| V4-041 | Stale evidence invalidation | verification | V4-040 | hash-change test |
| V4-042 | Workspace UI shell | renderer/v4 | V4-013 | feature-flag mount |
| V4-043 | Mission composer | renderer/v4 | V4-012 | create flow |
| V4-044 | Task board | renderer/v4 | V4-026 | live state flow |
| V4-045 | Run inspector | renderer/v4 | V4-024 | event rendering |
| V4-046 | Permission inbox | renderer/v4 | V4-029 | approve/deny flow |
| V4-047 | Diff inspector | renderer/v4 | V4-039 | file navigation |
| V4-048 | Evidence inspector | renderer/v4 | V4-040 | claim→evidence flow |
| V4-049 | Context inspector | renderer/v4 | V4-018 | provenance visibility |
| V4-050 | Project memory | memory | V4-018 | scope/provenance |
| V4-051 | Decision/convention memory | memory | V4-050 | invalidation tests |
| V4-052 | Skill schema | skills | V4-029,V4-040 | validation tests |
| V4-053 | Skill compiler | skills/missions | V4-052 | skill→mission test |
| V4-054 | Bug-fix Skill | skills | V4-053 | golden fixture |
| V4-055 | Audit Skill | skills | V4-053 | golden fixture |
| V4-056 | Git delivery | git/runtime | V4-033,V4-048 | dirty protection |
| V4-057 | PR artifact generator | git/artifacts | V4-056 | evidence in body |
| V4-058 | Cost attribution | observability | V4-022,V4-024 | per-run metrics |
| V4-059 | Diagnostic bundle | observability | V4-011 | secret-free export |
| V4-060 | Security regression pack | tests/security | accumulated | threat tests |
| V4-061 | Recovery pack | tests/integration | accumulated | restart/crash tests |
| V4-062 | Performance pass | runtime/index/ui | accumulated | baseline comparison |
| V4-063 | v3 compatibility matrix | docs/tests | accumulated | parity evidence |
| V4-064 | Legacy freeze/cleanup | legacy modules | V4-063 | no regression |
| V4-065 | Real v4 screenshots/docs | docs/assets | RC | real product proof |
| V4-066 | Golden demo | demo/docs | RC | repeatable mission |
| V4-067 | RC packaging | workflows/release | RC | package smoke |
| V4-068 | v4.0 release | tag/release | all | exact SHA gates |

This is the canonical ordering, but independent PRs inside the same dependency level can run in parallel.

---

# 23. Parallel agent lanes

When multiple engineering agents work simultaneously, assign them by lane rather than randomly.

## Lane A — Foundation

Owns:

```text
src/shared/v4/**
src/main/v4/persistence/**
src/main/v4/missions/state-machine*
```

Avoid touching renderer or provider code.

## Lane B — Workspace intelligence

Owns:

```text
src/main/v4/workspace/**
src/main/v4/indexing/**
workspace fixtures
```

## Lane C — Models

Owns:

```text
src/main/v4/models/**
provider adapter tests
```

## Lane D — Runtime / scheduler

Owns:

```text
src/main/v4/runtime/**
src/main/v4/missions/scheduler*
task graph runtime integration
```

## Lane E — Tools / security

Owns:

```text
src/main/v4/tools/**
tool security fixtures
worktree isolation
```

## Lane F — Verification

Owns:

```text
src/main/v4/verification/**
verification fixtures
```

## Lane G — Memory / Skills

Owns:

```text
src/main/v4/memory/**
src/main/v4/skills/**
```

Starts later than core runtime.

## Lane H — Renderer

Owns:

```text
src/renderer/v4/**
```

Must consume stable DTOs rather than reaching into main-process implementation details.

## Lane I — Quality / adversarial testing

Owns primarily:

```text
tests/security/**
tests/integration/**
tests/fixtures/**
```

Should review rather than co-own runtime hotspots.

## Lane J — Integration coordinator

Owns no feature implementation by default.

Responsibilities:

- monitor PR heads;
- ensure required dependency PRs are integrated;
- run exact-head gates;
- detect semantic overlap;
- coordinate conflicts;
- verify resulting main/integration SHA;
- maintain completion ledger.

---

# 24. Semantic hotspots

These files/areas are high conflict risk and should not be casually edited by parallel agents.

## Existing hotspots

```text
src/main.js
src/preload.js
src/main/ipc-v3-handlers.js
src/main/ipc-v325-handlers.js
src/main/ipc-v326-handlers.js
src/renderer/app.js
src/renderer/v3-ui.js
src/renderer/index.html
src/renderer/styles.css
package.json
pnpm-lock.yaml
```

## Rules

- Freeze feature growth in legacy hotspots when a v4 equivalent exists.
- IPC registration changes should be concentrated through a v4 adapter/bootstrap point instead of every feature editing `src/main.js`.
- Renderer v4 should mount through one controlled integration point.
- Dependency changes should be batched intentionally, not scattered across unrelated tasks.
- Lockfile ownership belongs to the PR adding/removing the dependency.

---

# 25. Branch and merge protocol

## Branch naming

```text
feat/v4-<area>-<task>
fix/v4-<area>-<task>
test/v4-<area>-<task>
docs/v4-<area>-<task>
```

Examples:

```text
feat/v4-mission-state-machine
feat/v4-repo-inventory
fix/v4-shell-cancellation
test/v4-permission-traversal
```

## A task is not complete when code exists

Completion requires:

1. code implementation;
2. focused tests;
3. full relevant tests;
4. lint;
5. self-review of complete diff;
6. exact-head CI green;
7. acceptance criteria mapped to evidence;
8. conflict check against current integration/main;
9. merge/integration;
10. verify resulting SHA.

## Merge ordering

If PR B depends on PR A:

- A merges first;
- B rebases/updates from resulting integration state;
- B reruns exact-head gates;
- do not use stale green checks from pre-update head.

## Conflict policy

The agent owning a semantic hotspot resolves semantic conflicts. The integration coordinator should not guess intended behavior when two independent feature agents changed the same logic.

---

# 26. Issue template for every engineering task

Every v4 issue should contain:

```text
Title
Program ID
Workstream
Goal
Why this exists
Allowed files / directories
Forbidden semantic hotspots
Dependencies
Current behavior
Required behavior
Data / IPC contracts
Failure behavior
Security considerations
Migration considerations
Tests required
Acceptance criteria
Evidence required
Integration target
Definition of complete
```

## Acceptance criteria must be binary where possible

Bad:

> Improve the scheduler.

Good:

> Given tasks A→B and A→C, B and C remain BLOCKED until A is VERIFIED; after A becomes VERIFIED, B and C become READY; unit test demonstrates this transition.

---

# 27. Verification matrix by change type

| Change type | Unit | Integration | Security | Smoke | Exact-head CI | Manual review |
| --- | --- | --- | --- | --- | --- | --- |
| Shared schema | required | migration if persisted | as relevant | no | required | yes |
| Persistence | required | required | corruption/path as relevant | yes | required | yes |
| Scheduler | required | required | concurrency | yes | required | yes |
| Tool adapter | required | required | required | yes | required | yes |
| Permission policy | required | required | required | yes | required | yes |
| Renderer view | focused | IPC flow | XSS/privilege as relevant | required | required | visual |
| Verification gate | required | required | command policy | yes | required | yes |
| Model adapter | required | mocked integration | privacy | yes | required | yes |
| Git delivery | required | required | destructive-op | required | required | yes |
| Docs only | link/check | no | no | no | required | yes |

---

# 28. Test architecture

## Unit

Keep deterministic and fast.

Targets:

- schemas;
- IDs;
- transition matrices;
- routing;
- permission decisions;
- path resolution;
- write conflict detection;
- evidence invalidation;
- Skill validation.

## Integration

Use fixture repositories.

Core scenarios:

1. create → persist → restart → restore;
2. plan → dependency scheduling;
3. local route;
4. provider failure/fallback policy;
5. permission denial;
6. shell cancellation;
7. worktree mutation;
8. failing test blocks VERIFIED;
9. changed file invalidates evidence;
10. Git dirty-state protection;
11. Skill → Mission → evidence.

## Security

Adversarial fixtures contain:

- prompt injection in README;
- malicious filename/path;
- symlink escape;
- secret text;
- hostile Skill manifest;
- dangerous shell request;
- forged IPC payload.

## Electron smoke

Keep small but meaningful:

- boot;
- open fixture workspace;
- mount v4 flag UI;
- create mission;
- display task status;
- permission interaction;
- evidence rendering.

## Golden mission

One deterministic end-to-end fixture should be run repeatedly throughout the program.

---

# 29. CI evolution

Current CI already installs, lints and tests. Expand only when the corresponding suite exists.

## Stage 1

```text
install
lint
test:ci
```

## Stage 2

```text
install
lint
test:unit
test:integration
audit:verify
```

## Stage 3

```text
install
lint
test:unit
test:integration
test:security
test:smoke
audit:verify
```

## Release stage

```text
all above
package smoke
artifact checks
release metadata checks
```

Do not invent a suite name in CI before the script actually exists.

---

# 30. Migration from v3

## Existing capability preservation matrix

Track each capability as:

```text
LEGACY_ONLY
ADAPTER_ACTIVE
V4_PARITY
V4_DEFAULT
LEGACY_DEPRECATED
LEGACY_REMOVED
```

## Categories to track

- chat;
- Ollama provider;
- cloud providers;
- agent profiles;
- orchestration;
- MCP;
- workflows;
- plugins;
- templates;
- audit;
- cost;
- browser tools;
- CLI;
- configuration;
- sessions/memory;
- release packaging.

## Removal rule

A v3 path cannot be deleted because the v4 code "looks complete".

Removal requires:

1. parity matrix marks V4_PARITY;
2. migration test exists;
3. data/config migration exists if needed;
4. release notes state change;
5. v4 path has been exercised in RC.

---

# 31. Data migration strategy

## Rule 1 — additive first

Prefer adding v4 storage rather than rewriting existing data immediately.

## Rule 2 — version everything persisted

Persisted object includes schema version or belongs to a versioned store.

## Rule 3 — migration is testable

Fixtures represent at least:

- clean previous version;
- partial/corrupt record;
- missing optional field;
- unknown future/unsupported version behavior.

## Rule 4 — preserve original before destructive migration

Create recoverable backup or use transactional migration where feasible.

## Rule 5 — no hidden irreversible migration

If migration is irreversible, the application must make that explicit in release/migration documentation.

---

# 32. Permissions matrix

| Capability | Observe | Edit | Developer | Trusted automation |
| --- | ---: | ---: | ---: | ---: |
| Read workspace files | yes | yes | yes | yes |
| Read Git status/diff | yes | yes | yes | yes |
| Write scoped files | no | yes | yes | configurable |
| Delete files | no | prompt | prompt | policy |
| Run safe test commands | no | prompt | yes/policy | yes/policy |
| Arbitrary shell | no | no/prompt | prompt/policy | policy |
| Network | deny/prompt | deny/prompt | prompt/policy | policy |
| Create worktree | no | prompt | yes/policy | yes/policy |
| Git commit | no | no | explicit approval | policy + evidence |
| Git push | no | no | explicit approval | explicit high-risk policy |
| Force push | no | no | no default | explicit exceptional approval only |
| Merge PR | no | no | explicit approval | explicit policy only |

This matrix is a product policy starting point, not a substitute for implementation-level command risk classification.

---

# 33. Model routing matrix

## Low-risk tasks

Examples:

- summarize repository;
- classify files;
- draft docs.

Can prioritize local/fast/low-cost models.

## Medium-risk tasks

Examples:

- write code;
- modify tests;
- dependency changes.

Require capable coding model and verification.

## High-risk tasks

Examples:

- auth/security;
- migrations;
- release tooling;
- destructive Git;
- infrastructure.

Routing policy may require stronger reasoning model, stricter context, reviewer and additional gates.

## Routing does not replace verification

A stronger model does not lower evidence requirements.

---

# 34. Product UX states

Every mission/task should have explicit empty, working, blocked and failure states.

## Workspace states

```text
NOT_OPEN
OPENING
INDEXING
READY
INDEX_STALE
INDEX_FAILED
```

## Mission states

```text
DRAFT
PLANNING
READY
RUNNING
PAUSED
BLOCKED
VERIFYING
COMPLETE
FAILED
CANCELLED
```

## Run states

```text
QUEUED
BUILDING_CONTEXT
WAITING_MODEL
RUNNING_MODEL
WAITING_PERMISSION
RUNNING_TOOL
CHECKPOINTING
COMPLETE
FAILED
CANCELLED
```

Users should never need to infer whether the app is frozen.

---

# 35. Failure and recovery design

Failures are first-class states.

## Provider failure

UI shows:

- provider/model;
- normalized failure reason;
- whether fallback is permitted;
- exact fallback candidate;
- retry option.

## Tool failure

Record:

- tool;
- command/scope summary;
- exit state;
- bounded output;
- whether retry is safe.

## Verification failure

Do not label mission "failed" automatically if implementation exists but evidence failed.

Show:

```text
Implementation produced
Verification failed
Blocking gates: tests, lint
```

Allow a repair task.

## Crash/restart

At startup:

- detect interrupted missions;
- classify last durable state;
- do not assume in-flight process still exists;
- mark interrupted run appropriately;
- offer resume/recover/inspect.

---

# 36. Performance program

## Measurements to record

- startup to usable shell;
- workspace open to inventory;
- initial index time;
- incremental index time;
- renderer idle memory;
- indexing peak memory;
- event rate under multi-agent run;
- large diff rendering;
- log rendering;
- cancellation latency.

## Engineering controls

- worker thread/process for expensive scans if needed;
- event batching/backpressure;
- virtualized or bounded long lists if needed;
- never render megabytes of raw tool output at once;
- persist large artifacts outside hot UI state;
- context size caps;
- file size caps.

---

# 37. Security release checklist

Before RC:

- [ ] Renderer Node integration remains off / no new direct privileged bridge.
- [ ] IPC actions validate payload schema.
- [ ] Workspace confinement tests green.
- [ ] Symlink escape tests green.
- [ ] Shell timeout/cancel tests green.
- [ ] Secret redaction tests green.
- [ ] Local-only routing tests green.
- [ ] Prompt injection fixture does not alter permission policy.
- [ ] Imported Skill cannot obtain undeclared privilege.
- [ ] Network destination policy is visible.
- [ ] Git destructive actions require explicit policy.
- [ ] Diagnostic bundle contains no secrets.
- [ ] Stale verification evidence invalidates on change.
- [ ] Dirty user changes are protected.
- [ ] Threat model published.

---

# 38. Release ladder

## v4-dev

Feature-flagged internal development.

Requirements:

- no promise of compatibility;
- v3 remains default.

## v4-alpha

Core Mission loop works on fixtures.

Requirements:

- persistence;
- workspace inventory;
- model route;
- runtime;
- permission engine;
- basic verification.

## v4-beta

Real repositories supported with task-first UI.

Requirements:

- worktree writes;
- evidence inspector;
- context inspector;
- Git diff delivery;
- recovery suite.

## v4-rc

Feature complete, only release blockers accepted.

Requirements:

- security suite;
- performance pass;
- compatibility matrix;
- docs;
- real screenshots;
- package smoke.

## v4.0

Exact release SHA satisfies Definition of Done.

---

# 39. Launch Definition of Done

## Core workflow

- [ ] Open repository as Workspace.
- [ ] Detect Git branch/dirty state.
- [ ] Build safe inventory/index.
- [ ] Create durable Mission.
- [ ] Generate editable task graph.
- [ ] Route models using declared policy.
- [ ] Execute dependency-aware tasks.
- [ ] Request and enforce permissions.
- [ ] Cancel active run/tool safely.
- [ ] Isolate mutation-heavy mission in worktree.
- [ ] Produce diff/artifacts.
- [ ] Run required verification gates.
- [ ] Generate typed evidence.
- [ ] Block VERIFIED on required failure.
- [ ] Inspect context/tool/model history.
- [ ] Inspect diff/evidence.
- [ ] Prepare safe Git delivery.
- [ ] Recover mission after restart.

## Security

- [ ] No known workspace escape.
- [ ] No silent local→cloud fallback.
- [ ] No secrets in journal/diagnostics tests.
- [ ] Prompt injection cannot grant tools.
- [ ] Renderer cannot invoke undeclared privileged action.
- [ ] Dirty user work protected.

## Quality

- [ ] Exact release-head CI green.
- [ ] No unexplained Jest open-handle warning.
- [ ] Security suite green.
- [ ] Recovery suite green.
- [ ] Golden mission repeatedly green.
- [ ] Package smoke green.

## Migration

- [ ] v3 compatibility matrix complete.
- [ ] Removed paths have tested parity.
- [ ] Existing config/session migration documented.
- [ ] CLI has v4 runtime path or explicit compatibility behavior.

## Presentation

- [ ] README contains real v4 screenshot.
- [ ] Demo is recorded from actual product.
- [ ] Architecture documented.
- [ ] Threat model documented.
- [ ] Skills documented.
- [ ] Known limitations published.

---

# 40. First 30 implementation actions

These are the recommended first actions after this plan is accepted.

1. Create v4 baseline issue.
2. Record current CI/test/lint/runtime metrics.
3. Reproduce Jest worker teardown warning.
4. Fix or isolate the open handle.
5. Add v4 feature flag.
6. Add shared v4 enums.
7. Add stable error codes.
8. Add schema validator helpers.
9. Add ID generation utilities.
10. Add persistence interface.
11. Add first store migration.
12. Add Mission repository.
13. Add Task repository.
14. Add Mission transition table.
15. Add Task transition table.
16. Add illegal-transition tests.
17. Add run event envelope.
18. Add append-only run journal.
19. Add restart/replay fixture.
20. Add Workspace service.
21. Add repository inventory scanner.
22. Add ignore/sensitive rules.
23. Add Git metadata reader.
24. Add content hashing.
25. Add incremental scan test.
26. Add context pack DTO.
27. Add v4 IPC bootstrap.
28. Add minimal feature-flagged Workspace view.
29. Demonstrate create Mission → restart → restore in UI/integration test.
30. Freeze new feature growth in equivalent legacy files after v4 spine is stable.

The first visible milestone is not "multi-agent swarm". It is **durable mission state + real repository understanding**.

---

# 41. Ten-agent first-wave allocation

If ten agents are available after W0 is complete, use the following assignments. Do not start all before dependencies exist.

## Agent 1 — Baseline/quality

- async leak investigation;
- smoke suite;
- baseline metrics.

## Agent 2 — Shared contracts

- enums;
- errors;
- schemas;
- IDs.

## Agent 3 — Persistence

Starts after shared contract skeleton.

- store;
- repository abstraction;
- migration fixtures.

## Agent 4 — State machines

Starts after shared status enums.

- Mission transitions;
- Task transitions;
- transition tests.

## Agent 5 — Event journal

Starts after IDs/persistence interface.

- event envelope;
- run journal;
- replay tests.

## Agent 6 — Workspace inventory

Starts after Workspace contract.

- safe file inventory;
- package/test/workflow discovery.

## Agent 7 — Ignore/security scanner

Works beside Agent 6 but owns separate files.

- ignore policy;
- sensitive path rules;
- path fixtures.

## Agent 8 — Git metadata

- branch/head/dirty state;
- fixture repositories;
- no mutation.

## Agent 9 — v4 IPC bootstrap

Starts after domain service interfaces stabilize.

- serializers;
- validated read/create handlers.

## Agent 10 — Integration coordinator

No feature hotspot.

- dependency tracking;
- exact-head checks;
- merge order;
- resulting SHA verification;
- blockers ledger.

Do not give renderer UX to a separate agent until the Workspace/Mission DTOs have stabilized enough to prevent churn.

---

# 42. What not to do

Do not:

- rewrite the entire renderer first;
- add twenty new personas before runtime contracts exist;
- make a new orchestration syntax inside prompts instead of a scheduler;
- call agent text "verified";
- create a cloud dependency for local workflows;
- auto-run destructive shell commands to look autonomous;
- index all files blindly;
- put new v4 feature logic into `app.js`/`v3-ui.js` because it is convenient;
- extend versioned IPC by adding another giant handler file for every release;
- merge branches merely because they compile;
- accept stale CI after head changes;
- hide errors in the demo;
- delete v3 paths before parity evidence exists;
- confuse UI polish with runtime completion.

---

# 43. Product decisions that should remain explicit

These are deliberate choices unless changed through a documented architecture decision.

1. Electron remains the desktop shell for v4.0.
2. Ollama remains first-class.
3. Cloud models remain optional.
4. Missions/tasks are primary durable work units.
5. Chat remains a supporting interaction surface.
6. Permissions are enforced independently of models.
7. Worktree isolation is preferred for risky code mutation.
8. Verification evidence is required for trusted completion.
9. Skills compile into Missions instead of bypassing runtime.
10. Existing functionality is migrated incrementally.

---

# 44. Program completion test

At the end of the program, run a fresh-machine demonstration on a repository not previously used in development.

The test passes only if the user can:

1. install/run Krevyx;
2. open the repository;
3. understand what will be indexed;
4. create a mission;
5. inspect/edit the plan;
6. see why each model was selected;
7. see/approve risky tool requests;
8. watch task progress;
9. cancel and resume where supported;
10. receive a real code change;
11. see tests/lint/review evidence;
12. distinguish failed/unverified/verified results;
13. inspect the exact final diff;
14. approve Git delivery;
15. close and reopen the application and still inspect mission history.

If this works reliably, Krevyx is no longer merely OllamaX with more features. It has become the local-first, evidence-backed agent engineering workspace described by the v4 product direction.
