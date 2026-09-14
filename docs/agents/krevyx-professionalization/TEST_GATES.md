# Test and Validation Gates

The repository currently exposes these baseline commands from `package.json`:

```bash
pnpm run lint
pnpm test
pnpm run test:ci
pnpm run audit:verify
```

Task specifications assign a gate class. A task may add stricter task-specific checks, but it may not weaken the class requirements.

## CI economy principle

Use the cheapest meaningful validation while developing and reserve expensive full-suite/coverage/packaging workflows for deliberate candidate heads.

CI is confirmation, not the primary debugging environment.

During implementation:

- run the narrowest relevant unit/regression tests first;
- rerun only checks affected by the current change while iterating;
- do not run `test:ci`, packaging, or full release workflows after every small edit;
- do not push merely to discover syntax, lint, unit-test, or obvious integration failures that can be checked locally;
- before the first remote push, complete the task, clean the diff, and run the gate class required for the candidate where the local environment supports it;
- after a failed candidate, diagnose the complete failure set and batch related corrections before pushing again.

A task may never skip a required final gate merely to save CI. The goal is fewer, higher-quality CI runs, not weaker validation.

## G0 — Documentation / repository truth

Required before push:

- validate changed links/paths manually;
- inspect the complete diff;
- confirm no product/runtime behavior changed unintentionally;
- if executable files changed despite G0 scope, escalate to the appropriate higher gate class.

G0 documentation changes should normally require a single remote candidate and no iterative CI churn.

## G1 — Runtime correctness

Development loop:

- run task-specific regression tests or focused Jest selection while editing;
- run lint on the affected implementation before declaring the candidate ready.

Required on the deliberate merge-candidate head:

- task-specific regression tests;
- `pnpm run lint`;
- `pnpm test`;
- `pnpm run test:ci`;
- `pnpm run audit:verify` when the audit verifier remains runnable in the current environment;
- full diff self-review.

Do not repeatedly run the full G1 set after edits that are still exploratory. Run it when the branch is intended to be merged.

## G2 — Security / trust boundary

Everything in G1 plus adversarial tests relevant to the boundary being changed. Typical cases include path traversal/normalization, symlink escape, forged identifiers/capabilities, secret leakage, untrusted renderer/plugin/MCP input, timeout/cancellation/malformed protocol data, and unauthorized tool/process/network access.

Security behavior must fail closed where the documented policy requires it.

During development, focused adversarial tests may run independently; the complete G2 set belongs on the finished candidate head.

## G3 — Packaging / end-to-end / release infrastructure

Everything in G1 plus the task's integration, packaged-app, workflow, release-manifest, or smoke validation. The task must record what could and could not be executed on the current platform.

A workflow edit is not considered validated merely because YAML parses. Validate source-to-artifact identity and exact-SHA behavior where applicable.

Packaging/release jobs are expensive and must not be used as an exploratory edit loop. Before triggering them, complete all locally available static/unit/integration validation and self-review the workflow diff.

## G4 — Final campaign promotion

Required before T023 can merge to `main`:

- all worker tasks T001-T022 are `MERGED_AND_VERIFIED`;
- full lint/test/test:ci/audit gate;
- golden engineering mission passes;
- packaged smoke evidence required by the release-readiness policy passes;
- security regression suites pass;
- complete campaign diff is self-reviewed;
- invariant ledger is checked;
- promotion PR exact head is the validated head;
- no unresolved P0 or campaign-defined release-blocking P1 remains.

T023 should assemble one deliberate promotion candidate, validate it comprehensively, and avoid speculative promotion pushes that repeatedly consume the complete G4 matrix.

## Test integrity

Do not delete, skip, weaken, or narrow a valid test simply to obtain a green build. When a test expectation is obsolete because the specification intentionally changed, explain that change in the PR and replace the assertion with one that validates the new invariant.

## Failure batching

When a candidate fails:

1. read all available failing logs before editing;
2. group failures by root cause;
3. reproduce locally where possible;
4. repair the complete root cause, not only the first surfaced assertion;
5. run focused local verification;
6. rerun the required candidate gate;
7. push one batched correction when practical.

Do not generate a chain of remote commits such as `fix lint`, `fix test`, `fix typo`, `retry CI` when those issues could have been resolved together locally.

## Post-merge verification

After merge, rerun the smallest critical check that directly proves the task's primary invariant on the resulting integration SHA. Do not automatically repeat the entire expensive CI matrix after every worker merge unless the task specification requires it. For final promotion, use the complete G4 post-merge verification required by T023.
