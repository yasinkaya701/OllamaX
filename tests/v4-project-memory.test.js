'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  MemoryKind,
  MemoryStatus,
  createProjectMemory,
} = require('../src/main/v4/memory/project-memory');

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-memory-'));
}

describe('v4 project memory', () => {
  const roots = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  test('persists provenance records and deduplicates equivalent facts', () => {
    const root = makeRoot();
    roots.push(root);
    const memory = createProjectMemory({ rootDir: root });
    const first = memory.add({
      workspaceId: 'ws-1',
      kind: MemoryKind.REPO_FACT,
      content: 'Renderer context isolation is enabled.',
      tags: ['electron'],
      confidence: 0.8,
      source: { type: 'evidence', id: 'ev-1' },
      sourceHash: 'inventory-a',
    });
    const second = memory.add({
      workspaceId: 'ws-1',
      kind: MemoryKind.REPO_FACT,
      content: ' Renderer context isolation is enabled. ',
      tags: ['security'],
      confidence: 0.95,
      source: { type: 'evidence', id: 'ev-2' },
      sourceHash: 'inventory-a',
    });
    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.record.id).toBe(first.record.id);
    const restarted = createProjectMemory({ rootDir: root });
    expect(restarted.get(first.record.id).source.id).toBe('ev-2');
    expect(restarted.list({ workspaceId: 'ws-1' })).toHaveLength(1);
  });

  test('stale and retracted records stay out of normal retrieval', () => {
    const root = makeRoot();
    roots.push(root);
    const memory = createProjectMemory({ rootDir: root });
    const record = memory.add({
      workspaceId: 'ws-2',
      kind: MemoryKind.DECISION,
      content: 'Use argument-array process execution in v4.',
      tags: ['process', 'security'],
      source: { type: 'task', id: 'security-task' },
    }).record;
    expect(memory.search('process security', { workspaceId: 'ws-2', touch: false })[0].id).toBe(record.id);
    memory.markStale(record.id, 'policy changed');
    expect(memory.search('process security', { workspaceId: 'ws-2', touch: false })).toEqual([]);
    expect(memory.search('process security', { workspaceId: 'ws-2', includeInactive: true, touch: false })[0].status).toBe(MemoryStatus.STALE);
    memory.retract(record.id, 'superseded');
    expect(memory.list({ workspaceId: 'ws-2' })).toEqual([]);
  });

  test('source and repository hash changes invalidate only affected memory', () => {
    const root = makeRoot();
    roots.push(root);
    const memory = createProjectMemory({ rootDir: root });
    const fact = memory.add({
      workspaceId: 'ws-3',
      kind: MemoryKind.REPO_FACT,
      content: 'CI runs with Node 22.',
      source: { type: 'file', id: 'ci-workflow' },
      sourceHash: 'old-inventory',
    }).record;
    const decision = memory.add({
      workspaceId: 'ws-3',
      kind: MemoryKind.DECISION,
      content: 'Keep v4 behind an explicit feature flag.',
      source: { type: 'mission', id: 'mission-1' },
      sourceHash: 'old-inventory',
    }).record;
    expect(memory.invalidateHashMismatch('ws-3', 'new-inventory')).toBe(1);
    expect(memory.get(fact.id).status).toBe(MemoryStatus.STALE);
    expect(memory.get(decision.id).status).toBe(MemoryStatus.ACTIVE);
    expect(memory.invalidateBySource('mission', 'mission-1', 'mission changed')).toBe(1);
    expect(memory.get(decision.id).status).toBe(MemoryStatus.STALE);
  });
});
