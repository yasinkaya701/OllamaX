# Test and Validation Gates

The repository currently exposes these baseline commands from `package.json`:

```bash
pnpm run lint
pnpm test
pnpm run test:ci
pnpm run audit:verify
```

Task specifications assign a gate class. A task may add stricter task-specific checks, but it may not weaken the class requirements.

## G0 — Documentation / repository truth

Required:

- validate changed links/paths manually;
- inspect the complete diff;
- confirm no product/runtime behavior changed unintentionally;
- if executable files changed despite G0 scope, escalate to the appropriate higher gate class.

## G1 — Runtime correctness

Required:

- task-specific regression tests;
- `pnpm run lint`;
- `pnpm test`;
- `pnpm run test:ci`;
- `pnpm run audit:verify` when the audit verifier remains runnable in the current environment;
- full diff self-review.

## G2 — Security / trust boundary

Everything in G1 plus adversarial tests relevant to the boundary being changed. Typical cases include path traversal/normalization, symlink escape, forged identifiers/capabilities, secret leakage, untrusted renderer/plugin/MCP input, timeout/cancellation/malformed protocol data, and unauthorized tool/process/network access.

Security behavior must fail closed where the documented policy requires it.

## G3 — Packaging / end-to-end / release infrastructure

Everything in G1 plus the task's integration, packaged-app, workflow, release-manifest, or smoke validation. The task must record what could and could not be executed on the current platform.

A workflow edit is not considered validated merely because YAML parses. Validate source-to-artifact identity and exact-SHA behavior where applicable.

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

## Test integrity

Do not delete, skip, weaken, or narrow a valid test simply to obtain a green build. When a test expectation is obsolete because the specification intentionally changed, explain that change in the PR and replace the assertion with one that validates the new invariant.

## Post-merge verification

After merge, rerun the smallest critical check that directly proves the task's primary invariant on the resulting integration SHA. For final promotion, use the complete G4 post-merge verification required by T023.
