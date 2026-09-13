'use strict';

const MissionStatus = Object.freeze({
  DRAFT: 'DRAFT',
  PLANNING: 'PLANNING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  VERIFYING: 'VERIFYING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const TaskStatus = Object.freeze({
  PENDING: 'PENDING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  VERIFYING: 'VERIFYING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const AgentRunStatus = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  BLOCKED: 'BLOCKED',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const VerificationStatus = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const RiskLevel = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
});

const EvidenceKind = Object.freeze({
  FILE_CHANGE: 'file-change',
  TEST_RESULT: 'test-result',
  LINT_RESULT: 'lint-result',
  BUILD_RESULT: 'build-result',
  COMMAND_RESULT: 'command-result',
  REVIEW_FINDING: 'review-finding',
  SECURITY_SCAN: 'security-scan',
  GIT_STATE: 'git-state',
  USER_APPROVAL: 'user-approval',
  BENCHMARK_RESULT: 'benchmark-result',
});

const EntityType = Object.freeze({
  WORKSPACE: 'workspace',
  MISSION: 'mission',
  TASK: 'task',
  AGENT_RUN: 'agentRun',
  TOOL_CALL: 'toolCall',
  ARTIFACT: 'artifact',
  EVIDENCE: 'evidence',
  VERIFICATION_RUN: 'verificationRun',
});

module.exports = {
  MissionStatus,
  TaskStatus,
  AgentRunStatus,
  VerificationStatus,
  RiskLevel,
  EvidenceKind,
  EntityType,
};
