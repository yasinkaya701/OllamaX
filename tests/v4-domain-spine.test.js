'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createAgentRun,
  createArtifact,
  createEvidence,
  createMission,
  createTask,
  createToolCall,
  createVerificationRun,
  createWorkspace,
} = require('../src/shared/v4/contracts');
const {
  EntityType,
  MissionStatus,
  TaskStatus,
} = require('../src/shared/v4/enums');
const { ErrorCode } = require('../src/shared/v4/errors');
const { assertEntity } = require('../src/shared/v4/schemas');
const {
  canTransitionMission,
  transitionMission,
  transitionTask,
} = require('../src/main/v4/missions/state-machine');
const {
  createStore,
  migrateState,
  STORE_SCHEMA_VERSION,
} = require('../src/main/v4/persistence/store');
const { createRunJournal, parseLines } = require('../src/main/v4/observability/run-journal');
const { serializeEntity, serializeError, toSerializable } = require('../src/main/v4/ipc/serializers');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('v4 domain contracts', () => {
  test('canonical factories create schema-valid durable entities', () => {
    const workspace = createWorkspace({ name: 'Repo', rootPath: '/tmp/repo' });
    const mission = createMission({ workspaceId: workspace.id, title: 'Ship v4', goal: 'Create durable runtime' });
    const task = createTask({ missionId: mission.id, title: 'Persist mission' });
    const run = createAgentRun({ taskId: task.id });
    const artifact = createArtifact({ kind: 'report' });
    const toolCall = createToolCall({ agentRunId: run.id, toolId: 'shell', outputArtifactId: artifact.id });
    const evidence = createEvidence({ subjectType: 'task', subjectId: task.id, sourceArtifactId: artifact.id });
    const verification = createVerificationRun({ subjectId: task.id, gates: ['tests'] });

    for (const [type, entity] of [
      [EntityType.WORKSPACE, workspace],
      [EntityType.MISSION, mission],
      [EntityType.TASK, task],
      [EntityType.AGENT_RUN, run],
      [EntityType.TOOL_CALL, toolCall],
      [EntityType.ARTIFACT, artifact],
      [EntityType.EVIDENCE, evidence],
      [EntityType.VERIFICATION_RUN, verification],
    ]) {
      expect(assertEntity(type, entity)).toBe(entity);
    }

    expect(workspace.id).toMatch(/^ws_/);
    expect(mission.id).toMatch(/^mission_/);
    expect(task.id).toMatch(/^task_/);
  });

  test('mission and task state machines reject illegal transitions without mutation', () => {
    const mission = createMission({ title: 'Mission', goal: 'Goal' });
    expect(canTransitionMission(MissionStatus.DRAFT, MissionStatus.PLANNING)).toBe(true);
    const planning = transitionMission(mission, MissionStatus.PLANNING, { at: '2026-09-13T00:00:00.000Z' });
    expect(planning.status).toBe(MissionStatus.PLANNING);
    expect(planning.updatedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(mission.status).toBe(MissionStatus.DRAFT);

    expect(() => transitionMission(mission, MissionStatus.COMPLETE)).toThrow(
      expect.objectContaining({ code: ErrorCode.STATE_TRANSITION_INVALID }),
    );

    const task = createTask({ missionId: mission.id, title: 'Task' });
    const ready = transitionTask(task, TaskStatus.READY);
    const running = transitionTask(ready, TaskStatus.RUNNING);
    const verifying = transitionTask(running, TaskStatus.VERIFYING);
    expect(transitionTask(verifying, TaskStatus.COMPLETE).status).toBe(TaskStatus.COMPLETE);
  });
});

describe('v4 durable persistence', () => {
  test('mission can be reconstructed after restart without chat history', () => {
    const dir = tempDir('krevyx-v4-store-');
    try {
      const first = createStore({ rootDir: dir });
      const workspace = createWorkspace({ name: 'Repo', rootPath: '/workspace/repo' });
      const mission = createMission({ workspaceId: workspace.id, title: 'Productionize', goal: 'Make repository production-ready' });
      const task = createTask({ missionId: mission.id, title: 'Add verification gates' });

      first.put(EntityType.WORKSPACE, workspace);
      first.put(EntityType.MISSION, mission);
      first.put(EntityType.TASK, task);
      first.update(EntityType.MISSION, mission.id, (current) => transitionMission(current, MissionStatus.PLANNING));
      const revisionBeforeRestart = first.snapshot().revision;

      const second = createStore({ rootDir: dir });
      const resumedMission = second.get(EntityType.MISSION, mission.id);
      const resumedTask = second.get(EntityType.TASK, task.id);
      expect(resumedMission.id).toBe(mission.id);
      expect(resumedMission.status).toBe(MissionStatus.PLANNING);
      expect(resumedMission.goal).toBe('Make repository production-ready');
      expect(resumedTask.missionId).toBe(mission.id);
      expect(second.snapshot().revision).toBe(revisionBeforeRestart);
    } finally {
      removeDir(dir);
    }
  });

  test('store rejects invalid entities before they reach disk', () => {
    const dir = tempDir('krevyx-v4-invalid-');
    try {
      const store = createStore({ rootDir: dir });
      expect(() => store.put(EntityType.MISSION, { id: 'broken' })).toThrow(
        expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
      );
      expect(store.list(EntityType.MISSION)).toEqual([]);
    } finally {
      removeDir(dir);
    }
  });

  test('corrupted primary state recovers from the last atomic backup', () => {
    const dir = tempDir('krevyx-v4-recovery-');
    try {
      const first = createStore({ rootDir: dir });
      const workspace = createWorkspace({ name: 'Recovery', rootPath: '/workspace/recovery' });
      const mission = createMission({ workspaceId: workspace.id, title: 'Backup', goal: 'Exercise recovery' });
      first.put(EntityType.WORKSPACE, workspace);
      first.put(EntityType.MISSION, mission);
      fs.writeFileSync(first.paths.statePath, '{ definitely not json', 'utf8');

      const recovered = createStore({ rootDir: dir });
      expect(recovered.recovery).toBe('backup');
      expect(recovered.get(EntityType.WORKSPACE, workspace.id).id).toBe(workspace.id);
      expect(recovered.get(EntityType.MISSION, mission.id)).toBeNull();
      expect(recovered.quarantined).toHaveLength(1);
      expect(fs.existsSync(recovered.quarantined[0])).toBe(true);
    } finally {
      removeDir(dir);
    }
  });

  test('corrupted primary and backup are quarantined and replaced with a clean store', () => {
    const dir = tempDir('krevyx-v4-fresh-recovery-');
    try {
      const first = createStore({ rootDir: dir });
      const workspace = createWorkspace({ name: 'Recovery', rootPath: '/workspace/recovery' });
      first.put(EntityType.WORKSPACE, workspace);
      fs.writeFileSync(first.paths.statePath, 'bad-primary', 'utf8');
      fs.writeFileSync(first.paths.backupPath, 'bad-backup', 'utf8');

      const recovered = createStore({ rootDir: dir });
      expect(recovered.recovery).toBe('fresh');
      expect(recovered.list(EntityType.WORKSPACE)).toEqual([]);
      expect(recovered.quarantined).toHaveLength(2);
      expect(fs.existsSync(recovered.paths.statePath)).toBe(true);
    } finally {
      removeDir(dir);
    }
  });

  test('schema-zero entity buckets migrate into the current durable schema', () => {
    const legacyMission = createMission({ title: 'Legacy', goal: 'Migrate' });
    const migrated = migrateState({ missions: { [legacyMission.id]: legacyMission } });
    expect(migrated.schemaVersion).toBe(STORE_SCHEMA_VERSION);
    expect(migrated.entities.missions[legacyMission.id].title).toBe('Legacy');
  });
});

describe('v4 run journal and IPC serialization', () => {
  test('journal sequence survives restart and replay ignores malformed lines explicitly', () => {
    const dir = tempDir('krevyx-v4-journal-');
    try {
      const first = createRunJournal({ rootDir: dir });
      const one = first.append({ type: 'mission.created', subjectType: 'mission', subjectId: 'm1' });
      expect(one.sequence).toBe(1);

      const second = createRunJournal({ rootDir: dir });
      const two = second.append({ type: 'mission.planning', subjectType: 'mission', subjectId: 'm1' });
      expect(two.sequence).toBe(2);
      fs.appendFileSync(second.filePath, 'not-json\n', 'utf8');

      const read = second.readAll();
      expect(read.entries.map((entry) => entry.sequence)).toEqual([1, 2]);
      expect(read.invalid).toHaveLength(1);
      const replayed = second.replay((count) => count + 1, 0);
      expect(replayed.value).toBe(2);
      expect(replayed.invalid).toHaveLength(1);
    } finally {
      removeDir(dir);
    }
  });

  test('line parser reports corrupt offsets instead of silently accepting them', () => {
    const parsed = parseLines('{"sequence":1}\nnope\n{"sequence":2}\n');
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.invalid).toEqual([expect.objectContaining({ line: 2 })]);
  });

  test('serializer emits DTO-safe values and stable error codes', () => {
    const mission = createMission({ title: 'DTO', goal: 'Serialize' });
    expect(serializeEntity(EntityType.MISSION, mission)).toEqual(mission);

    const dto = toSerializable({
      date: new Date('2026-09-13T00:00:00.000Z'),
      bytes: Buffer.from('ok'),
      skip: undefined,
      fn: () => true,
    });
    expect(dto).toEqual({ date: '2026-09-13T00:00:00.000Z', bytes: 'b2s=' });

    const circular = {};
    circular.self = circular;
    try {
      toSerializable(circular);
      throw new Error('expected serialization to fail');
    } catch (error) {
      const serialized = serializeError(error);
      expect(serialized.code).toBe(ErrorCode.SERIALIZATION_FAILED);
    }
  });
});
