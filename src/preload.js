const { contextBridge, ipcRenderer } = require('electron');

const SEND = new Set([
  'get-models', 'pull-model', 'chat', 'openai-chat', 'anthropic-chat', 'gemini-chat',
  'github-search', 'git-clone', 'list-dir', 'read-file',
  'open-folder-dialog', 'get-workspaces', 'get-stats',
  'terminal-input', 'terminal-resize', 'terminal-close',
]);

const ON = new Set([
  'models-list', 'chat-chunk', 'chat-done', 'stats', 'github-results', 'exec-output',
  'git-done', 'dir-contents', 'folder-selected', 'file-content', 'pull-progress',
  'pull-done', 'workspaces-list', 'terminal-data',
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
]);

contextBridge.exposeInMainWorld('ollamaxApi', {
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
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`Blocked invoke: ${channel}`));
    return ipcRenderer.invoke(channel, ...args);
  },
});
