'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore } = require('../src/main/v4/persistence/store');
const { createProjectMemory } = require('../src/main/v4/memory/project-memory');
const { createSkillRegistry } = require('../src/main/v4/skills/skill-registry');
const { registerBuiltins } = require('../src/main/v4/skills/builtins');
const { createV4ApplicationService } = require('../src/main/v4/ipc/application-service');

describe('v4 application service', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  function fixture(enabled) {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-app-repo-'));
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-app-state-'));
    const memoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-app-memory-'));
    roots.push(repoRoot, stateRoot, memoryRoot);
    fs.writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"fixture"}\n', 'utf8');
    const store = createStore({ rootDir: stateRoot });
    const memory = createProjectMemory({ rootDir: memoryRoot });
    const skillRegistry = createSkillRegistry();
    registerBuiltins(skillRegistry);
    const service = createV4ApplicationService({
      store,
      memory,
      skillRegistry,
      configReader: () => ({ features: { v4Workspace: enabled } }),
    });
    return { service, repoRoot, store };
  }

  test('fails closed while v4Workspace is disabled', () => {
    const { service, repoRoot } = fixture(false);
    expect(() => service.openWorkspace({ rootPath: repoRoot })).toThrow(/v4 workspace is disabled/);
    expect(() => service.listSkills()).toThrow(/v4 workspace is disabled/);
  });

  test('opens workspace and persists canonical missions/tasks from a built-in skill', () => {
    const { service, repoRoot } = fixture(true);
    const opened = service.openWorkspace({ rootPath: repoRoot, name: 'Fixture' });
    expect(opened.workspace.name).toBe('Fixture');
    expect(opened.workspace.indexState.status).toBe('INDEXED');
    expect(service.listSkills().map((skill) => skill.id)).toEqual(expect.arrayContaining(['repo-audit', 'bug-fix', 'release-prep']));

    const created = service.createMissionFromSkill({
      workspaceId: opened.workspace.id,
      skillId: 'repo-audit',
      skillInput: { focus: 'security boundaries' },
    });
    expect(created.tasks.length).toBeGreaterThan(0);
    expect(service.listMissions({ workspaceId: opened.workspace.id })).toHaveLength(1);
    expect(service.missionTasks({ missionId: created.mission.id })).toHaveLength(created.tasks.length);
    expect(service.missionTasks({ missionId: created.mission.id })[0].inputs[0].skillId).toBe('repo-audit');
  });
});
