'use strict';

const {
  extractJson,
  normalizePlan,
} = require('../src/main/v4/runtime/task-planner');

function task() {
  return {
    id: 'task-1',
    title: 'Inspect README',
    inputs: [{
      kind: 'skill-runtime',
      skillId: 'audit',
      skillVersion: '1.0.0',
      allowedTools: ['fs.read'],
      writeScopes: [],
      toolPlan: [],
    }],
  };
}

describe('v4 structured task planner', () => {
  test('extracts fenced JSON and normalizes allowed steps', () => {
    const parsed = extractJson('```json\n{"summary":"read","steps":[{"toolId":"fs.read","args":{"path":"README.md"}}]}\n```');
    const plan = normalizePlan(task(), parsed);
    expect(plan.steps).toEqual([{ id: 'planned-1', toolId: 'fs.read', args: { path: 'README.md' } }]);
  });

  test('rejects tools outside skill policy', () => {
    expect(() => normalizePlan(task(), {
      steps: [{ toolId: 'fs.write', args: { path: 'README.md', content: 'x' } }],
    })).toThrow(/does not allow tool/);
  });
});
