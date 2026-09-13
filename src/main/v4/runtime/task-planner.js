'use strict';

const crypto = require('crypto');
const { EntityType } = require('../../../shared/v4/enums');
const { ErrorCode, V4Error } = require('../../../shared/v4/errors');
const { validateArgs, getManifest, ToolId } = require('../tools/tool-registry');
const { assertSkillStepAllowed } = require('./agent-runtime');

function runtimeInput(task) {
  return Array.isArray(task && task.inputs)
    ? task.inputs.find((item) => item && item.kind === 'skill-runtime') || null
    : null;
}

function extractJson(text) {
  const source = String(text || '').trim();
  if (!source) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'planner returned empty output');
  const unfenced = source.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(unfenced); } catch { /* try embedded object */ }
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'planner output does not contain JSON object');
  try { return JSON.parse(unfenced.slice(start, end + 1)); } catch (error) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, `planner JSON is invalid: ${error.message}`);
  }
}

function contextExcerpt(contextPack, maxChars = 36000) {
  const entries = Array.isArray(contextPack && contextPack.entries) ? contextPack.entries : [];
  let used = 0;
  const parts = [];
  for (const entry of entries) {
    const header = `\n--- ${entry.path} [sha256:${entry.hash || 'unknown'}] ---\n`;
    const body = String(entry.content || '');
    const room = maxChars - used - header.length;
    if (room <= 0) break;
    const clipped = body.slice(0, room);
    parts.push(header, clipped);
    used += header.length + clipped.length;
  }
  return parts.join('');
}

function buildPlannerMessages(task, contextPack) {
  const runtime = runtimeInput(task);
  if (!runtime) throw new V4Error(ErrorCode.VALIDATION_FAILED, `task has no skill runtime policy: ${task.id}`);
  const system = [
    'You are the Krevyx engineering task planner.',
    'Return JSON only: {"summary":"...","steps":[{"toolId":"...","args":{...}}]}.',
    `Allowed tools: ${(runtime.allowedTools || []).join(', ') || '(none)'}.`,
    `Allowed write scopes: ${(runtime.writeScopes || []).join(', ') || '(none)'}.`,
    'Never include approval, shell strings, push, merge, force operations, or paths outside write scopes.',
    'For fs.write overwrites, use the exact sha256 from context as expectedHash; omit expectedHash only for new files.',
    'Prefer the smallest bounded plan that satisfies the acceptance criteria.',
  ].join('\n');
  const user = [
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : '',
    `Acceptance criteria: ${(task.acceptanceCriteria || []).join(' | ') || '(none)'}`,
    'Workspace context:',
    contextExcerpt(contextPack),
  ].filter(Boolean).join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function normalizePlan(task, rawPlan) {
  const runtime = runtimeInput(task);
  if (!runtime) throw new V4Error(ErrorCode.VALIDATION_FAILED, `task has no runtime policy: ${task.id}`);
  if (!rawPlan || !Array.isArray(rawPlan.steps) || !rawPlan.steps.length) {
    throw new V4Error(ErrorCode.VALIDATION_FAILED, 'planner must return at least one tool step');
  }
  if (rawPlan.steps.length > 32) throw new V4Error(ErrorCode.VALIDATION_FAILED, 'planner returned too many steps');

  const steps = rawPlan.steps.map((candidate, index) => {
    const toolId = String(candidate && candidate.toolId || '').trim();
    if (!getManifest(toolId)) throw new V4Error(ErrorCode.VALIDATION_FAILED, `planner referenced unknown tool: ${toolId}`);
    const args = candidate && candidate.args && typeof candidate.args === 'object' && !Array.isArray(candidate.args)
      ? JSON.parse(JSON.stringify(candidate.args))
      : {};
    validateArgs(toolId, args);
    const step = {
      id: `planned-${index + 1}`,
      toolId,
      args,
    };
    if (toolId === ToolId.SHELL_RUN && Array.isArray(candidate.acceptedExitCodes)) {
      step.acceptedExitCodes = candidate.acceptedExitCodes
        .filter((code) => Number.isInteger(code) && code >= 0 && code <= 255)
        .slice(0, 8);
    }
    assertSkillStepAllowed(task, step);
    return step;
  });

  return {
    summary: String(rawPlan.summary || '').slice(0, 2000),
    steps,
  };
}

function createTaskPlanner(options = {}) {
  const store = options.store;
  const journal = options.journal || null;
  const modelInvoker = options.modelInvoker;
  if (!store || typeof store.get !== 'function' || typeof store.update !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'task planner requires durable store');
  }
  if (typeof modelInvoker !== 'function') {
    throw new V4Error(ErrorCode.INVALID_ARGUMENT, 'task planner requires modelInvoker');
  }

  async function planTask(input = {}) {
    const task = store.get(EntityType.TASK, input.taskId);
    if (!task) throw new V4Error(ErrorCode.NOT_FOUND, `task not found: ${input.taskId}`);
    const runtime = runtimeInput(task);
    if (!runtime) throw new V4Error(ErrorCode.VALIDATION_FAILED, `task has no skill runtime policy: ${task.id}`);
    if (Array.isArray(runtime.toolPlan) && runtime.toolPlan.length && input.replace !== true) {
      return { task, plan: { summary: 'Existing trusted plan retained.', steps: runtime.toolPlan }, reused: true };
    }

    const messages = buildPlannerMessages(task, input.contextPack || null);
    const response = await modelInvoker({ messages, task, contextPack: input.contextPack || null });
    const content = typeof response === 'string' ? response : response && response.content;
    const rawPlan = extractJson(content);
    const plan = normalizePlan(task, rawPlan);
    const promptDigest = crypto.createHash('sha256').update(JSON.stringify(messages)).digest('hex');
    const generatedAt = new Date().toISOString();

    const updated = store.update(EntityType.TASK, task.id, (current) => ({
      ...current,
      inputs: current.inputs.map((item) => item && item.kind === 'skill-runtime'
        ? {
            ...item,
            toolPlan: plan.steps,
            planner: {
              generatedAt,
              summary: plan.summary,
              promptDigest,
              provider: response && response.provider || null,
              model: response && response.model || null,
            },
          }
        : item),
    }));

    if (journal && typeof journal.append === 'function') {
      journal.append({
        type: 'task.plan-generated',
        subjectType: 'task',
        subjectId: task.id,
        payload: { stepCount: plan.steps.length, promptDigest, provider: response && response.provider || null, model: response && response.model || null },
      });
    }
    return { task: updated, plan, reused: false };
  }

  return { planTask };
}

module.exports = {
  runtimeInput,
  extractJson,
  contextExcerpt,
  buildPlannerMessages,
  normalizePlan,
  createTaskPlanner,
};
