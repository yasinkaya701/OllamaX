const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set([
  'get-models', 'pull-model', 'chat', 'openai-chat', 'anthropic-chat', 'gemini-chat',
  'github-search', 'get-featured-repos', 'git-clone', 'list-dir', 'read-file',
  'open-folder-dialog', 'get-workspaces', 'get-stats',
  'terminal-input', 'terminal-resize', 'terminal-close',
  'tool-approval-response', // AgentLoop onay köprüsü (F2.4)
  'agent-run', // Orkestrasyon: lokal ajana görev gönder (F3)
  'agent-chain', // Orkestrasyon: zincir modu (Claude → Codex → Antigravity)
]);

const ON = new Set([
  'models-list', 'chat-chunk', 'chat-done', 'stats', 'github-results', 'featured-repos', 'exec-output',
  'git-done', 'dir-contents', 'folder-selected', 'file-content', 'pull-progress',
  'pull-done', 'workspaces-list', 'terminal-data',
  'tool-approval-request', // AgentLoop: write/exec araç onayı (F2.4)
  'event:token', 'event:thinking', 'event:tool-call', 'event:tool-result', // EventChannel akışı
  'agent-discover', // Orkestrasyon: lokal ajan keşfi sonucu
  'agent-output', // Orkestrasyon: ajan çıktı akışı
  'agent-chain-progress', // Orkestrasyon: zincir ilerleme akışı
]);

const INVOKE = new Set([
  'fetch-provider-models',
  'persist-save',
  'persist-load',
  'export-to-path',
  'app-health',
  'open-path',
  'get-model-catalog',
  'normalize-ollama-host',
  'hardware-profile',
  'get-team-presets',
  'scan-project',
  'write-project-doc',
  'terminal-create',
  'composer-file-read',
  'get-behavior-profiles',
  'agent-discover-all', // Orkestrasyon: tüm lokal ajanları keşfet
  'vault-status', // V3.14 (A1-1): kasa durumu
  'vault-set', // V3.14 (A1-1): kasaya anahtar taşı
  'vault-get', // V3.14 (A1-1): kasa anahtar kontrolü
  'network-mode-get', // V3.14 (A1-2): ağ modu okuma
  'network-mode-set', // V3.14 (A1-2): ağ modu (air-gapped) geçişi
  'cost-totals', // V3.15 (A2): aylık maliyet toplamları
  'cost-budgets-get', // V3.15 (A2-1): bütçe limitleri okuma
  'cost-budgets-set', // V3.15 (A2-1): bütçe limiti yazma
  'cost-check', // V3.15 (A2-1): istek öncesi bütçe kontrolü
  'cost-csv', // V3.15 (A2-4): kullanım raporu CSV export
  'audit-verify', // V3.15 (A1-3): SHA-256 zincir bütünlük doğrulaması
]);

contextBridge.exposeInMainWorld('krevyxApi', {
  send(channel, ...args) {
    if (!SEND.has(channel)) throw new Error(`Blocked send: ${channel}`);
    ipcRenderer.send(channel, ...args);
  },
  on(channel, listener) {
    if (!ON.has(channel)) return () => {};
    const wrapped = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  invoke(channel, ...args) {
    // ipc:3:* ad alanı ipc-v3-handlers.js'te tanımlı uç noktalardır (Faz 1-6)
    const allowed = INVOKE.has(channel) || (typeof channel === 'string' && channel.startsWith('ipc:3:'));
    if (!allowed) return Promise.reject(new Error(`Blocked invoke: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
});
