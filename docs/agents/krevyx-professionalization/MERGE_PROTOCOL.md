# Mandatory Merge Protocol

Worker merge target: `campaign-krevyx-professionalization`.
Final promotion target: `main`.

## Focus-first worker flow

1. Fetch the campaign branch and record its exact HEAD SHA.
2. Create a task branch from that exact SHA.
3. Claim one task and stay focused on it. Do not claim or start another task while it is active.
4. Implement the complete task locally, including regression coverage and required cleanup.
5. Run cheap targeted checks while iterating. Do not repeatedly run the full CI-equivalent suite after every small edit.
6. Before the first remote push, run the task's required local gates where the environment permits and self-review the complete diff.
7. Consolidate local history. Prefer one coherent task commit; use no more than two logical commits unless preserved topology is genuinely useful to reviewers.
8. Re-fetch the campaign branch. If it advanced, synchronize now, resolve conflicts semantically, and rerun the affected gates locally.
9. Push only when the branch is a serious merge candidate. Open a focused PR into the campaign branch.
10. Treat remote CI as confirmation of the merge candidate, not as an exploratory debugging loop.
11. If CI or review reveals a real defect, fix all known related defects locally, rerun the relevant gates, then batch the remediation into one push when practical.
12. Confirm the exact PR head SHA is the SHA that passed the required gates.
13. Squash-merge the PR into the campaign branch unless the task explicitly requires preserved commit topology.
14. Fetch the campaign branch after merge and record the resulting integration SHA.
15. Verify the intended changes and task invariants are present in that SHA.
16. Run the smallest required post-merge critical check.
17. Record `COMPLETE v1` on the canonical task issue.

## Remote push budget

The default worker budget is one merge-candidate push plus, if needed, one batched remediation push.

This is a discipline target, not permission to merge broken code. Additional pushes are allowed only when necessary for one of these reasons:

- CI exposed an environment-specific failure that could not reasonably be reproduced locally;
- the merge target advanced and required synchronization/conflict resolution;
- a substantive review finding requires code changes;
- the task genuinely cannot be made mergeable within the normal budget.

When exceeding the normal budget, diagnose first and batch fixes. Do not emit a stream of one-line fix commits. Do not create empty commits or touch unrelated files merely to retrigger CI.

## CI retry rule

Do not rerun an unchanged failed workflow until its failure is understood. A retry without code changes is appropriate only when logs/evidence indicate transient infrastructure, service, runner, or known flaky-test failure. Otherwise fix the cause locally and push one corrected candidate.

## Exact-head rule

A green result is valid only for the exact commit that will be merged. Any rebase, synchronization, conflict resolution, fixup, or additional commit invalidates earlier head validation and requires the relevant affected gates to run again.

The exact-head rule does not mean “run every expensive gate after every keystroke.” Expensive gates belong on the completed candidate head and on later heads only when that head actually changes.

## Merge discipline

- Worker PRs merge into `campaign-krevyx-professionalization`, not directly into `main`.
- The claiming agent owns conflict resolution and merge completion.
- Normal worker PRs use squash merge so local checkpoint history does not pollute the campaign branch.
- A normal task must not be left at “PR ready for someone else”.
- After merge, verify the integration SHA before claiming another task or exiting.

## COMPLETE record

```text
COMPLETE v1
task: Txxx
agent: <stable-agent-id>
pr: #<number>
task_head: <sha>
integration_sha: <sha>
gates:
- <gate>: PASS
result: MERGED_AND_VERIFIED
```

## BLOCKED record

A blocked exit is allowed only for a genuine external action that cannot be resolved with repository permissions or available tools.

```text
BLOCKED v1
task: Txxx
agent: <stable-agent-id>
reason: <external blocker>
evidence: <concrete evidence>
attempted: <remediation performed>
remaining: <remaining work>
branch: <branch>
head_sha: <sha>
required_external_action: <exact action>
claim_released: true
```

Merge conflicts, ordinary failing tests, target-branch advancement, CI reruns, or “too many changes left” are not valid external blockers.

## Final integration flow

T023 is the only campaign promotion task. Its agent must:

1. verify T001-T022 all have valid `COMPLETE v1` records;
2. verify each recorded integration SHA belongs to campaign history;
3. assemble and review the campaign invariant ledger;
4. inspect the complete campaign diff against `main`;
5. run G4 gates on a deliberate promotion candidate rather than repeatedly pushing speculative integration commits;
6. open the campaign-to-main promotion PR;
7. resolve conflicts without losing validated behavior;
8. rerun affected gates on the exact promotion head;
9. merge the promotion PR into `main`;
10. fetch and verify the resulting `main` SHA;
11. record `CAMPAIGN_COMPLETE`.

A campaign with an open promotion PR is not complete.
