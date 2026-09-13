'use strict';

const { ToolId } = require('../src/main/v4/tools/tool-registry');
const { TaskStatus } = require('../src/shared/v4/enums');
const { createSkillRegistry } = require('../src/main/v4/skills/skill-registry');
const { compileSkillMission } = require('../src/main/v4/skills/skill-mission-compiler');

describe('v4 skill mission compiler', () => {
  test('remaps template dependencies to canonical task ids and carries provenance', () => {
    const registry = createSkillRegistry();
    registry.register({
      id: 'two-step-fix',
      version: '1.0.0',
      title: 'Two Step Fix',
      allowedTools: [ToolId.GIT_STATUS],
      inputKeys: ['problem'],
      defaultVerificationGates: [{ id: 'status', type: 'git-clean', required: false }],
      tasks: [
        { id: 'inspect', title: 'Inspect {{input.problem}}', toolPlan: [{ toolId: ToolId.GIT_STATUS, args: {} }] },
        { id: 'fix', title: 'Fix {{input.problem}}', dependencies: ['inspect'], writeScopes: ['src'] },
      ],
    });
    const compiled = registry.compile('two-step-fix', { problem: 'startup bug' });
    const result = compileSkillMission(compiled, { workspaceId: 'ws-1' });

    expect(result.mission.workspaceId).toBe('ws-1');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].status).toBe(TaskStatus.READY);
    expect(result.tasks[1].status).toBe(TaskStatus.PENDING);
    expect(result.tasks[1].dependencies).toEqual([result.tasks[0].id]);
    expect(result.tasks[0].inputs[0].skillId).toBe('two-step-fix');
    expect(result.tasks[0].inputs[0].verificationGates[0].type).toBe('git-clean');
    expect(result.provenance.skillVersion).toBe('1.0.0');
  });
});
