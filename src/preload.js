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
  'ipc:3:code-agent:step', // V3.19: kod ajanı canlı adım akışı (stream)
  'ipc:3:code-agent:done', // V3.19: kod ajanı görev tamamlandı
  'ipc:3:update:available', // V3.24: güncelleme bildirimi
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
  'agent-discover-all',
  'vault-status',
  'vault-set',
  'vault-get',
  'network-mode-get',
  'network-mode-set',
  'cost-totals',
  'cost-budgets-get',
  'cost-budgets-set',
  'cost-check',
  'cost-csv',
  'audit-verify',
  'ipc:3:code-agent-stop',
  'ipc:3:code-agent-plan',
  'ipc:3:code-agent-plan-edit',
  'ipc:3:code-agent-plan-edits',
  'ipc:3:code-agent-plan-clear',
  'ipc:3:audit-verify',
]);

const INVOKE_V4 = new Set([
  'ipc:4:workspace:open',
  'ipc:4:workspace:refresh',
  'ipc:4:workspace:list',
  'ipc:4:skill:list',
  'ipc:4:mission:create-from-skill',
  'ipc:4:mission:list',
  'ipc:4:mission:tasks',
  'ipc:4:mission:run-ready',
  'ipc:4:mission:cancel',
  'ipc:4:task:plan',
  'ipc:4:memory:search',
  'ipc:4:memory:add',
  'ipc:4:verification:run',
  'ipc:4:approval:list',
  'ipc:4:approval:resolve',
]);

function appendStyle(href) {
  if (document.querySelector(`link[data-krevyx-v4="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.krevyxV4 = href;
  document.head.appendChild(link);
}

function appendScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-krevyx-v4="${src}"]`)) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.defer = false;
    script.dataset.krevyxV4 = src;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.body.appendChild(script);
  });
}

async function loadV4RendererIfEnabled() {
  try {
    const response = await ipcRenderer.invoke('ipc:3:config-get');
    if (!response || response.ok !== true || response.config?.features?.v4Workspace !== true) return false;
    appendStyle('v4/workspace.css');
    for (const src of [
      'v4/api.js',
      'v4/state.js',
      'v4/workspace-shell.js',
      'v4/execution-controls.js',
      'v4/approval-inbox.js',
      'v4/bootstrap.js',
    ]) {
      await appendScript(src);
    }
    return true;
  } catch (error) {
    console.error('[Krevyx v4] feature loader failed:', error && error.message ? error.message : error);
    return false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  loadV4RendererIfEnabled();
}, { once: true });

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
    const allowed = INVOKE.has(channel) || INVOKE_V4.has(channel) || (typeof channel === 'string' && channel.startsWith('ipc:3:'));
    if (!allowed) return Promise.reject(new Error(`Blocked invoke: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
});
