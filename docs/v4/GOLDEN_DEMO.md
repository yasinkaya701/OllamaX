# Krevyx v4 golden demo

Purpose: repeatable release-candidate scenario for validating the flagship product loop in the real desktop app.

This document is a procedure, not proof that the packaged-app demo has already been executed.

## Fixture repository

Use a small Git repository with a deterministic failing test, a corresponding source bug, local test/lint scripts, no external network dependency and a clean Git working tree.

## Required scenario

1. Launch the packaged Krevyx desktop app.
2. Enable the feature-gated v4 workspace from the classic surface.
3. Open the fixture repository.
4. Confirm repository inventory and branch state are factual.
5. Create the built-in bug-fix Mission with a specific problem statement.
6. Confirm the Mission and task graph persist after closing/reopening the v4 workspace view.
7. Generate the implementation plan with local Ollama.
8. Confirm a mission-scoped detached worktree exists and the source repository remains unchanged.
9. Run ready tasks.
10. If a high-risk action is requested, confirm the Approval Inbox blocks execution until explicit user approval or denial.
11. Run verification gates for VERIFYING tasks.
12. Confirm a required failing gate prevents completion.
13. Correct the fixture/plan if needed and rerun until required gates pass.
14. Open task evidence and confirm AgentRun, ToolCall, verification and evidence records are visible.
15. Prepare delivery data and confirm base SHA, head SHA, changed files, diff hash/stat and review artifact are correct.
16. Confirm no remote Git action occurs automatically.
17. Restart the app and confirm Mission/task/evidence state recovers.
18. Inspect the diagnostic bundle and confirm it contains no credential values or local absolute paths.

## Required capture

For RC evidence capture:

- exact application version and Git SHA;
- OS and architecture;
- real screenshot of workspace/mission/task board;
- real screenshot of Approval Inbox if exercised;
- real screenshot of Evidence/Delivery inspector;
- verification result summary;
- source repository status showing no silent mutation outside the mission worktree;
- packaged build identifier;
- any deviations or failures.

## Pass criteria

The demo passes only when planner, execution and verification operate on the same isolated mission root; user authority is preserved at approval and delivery boundaries; required verification cannot be bypassed; evidence is durable across restart; source workspace remains protected; diagnostics are sanitized; and no failed verification is hidden in the final review artifact.
