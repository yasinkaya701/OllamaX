'use strict';

const { ToolId } = require('../tools/tool-registry');

const BUILTIN_SKILLS = Object.freeze([
  {
    id: 'repo-audit',
    version: '1.0.0',
    title: 'Repository Audit',
    description: 'Inspect repository state and produce an evidence-backed implementation audit without mutating files.',
    category: 'analysis',
    allowedTools: [
      ToolId.FS_READ,
      ToolId.FS_LIST,
      ToolId.GIT_STATUS,
      ToolId.GIT_DIFF,
      ToolId.GIT_HEAD,
      ToolId.GIT_BRANCH_CURRENT,
    ],
    inputKeys: ['focus'],
    tasks: [
      {
        id: 'inventory',
        title: 'Inspect repository structure for {{input.focus}}',
        description: 'Read project manifests, relevant source files and repository state.',
        writeScopes: [],
        toolPlan: [
          { toolId: ToolId.FS_LIST, args: { path: '.' } },
          { toolId: ToolId.GIT_STATUS, args: {} },
          { toolId: ToolId.GIT_HEAD, args: {} },
        ],
        verificationGates: [
          { id: 'inventory-execution', type: 'execution-evidence', minToolCalls: 3, required: true },
        ],
        acceptanceCriteria: ['Repository state and relevant implementation surface are identified.'],
      },
      {
        id: 'report',
        title: 'Produce evidence-backed audit for {{input.focus}}',
        dependencies: ['inventory'],
        writeScopes: [],
        toolPlan: [{ toolId: ToolId.GIT_DIFF, args: {} }],
        verificationGates: [
          { id: 'report-execution', type: 'execution-evidence', minToolCalls: 1, required: true },
        ],
        acceptanceCriteria: ['Findings distinguish verified evidence from recommendations.'],
      },
    ],
    metadata: { mutatesWorkspace: false },
  },
  {
    id: 'bug-fix',
    version: '1.0.0',
    title: 'Bug Fix',
    description: 'Reproduce, implement and verify a bounded software defect fix.',
    category: 'implementation',
    allowedTools: [
      ToolId.FS_READ,
      ToolId.FS_LIST,
      ToolId.FS_WRITE,
      ToolId.SHELL_RUN,
      ToolId.GIT_STATUS,
      ToolId.GIT_DIFF,
    ],
    inputKeys: ['problem', 'packageManager', 'testScript'],
    tasks: [
      {
        id: 'reproduce',
        title: 'Reproduce {{input.problem}}',
        writeScopes: [],
        toolPlan: [{
          toolId: ToolId.SHELL_RUN,
          args: { executable: '{{input.packageManager}}', args: ['run', '{{input.testScript}}'] },
          acceptedExitCodes: [0, 1],
        }],
        verificationGates: [
          { id: 'reproduction-execution', type: 'execution-evidence', minToolCalls: 1, required: true },
        ],
        acceptanceCriteria: ['Failure is reproduced or the non-reproducibility is recorded as execution evidence.'],
      },
      {
        id: 'implement',
        title: 'Implement minimal fix for {{input.problem}}',
        dependencies: ['reproduce'],
        writeScopes: ['*'],
        acceptanceCriteria: ['Diff is bounded to the defect and preserves unrelated behavior.'],
      },
      {
        id: 'verify',
        title: 'Verify fix for {{input.problem}}',
        dependencies: ['implement'],
        writeScopes: [],
        toolPlan: [{ toolId: ToolId.GIT_DIFF, args: {} }],
        verificationGates: [{
          id: 'regression-test',
          type: 'test',
          executable: '{{input.packageManager}}',
          args: ['run', '{{input.testScript}}'],
          required: true,
        }],
        acceptanceCriteria: ['Required regression gate passes and evidence is attached.'],
      },
    ],
    metadata: { mutatesWorkspace: true, requiresPlannerForTasks: ['implement'] },
  },
  {
    id: 'release-prep',
    version: '1.0.0',
    title: 'Release Preparation',
    description: 'Validate a release candidate without pushing or merging.',
    category: 'release',
    allowedTools: [
      ToolId.FS_READ,
      ToolId.GIT_STATUS,
      ToolId.GIT_DIFF,
      ToolId.GIT_HEAD,
      ToolId.GIT_BRANCH_CURRENT,
      ToolId.GIT_STAGE,
      ToolId.GIT_COMMIT,
      ToolId.SHELL_RUN,
    ],
    inputKeys: ['packageManager', 'testScript', 'lintScript'],
    tasks: [
      {
        id: 'quality',
        title: 'Run release quality gates',
        writeScopes: [],
        toolPlan: [
          { toolId: ToolId.SHELL_RUN, args: { executable: '{{input.packageManager}}', args: ['run', '{{input.testScript}}'] } },
          { toolId: ToolId.SHELL_RUN, args: { executable: '{{input.packageManager}}', args: ['run', '{{input.lintScript}}'] } },
        ],
        verificationGates: [
          { id: 'tests', type: 'test', executable: '{{input.packageManager}}', args: ['run', '{{input.testScript}}'], required: true },
          { id: 'lint', type: 'lint', executable: '{{input.packageManager}}', args: ['run', '{{input.lintScript}}'], required: true },
        ],
        acceptanceCriteria: ['Required release quality gates pass.'],
      },
      {
        id: 'review',
        title: 'Review release diff and git state',
        dependencies: ['quality'],
        writeScopes: [],
        toolPlan: [
          { toolId: ToolId.GIT_STATUS, args: {} },
          { toolId: ToolId.GIT_DIFF, args: {} },
        ],
        verificationGates: [
          { id: 'review-execution', type: 'execution-evidence', minToolCalls: 2, required: true },
        ],
        acceptanceCriteria: ['Release diff is reviewable and unresolved blockers are surfaced.'],
      },
    ],
    metadata: {
      mutatesWorkspace: false,
      noRemoteMutation: true,
      note: 'Push, merge and force operations are intentionally unavailable in the v4 tool registry.',
    },
  },
]);

function registerBuiltins(registry) {
  return BUILTIN_SKILLS.map((skill) => registry.register(skill, 'builtin'));
}

module.exports = {
  BUILTIN_SKILLS,
  registerBuiltins,
};
