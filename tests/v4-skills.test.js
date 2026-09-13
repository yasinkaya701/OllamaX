'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ToolId } = require('../src/main/v4/tools/tool-registry');
const { createSkillRegistry } = require('../src/main/v4/skills/skill-registry');
const { loadSkillDirectory } = require('../src/main/v4/skills/skill-loader');

function baseSkill(version = '1.0.0') {
  return {
    id: 'repo-audit',
    version,
    title: 'Repository audit',
    allowedTools: [ToolId.FS_READ, ToolId.GIT_STATUS],
    inputKeys: ['target'],
    tasks: [{
      id: 'inspect',
      title: 'Inspect {{input.target}}',
      toolPlan: [{ toolId: ToolId.FS_READ, args: { path: '{{input.target}}' } }],
      verificationGates: [{ type: 'file-exists', path: '{{input.target}}' }],
    }],
  };
}

describe('v4 skills', () => {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  test('selects latest version and compiles input templates', () => {
    const registry = createSkillRegistry();
    registry.register(baseSkill('1.0.0'));
    registry.register(baseSkill('1.2.0'));
    expect(registry.get('repo-audit').version).toBe('1.2.0');
    const compiled = registry.compile('repo-audit', { target: 'README.md' });
    expect(compiled.tasks[0].title).toBe('Inspect README.md');
    expect(compiled.tasks[0].toolPlan[0].args.path).toBe('README.md');
    expect(compiled.tasks[0].verificationGates[0].path).toBe('README.md');
  });

  test('rejects undeclared tools, missing input and cyclic tasks', () => {
    const registry = createSkillRegistry();
    const unknown = baseSkill();
    unknown.tasks[0].toolPlan[0].toolId = ToolId.SHELL_RUN;
    expect(() => registry.register(unknown)).toThrow(/undeclared tool/);

    registry.register(baseSkill());
    expect(() => registry.compile('repo-audit', {})).toThrow(/missing skill input/);

    const cyclic = baseSkill('2.0.0');
    cyclic.tasks = [
      { id: 'a', title: 'A', dependencies: ['b'] },
      { id: 'b', title: 'B', dependencies: ['a'] },
    ];
    expect(() => registry.register(cyclic)).toThrow(/dependency cycle/);
  });

  test('loader accepts JSON manifests and rejects malformed JSON and symlinks', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-skills-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'audit.json'), JSON.stringify(baseSkill()), 'utf8');
    fs.writeFileSync(path.join(root, 'broken.json'), '{broken', 'utf8');
    if (process.platform !== 'win32') fs.symlinkSync(path.join(root, 'audit.json'), path.join(root, 'alias.json'));

    const registry = createSkillRegistry();
    const result = loadSkillDirectory(registry, root);
    expect(result.loaded).toEqual([{ id: 'repo-audit', version: '1.0.0', file: 'audit.json' }]);
    expect(result.rejected.find((item) => item.file === 'broken.json')).toBeTruthy();
    if (process.platform !== 'win32') expect(result.rejected.find((item) => item.file === 'alias.json').reason).toBe('not-regular-file');
  });
});
