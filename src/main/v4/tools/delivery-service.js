'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { buildPullRequestArtifact } = require('./pr-artifact');

function createDeliveryService(options = {}) {
  const store = options.store;
  const inspectWorktree = options.inspectWorktree;
  if (!store || typeof store.get !== 'function' || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'delivery service requires durable store');
  }
  if (typeof inspectWorktree !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'delivery service requires inspectWorktree');
  }

  async function prepareMission(input = {}) {
    const missionId = String(input.missionId || '').trim();
    if (!missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    const mission = store.get(EntityType.MISSION, missionId);
    if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${missionId}`);
    const workspace = store.get(EntityType.WORKSPACE, mission.workspaceId);
    if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${mission.workspaceId}`);
    const worktree = await inspectWorktree({ missionId });
    if (!worktree || !worktree.exists) {
      throw new V4Error(ErrorCode.NOT_FOUND, `mission worktree does not exist: ${missionId}`);
    }

    const tasks = store.list(EntityType.TASK).filter((task) => task.missionId === mission.id);
    const taskIds = new Set(tasks.map((task) => task.id));
    const runs = store.list(EntityType.AGENT_RUN).filter((run) => taskIds.has(run.taskId));
    const verifications = store.list(EntityType.VERIFICATION_RUN).filter((run) => taskIds.has(run.subjectId));
    const evidence = store.list(EntityType.EVIDENCE).filter((item) => taskIds.has(item.subjectId));
    const summary = {
      taskCount: tasks.length,
      agentRunCount: runs.length,
      verificationRunCount: verifications.length,
      verificationPassed: verifications.filter((run) => run.status === 'PASSED').length,
      verificationFailed: verifications.filter((run) => run.status === 'FAILED').length,
      evidenceCount: evidence.length,
    };
    const delivery = {
      missionId: mission.id,
      workspaceId: workspace.id,
      baseSha: worktree.baseSha || null,
      headSha: worktree.headSha || null,
      hasChanges: worktree.hasChanges === true,
      dirty: worktree.dirty === true,
      changedFiles: worktree.changedFiles || [],
      diffStat: worktree.diffStat || '',
      diffHash: worktree.diffHash || null,
      diffTruncated: worktree.diffTruncated === true,
    };
    return {
      mission,
      workspace,
      delivery,
      evidence: summary,
      pullRequestArtifact: buildPullRequestArtifact({ mission, workspace, delivery, evidence: summary, title: input.title }),
    };
  }

  return { prepareMission };
}

module.exports = { createDeliveryService };
