# Mandatory Merge Protocol

Worker merge target: `campaign-krevyx-professionalization`.
Final promotion target: `main`.

## Worker flow

1. Fetch the campaign branch and record its exact HEAD SHA.
2. Create a task branch from that exact SHA.
3. Implement only the claimed task.
4. Run required gates and self-review the complete diff.
5. Re-fetch the campaign branch.
6. If the target advanced, synchronize, resolve conflicts semantically, and rerun all required gates.
7. Open a focused PR into the campaign branch.
8. Confirm the exact PR head SHA is the SHA that passed the required gates.
9. Merge the PR. Do not leave a normal task waiting for another person or agent to merge it.
10. Fetch the campaign branch after merge and record the resulting integration SHA.
11. Verify the intended changes and task invariants are present in that SHA.
12. Run required post-merge critical checks.
13. Record `COMPLETE v1` on the canonical task issue.

## Exact-head rule

A green result is valid only for the exact commit that will be merged. Any rebase, synchronization, conflict resolution, fixup, or additional commit invalidates earlier head validation and requires the relevant gates to run again.

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

Merge conflicts, ordinary failing tests, target-branch advancement, and CI reruns are not valid external blockers.

## Final integration flow

T023 is the only campaign promotion task. Its agent must:

1. verify T001-T022 all have valid `COMPLETE v1` records;
2. verify each recorded integration SHA belongs to campaign history;
3. assemble and review the campaign invariant ledger;
4. inspect the complete campaign diff against `main`;
5. run G4 gates;
6. open the campaign-to-main promotion PR;
7. resolve conflicts without losing validated behavior;
8. rerun gates on the exact promotion head;
9. merge the promotion PR into `main`;
10. fetch and verify the resulting `main` SHA;
11. record `CAMPAIGN_COMPLETE`.

A campaign with an open promotion PR is not complete.
