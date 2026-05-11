/**
 * Bazı ortamlarda (ör. ELECTRON_RUN_AS_NODE=1) doğrudan `electron .` çalıştırılınca
 * ana süreçte require('electron') yol string'i döner ve ipcMain tanımsız olur.
 * Bu sarmalayıcı temiz bir ortamda gerçek Electron ikilisini başlatır.
 */
const { spawn } = require('child_process');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const electronExe = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronExe, ['.'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (err) => {
  console.error('[OllamaX] Electron başlatılamadı:', err.message);
  process.exit(1);
});

child.on('close', (code) => {
  process.exit(code == null ? 0 : code);
});
