'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const {
  Decision,
  evaluatePermission,
} = require('./policy-engine');
const {
  ToolId,
  getManifest,
  digestArguments,
  executeTool: defaultExecuteTool,
} = require('./tool-registry');
const { classifyShellOperation } = require('./shell-runner');

function permissionPreflight(toolId, args = {}, context = {}) {
  const manifest = getManifest(toolId);
  if (!manifest) throw new V4Error(ErrorCode.NOT_FOUND, `unknown v4 tool: ${toolId}`);
  let capability = manifest.capability;
  let risk = manifest.risk;
  let classification = null;
  if (toolId === ToolId.SHELL_RUN) {
    classification = classifyShellOperation(args.executable, args.args || []);
    capability = classification.capability;
    risk = classification.risk;
  }
  const decision = evaluatePermission({
    profile: context.profile,
    capability,
    risk,
    forceApproval: context.forceApproval === true,
  });
  return { manifest, decision, classification };
}

function previewFor(toolId, args = {}) {
  if ([ToolId.FS_READ, ToolId.FS_LIST, ToolId.FS_WRITE, ToolId.FS_DELETE].includes(toolId)) {
    return { path: args.path || null };
  }
  if (toolId === ToolId.SHELL_RUN) return { executable: args.executable, args: args.args || [] };
  if (toolId === ToolId.GIT_BRANCH_CREATE) return { branchName: args.branchName || null };
  if (toolId === ToolId.GIT_STAGE) return { paths: args.paths || [] };
  if (toolId === ToolId.GIT_COMMIT) return { message: args.message || '' };
  return {};
}

function createApprovedToolExecutor(options = {}) {
  const broker = options.broker;
  const baseExecutor = options.baseExecutor || defaultExecuteTool;
  if (!broker || typeof broker.request !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'approved tool executor requires approval broker');
  }

  return async function approvedToolExecutor(toolId, args = {}, context = {}) {
    const preflight = permissionPreflight(toolId, args, context);
    let approval = null;
    if (preflight.decision.decision === Decision.REQUIRE_APPROVAL) {
      approval = await broker.request({
        toolId,
        decision: preflight.decision,
        argumentsDigest: digestArguments(args),
        preview: previewFor(toolId, args),
        taskId: context.taskId || null,
        runId: context.runId || null,
        signal: context.signal,
      });
    }
    return baseExecutor(toolId, args, {
      ...context,
      // Never trust approval objects supplied by a skill or renderer path.
      approval,
      approvalProvider: undefined,
    });
  };
}

module.exports = {
  permissionPreflight,
  previewFor,
  createApprovedToolExecutor,
};
