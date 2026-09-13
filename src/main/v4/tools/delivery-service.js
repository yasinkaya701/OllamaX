'use strict';

const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { toSerializable, serializeError } = require('../ipc/serializers');
const { inspectRepository } = require('../workspace/repo-inspector');
const { buildPullRequestArtifact } = require('./pr-artifact');

const DELIVERY_CHANNEL = 'ipc:4:delivery:prepare';

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

    const currentInventoryHash = inspectRepository(worktree.path).inventoryHash;
    const tasks = store.list(EntityType.TASK).filter((task) => task.missionId === mission.id);
    const taskIds = new Set(tasks.map((task) => task.id));
    const runs = store.list(EntityType.AGENT_RUN).filter((run) => taskIds.has(run.taskId));
    const verifications = store.list(EntityType.VERIFICATION_RUN).filter((run) => taskIds.has(run.subjectId));
    const evidence = store.list(EntityType.EVIDENCE).filter((item) => taskIds.has(item.subjectId));
    const passed = verifications.filter((run) => run.status === 'PASSED');
    const currentPassed = passed.filter((run) => run.subjectHash && run.subjectHash === currentInventoryHash);
    const stalePassed = passed.filter((run) => !run.subjectHash || run.subjectHash !== currentInventoryHash);
    const summary = {
      taskCount: tasks.length,
      agentRunCount: runs.length,
      verificationRunCount: verifications.length,
      verificationPassed: currentPassed.length,
      verificationStale: stalePassed.length,
      verificationFailed: verifications.filter((run) => run.status === 'FAILED').length,
      evidenceCount: evidence.length,
      currentInventoryHash,
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
      currentInventoryHash,
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

function registerDeliveryService(ipcMain, service) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'delivery IPC requires ipcMain.handle');
  }
  if (!service || typeof service.prepareMission !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'delivery IPC requires delivery service');
  }
  ipcMain.handle(DELIVERY_CHANNEL, async (_event, input = {}) => {
    try {
      return { ok: true, data: toSerializable(await service.prepareMission(input || {})) };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }
  });
  return { channel: DELIVERY_CHANNEL };
}

module.exports = {
  DELIVERY_CHANNEL,
  createDeliveryService,
  registerDeliveryService,
};
