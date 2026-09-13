'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWorkspace, createMission, createTask } = require('../../src/shared/v4/contracts');
const { EntityType } = require('../../src/shared/v4/enums');
const { createStore } = require('../../src/main/v4/persistence/store');
const { createRunJournal } = require('../../src/main/v4/observability/run-journal');

describe('v4 recovery pack', () => {
  test('recovers durable entities from backup and quarantines corrupt primary state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-recovery-'));
    try {
      const store = createStore({ rootDir: root });
      const workspace = createWorkspace({ name: 'Fixture', rootPath: root });
      const mission = createMission({ workspaceId: workspace.id, title: 'Recover me', goal: 'verify recovery' });
      const task = createTask({ missionId: mission.id, title: 'Persist me' });
      store.put(EntityType.WORKSPACE, workspace);
      store.put(EntityType.MISSION, mission);
      store.put(EntityType.TASK, task);
      store.update(EntityType.TASK, task.id, (current) => ({ ...current, description: 'latest write' }));

      fs.writeFileSync(store.paths.statePath, '{ this is corrupted', 'utf8');
      const recovered = createStore({ rootDir: root });
      expect(recovered.recovery).toBe('backup');
      expect(recovered.get(EntityType.WORKSPACE, workspace.id)).not.toBeNull();
      expect(recovered.get(EntityType.MISSION, mission.id)).not.toBeNull();
      expect(recovered.get(EntityType.TASK, task.id)).not.toBeNull();
      expect(recovered.quarantined.length).toBeGreaterThan(0);
      expect(recovered.quarantined.every((file) => file.includes('.corrupt-'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('run journal continues monotonic sequence after restart', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-journal-recovery-'));
    try {
      const first = createRunJournal({ rootDir: root });
      const event1 = first.append({ type: 'fixture.one', subjectType: 'mission', subjectId: 'm1' });
      const second = createRunJournal({ rootDir: root });
      const event2 = second.append({ type: 'fixture.two', subjectType: 'mission', subjectId: 'm1' });
      expect(event2.sequence).toBe(event1.sequence + 1);
      expect(second.readAll().entries.map((entry) => entry.type)).toEqual(['fixture.one', 'fixture.two']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
