'use strict';

const configStore = require('../config/config-store');
const { isFeatureEnabled } = require('../config/feature-flags');
const { ErrorCode, V4Error } = require('../../shared/v4/errors');
const { createStore } = require('./persistence/store');
const { createRunJournal } = require('./observability/run-journal');
const { createProjectMemory } = require('./memory/project-memory');
const { createSkillRegistry } = require('./skills/skill-registry');
const { registerBuiltins } = require('./skills/builtins');
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
  const agentRuntime = options.agentRuntime || createAgentRuntime({ store, journal, toolExecutor: options.toolExecutor });
  const missionRunner = options.missionRunner || createMissionRunner({ store, agentRuntime });
  const verificationEngine = options.verificationEngine || createVerificationEngine({
    store,
    journal,
    toolExecutor: options.toolExecutor,
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
  if (options.ipcMain) ipc = registerV4IpcHandlers(options.ipcMain, service);

  return {
    enabled: true,
    store,
    journal,
    memory,
    skillRegistry,
    agentRuntime,
    missionRunner,
    verificationEngine,
    service,
    ipc,
  };
}

module.exports = {
  bootstrapV4Runtime,
};
