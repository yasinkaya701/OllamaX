'use strict';

const crypto = require('crypto');
const {
  AgentRunStatus,
  EvidenceKind,
  MissionStatus,
  RiskLevel,
  TaskStatus,
  VerificationStatus,
} = require('./enums');

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createWorkspace(input = {}) {
  const now = input.createdAt || nowIso();
  return {
    id: input.id || makeId('ws'),
    name: String(input.name || '').trim(),
    rootPath: String(input.rootPath || '').trim(),
    repositoryMetadata: clone(input.repositoryMetadata || {}),
    activeBranch: input.activeBranch || null,
    indexState: clone(input.indexState || { status: 'NOT_INDEXED' }),
    createdAt: now,
    lastOpenedAt: input.lastOpenedAt || now,
    settings: clone(input.settings || {}),
  };
}

function createMission(input = {}) {
  const now = input.createdAt || nowIso();
  return {
    id: input.id || makeId('mission'),
    workspaceId: input.workspaceId || null,
    title: String(input.title || '').trim(),
    goal: String(input.goal || '').trim(),
    constraints: clone(input.constraints || []),
    status: input.status || MissionStatus.DRAFT,
    priority: input.priority || 'NORMAL',
    createdBy: input.createdBy || 'user',
    createdAt: now,
    updatedAt: input.updatedAt || now,
    budget: clone(input.budget || {}),
    policyProfileId: input.policyProfileId || null,
  };
}

function createTask(input = {}) {
  return {
    id: input.id || makeId('task'),
    missionId: input.missionId || null,
    parentTaskId: input.parentTaskId || null,
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    status: input.status || TaskStatus.PENDING,
    dependencies: clone(input.dependencies || []),
    assigneeAgentId: input.assigneeAgentId || null,
    requiredCapabilities: clone(input.requiredCapabilities || []),
    inputs: clone(input.inputs || []),
    expectedOutputs: clone(input.expectedOutputs || []),
    acceptanceCriteria: clone(input.acceptanceCriteria || []),
    riskLevel: input.riskLevel || RiskLevel.LOW,
  };
}

function createAgentRun(input = {}) {
  return {
    id: input.id || makeId('run'),
    taskId: input.taskId || null,
    agentProfileId: input.agentProfileId || null,
    modelRoute: clone(input.modelRoute || null),
    status: input.status || AgentRunStatus.QUEUED,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    contextSnapshotId: input.contextSnapshotId || null,
    usage: clone(input.usage || {}),
    resultSummary: input.resultSummary || null,
  };
}

function createToolCall(input = {}) {
  return {
    id: input.id || makeId('tool'),
    agentRunId: input.agentRunId || null,
    toolId: input.toolId || null,
    argumentsDigest: input.argumentsDigest || null,
    permissionDecision: input.permissionDecision || null,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    exitState: clone(input.exitState || null),
    outputArtifactId: input.outputArtifactId || null,
  };
}

function createArtifact(input = {}) {
  return {
    id: input.id || makeId('artifact'),
    kind: input.kind || 'generic',
    name: input.name || null,
    path: input.path || null,
    mediaType: input.mediaType || null,
    hash: input.hash || null,
    metadata: clone(input.metadata || {}),
    createdAt: input.createdAt || nowIso(),
  };
}

function createEvidence(input = {}) {
  return {
    id: input.id || makeId('evidence'),
    subjectType: input.subjectType || null,
    subjectId: input.subjectId || null,
    kind: input.kind || EvidenceKind.COMMAND_RESULT,
    sourceArtifactId: input.sourceArtifactId || null,
    summary: input.summary || null,
    hash: input.hash || null,
    createdAt: input.createdAt || nowIso(),
  };
}

function createVerificationRun(input = {}) {
  return {
    id: input.id || makeId('verify'),
    subjectId: input.subjectId || null,
    gates: clone(input.gates || []),
    status: input.status || VerificationStatus.PENDING,
    startedAt: input.startedAt || null,
    finishedAt: input.finishedAt || null,
    evidenceIds: clone(input.evidenceIds || []),
  };
}

module.exports = {
  nowIso,
  makeId,
  createWorkspace,
  createMission,
  createTask,
  createAgentRun,
  createToolCall,
  createArtifact,
  createEvidence,
  createVerificationRun,
};
