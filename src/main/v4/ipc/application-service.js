'use strict';

const path = require('path');
const configStore = require('../../config/config-store');
const { isFeatureEnabled } = require('../../config/feature-flags');
const { createWorkspace } = require('../../../shared/v4/contracts');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { PermissionProfile } = require('../tools/policy-engine');
const { compileSkillMission } = require('../skills/skill-mission-compiler');
const { refreshWorkspaceContext } = require('../workspace/workspace-context');

function createV4ApplicationService(options = {}) {
  const store = options.store;
  const memory = options.memory || null;
  const skillRegistry = options.skillRegistry || null;
  const missionRunner = options.missionRunner || null;
  const verificationEngine = options.verificationEngine || null;
  const configReader = options.configReader || (() => configStore.readConfig());
  const inventoryCache = new Map();
  let executionRootResolver = typeof options.executionRootResolver === 'function'
    ? options.executionRootResolver
    : null;

  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'v4 application service requires a v4 store');
  }

  function assertEnabled() {
    const config = configReader() || {};
    if (!isFeatureEnabled(config, 'v4Workspace')) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, 'v4 workspace is disabled');
    }
  }

  function setExecutionRootResolver(resolver) {
    if (resolver !== null && typeof resolver !== 'function') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'execution root resolver must be a function or null');
    }
    executionRootResolver = resolver;
    return true;
  }

  async function resolveExecutionRoot(mission, workspace, purpose = 'execution') {
    if (!executionRootResolver) return path.resolve(workspace.rootPath);
    const resolved = await executionRootResolver({ mission, workspace, purpose });
    if (!resolved || typeof resolved !== 'string') {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `execution root resolver returned no root for ${purpose}`);
    }
    return path.resolve(resolved);
  }

  function workspaceByRoot(rootPath) {
    const resolved = path.resolve(rootPath);
    return store.list(EntityType.WORKSPACE).find((workspace) => path.resolve(workspace.rootPath) === resolved) || null;
  }

  function missionWorkspace(missionId) {
    const mission = store.get(EntityType.MISSION, missionId);
    if (!mission) throw new V4Error(ErrorCode.NOT_FOUND, `mission not found: ${missionId}`);
    const workspace = store.get(EntityType.WORKSPACE, mission.workspaceId);
    if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${mission.workspaceId}`);
    return { mission, workspace };
  }

  function taskRuntimeInput(task) {
    if (!task || !Array.isArray(task.inputs)) return null;
    return task.inputs.find((item) => item && item.kind === 'skill-runtime') || null;
  }

  function openWorkspace(input = {}) {
    assertEnabled();
    if (!input.rootPath || typeof input.rootPath !== 'string') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'workspace rootPath is required');
    }
    const resolvedRoot = path.resolve(input.rootPath);
    const existing = workspaceByRoot(resolvedRoot);
    const refreshed = refreshWorkspaceContext({
      rootPath: resolvedRoot,
      workspaceId: existing ? existing.id : `pending:${resolvedRoot}`,
      memory: existing ? memory : null,
      previousInventory: existing && existing.indexState && existing.indexState.inventoryHash
        ? { inventoryHash: existing.indexState.inventoryHash, files: [] }
        : null,
      query: input.query || '',
      maxContextFiles: input.maxContextFiles,
      maxContextBytes: input.maxContextBytes,
    });

    const workspace = createWorkspace({
      id: existing ? existing.id : undefined,
      name: String(input.name || (existing && existing.name) || path.basename(resolvedRoot)).trim(),
      rootPath: resolvedRoot,
      repositoryMetadata: refreshed.inventory.repositoryMetadata,
      activeBranch: refreshed.inventory.repositoryMetadata.activeBranch,
      indexState: {
        status: 'INDEXED',
        inventoryHash: refreshed.inventory.inventoryHash,
        generatedAt: refreshed.inventory.generatedAt,
        includedFiles: refreshed.inventory.stats.includedFiles,
      },
      createdAt: existing && existing.createdAt,
      lastOpenedAt: new Date().toISOString(),
      settings: { ...((existing && existing.settings) || {}), ...(input.settings || {}) },
    });
    store.put(EntityType.WORKSPACE, workspace);
    inventoryCache.set(workspace.id, refreshed.inventory);
    return { workspace, inventory: refreshed.inventory, context: refreshed.context };
  }

  function refreshWorkspace(input = {}) {
    assertEnabled();
    const workspace = store.get(EntityType.WORKSPACE, input.workspaceId);
    if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${input.workspaceId}`);
    const previousInventory = inventoryCache.get(workspace.id) || (workspace.indexState && workspace.indexState.inventoryHash
      ? { inventoryHash: workspace.indexState.inventoryHash, files: [] }
      : null);
    const refreshed = refreshWorkspaceContext({
      rootPath: workspace.rootPath,
      workspaceId: workspace.id,
      memory,
      previousInventory,
      query: input.query || '',
      paths: input.paths,
      categories: input.categories,
      maxContextFiles: input.maxContextFiles,
      maxContextBytes: input.maxContextBytes,
      maxMemoryRecords: input.maxMemoryRecords,
      maxMemoryBytes: input.maxMemoryBytes,
    });
    const updated = {
      ...workspace,
      repositoryMetadata: refreshed.inventory.repositoryMetadata,
      activeBranch: refreshed.inventory.repositoryMetadata.activeBranch,
      indexState: {
        status: 'INDEXED',
        inventoryHash: refreshed.inventory.inventoryHash,
        generatedAt: refreshed.inventory.generatedAt,
        includedFiles: refreshed.inventory.stats.includedFiles,
      },
      lastOpenedAt: new Date().toISOString(),
    };
    store.put(EntityType.WORKSPACE, updated);
    inventoryCache.set(workspace.id, refreshed.inventory);
    return { workspace: updated, ...refreshed };
  }

  function listWorkspaces() {
    assertEnabled();
    return store.list(EntityType.WORKSPACE);
  }

  function listSkills() {
    assertEnabled();
    if (!skillRegistry) return [];
    return skillRegistry.list();
  }

  function createMissionFromSkill(input = {}) {
    assertEnabled();
    if (!skillRegistry) throw new V4Error(ErrorCode.NOT_FOUND, 'skill registry is unavailable');
    const workspace = store.get(EntityType.WORKSPACE, input.workspaceId);
    if (!workspace) throw new V4Error(ErrorCode.NOT_FOUND, `workspace not found: ${input.workspaceId}`);
    const compiled = skillRegistry.compile(input.skillId, input.skillInput || {}, input.version || null);
    const result = compileSkillMission(compiled, {
      workspaceId: workspace.id,
      title: input.title,
      goal: input.goal,
      constraints: input.constraints,
      priority: input.priority,
      policyProfileId: input.policyProfileId,
      createdBy: input.createdBy || 'skill',
      riskLevel: input.riskLevel,
    });
    store.put(EntityType.MISSION, result.mission);
    for (const task of result.tasks) store.put(EntityType.TASK, task);
    return result;
  }

  function listMissions(input = {}) {
    assertEnabled();
    return store.list(EntityType.MISSION).filter((mission) => !input.workspaceId || mission.workspaceId === input.workspaceId);
  }

  function missionTasks(input = {}) {
    assertEnabled();
    if (!input.missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    return store.list(EntityType.TASK).filter((task) => task.missionId === input.missionId);
  }

  function memorySearch(input = {}) {
    assertEnabled();
    if (!memory) return [];
    return memory.search(input.query || '', {
      workspaceId: input.workspaceId,
      kind: input.kind,
      limit: input.limit,
      touch: input.touch,
    });
  }

  function memoryAdd(input = {}) {
    assertEnabled();
    if (!memory) throw new V4Error(ErrorCode.NOT_FOUND, 'project memory is unavailable');
    return memory.add(input);
  }

  async function runReadyBatch(input = {}) {
    assertEnabled();
    if (!missionRunner) throw new V4Error(ErrorCode.NOT_FOUND, 'mission runner is unavailable');
    if (!input.missionId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'missionId is required');
    const { mission, workspace } = missionWorkspace(input.missionId);
    const executionRoot = await resolveExecutionRoot(mission, workspace, 'execution');
    const permissionProfile = Object.values(PermissionProfile).includes(input.permissionProfile)
      ? input.permissionProfile
      : PermissionProfile.DEVELOPER;

    return missionRunner.runReadyBatch({
      missionId: input.missionId,
      rootPath: executionRoot,
      cwd: '.',
      maxParallel: input.maxParallel,
      permissionProfile,
      approval: null,
      approvalProvider: null,
      agentProfileId: input.agentProfileId || 'implementer',
      modelRoute: input.modelRoute || null,
      contextSnapshotId: input.contextSnapshotId || null,
      timeoutMs: input.timeoutMs,
      maxOutputBytes: input.maxOutputBytes,
      getWriteScopes: (task) => {
        const runtime = taskRuntimeInput(task);
        return runtime && Array.isArray(runtime.writeScopes) ? runtime.writeScopes : [];
      },
      planForTask: (task) => {
        const runtime = taskRuntimeInput(task);
        if (!runtime) {
          throw new V4Error(ErrorCode.VALIDATION_FAILED, `task has no trusted runtime plan: ${task.id}`);
        }
        const steps = Array.isArray(runtime.toolPlan) ? runtime.toolPlan : [];
        if (!steps.length) {
          throw new V4Error(ErrorCode.VALIDATION_FAILED, `task requires planner-generated steps before execution: ${task.id}`);
        }
        return steps;
      },
    });
  }

  function cancelMission(input = {}) {
    assertEnabled();
    if (!missionRunner) throw new V4Error(ErrorCode.NOT_FOUND, 'mission runner is unavailable');
    return missionRunner.cancelMission(input.missionId, input.reason);
  }

  async function verifyTask(input = {}) {
    assertEnabled();
    if (!verificationEngine) throw new V4Error(ErrorCode.NOT_FOUND, 'verification engine is unavailable');
    const task = store.get(EntityType.TASK, input.taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${input.taskId}`);
    const { mission, workspace } = missionWorkspace(task.missionId);
    const executionRoot = await resolveExecutionRoot(mission, workspace, 'verification');
    const runtime = taskRuntimeInput(task);
    const storedGates = runtime && Array.isArray(runtime.verificationGates) ? runtime.verificationGates : [];
    if (!storedGates.length) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `task has no trusted verification gates: ${task.id}`);
    }
    const permissionProfile = Object.values(PermissionProfile).includes(input.permissionProfile)
      ? input.permissionProfile
      : PermissionProfile.DEVELOPER;
    return verificationEngine.runTaskVerification({
      taskId: task.id,
      rootPath: executionRoot,
      cwd: '.',
      gates: storedGates,
      permissionProfile,
      timeoutMs: input.timeoutMs,
      maxOutputBytes: input.maxOutputBytes,
      stopOnRequiredFailure: input.stopOnRequiredFailure !== false,
    });
  }

  return {
    assertEnabled,
    setExecutionRootResolver,
    resolveExecutionRoot,
    openWorkspace,
    refreshWorkspace,
    listWorkspaces,
    listSkills,
    createMissionFromSkill,
    listMissions,
    missionTasks,
    memorySearch,
    memoryAdd,
    runReadyBatch,
    cancelMission,
    verifyTask,
  };
}

module.exports = {
  createV4ApplicationService,
};
