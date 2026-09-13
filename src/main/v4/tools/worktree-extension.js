'use strict';

const path = require('path');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { toSerializable, serializeError } = require('../ipc/serializers');
const {
  createManagedWorktree,
  inspectManagedWorktree,
  removeManagedWorktree,
} = require('./worktree-manager');

const CHANNELS = Object.freeze({
  CREATE: 'ipc:4:worktree:create',
  INSPECT: 'ipc:4:worktree:inspect',
  REMOVE: 'ipc:4:worktree:remove',
});

function missionContext(runtime, missionId) {
  runtime.service.assertEnabled();
  const id = String(missionId || '').trim();
  if (!id) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
  const mission = runtime.store.get(EntityType.MISSION, id);
  if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${id}`);
  const workspace = runtime.store.get(EntityType.WORKSPACE, mission.workspaceId);
  if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${mission.workspaceId}`);
  return { mission, workspace };
}

function createWorktreeExtension(options = {}) {
  const runtime = options.runtime;
  const sandboxRoot = path.resolve(String(options.sandboxRoot || ''));
  if (!runtime || !runtime.store || !runtime.service) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'worktree extension requires bootstrapped runtime');
  }
  if (!options.sandboxRoot) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'worktree extension requires sandboxRoot');

  function descriptor(mission, workspace) {
    return {
      id: `mission-${mission.id}`,
      missionId: mission.id,
      workspaceId: workspace.id,
      rootPath: workspace.rootPath,
      sandboxRoot,
    };
  }

  async function resolveMissionRoot({ mission, workspace, purpose = 'execution' } = {}) {
    if (!mission || !workspace) {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'mission and workspace are required to resolve isolated root');
    }
    const spec = descriptor(mission, workspace);
    const inspected = await inspectManagedWorktree({ sandboxRoot: spec.sandboxRoot, id: spec.id });
    if (!inspected.exists) {
      throw new V4Error(
        ErrorCode.VALIDATION_FAILED,
        `isolated worktree is required before ${purpose}: ${mission.id}`,
        { missionId: mission.id, workspaceId: workspace.id, expectedPath: inspected.path },
      );
    }
    return inspected.path;
  }

  async function create(input = {}) {
    const { mission, workspace } = missionContext(runtime, input.missionId);
    const spec = descriptor(mission, workspace);
    const created = await createManagedWorktree({
      rootPath: spec.rootPath,
      sandboxRoot: spec.sandboxRoot,
      id: spec.id,
      baseRef: 'HEAD',
    });
    if (runtime.journal && typeof runtime.journal.append === 'function') {
      runtime.journal.append({
        type: 'worktree.created',
        subjectType: 'mission',
        subjectId: mission.id,
        payload: {
          path: created.path,
          baseSha: created.baseSha,
          headSha: created.headSha,
        },
      });
    }
    return { ...created, missionId: mission.id, workspaceId: workspace.id };
  }

  async function inspect(input = {}) {
    const { mission, workspace } = missionContext(runtime, input.missionId);
    const spec = descriptor(mission, workspace);
    const inspected = await inspectManagedWorktree({ sandboxRoot: spec.sandboxRoot, id: spec.id });
    return { ...inspected, missionId: mission.id, workspaceId: workspace.id, sourceRootPath: workspace.rootPath };
  }

  async function remove(input = {}) {
    const { mission, workspace } = missionContext(runtime, input.missionId);
    const spec = descriptor(mission, workspace);
    const removed = await removeManagedWorktree({
      rootPath: spec.rootPath,
      sandboxRoot: spec.sandboxRoot,
      id: spec.id,
    });
    if (removed.removed && runtime.journal && typeof runtime.journal.append === 'function') {
      runtime.journal.append({
        type: 'worktree.removed',
        subjectType: 'mission',
        subjectId: mission.id,
        payload: { path: removed.path },
      });
    }
    return { ...removed, missionId: mission.id, workspaceId: workspace.id };
  }

  function installIsolation() {
    if (typeof runtime.service.setExecutionRootResolver !== 'function') {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, 'v4 application service does not support isolated execution roots');
    }
    runtime.service.setExecutionRootResolver(resolveMissionRoot);
    return true;
  }

  return { sandboxRoot, descriptor, resolveMissionRoot, installIsolation, create, inspect, remove };
}

function registerWorktreeExtension(ipcMain, options = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'worktree extension requires ipcMain.handle');
  }
  const extension = createWorktreeExtension(options);
  extension.installIsolation();
  const handlers = [
    [CHANNELS.CREATE, extension.create],
    [CHANNELS.INSPECT, extension.inspect],
    [CHANNELS.REMOVE, extension.remove],
  ];
  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, async (_event, input = {}) => {
      try {
        return { ok: true, data: toSerializable(await handler(input || {})) };
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    });
  }
  return { ...extension, channels: handlers.map(([channel]) => channel) };
}

module.exports = {
  CHANNELS,
  missionContext,
  createWorktreeExtension,
  registerWorktreeExtension,
};
