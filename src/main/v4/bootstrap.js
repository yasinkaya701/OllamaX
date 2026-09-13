'use strict';

const path = require('path');
const configStore = require('../config/config-store');
const { isFeatureEnabled } = require('../config/feature-flags');
const { ErrorCode, V4Error } = require('../../shared/v4/errors');
const { createStore } = require('./persistence/store');
const { createRunJournal } = require('./observability/run-journal');
const { createProjectMemory } = require('./memory/project-memory');
const { createSkillRegistry } = require('./skills/skill-registry');
const { registerBuiltins } = require('./skills/builtins');
const { createApprovalBroker } = require('./tools/approval-broker');
const { createApprovedToolExecutor } = require('./tools/approved-tool-executor');
const { registerWorktreeExtension } = require('./tools/worktree-extension');
const { createDeliveryService, registerDeliveryService } = require('./tools/delivery-service');
const { createAgentRuntime } = require('./runtime/agent-runtime');
const { createMissionRunner } = require('./runtime/mission-runner');
const { createVerificationEngine } = require('./verification/verification-engine');
const { createV4ApplicationService } = require('./ipc/application-service');
const { registerV4IpcHandlers } = require('./ipc/handlers');

function bootstrapV4Runtime(options = {}) {
  const configReader = options.configReader || (() => configStore.readConfig());
  const config = configReader() || {};
  if (!isFeatureEnabled(config, 'v4Workspace')) {
    return { enabled: false, reason: 'feature-disabled' };
  }
  if (!options.rootDir || typeof options.rootDir !== 'string') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'v4 runtime rootDir is required when enabled');
  }

  const store = options.store || createStore({ rootDir: options.rootDir });
  const journal = options.journal || createRunJournal({ rootDir: options.rootDir });
  const memory = options.memory || createProjectMemory({ rootDir: options.rootDir });
  const skillRegistry = options.skillRegistry || createSkillRegistry();
  if (!options.skillRegistry) registerBuiltins(skillRegistry);

  const approvalBroker = options.approvalBroker || createApprovalBroker({
    journal,
    timeoutMs: options.approvalTimeoutMs,
  });
  const toolExecutor = options.approvedToolExecutor || createApprovedToolExecutor({
    broker: approvalBroker,
    baseExecutor: options.toolExecutor,
  });

  const agentRuntime = options.agentRuntime || createAgentRuntime({ store, journal, toolExecutor });
  const missionRunner = options.missionRunner || createMissionRunner({ store, agentRuntime });
  const verificationEngine = options.verificationEngine || createVerificationEngine({
    store,
    journal,
    toolExecutor,
  });
  const service = options.service || createV4ApplicationService({
    store,
    memory,
    skillRegistry,
    missionRunner,
    verificationEngine,
    configReader,
  });

  let ipc = null;
  let worktrees = null;
  let delivery = null;
  let deliveryIpc = null;
  if (options.ipcMain) {
    ipc = registerV4IpcHandlers(options.ipcMain, service, { approvalBroker });
    worktrees = registerWorktreeExtension(options.ipcMain, {
      runtime: { service, store, journal },
      sandboxRoot: path.join(options.rootDir, 'worktrees'),
    });
    delivery = createDeliveryService({ store, inspectWorktree: worktrees.inspect });
    deliveryIpc = registerDeliveryService(options.ipcMain, delivery);
  }

  return {
    enabled: true,
    store,
    journal,
    memory,
    skillRegistry,
    approvalBroker,
    toolExecutor,
    agentRuntime,
    missionRunner,
    verificationEngine,
    service,
    ipc,
    worktrees,
    delivery,
    deliveryIpc,
  };
}

module.exports = {
  bootstrapV4Runtime,
};
