# Krevyx v4 threat model

Status: implementation-oriented threat model for the feature-gated v4 engineering workspace.

## Trust boundaries

1. **Renderer is untrusted.** It may request approved IPC actions but may not grant itself permissions.
2. **Repository content is untrusted.** Source, docs, comments and generated text may contain prompt injection or malicious paths.
3. **Model output is untrusted.** Planner output is parsed as structured data and revalidated against tool manifests, Skill policy and write scopes.
4. **Tool runtime is privileged.** Filesystem, shell and Git adapters enforce path, permission, timeout and cancellation policy.
5. **Remote services are separate privacy domains.** Local-only policy must never fall back silently to cloud models.

## Threats and implemented controls

| Threat | Control |
| --- | --- |
| Path traversal | Workspace-relative path guard rejects paths escaping the project root. |
| Symlink escape | Existing path components are checked; symlinks resolving outside the root are rejected. |
| Secret file access | `.env`, SSH/AWS/GPG paths and key-like files are protected by default. |
| Shell injection | v4 shell execution uses executable + argv and `shell:false`; no model-authored shell string is accepted. |
| Runaway child process | Timeout/cancellation propagates to process groups and test coverage checks cleanup. |
| Renderer privilege escalation | High-risk approval is brokered in the main process; renderer-supplied approval data is ignored at the application boundary. |
| Planner privilege escalation | Planner steps are rebuilt from known fields; undeclared tools and write-scope violations are rejected before execution. |
| Local-to-cloud privacy downgrade | `local-only` routing filters cloud candidates and fallback candidates before selection. |
| Dirty workspace destruction | Mission mutation occurs in managed worktrees rather than the source workspace. |
| Worktree cleanup data loss | Removal is rejected when either uncommitted or committed mission changes exist relative to the recorded base SHA. |
| Stale overwrite | Filesystem writes can require an expected content hash and fail on mismatch. |
| Unbounded tool output | Shell/Git output is capped and marked truncated. |
| Stale verification | Task completion requires current verification/evidence flow; implementation success alone moves a task to VERIFYING. |
| Diagnostic secret leakage | Diagnostic payload recursively redacts secret-like keys, bearer tokens and local path fields. |
| Malicious Skill code | Skills are declarative/versioned data; arbitrary JavaScript/eval is not part of the Skill format. |
| Corrupt persisted state | Primary state is quarantined and recovered from backup when possible. |
| Event journal restart | Journal sequence resumes monotonically after restart. |

## Security regression evidence

The consolidated v4 security pack covers:

- path traversal rejection;
- secret-like path rejection;
- planner approval-field stripping;
- local-only routing without cloud fallback.

Additional focused tests cover:

- permission matrix behavior;
- symlink/path escape controls;
- cancellation and process cleanup;
- Skill tool/write-scope enforcement;
- managed worktree dirty and committed-change protection;
- diagnostic redaction;
- persistence corruption recovery.

## Intentionally unavailable operations

The v4 tool runtime does not expose automatic remote Git push, merge or force-push. Delivery produces a review artifact; any future remote action must be separately permissioned and explicitly authorized.

## Remaining release validation

Repository tests cannot replace real packaged-app security validation. Before a v4.0 release candidate is promoted, run at least:

- packaged Electron smoke on supported OS targets;
- permission/approval interaction testing in the real renderer;
- malicious repository fixture testing;
- installer/updater smoke;
- diagnostics inspection for accidental local path or secret leakage;
- soak/restart testing across real app relaunches.
