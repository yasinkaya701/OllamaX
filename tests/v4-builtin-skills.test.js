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

  test('bug-fix and release-prep compile required inputs into verification gates', () => {
    const registry = createSkillRegistry();
    registerBuiltins(registry);
    const bugFix = registry.compile('bug-fix', { problem: 'startup crash', testExecutable: 'node' });
    expect(bugFix.tasks[0].title).toContain('startup crash');
    expect(bugFix.tasks[2].verificationGates[0].executable).toBe('node');

    const release = registry.compile('release-prep', { testExecutable: 'node', lintExecutable: 'node' });
    expect(release.tasks[0].verificationGates).toHaveLength(2);
    expect(release.tasks[0].verificationGates.every((gate) => gate.required)).toBe(true);
  });
});
