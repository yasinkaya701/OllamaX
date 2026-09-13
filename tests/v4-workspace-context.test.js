'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { inspectRepository } = require('../src/main/v4/workspace/repo-inspector');
const { refreshWorkspaceContext } = require('../src/main/v4/workspace/workspace-context');
const { createProjectMemory, MemoryKind, MemoryStatus } = require('../src/main/v4/memory/project-memory');

describe('v4 workspace context', () => {
  test('repository changes stale old repo facts before context retrieval', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-context-'));
    const memoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v4-context-memory-'));
    try {
      fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}\n', 'utf8');
      fs.mkdirSync(path.join(root, 'src'));
      fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 1;\n', 'utf8');
      const previousInventory = inspectRepository(root);
      const memory = createProjectMemory({ rootDir: memoryRoot });
      const fact = memory.add({
        workspaceId: 'ws-context',
        kind: MemoryKind.REPO_FACT,
        content: 'src/app.js exports the value one.',
        source: { type: 'file', id: 'src/app.js' },
        sourceHash: previousInventory.inventoryHash,
      }).record;

      fs.writeFileSync(path.join(root, 'src', 'app.js'), 'module.exports = 2;\n', 'utf8');
      const refreshed = refreshWorkspaceContext({
        rootPath: root,
        workspaceId: 'ws-context',
        previousInventory,
        memory,
        query: 'app exports',
      });

      expect(refreshed.inventory.inventoryHash).not.toBe(previousInventory.inventoryHash);
      expect(refreshed.invalidatedMemory).toBe(1);
      expect(memory.get(fact.id).status).toBe(MemoryStatus.STALE);
      expect(refreshed.context.memory.find((record) => record.id === fact.id)).toBeUndefined();
      expect(refreshed.context.entries.find((entry) => entry.path === 'src/app.js').content).toContain('2');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(memoryRoot, { recursive: true, force: true });
    }
  });
});
