'use strict';

const {
  AgentRunStatus,
  EntityType,
  EvidenceKind,
  MissionStatus,
  RiskLevel,
  TaskStatus,
  VerificationStatus,
} = require('./enums');
const { ErrorCode, V4Error } = require('./errors');

const ENUM_VALUES = new Map([
  ['mission.status', new Set(Object.values(MissionStatus))],
  ['task.status', new Set(Object.values(TaskStatus))],
  ['task.riskLevel', new Set(Object.values(RiskLevel))],
  ['agentRun.status', new Set(Object.values(AgentRunStatus))],
  ['evidence.kind', new Set(Object.values(EvidenceKind))],
  ['verificationRun.status', new Set(Object.values(VerificationStatus))],
]);

const REQUIRED_FIELDS = Object.freeze({
  [EntityType.WORKSPACE]: [
    'id', 'name', 'rootPath', 'repositoryMetadata', 'activeBranch', 'indexState',
    'createdAt', 'lastOpenedAt', 'settings',
  ],
  [EntityType.MISSION]: [
    'id', 'workspaceId', 'title', 'goal', 'constraints', 'status', 'priority',
    'createdBy', 'createdAt', 'updatedAt', 'budget', 'policyProfileId',
  ],
  [EntityType.TASK]: [
    'id', 'missionId', 'parentTaskId', 'title', 'description', 'status',
    'dependencies', 'assigneeAgentId', 'requiredCapabilities', 'inputs',
    'expectedOutputs', 'acceptanceCriteria', 'riskLevel',
  ],
  [EntityType.AGENT_RUN]: [
    'id', 'taskId', 'agentProfileId', 'modelRoute', 'status', 'startedAt',
    'finishedAt', 'contextSnapshotId', 'usage', 'resultSummary',
  ],
  [EntityType.TOOL_CALL]: [
    'id', 'agentRunId', 'toolId', 'argumentsDigest', 'permissionDecision',
    'startedAt', 'finishedAt', 'exitState', 'outputArtifactId',
  ],
  [EntityType.ARTIFACT]: ['id', 'kind', 'createdAt'],
  [EntityType.EVIDENCE]: [
    'id', 'subjectType', 'subjectId', 'kind', 'sourceArtifactId', 'summary',
    'hash', 'createdAt',
  ],
  [EntityType.VERIFICATION_RUN]: [
    'id', 'subjectId', 'gates', 'status', 'startedAt', 'finishedAt', 'evidenceIds',
  ],
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function validateRequired(type, value, errors) {
  const required = REQUIRED_FIELDS[type];
  if (!required) {
    errors.push(`Unknown entity type: ${type}`);
    return;
  }
  for (const key of required) {
    if (!hasOwn(value, key)) errors.push(`Missing required field: ${key}`);
  }
}

function validateCommon(type, value, errors) {
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('id must be a non-empty string');
  if (type === EntityType.WORKSPACE) {
    if (typeof value.name !== 'string' || !value.name.trim()) errors.push('name must be a non-empty string');
    if (typeof value.rootPath !== 'string' || !value.rootPath.trim()) errors.push('rootPath must be a non-empty string');
  }
  if (type === EntityType.MISSION) {
    if (typeof value.title !== 'string' || !value.title.trim()) errors.push('title must be a non-empty string');
    if (typeof value.goal !== 'string' || !value.goal.trim()) errors.push('goal must be a non-empty string');
    if (!Array.isArray(value.constraints)) errors.push('constraints must be an array');
  }
  if (type === EntityType.TASK) {
    if (typeof value.title !== 'string' || !value.title.trim()) errors.push('title must be a non-empty string');
    for (const key of ['dependencies', 'requiredCapabilities', 'inputs', 'expectedOutputs', 'acceptanceCriteria']) {
      if (!Array.isArray(value[key])) errors.push(`${key} must be an array`);
    }
  }
  if (type === EntityType.VERIFICATION_RUN && !Array.isArray(value.gates)) {
    errors.push('gates must be an array');
  }
  if (type === EntityType.VERIFICATION_RUN && !Array.isArray(value.evidenceIds)) {
    errors.push('evidenceIds must be an array');
  }
}

function validateEnums(type, value, errors) {
  const checks = [
    [`${type}.status`, value.status],
    [`${type}.riskLevel`, value.riskLevel],
    [`${type}.kind`, value.kind],
  ];
  for (const [key, actual] of checks) {
    const allowed = ENUM_VALUES.get(key);
    if (allowed && !allowed.has(actual)) errors.push(`${key.split('.').pop()} is invalid: ${actual}`);
  }
}

function validateEntity(type, value) {
  const errors = [];
  if (!isPlainObject(value)) return { ok: false, errors: ['entity must be a plain object'] };
  validateRequired(type, value, errors);
  validateCommon(type, value, errors);
  validateEnums(type, value, errors);
  return { ok: errors.length === 0, errors };
}

function assertEntity(type, value) {
  const result = validateEntity(type, value);
  if (!result.ok) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `Invalid ${type}`, {
      entityType: type,
      errors: result.errors,
    });
  }
  return value;
}

module.exports = {
  REQUIRED_FIELDS,
  validateEntity,
  assertEntity,
  isPlainObject,
};
