'use strict';

const { createTask } = require('../src/shared/v4/contracts');
const { TaskStatus } = require('../src/shared/v4/enums');
const { ErrorCode } = require('../src/shared/v4/errors');
const { createTaskGraph } = require('../src/main/v4/missions/task-graph');
const {
  resolveScope,
  scopesConflict,
  selectRunnableBatch,
} = require('../src/main/v4/missions/scheduler');

function task(id, dependencies = [], extra = {}) {
  return {
    ...createTask({ id, missionId: 'mission_1', title: id, dependencies }),
    ...extra,
  };
}

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('v4 task graph', () => {
  test('three-task dependency graph exposes tasks in deterministic order', () => {
    const first = task('a');
    const second = task('b', ['a']);
    const third = task('c', ['b']);
    const graph = createTaskGraph([third, first, second]);

    expect(graph.topologicalOrder()).toEqual(['a', 'b', 'c']);
    expect(graph.readyTasks().map((item) => item.id)).toEqual(['a']);

    first.status = TaskStatus.COMPLETE;
    expect(graph.readyTasks().map((item) => item.id)).toEqual(['b']);
    second.status = TaskStatus.COMPLETE;
    expect(graph.readyTasks().map((item) => item.id)).toEqual(['c']);
  });

  test('unknown and cyclic dependencies fail closed', () => {
    expectCode(
      () => createTaskGraph([task('a', ['missing'])]),
      ErrorCode.VALIDATION_FAILED,
    );
    expectCode(
      () => createTaskGraph([task('a', ['b']), task('b', ['a'])]),
      ErrorCode.VALIDATION_FAILED,
    );
  });

  test('failed dependency is surfaced as a downstream block', () => {
    const dependency = task('dep', [], { status: TaskStatus.FAILED });
    const downstream = task('downstream', ['dep']);
    const graph = createTaskGraph([dependency, downstream]);
    expect(graph.blockedByFailedDependencies().map((item) => item.id)).toEqual(['downstream']);
    expect(graph.dependencyState('downstream')).toEqual(expect.objectContaining({
      satisfied: false,
      blockedByFailure: true,
      failedDependencyIds: ['dep'],
    }));
  });
});

describe('v4 conflict-aware scheduler', () => {
  test('two non-conflicting tasks can be scheduled in parallel', () => {
    const tasks = [
      task('api', [], { writeScopes: ['src/api'] }),
      task('ui', [], { writeScopes: ['src/ui'] }),
    ];
    const batch = selectRunnableBatch(tasks, { maxParallel: 2 });
    expect(batch.selected.map((item) => item.id)).toEqual(['api', 'ui']);
    expect(batch.deferred).toEqual([]);
  });

  test('conflicting write scopes are serialized', () => {
    const tasks = [
      task('one', [], { writeScopes: ['src/core'] }),
      task('two', [], { writeScopes: ['src/core/runtime'] }),
    ];
    const batch = selectRunnableBatch(tasks, { maxParallel: 2 });
    expect(batch.selected).toHaveLength(1);
    expect(batch.deferred).toEqual([
      expect.objectContaining({
        taskId: 'two',
        reason: 'write-scope-conflict',
        conflictsWith: 'one',
      }),
    ]);
  });

  test('already-running task consumes capacity and protects its write scope', () => {
    const tasks = [
      task('running', [], { status: TaskStatus.RUNNING, writeScopes: ['src/core'] }),
      task('conflict', [], { writeScopes: ['src/core/file.js'] }),
      task('free', [], { writeScopes: ['docs'] }),
    ];
    const batch = selectRunnableBatch(tasks, { maxParallel: 2 });
    expect(batch.runningTaskIds).toEqual(['running']);
    expect(batch.selected.map((item) => item.id)).toEqual(['free']);
    expect(batch.deferred).toEqual([
      expect.objectContaining({ taskId: 'conflict', reason: 'write-scope-conflict' }),
    ]);
  });

  test('scope matching is hierarchical and workspace escape is rejected', () => {
    expect(scopesConflict('src', 'src/main/index.js')).toBe(true);
    expect(scopesConflict('src/main', 'src/renderer')).toBe(false);
    expect(resolveScope('/workspace/repo', 'src/main')).toBe('src/main');
    expectCode(() => resolveScope('/workspace/repo', '../outside'), ErrorCode.VALIDATION_FAILED);
  });
});
