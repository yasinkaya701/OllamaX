'use strict';

const os = require('os');
const path = require('path');
const { createTask } = require('../../src/shared/v4/contracts');
const { resolveWorkspacePath } = require('../../src/main/v4/tools/path-guard');
const { ToolId } = require('../../src/main/v4/tools/tool-registry');
const { normalizePlan } = require('../../src/main/v4/runtime/task-planner');
const { createCapabilityRegistry } = require('../../src/main/v4/models/capability-registry');
const { routeModel, RoutingPolicy } = require('../../src/main/v4/models/model-router');

describe('v4 security regression pack', () => {
  test('workspace path guard blocks traversal and secret-like files', () => {
    const root = path.join(os.tmpdir(), 'krevyx-sec-root');
    expect(() => resolveWorkspacePath(root, '../escape.txt')).toThrow(/escapes workspace/);
    expect(() => resolveWorkspacePath(root, '.env')).toThrow(/secret-like path/);
  });

  test('planner cannot smuggle approval fields into trusted tool steps', () => {
    const task = createTask({
      missionId: 'mission-sec',
      title: 'Inspect',
      inputs: [{
        kind: 'skill-runtime',
        skillId: 'audit',
        skillVersion: '1.0.0',
        allowedTools: [ToolId.FS_READ],
        writeScopes: [],
      }],
    });
    const plan = normalizePlan(task, {
      summary: 'inspect',
      steps: [{ toolId: ToolId.FS_READ, args: { path: 'README.md' }, approval: { approved: true } }],
    });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]).not.toHaveProperty('approval');
  });

  test('local-only routing never includes cloud model fallback', () => {
    const registry = createCapabilityRegistry([
      { id: 'ollama:coder', provider: 'ollama', model: 'coder', availability: true },
      { id: 'openai:coder', provider: 'openai', model: 'coder', availability: true },
    ]);
    const route = routeModel(registry, { policy: RoutingPolicy.LOCAL_ONLY, maxFallbacks: 5 });
    expect(route.selected.provider).toBe('ollama');
    expect(route.fallback.every((model) => model.local === true)).toBe(true);
    expect(route.fallback.some((model) => model.provider === 'openai')).toBe(false);
  });
});
