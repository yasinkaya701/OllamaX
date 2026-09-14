# Krevyx Professionalization Campaign

This directory defines the autonomous multi-agent execution protocol for the Krevyx professionalization program.

The design goal is simple: an agent enters the repository, discovers one eligible task, claims it atomically, executes it within a declared ownership boundary, validates the exact head that will be merged, merges the PR itself, verifies the integration SHA, records completion, and only then may take another task or exit successfully.

## Campaign branches

Worker merge target:

`codex/campaign/krevyx-professionalization`

Final promotion target:

`main`

Normal worker agents never merge directly to `main`. They merge their task PRs into the campaign branch. The final integration coordinator owns the campaign-to-main promotion.

## Required reading order

1. repository root `AGENTS.md`
2. this file
3. `INDEX.md`
4. `OWNERSHIP.md`
5. `MERGE_PROTOCOL.md`
6. `TEST_GATES.md`
7. `TASKS.md`
8. the complete task section for the task being claimed

## Agent lifecycle

`ENTER -> SYNC -> DISCOVER -> CLAIM -> IMPLEMENT -> TEST -> SELF_REVIEW -> PR -> EXACT_HEAD_GATES -> MERGE -> VERIFY_MERGE_SHA -> COMPLETE -> NEXT_TASK_OR_EXIT`

No earlier state is completion.

## Task discovery

`INDEX.md` contains the stable task DAG. Operational state lives in GitHub issues whose title starts with `[AGENT TASK Txxx]`.

For each candidate task, an agent must:

1. resolve its dependencies from `INDEX.md`;
2. locate the canonical GitHub issue for each dependency;
3. confirm every dependency contains a valid `COMPLETE v1` record whose integration SHA is reachable from the current campaign branch;
4. locate or create the canonical issue for the candidate task;
5. confirm no valid active claim exists;
6. confirm its file ownership and semantic hotspots do not conflict with another active claim;
7. claim the highest-priority eligible task.

Do not ask the user which eligible task to select.

## Canonical task issue race rule

If no issue exists for a task, an agent may create one using `ISSUE_TEMPLATE.md` and the task specification in `TASKS.md`.

After creation, search again for all open and closed issues matching the exact task ID. The lowest issue number with a structurally valid task body is canonical. Any later duplicate must be marked as duplicate and must not be used for claims.

This prevents two agents that discover a missing task issue simultaneously from creating two independent ownership histories.

## Claim race rule

A valid claim comment is:

```text
CLAIM v1
agent: <stable-agent-id>
task: Txxx
base: <campaign-head-sha>
branch: <task-branch>
timestamp: <UTC ISO-8601>
```

Immediately after posting, re-read the canonical issue. Among valid, unreleased claims, the earliest GitHub-created claim comment wins. A losing agent records `CLAIM_LOST v1`, does not edit the task, and returns to discovery.

## One-task rule

One agent may have only one active unmerged task claim. A second task may be claimed only after the first task reaches `MERGED_AND_VERIFIED` or a genuine `BLOCKED v1` record releases the claim.

## Completion rule

Implementation, commit, push, PR creation, review readiness, and green CI are intermediate states only.

A worker task is complete only when all are true:

- its validated PR is merged into the campaign branch;
- the resulting campaign integration SHA is fetched and verified;
- the intended changes and required invariants are present in that SHA;
- required post-merge checks pass;
- `COMPLETE v1` is recorded on the canonical task issue with task head SHA, PR number, integration SHA, and gate results.

The final campaign is complete only when the campaign promotion PR is merged into `main`, the resulting `main` SHA is verified, and `CAMPAIGN_COMPLETE` is recorded.

## Blocked exit

A normal agent must not use “someone else can merge this” as a blocker. Merge conflicts, target-branch advancement, CI reruns, and ordinary test failures remain the claiming agent's responsibility.

A `BLOCKED v1` exit is allowed only for a genuine external dependency the agent cannot resolve with repository permissions or available tools. The record must contain evidence, attempted remediation, remaining work, branch/head state, and the exact external action required.
