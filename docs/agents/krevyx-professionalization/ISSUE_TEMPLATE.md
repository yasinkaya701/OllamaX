# Canonical Agent Task Issue Template

Use this body when creating a missing campaign task issue. Replace placeholders from `INDEX.md` and `TASKS.md`.

```text
TASK_ID: Txxx
CAMPAIGN: krevyx-professionalization
PRIORITY: P0|P1|P2
MERGE_TARGET: codex/campaign/krevyx-professionalization
GATE_CLASS: G0|G1|G2|G3|G4

DEPENDS_ON:
- Txxx

OWNS:
- <paths/invariants>

MAY_TOUCH:
- <paths>

MUST_NOT_TOUCH:
- <paths/domains>

SEMANTIC_HOTSPOTS:
- <invariants>

ACCEPTANCE:
- <criterion>

COMPLETION:
- validated PR merged to MERGE_TARGET
- resulting integration SHA verified
- COMPLETE v1 recorded
```

Issue title format:

`[AGENT TASK Txxx] <exact task title from INDEX.md>`

## Claim comment

```text
CLAIM v1
agent: <stable-agent-id>
task: Txxx
base: <campaign-head-sha>
branch: agent/Txxx-<short-name>
timestamp: <UTC ISO-8601>
```

## Lost claim

```text
CLAIM_LOST v1
agent: <stable-agent-id>
task: Txxx
winner_comment: <canonical earlier claim reference>
```

## Completion comment

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

## Campaign completion

```text
CAMPAIGN_COMPLETE
campaign: krevyx-professionalization
promotion_pr: #<number>
main_before: <sha>
main_after: <sha>
tasks: 23/23 COMPLETE
critical_gates: PASS
promotion: MERGED_AND_VERIFIED
```
