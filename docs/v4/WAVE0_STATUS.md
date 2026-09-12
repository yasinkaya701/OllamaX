# Wave 0 Status Ledger

Tracking issue: #11

## Scope

- V4-001 baseline report
- V4-002 smoke/regression coverage
- V4-003 child-process teardown cleanup
- V4-004 v4 workspace feature flag foundation

## Current implementation

- baseline metrics recorded in `docs/v4/BASELINE.md`;
- lifecycle hook timeout now terminates a POSIX process group instead of only the shell PID;
- timeout timers are unref'd after scheduling;
- config schema adds a v3 → v4 migration;
- v4 workspace flag normalization is default-deny;
- regression coverage checks v2 → v4 migration and descendant process cleanup.

## Promotion evidence

This ledger is updated only from exact-head CI evidence. Wave 0 is not complete until CI passes without the historical Jest worker force-exit warning and without an orphan `sleep` process in runner cleanup.
