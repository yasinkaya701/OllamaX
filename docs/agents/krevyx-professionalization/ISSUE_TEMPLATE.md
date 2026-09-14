# Canonical Agent Task Issue Template

Create missing campaign task issues from `INDEX.md` and `TASKS.md`.

Required issue fields:

- `TASK_ID`: task ID from the campaign index.
- `CAMPAIGN`: `krevyx-professionalization`.
- `PRIORITY`: priority from the index.
- `MERGE_TARGET`: `campaign-krevyx-professionalization`.
- `GATE_CLASS`: gate class from the index.
- `DEPENDS_ON`: dependencies from the index.
- `OWNS`, `MAY_TOUCH`, `MUST_NOT_TOUCH`, `SEMANTIC_HOTSPOTS`, `ACCEPTANCE`: copy from the task specification.

Title format: `[AGENT TASK Txxx] <task title>`.

A claim record must include the stable agent ID, task ID, campaign-base SHA, task branch, and UTC timestamp. After posting, re-read the issue; the earliest valid unreleased claim owns the task.

A completion record must include the task ID, agent ID, PR number, task-head SHA, resulting integration SHA, required gate results, and `MERGED_AND_VERIFIED`.

A final campaign-completion record must identify the promotion PR, main SHA before promotion, main SHA after promotion, completion of all 23 tasks, final gate result, and `MERGED_AND_VERIFIED`.
