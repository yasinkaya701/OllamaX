# Ownership Protocol

Every campaign task declares `OWNS`, `MAY_TOUCH`, `MUST_NOT_TOUCH`, and `SEMANTIC_HOTSPOTS`.

- `OWNS`: primary files, directories, tests, or invariants for the task.
- `MAY_TOUCH`: supporting paths that may be changed only when no other active task owns them.
- `MUST_NOT_TOUCH`: paths or domains outside the task scope.
- `SEMANTIC_HOTSPOTS`: logical invariants that can overlap even when file paths do not.

Before implementation and before every merge attempt, inspect canonical task issues for active claims and build the current ownership map.

If another active task owns a required file or semantic hotspot, do not edit it. Record the dependency in the canonical task issue and wait for that ownership to clear or be explicitly transferred.

A merge conflict does not grant ownership. Resolve conflicts by preserving all already-validated invariants. If both intended behaviors cannot be preserved, record the conflict with evidence rather than choosing one side silently.

One agent may hold only one unmerged task claim at a time. This is an anti-branch-sprawl rule.

The final integration coordinator must review the invariant ledger from every completed task. Passing tests is insufficient if a previously merged security, privacy, data-integrity, compatibility, or release invariant is lost.
