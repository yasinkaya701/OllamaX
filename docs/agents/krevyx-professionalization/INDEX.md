# Campaign Task Index

This file is the stable task catalog and dependency DAG for `krevyx-professionalization`. Do not use this file for live claim status; live state belongs in canonical GitHub task issues.

## Priority order

1. P0 correctness and security blockers
2. P1 trust-boundary and integrity work
3. P2 productization, release, and documentation
4. final integration

Within the same priority, choose the lowest task ID whose dependencies are complete and whose ownership does not conflict with an active claim.

## DAG

| Task | Priority | Depends on | Gate class | Summary |
|---|---|---|---|---|
| T001 | P1 | - | G0 | Repository truth/status baseline |
| T002 | P0 | - | G1 | Agent/tool runtime wiring correctness |
| T003 | P0 | - | G2 | Secrets vault and Manus key correctness |
| T004 | P0 | - | G1 | Persistence size contracts and atomic writes |
| T005 | P0 | T002 | G2 | MCP lifecycle and protocol handshake |
| T006 | P0 | T005 | G2 | MCP environment/root/capability confinement |
| T007 | P0 | - | G2 | V3 filesystem boundary hardening |
| T008 | P1 | T007 | G2 | Preload IPC allowlist and Electron sandbox boundary |
| T009 | P0 | T008 | G2 | V4 workspace grants/capabilities |
| T010 | P1 | T009 | G1 | Mission cancellation and approval correlation |
| T011 | P1 | T009 | G2 | Audit-log integrity and rotation |
| T012 | P1 | - | G2 | Unsafe plugin runtime lockdown |
| T013 | P1 | T012,T009 | G2 | Capability-brokered plugin runtime |
| T014 | P1 | T010,T011,T013 | G1 | V4 canonical execution path |
| T015 | P1 | T014 | G1 | Recover isolation-review feature from legacy PR |
| T016 | P1 | T015 | G3 | Golden engineering mission E2E |
| T017 | P1 | T016 | G3 | Packaged Electron smoke tests |
| T018 | P1 | T017 | G3 | CI, security, SBOM, provenance gates |
| T019 | P1 | T018 | G3 | Release pipeline exact-SHA promotion |
| T020 | P1 | T019 | G3 | Updater/release-manifest contract |
| T021 | P1 | T020 | G3 | Signed/notarized cross-platform distribution |
| T022 | P2 | T021 | G1 | Website, brand, architecture, README truth cleanup |
| T023 | P0 | T001-T022 | G4 | Final campaign integration and promotion to main |

## Readiness algorithm

A task is eligible only when:

- every listed dependency has a canonical issue with `COMPLETE v1`;
- each dependency's recorded integration SHA is reachable from the current campaign branch;
- the task itself has no valid active claim;
- no active task owns an overlapping file or semantic hotspot;
- the task is not T023 unless T001 through T022 are all complete.

## Suggested initial parallel wave

The following can begin independently after the campaign branch exists:

- T001 repository truth baseline
- T002 runtime wiring
- T003 secrets vault
- T004 persistence contracts
- T007 V3 filesystem boundary
- T012 plugin lockdown

Do not manufacture parallelism beyond the DAG. Dependency serialization is intentional where trust boundaries overlap.

## Final promotion

T023 is integration-only. Its agent must not use the integration task to add unrelated product features. It validates the entire campaign diff, executes final gates, creates the campaign-to-main PR, resolves conflicts without losing validated behavior, merges it, verifies the resulting main SHA, and records `CAMPAIGN_COMPLETE`.
