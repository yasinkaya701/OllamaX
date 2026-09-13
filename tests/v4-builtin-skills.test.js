'use strict';

const { createSkillRegistry } = require('../src/main/v4/skills/skill-registry');
const { BUILTIN_SKILLS, registerBuiltins } = require('../src/main/v4/skills/builtins');

describe('v4 built-in engineering skills', () => {
  test('all built-ins register and remain declarative', () => {
    const registry = createSkillRegistry();
    const registered = registerBuiltins(registry);
    expect(registered).toHaveLength(BUILTIN_SKILLS.length);
    expect(registry.get('repo-audit').version).toBe('1.0.0');
    expect(registry.get('bug-fix').allowedTools).not.toContain('git.push');
    expect(registry.get('release-prep').allowedTools).not.toContain('git.merge');
  });

  test('bug-fix and release-prep compile package manager and script inputs into gates', () => {
    const registry = createSkillRegistry();
    registerBuiltins(registry);
    const bugFix = registry.compile('bug-fix', {
      problem: 'startup crash',
      packageManager: 'pnpm',
      testScript: 'test:ci',
    });
    expect(bugFix.tasks[0].title).toContain('startup crash');
    expect(bugFix.tasks[0].toolPlan[0].args).toEqual({ executable: 'pnpm', args: ['run', 'test:ci'] });
    expect(bugFix.tasks[2].verificationGates[0].executable).toBe('pnpm');
    expect(bugFix.tasks[2].verificationGates[0].args).toEqual(['run', 'test:ci']);

    const release = registry.compile('release-prep', {
      packageManager: 'pnpm',
      testScript: 'test:ci',
      lintScript: 'lint',
    });
    expect(release.tasks[0].verificationGates).toHaveLength(2);
    expect(release.tasks[0].verificationGates[0].args).toEqual(['run', 'test:ci']);
    expect(release.tasks[0].verificationGates[1].args).toEqual(['run', 'lint']);
    expect(release.tasks[0].verificationGates.every((gate) => gate.required)).toBe(true);
  });
});
