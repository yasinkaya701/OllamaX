'use strict';

const { TaskStatus } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');

function taskMap(tasks = []) {
  const map = new Map();
  for (const task of tasks) {
    if (!task || !task.id) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'task graph contains a task without id');
    if (map.has(task.id)) throw new V4Error(ErrorCode.VALIDATION_FAILED, `duplicate task id: ${task.id}`);
    map.set(task.id, task);
  }
  return map;
}

function validateDependencies(map) {
  for (const task of map.values()) {
    for (const dependencyId of task.dependencies || []) {
      if (!map.has(dependencyId)) {
        throw new V4Error(ErrorCode.VALIDATION_FAILED, `unknown dependency ${dependencyId} for task ${task.id}`, {
          taskId: task.id,
          dependencyId,
        });
      }
      if (dependencyId === task.id) {
        throw new V4Error(ErrorCode.VALIDATION_FAILED, `task cannot depend on itself: ${task.id}`);
      }
    }
  }
}

function detectCycle(map) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(id) {
    if (visited.has(id)) return null;
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    visiting.add(id);
    stack.push(id);
    const task = map.get(id);
    for (const dependencyId of task.dependencies || []) {
      const cycle = visit(dependencyId);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of map.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

function createTaskGraph(tasks = []) {
  const map = taskMap(tasks);
  validateDependencies(map);
  const cycle = detectCycle(map);
  if (cycle) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `task dependency cycle detected: ${cycle.join(' -> ')}`, { cycle });
  }

  const dependents = new Map(Array.from(map.keys(), (id) => [id, []]));
  for (const task of map.values()) {
    for (const dependencyId of task.dependencies || []) dependents.get(dependencyId).push(task.id);
  }

  function get(id) {
    return map.get(id) || null;
  }

  function dependenciesOf(id) {
    const task = get(id);
    return task ? (task.dependencies || []).map((dependencyId) => get(dependencyId)) : [];
  }

  function dependentsOf(id) {
    return (dependents.get(id) || []).map((taskId) => get(taskId));
  }

  function dependencyState(id) {
    const dependencies = dependenciesOf(id);
    const failed = dependencies.filter((task) => [TaskStatus.FAILED, TaskStatus.CANCELLED].includes(task.status));
    const incomplete = dependencies.filter((task) => task.status !== TaskStatus.COMPLETE);
    return {
      satisfied: incomplete.length === 0,
      blockedByFailure: failed.length > 0,
      failedDependencyIds: failed.map((task) => task.id),
      incompleteDependencyIds: incomplete.map((task) => task.id),
    };
  }

  function readyTasks() {
    return Array.from(map.values()).filter((task) => {
      if (![TaskStatus.PENDING, TaskStatus.READY].includes(task.status)) return false;
      return dependencyState(task.id).satisfied;
    });
  }

  function blockedByFailedDependencies() {
    return Array.from(map.values()).filter((task) => dependencyState(task.id).blockedByFailure);
  }

  function topologicalOrder() {
    const indegree = new Map(Array.from(map.keys(), (id) => [id, 0]));
    for (const task of map.values()) indegree.set(task.id, (task.dependencies || []).length);
    const queue = Array.from(map.keys()).filter((id) => indegree.get(id) === 0).sort();
    const order = [];
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const dependentId of dependents.get(id) || []) {
        const next = indegree.get(dependentId) - 1;
        indegree.set(dependentId, next);
        if (next === 0) {
          queue.push(dependentId);
          queue.sort();
        }
      }
    }
    return order;
  }

  return {
    get,
    list: () => Array.from(map.values()),
    dependenciesOf,
    dependentsOf,
    dependencyState,
    readyTasks,
    blockedByFailedDependencies,
    topologicalOrder,
  };
}

module.exports = {
  createTaskGraph,
  detectCycle,
};
