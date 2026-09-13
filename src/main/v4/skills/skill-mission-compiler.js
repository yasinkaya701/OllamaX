'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { TaskStatus, RiskLevel } = require('../../../shared/v4/enums');
const { createMission, createTask } = require('../../../shared/v4/contracts');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function compileSkillMission(compiledSkill, input = {}) {
  if (!compiledSkill || !compiledSkill.skill || !Array.isArray(compiledSkill.tasks)) {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'compiled skill is required');
  }
  const workspaceId = String(input.workspaceId || '').trim();
  if (!workspaceId) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'workspaceId is required');
  const title = String(input.title || compiledSkill.skill.title || '').trim();
  const goal = String(input.goal || title).trim();
  if (!title || !goal) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'mission title and goal are required');

  const mission = createMission({
    workspaceId,
    title,
    goal,
    constraints: clone(input.constraints || []),
    priority: input.priority || 'NORMAL',
    policyProfileId: input.policyProfileId || null,
    createdBy: input.createdBy || 'skill',
  });

  const taskIdByTemplateId = new Map();
  for (const taskTemplate of compiledSkill.tasks) {
    const provisional = createTask({ missionId: mission.id, title: taskTemplate.title || taskTemplate.id });
    taskIdByTemplateId.set(taskTemplate.id, provisional.id);
  }

  const tasks = compiledSkill.tasks.map((taskTemplate) => {
    const dependencyIds = (taskTemplate.dependencies || []).map((dependency) => {
      const taskId = taskIdByTemplateId.get(dependency);
      if (!taskId) throw new V4Error(ErrorCode.VALIDATION_FAILED, `compiled skill has unknown dependency: ${dependency}`);
      return taskId;
    });
    const status = dependencyIds.length ? TaskStatus.PENDING : TaskStatus.READY;
    const taskGates = Array.isArray(taskTemplate.verificationGates) && taskTemplate.verificationGates.length
      ? taskTemplate.verificationGates
      : (compiledSkill.defaultVerificationGates || []);
    return createTask({
      id: taskIdByTemplateId.get(taskTemplate.id),
      missionId: mission.id,
      title: taskTemplate.title,
      description: taskTemplate.description || '',
      status,
      dependencies: dependencyIds,
      requiredCapabilities: clone(taskTemplate.requiredCapabilities || []),
      inputs: [{
        kind: 'skill-runtime',
        skillId: compiledSkill.skill.id,
        skillVersion: compiledSkill.skill.version,
        templateTaskId: taskTemplate.id,
        allowedTools: clone(compiledSkill.allowedTools || []),
        toolPlan: clone(taskTemplate.toolPlan || []),
        writeScopes: clone(taskTemplate.writeScopes || []),
        verificationGates: clone(taskGates),
      }],
      expectedOutputs: clone(input.expectedOutputs || []),
      acceptanceCriteria: clone(taskTemplate.acceptanceCriteria || []),
      riskLevel: input.riskLevel || RiskLevel.LOW,
    });
  });

  return {
    mission,
    tasks,
    provenance: {
      kind: 'skill',
      skillId: compiledSkill.skill.id,
      skillVersion: compiledSkill.skill.version,
      compiledAt: compiledSkill.compiledAt || null,
    },
  };
}

module.exports = {
  compileSkillMission,
};
