'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask, createAgentRun } = require('../src/shared/v4/contracts');
const { EntityType } = require('../src/shared/v4/enums');
const { createStore } = require('../src/main/v4/persistence/store');
const { createRunJournal } = require('../src/main/v4/observability/run-journal');
const { summarizeMissionUsage } = require('../src/main/v4/observability/cost-attribution');
const { buildDiagnosticBundle } = require('../src/main/v4/observability/diagnostic-bundle');

describe('v4 final observability', () => {
  test('attributes planner and agent usage to a mission', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-cost-'));
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
      const mission = createMission({ workspaceId: workspace.id, title: 'Mission' });
      const task = createTask({
        missionId: mission.id,
        title: 'Task',
        inputs: [{ kind: 'skill-runtime', planner: { usage: { promptTokens: 100, completionTokens: 20, costUsd: 0 } } }],
      });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);
      store.put(EntityType.AGENT_RUN, createAgentRun({
        taskId: task.id,
        usage: { promptTokens: 30, completionTokens: 10, costUsd: 0.02 },
      }));
      const summary = summarizeMissionUsage(store, mission.id);
      expect(summary.total.promptTokens).toBe(130);
      expect(summary.total.completionTokens).toBe(30);
      expect(summary.total.totalTokens).toBe(160);
      expect(summary.total.costUsd).toBeCloseTo(0.02);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('diagnostic bundle redacts secrets and absolute paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-diag-'));
    try {
      const store = createStore({ rootDir: path.join(root, '.state') });
      const journal = createRunJournal({ rootDir: path.join(root, '.journal') });
      journal.append({
        type: 'fixture',
        subjectType: 'task',
        subjectId: 'task-1',
        payload: {
          apiKey: 'sk-supersecretvalue',
          rootPath: '/Users/test/private/repo',
          note: 'Bearer abcdefghijklmnop',
          safe: 'ok',
        },
      });
      const bundle = buildDiagnosticBundle({
        store,
        journal,
        config: { schemaVersion: 4, features: { v4Workspace: true }, providers: { secret: 'do-not-export' } },
        appVersion: 'test',
      });
      const payload = bundle.recentEvents[0].payload;
      expect(payload.apiKey).toBe('<redacted>');
      expect(payload.rootPath).toBe('<path>');
      expect(payload.note).toContain('<redacted>');
      expect(payload.safe).toBe('ok');
      expect(JSON.stringify(bundle)).not.toContain('do-not-export');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
