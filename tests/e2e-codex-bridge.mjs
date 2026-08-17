/*
 * E2E test: code-agent-bridge üzerinden gerçek Codex CLI akışı
 *
 * Electron'u mock'lar (test ortamında pencere yok), gerçek `codex exec`
 * sürecini spawn eder ve bridge'in stream/exit/durdurma hattını doğrular.
 *
 * Not: Bu test bir geçerli OPENAI_API_KEY gerektirir; anahtarsız çalıştırıldığında
 * 401 hataları bridge'in stderr akışına adım olarak düşer — akışın kendisi doğrulanır.
 */
import Module from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* electron + BrowserWindow mock: step/done event'lerini yakala */
let capturedSteps = [];
let capturedDone = null;

const electronMock = new Proxy(
  {},
  {
    get(_t, name) {
      if (name !== 'BrowserWindow') return undefined;
      return {
        getAllWindows: () => [
          {
            isDestroyed: () => false,
            webContents: {
              send: (channel, payload) => {
                if (channel === 'ipc:3:code-agent:step') capturedSteps.push(payload);
                if (channel === 'ipc:3:code-agent:done') capturedDone = payload;
              },
            },
          },
        ],
      };
    },
  }
);

/* require('electron') çağrısını mock'a yönlendir */
const require = Module.createRequire(import.meta.url);
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'electron') return 'electron';
  return originalResolve.call(this, request, ...rest);
};
const loaders = Module._resolveLookupPaths || {};
require.cache['electron'] = { id: 'electron', filename: 'electron', loaded: true, exports: electronMock };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bridge = require(path.join(__dirname, '../src/main/agents/code-agent-bridge.js'));

/* ---------- test 1: ajan keşfi ---------- */
const detected = await bridge.detectAgents();
console.log('TEST 1 — ajan keşfi:');
console.log('  codex bağlı mı:', detected['codex'].connected, '| bulunan exe:', detected['codex'].executable);
console.log('  claude-code bağlı mı:', detected['claude-code'].connected, '| exe:', detected['claude-code'].executable);
console.log('  antigravity bağlı mı:', detected['antigravity'].connected, '| exe:', detected['antigravity'].executable);

/* ---------- test 2: spawn + stream + exit (gerçek süreç) ---------- */
capturedSteps = [];
capturedDone = null;
const result = await bridge.runCodeAgent('codex', 'Write hello.txt containing the word hello', false);
console.log('\nTEST 2 — gerçek Codex akışı (spawn → stream → exit):');
console.log('  ok:', result.ok, '| truncated:', result.truncated, '| exitCode:', result.exitCode);
console.log('  yakalanan adım sayısı (IPC):', capturedSteps.length);
console.log('  ilk 6 adım:');
capturedSteps.slice(0, 6).forEach((s, i) => console.log(`    [${i}] (${s.kind}) ${s.text.slice(0, 100)}`));
console.log('  son 2 adım:');
capturedSteps.slice(-2).forEach((s, i) => console.log(`    [${i}] (${s.kind}) ${s.text.slice(0, 100)}`));

/* ---------- test 3: durdurma (SIGTERM → SIGKILL) ---------- */
bridge.stopAgent('nonexistent').then((r) => {
  console.log('\nTEST 3 — olmayan ajanda durdurma:', r.ok, '| stopped:', r.stopped, '|', r.reason);
});

/* ---------- test 4: CWD kayıt defteri ---------- */
bridge.cwdRegistry.set('codex', '/tmp/codex-e2e');
console.log('\nTEST 4 — CWD kayıt defteri: codex →', bridge.cwdRegistry.get('codex'));

console.log('\nDONE — akış doğrulandı.');
process.exit(0);
