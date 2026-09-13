'use strict';

const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { getManifest: getToolManifest } = require('../tools/tool-registry');
const { normalizeGate } = require('../verification/gates');

const SKILL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function parseVersion(value) {
  const text = String(value || '').trim();
  const match = VERSION_PATTERN.exec(text);
  if (!match) throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid skill version: ${value}`);
  return { raw: text, major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left, right) {
  const a = typeof left === 'string' ? parseVersion(left) : left;
  const b = typeof right === 'string' ? parseVersion(right) : right;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] - b[key];
  }
  return 0;
}

function validateAcceptedExitCodes(value, taskId, stepIndex) {
  if (value === undefined) return [0];
  if (!Array.isArray(value) || value.length === 0) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task ${taskId} step ${stepIndex + 1} acceptedExitCodes must be a non-empty array`);
  }
  const codes = Array.from(new Set(value.map(Number)));
  if (codes.some((code) => !Number.isInteger(code) || code < 0 || code > 255)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task ${taskId} step ${stepIndex + 1} has invalid accepted exit code`);
  }
  return codes;
}

function validateTask(task, index, allowedTools) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task ${index + 1} must be an object`);
  }
  const id = String(task.id || `task-${index + 1}`).trim();
  const title = String(task.title || '').trim();
  if (!id || !title) throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task ${index + 1} requires id and title`);
  const toolPlan = Array.isArray(task.toolPlan) ? task.toolPlan.map((step, stepIndex) => {
    const toolId = String((step && step.toolId) || '').trim();
    if (!allowedTools.has(toolId)) {
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task ${id} uses undeclared tool: ${toolId || '(empty)'}`);
    }
    return {
      id: String(step.id || `step-${stepIndex + 1}`),
      toolId,
      args: clone(step.args || {}),
      approval: step.approval || null,
      acceptedExitCodes: validateAcceptedExitCodes(step.acceptedExitCodes, id, stepIndex),
    };
  }) : [];
  return {
    id,
    title,
    description: String(task.description || '').trim(),
    dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(String) : [],
    writeScopes: Array.isArray(task.writeScopes) ? task.writeScopes.map(String) : [],
    requiredCapabilities: Array.isArray(task.requiredCapabilities) ? task.requiredCapabilities.map(String) : [],
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria.map(String) : [],
    toolPlan,
    verificationGates: Array.isArray(task.verificationGates)
      ? task.verificationGates.map((gate, gateIndex) => normalizeGate(gate, gateIndex))
      : [],
  };
}

function assertAcyclicTasks(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(taskId) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      const cycleStart = stack.indexOf(taskId);
      const cycle = [...stack.slice(Math.max(0, cycleStart)), taskId];
      throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill task dependency cycle: ${cycle.join(' -> ')}`, { cycle });
    }
    visiting.add(taskId);
    stack.push(taskId);
    const task = byId.get(taskId);
    for (const dependency of task.dependencies) visit(dependency);
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const task of tasks) visit(task.id);
  return true;
}

function validateSkillManifest(input = {}) {
  const id = String(input.id || '').trim();
  if (!SKILL_ID_PATTERN.test(id)) throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid skill id: ${id || '(empty)'}`);
  const version = parseVersion(input.version).raw;
  const title = String(input.title || '').trim();
  if (!title) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'skill title is required');
  const allowedTools = Array.isArray(input.allowedTools) ? Array.from(new Set(input.allowedTools.map(String))) : [];
  for (const toolId of allowedTools) {
    if (!getToolManifest(toolId)) throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill references unknown tool: ${toolId}`);
  }
  const tasks = Array.isArray(input.tasks)
    ? input.tasks.map((task, index) => validateTask(task, index, new Set(allowedTools)))
    : [];
  if (!tasks.length) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'skill must define at least one task');
  const taskIds = new Set(tasks.map((task) => task.id));
  if (taskIds.size !== tasks.length) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'skill task ids must be unique');
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!taskIds.has(dependency) || dependency === task.id) {
        throw new V4Error(ErrorCode.VALIDATION_FAILED, `invalid dependency ${dependency} for task ${task.id}`);
      }
    }
  }
  assertAcyclicTasks(tasks);
  return {
    id,
    version,
    title,
    description: String(input.description || '').trim(),
    category: String(input.category || 'engineering'),
    allowedTools,
    requiredCapabilities: Array.isArray(input.requiredCapabilities) ? input.requiredCapabilities.map(String) : [],
    inputKeys: Array.isArray(input.inputKeys) ? Array.from(new Set(input.inputKeys.map(String))) : [],
    tasks,
    defaultVerificationGates: Array.isArray(input.defaultVerificationGates)
      ? input.defaultVerificationGates.map((gate, index) => normalizeGate(gate, index))
      : [],
    metadata: clone(input.metadata || {}),
  };
}

function readInput(input, key) {
  let cursor = input;
  for (const part of String(key).split('.').filter(Boolean)) {
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, part)) return '';
    cursor = cursor[part];
  }
  return cursor == null ? '' : (typeof cursor === 'object' ? JSON.stringify(cursor) : String(cursor));
}

function render(value, input) {
  if (typeof value === 'string') {
    return value.replace(/\{\{input\.([A-Za-z0-9_.-]+)\}\}/g, (_match, key) => readInput(input, key));
  }
  if (Array.isArray(value)) return value.map((item) => render(item, input));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = render(item, input);
    return output;
  }
  return value;
}

function compileSkill(manifest, input = {}) {
  const missing = manifest.inputKeys.filter((key) => readInput(input, key) === '');
  if (missing.length) throw new V4Error(ErrorCode.INVALID_ARGUMENT, `missing skill input: ${missing.join(', ')}`);
  return {
    skill: { id: manifest.id, version: manifest.version, title: manifest.title },
    allowedTools: clone(manifest.allowedTools),
    requiredCapabilities: clone(manifest.requiredCapabilities),
    tasks: render(clone(manifest.tasks), input),
    defaultVerificationGates: render(clone(manifest.defaultVerificationGates), input),
    compiledAt: new Date().toISOString(),
  };
}

function createSkillRegistry(options = {}) {
  const entries = new Map();
  function register(input, source = 'runtime') {
    const manifest = validateSkillManifest(input);
    const key = `${manifest.id}@${manifest.version}`;
    if (entries.has(key) && options.allowReplace !== true) throw new V4Error(ErrorCode.VALIDATION_FAILED, `skill already registered: ${key}`);
    entries.set(key, { manifest, source });
    return clone(manifest);
  }
  function get(id, version = null) {
    if (version) return clone((entries.get(`${id}@${version}`) || {}).manifest || null);
    const matches = Array.from(entries.values()).filter((entry) => entry.manifest.id === id);
    matches.sort((a, b) => compareVersions(b.manifest.version, a.manifest.version));
    return matches.length ? clone(matches[0].manifest) : null;
  }
  function list() {
    return Array.from(entries.values())
      .map((entry) => ({ ...clone(entry.manifest), source: entry.source }))
      .sort((a, b) => a.id.localeCompare(b.id) || compareVersions(b.version, a.version));
  }
  function compile(id, input = {}, version = null) {
    const manifest = get(id, version);
    if (!manifest) throw new V4Error(ErrorCode.NOT_FOUND, `skill not found: ${id}`);
    return compileSkill(manifest, input);
  }
  return { register, get, list, compile };
}

module.exports = {
  SKILL_ID_PATTERN,
  VERSION_PATTERN,
  parseVersion,
  compareVersions,
  validateAcceptedExitCodes,
  assertAcyclicTasks,
  validateSkillManifest,
  compileSkill,
  createSkillRegistry,
};
