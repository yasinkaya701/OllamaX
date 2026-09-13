'use strict';

const path = require('path');
const configStore = require('../../config/config-store');
const { isFeatureEnabled } = require('../../config/feature-flags');
const { createWorkspace } = require('../../../shared/v4/contracts');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
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

  if (!store || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'v4 application service requires a v4 store');
  }

  function assertEnabled() {
    const config = configReader() || {};
    if (!isFeatureEnabled(config, 'v4Workspace')) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, 'v4 workspace is disabled');
    }
  }

  function workspaceByRoot(rootPath) {
    const resolved = path.resolve(rootPath);
    return store.list(EntityType.WORKSPACE).find((workspace) => path.resolve(workspace.rootPath) === resolved) || null;
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
    return missionRunner.runReadyBatch(input);
  }

  function cancelMission(input = {}) {
    assertEnabled();
    if (!missionRunner) throw new V4Error(ErrorCode.NOT_FOUND, 'mission runner is unavailable');
    return missionRunner.cancelMission(input.missionId, input.reason);
  }

  async function verifyTask(input = {}) {
    assertEnabled();
    if (!verificationEngine) throw new V4Error(ErrorCode.NOT_FOUND, 'verification engine is unavailable');
    return verificationEngine.runTaskVerification(input);
  }

  return {
    assertEnabled,
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
