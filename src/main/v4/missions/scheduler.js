'use strict';

const path = require('path');
const { TaskStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { createTaskGraph } = require('./task-graph');

function normalizeScope(scope) {
  return String(scope || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/{2,}/g, '/')
    .replace(/\/$/, '');
}

function scopesConflict(a, b) {
  const left = normalizeScope(a);
  const right = normalizeScope(b);
  if (!left || !right) return false;
  if (left === '*' || right === '*') return true;
  if (left === right) return true;
  return right.startsWith(`${left}/`) || left.startsWith(`${right}/`);
}

function taskScopes(task, options = {}) {
  if (typeof options.getWriteScopes === 'function') {
    const scopes = options.getWriteScopes(task);
    return Array.isArray(scopes) ? scopes.map(normalizeScope).filter(Boolean) : [];
  }
  if (Array.isArray(task.writeScopes)) return task.writeScopes.map(normalizeScope).filter(Boolean);
  return [];
}

function taskPairConflict(left, right, options) {
  const leftScopes = taskScopes(left, options);
  const rightScopes = taskScopes(right, options);
  for (const a of leftScopes) {
    for (const b of rightScopes) {
      if (scopesConflict(a, b)) return { conflict: true, leftScope: a, rightScope: b };
    }
  }
  return { conflict: false, leftScope: null, rightScope: null };
}

function priorityValue(task) {
  return { CRITICAL: 4, HIGH: 3, NORMAL: 2, LOW: 1 }[task.priority] || 2;
}

function selectRunnableBatch(tasks, options = {}) {
  if (!Array.isArray(tasks)) throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'scheduler requires tasks array');
  const graph = createTaskGraph(tasks);
  const maxParallel = Number.isInteger(options.maxParallel)
    ? Math.max(1, Math.min(64, options.maxParallel))
    : 4;
  const alreadyRunning = tasks.filter((task) => task.status === TaskStatus.RUNNING);
  const ready = graph.readyTasks().sort((a, b) => priorityValue(b) - priorityValue(a) || a.id.localeCompare(b.id));
  const selected = [];
  const deferred = [];

  for (const task of ready) {
    if (selected.length >= Math.max(0, maxParallel - alreadyRunning.length)) {
      deferred.push({ taskId: task.id, reason: 'parallel-limit' });
      continue;
    }

    let conflict = null;
    for (const other of [...alreadyRunning, ...selected]) {
      const pair = taskPairConflict(task, other, options);
      if (pair.conflict) {
        conflict = {
          taskId: task.id,
          reason: 'write-scope-conflict',
          conflictsWith: other.id,
          scope: pair.leftScope,
          otherScope: pair.rightScope,
        };
        break;
      }
    }
    if (conflict) deferred.push(conflict);
    else selected.push(task);
  }

  const failedDependencyBlocks = graph.blockedByFailedDependencies().map((task) => ({
    taskId: task.id,
    reason: 'failed-dependency',
    failedDependencyIds: graph.dependencyState(task.id).failedDependencyIds,
  }));

  return {
    selected,
    deferred: [...deferred, ...failedDependencyBlocks],
    capacity: Math.max(0, maxParallel - alreadyRunning.length),
    runningTaskIds: alreadyRunning.map((task) => task.id),
  };
}

function resolveScope(rootPath, scope) {
  const normalized = normalizeScope(scope);
  if (!normalized || normalized === '*') return normalized;
  const root = path.resolve(rootPath);
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `write scope escapes workspace: ${scope}`);
  }
  return normalizeScope(relative);
}

module.exports = {
  normalizeScope,
  scopesConflict,
  taskScopes,
  taskPairConflict,
  selectRunnableBatch,
  resolveScope,
};
