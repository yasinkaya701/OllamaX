'use strict';

const fs = require('fs');
const { AgentRunStatus, EntityType, EvidenceKind } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error, asV4Error } = require('../../../shared/v4/errors');
const { PermissionProfile } = require('../tools/policy-engine');
const { secureWorkspacePath } = require('../tools/path-guard');
const { ToolId, executeTool: defaultExecuteTool } = require('../tools/tool-registry');

const GateType = Object.freeze({
  TEST: 'test',
  LINT: 'lint',
  BUILD: 'build',
  SECURITY: 'security',
  COMMAND: 'command',
  FILE_EXISTS: 'file-exists',
  GIT_CLEAN: 'git-clean',
  EXECUTION_EVIDENCE: 'execution-evidence',
});

const EVIDENCE_BY_GATE = Object.freeze({
  [GateType.TEST]: EvidenceKind.TEST_RESULT,
  [GateType.LINT]: EvidenceKind.LINT_RESULT,
  [GateType.BUILD]: EvidenceKind.BUILD_RESULT,
  [GateType.SECURITY]: EvidenceKind.SECURITY_SCAN,
  [GateType.COMMAND]: EvidenceKind.COMMAND_RESULT,
  [GateType.FILE_EXISTS]: EvidenceKind.COMMAND_RESULT,
  [GateType.GIT_CLEAN]: EvidenceKind.GIT_STATE,
  [GateType.EXECUTION_EVIDENCE]: EvidenceKind.COMMAND_RESULT,
});

function normalizeGate(input = {}, index = 0) {
  const type = String(input.type || '').trim();
  if (!Object.values(GateType).includes(type)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `unsupported verification gate: ${type || '(empty)'}`);
  }
  const id = String(input.id || `${type}-${index + 1}`).trim();
  if (!id) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'verification gate id is required');
  const gate = {
    id,
    type,
    required: input.required !== false,
    label: input.label || id,
    timeoutMs: Number.isInteger(input.timeoutMs) ? Math.max(100, input.timeoutMs) : null,
  };
  if ([GateType.TEST, GateType.LINT, GateType.BUILD, GateType.SECURITY, GateType.COMMAND].includes(type)) {
    if (!input.executable || typeof input.executable !== 'string') {
      throw new V4Error(ErrorCode.INVALID_ARGUMENT, `${type} gate requires executable`);
    }
    gate.executable = input.executable;
    gate.args = Array.isArray(input.args) ? input.args.map((arg) => String(arg)) : [];
    gate.cwd = input.cwd || '.';
  }
  if (type === GateType.FILE_EXISTS) {
    if (!input.path || typeof input.path !== 'string') throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'file-exists gate requires path');
    gate.path = input.path;
  }
  if (type === GateType.EXECUTION_EVIDENCE) {
    gate.minToolCalls = Number.isInteger(input.minToolCalls) ? Math.max(0, input.minToolCalls) : 1;
  }
  return gate;
}

function summarizeCommandResult(result) {
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || '').trim();
  const excerpt = (stdout || stderr).slice(0, 500);
  return {
    ok: result.ok === true,
    code: result.code ?? null,
    timedOut: result.timedOut === true,
    cancelled: result.cancelled === true,
    outputTruncated: result.outputTruncated === true,
    excerpt,
  };
}

function gitStatusIsClean(stdout) {
  const lines = String(stdout || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.every((line) => line.startsWith('##'));
}

function executionEvidence(store, taskId, gate) {
  if (!store || typeof store.list !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'execution-evidence gate requires durable store access');
  }
  if (!taskId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'execution-evidence gate requires taskId');
  const runs = store.list(EntityType.AGENT_RUN)
    .filter((run) => run.taskId === taskId && run.status === AgentRunStatus.COMPLETE)
    .sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));
  const run = runs[0] || null;
  const calls = run
    ? store.list(EntityType.TOOL_CALL).filter((call) => call.agentRunId === run.id)
    : [];
  const successfulCalls = calls.filter((call) => call.exitState && call.exitState.ok === true);
  const passed = Boolean(run)
    && calls.length >= gate.minToolCalls
    && successfulCalls.length === calls.length;
  return {
    passed,
    runId: run ? run.id : null,
    toolCallCount: calls.length,
    successfulToolCallCount: successfulCalls.length,
    minToolCalls: gate.minToolCalls,
    toolCallIds: calls.map((call) => call.id),
  };
}

function createGateRunner(options = {}) {
  const toolExecutor = options.toolExecutor || defaultExecuteTool;
  const store = options.store || null;

  async function run(gateInput, context = {}, index = 0) {
    const gate = normalizeGate(gateInput, index);
    const startedAt = new Date().toISOString();
    try {
      if ([GateType.TEST, GateType.LINT, GateType.BUILD, GateType.SECURITY, GateType.COMMAND].includes(gate.type)) {
        const execution = await toolExecutor(ToolId.SHELL_RUN, {
          executable: gate.executable,
          args: gate.args,
        }, {
          rootPath: context.rootPath,
          cwd: gate.cwd,
          profile: context.permissionProfile || PermissionProfile.DEVELOPER,
          signal: context.signal,
          timeoutMs: gate.timeoutMs || context.timeoutMs,
          maxOutputBytes: context.maxOutputBytes,
        });
        const command = summarizeCommandResult(execution.result || {});
        return {
          gate,
          passed: command.ok,
          startedAt,
          finishedAt: new Date().toISOString(),
          evidenceKind: EVIDENCE_BY_GATE[gate.type],
          summary: command.ok ? `${gate.label} passed.` : `${gate.label} failed.`,
          payload: command,
        };
      }

      if (gate.type === GateType.FILE_EXISTS) {
        const resolved = secureWorkspacePath(context.rootPath, gate.path, { allowSecrets: false });
        const stat = fs.statSync(resolved.target);
        const passed = stat.isFile();
        return {
          gate,
          passed,
          startedAt,
          finishedAt: new Date().toISOString(),
          evidenceKind: EVIDENCE_BY_GATE[gate.type],
          summary: passed ? `Required file exists: ${resolved.relative}` : `Required path is not a file: ${resolved.relative}`,
          payload: { path: resolved.relative, size: stat.size, isFile: stat.isFile() },
        };
      }

      if (gate.type === GateType.GIT_CLEAN) {
        const execution = await toolExecutor(ToolId.GIT_STATUS, {}, {
          rootPath: context.rootPath,
          cwd: context.cwd || '.',
          profile: context.permissionProfile || PermissionProfile.OBSERVE,
          signal: context.signal,
          timeoutMs: gate.timeoutMs || context.timeoutMs,
          maxOutputBytes: context.maxOutputBytes,
        });
        const result = execution.result || {};
        const passed = result.ok === true && gitStatusIsClean(result.stdout);
        return {
          gate,
          passed,
          startedAt,
          finishedAt: new Date().toISOString(),
          evidenceKind: EVIDENCE_BY_GATE[gate.type],
          summary: passed ? 'Git working tree is clean.' : 'Git working tree contains uncommitted changes.',
          payload: {
            ok: result.ok === true,
            clean: passed,
            statusExcerpt: String(result.stdout || '').slice(0, 1000),
          },
        };
      }

      if (gate.type === GateType.EXECUTION_EVIDENCE) {
        const execution = executionEvidence(store, context.taskId, gate);
        return {
          gate,
          passed: execution.passed,
          startedAt,
          finishedAt: new Date().toISOString(),
          evidenceKind: EVIDENCE_BY_GATE[gate.type],
          summary: execution.passed
            ? `Durable execution evidence contains ${execution.toolCallCount} successful tool call(s).`
            : 'Durable execution evidence is incomplete or contains failed tool calls.',
          payload: execution,
        };
      }

      throw new V4Error(ErrorCode.NOT_FOUND, `no runner for verification gate: ${gate.type}`);
    } catch (error) {
      const normalized = asV4Error(error, ErrorCode.VALIDATION_FAILED);
      return {
        gate,
        passed: false,
        startedAt,
        finishedAt: new Date().toISOString(),
        evidenceKind: EVIDENCE_BY_GATE[gate.type] || EvidenceKind.COMMAND_RESULT,
        summary: `${gate.label} failed: ${normalized.message}`,
        payload: {
          error: { code: normalized.code, message: normalized.message },
          cancelled: Boolean(context.signal && context.signal.aborted),
        },
      };
    }
  }

  return { run };
}

module.exports = {
  GateType,
  EVIDENCE_BY_GATE,
  normalizeGate,
  summarizeCommandResult,
  gitStatusIsClean,
  executionEvidence,
  createGateRunner,
};
