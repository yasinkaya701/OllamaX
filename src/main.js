const electron = require('electron');
if (typeof electron !== 'object' || electron == null || typeof electron.ipcMain !== 'object') {
  // Ortamda ELECTRON_RUN_AS_NODE=1 iken veya düz `node` ile çalıştırılınca oluşur.
  console.error('\n[OllamaX] Electron ana süreci gerekli. Proje kökünde: npm start\n');
  process.exit(1);
}
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = electron;
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');
const {
  registerUserFolder,
  resolveReadablePath,
  normalizeOllamaHost,
  splitOllamaHttpTarget,
  sanitizeGeminiModelId,
  isAllowedGitCloneUrl,
  safeCloneRepoName,
} = require('./main-security');
const { registerIpcV3Handlers } = require('./main/ipc-v3-handlers');
const { registerProviderChatHandlers, runMultiChat } = require('./main/agents/provider-chat');
const { registerIpcBridge } = require('./main/ipc-bridge');
const configStore = require('./main/config/config-store');

const isWin = process.platform === 'win32';

let nodePty = null;
try {
  nodePty = require('node-pty');
} catch {
  /* optional: native PTY */
}

const ptySessions = new Map();

function termEmit(win, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('terminal-data', payload);
}

const STREAM_TIMEOUT_MS = 180000;
const API_TIMEOUT_MS = 60000;
const MAX_SESSION_BYTES = 15 * 1024 * 1024;
const MAX_PREVIEW_FILE_BYTES = 2 * 1024 * 1024;

let mainWindow;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const htmlPath = path.join(__dirname, 'renderer', 'index.html');
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d1117',
    titleBarStyle: 'hiddenInset',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow.loadFile(htmlPath);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    mainWindow.setTitle(`OllamaX Ultra v${pkg.version || app.getVersion()}`);
  } catch {
    mainWindow.setTitle('OllamaX Ultra');
  }
}

function persistPath() {
  return path.join(app.getPath('userData'), 'chat-session.json');
}

const modelCatalogPath = path.join(__dirname, 'shared', 'model-catalog.json');

function readModelCatalog() {
  try {
    return JSON.parse(fs.readFileSync(modelCatalogPath, 'utf8'));
  } catch {
    return { openai: [], anthropic: [], gemini: [] };
  }
}

function isLikelyOpenAIChatModel(id) {
  if (!id || typeof id !== 'string') return false;
  const x = id.toLowerCase();
  if (x.includes('embedding') || x.includes('moderation')) return false;
  if (x.startsWith('tts-') || x.startsWith('whisper')) return false;
  if (x.includes('dall-e') || x.includes('dall·e')) return false;
  if (x.startsWith('gpt-') || x.startsWith('o1') || x.startsWith('o3') || x.startsWith('o4') || x.startsWith('o5')) return true;
  if (x.startsWith('chatgpt-')) return true;
  return false;
}

ipcMain.handle('get-model-catalog', () => readModelCatalog());
ipcMain.handle('get-behavior-profiles', () => {
  try {
    return { ok: true, profiles: JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'behavior-profiles.json'), 'utf8')).profiles || [] };
  } catch {
    return { ok: false, profiles: [] };
  }
});

/* V3.8 Composer: dosya bağlamı okuma (güvenli yol çözümlemesi ile) */
ipcMain.handle('composer-file-read', async (_e, filePath) => {
  const safe = resolveReadablePath(filePath);
  if (!safe) return { ok: false, error: 'Erişim reddedildi: izin verilen klasör dışında.' };
  try {
    const st = fs.statSync(safe);
    if (!st.isFile()) return { ok: false, error: 'Bu yol bir dosya değil.' };
    if (st.size > MAX_PREVIEW_FILE_BYTES) return { ok: false, error: `Dosya çok büyük (${st.size} bayt; üst sınır ${MAX_PREVIEW_FILE_BYTES / (1024 * 1024)} MB).` };
    return { ok: true, path: safe, name: path.basename(safe), size: st.size, content: fs.readFileSync(safe, 'utf8') };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
/* V3.9 Slash araçları: /prompt /improve /summarize /extract /translate */
function readSlashSettings() {
  try {
    const p = persistPath();
    if (!fs.existsSync(p)) return {};
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return (parsed && parsed.settings) ? parsed.settings : {};
  } catch {
    return {};
  }
}
function defaultOllamaHostForSlash() {
  const settings = readSlashSettings();
  const machines = Array.isArray(settings.ollamaMachines) ? settings.ollamaMachines : [];
  const active = machines.find((m) => m.active);
  return (active && active.host) ? active.host : 'http://localhost:11434';
}
ipcMain.on('slash-tool', (event, { tool, msgs, prov, model }) => {
  const agentId = `slash-${tool}-${Date.now()}`;
  const settings = readSlashSettings();
  const apiKey =
    prov === 'openai' ? settings.openai
      : prov === 'anthropic' ? settings.anthropic
        : prov === 'gemini' ? settings.gemini
          : prov === 'azure' ? settings.azureApiKey
            : prov === 'aws-bedrock' ? settings.bedrockAccessKeyId
              : prov === 'lmstudio' ? ''
                : prov === 'custom' ? settings.customApiKey
                  : settings[prov] || '';
  const options = {
    endpoint: prov === 'azure' ? settings.azureEndpoint || ''
      : prov === 'lmstudio' ? settings.lmstudioEndpoint || 'http://localhost:1234'
        : prov === 'custom' ? settings.customEndpoint || ''
          : '',
    region: settings.bedrockRegion || '',
    awsAccessKeyId: settings.bedrockAccessKeyId || '',
    awsSecretAccessKey: settings.bedrockSecretAccessKey || '',
    apiVersion: '2024-02-15-preview',
  };
  const modelParams = (settings.modelParams && typeof settings.modelParams === 'object') ? settings.modelParams : {};
  if (prov === 'ollama') {
    const hostKey = normalizeOllamaHost(defaultOllamaHostForSlash()) || 'localhost:11434';
    const t = splitOllamaHttpTarget(hostKey);
    if (!t) {
      event.reply('chat-chunk', { agentId, content: '❌ Geçersiz Ollama adresi.' });
      event.reply('chat-done', { agentId });
      return;
    }
    const body = JSON.stringify({
      model,
      messages: msgs,
      stream: true,
      options: {
        temperature: Number.isFinite(Number(modelParams.temperature)) ? Math.min(2, Math.max(0, Number(modelParams.temperature))) : 0.7,
        top_p: Number.isFinite(Number(modelParams.top_p)) ? Math.min(1, Math.max(0, Number(modelParams.top_p))) : 1,
        num_predict: Number.isFinite(Number(modelParams.max_tokens)) ? Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens)))) : -1,
      },
    });
    const reqOpts = {
      hostname: t.hostname,
      port: t.port,
      path: '/api/chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: STREAM_TIMEOUT_MS,
    };
    const req = http.request(reqOpts, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.trim()) continue;
          try {
            const j = JSON.parse(l);
            if (j.message?.content) event.reply('chat-chunk', { agentId, content: j.message.content });
            if (j.done === true) event.reply('chat-done', { agentId });
          } catch { /* parça atlandı */ }
        }
      });
      res.on('end', () => { event.reply('chat-done', { agentId }); });
      if (res.statusCode !== 200) {
        event.reply('chat-chunk', { agentId, content: `❌ Ollama hatası (HTTP ${res.statusCode}). Sunucuyu kontrol edin.` });
        event.reply('chat-done', { agentId });
      }
    });
    req.on('error', (e) => { event.reply('chat-chunk', { agentId, content: `❌ Ollama sunucusuna bağlanılamadı (${e.message}). Sunucu çalışıyor mu?` }); event.reply('chat-done', { agentId }); });
    req.on('timeout', () => { req.destroy(); event.reply('chat-chunk', { agentId, content: '⚠️ Ollama isteği zaman aşımına uğradı.' }); event.reply('chat-done', { agentId }); });
    req.write(body);
    req.end();
  } else {
    runMultiChat(event, { provider: prov, model, apiKey, options, messages: msgs, agentId, modelParams });
  }
});

ipcMain.handle('set-window-opacity', (event, opacity) => {
  if (mainWindow) {
    mainWindow.setOpacity(opacity);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('normalize-ollama-host', (_e, input) => {
  const h = normalizeOllamaHost(input);
  if (!h) return { ok: false, error: 'Geçersiz Ollama adresi (örn. localhost:11434 veya 192.168.1.5:11434).' };
  return { ok: true, host: h };
});

function httpsRequestJson(opts, body, timeoutMs = API_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const req = https.request({ ...opts, timeout: timeoutMs }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(d || '{}'));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (body) req.write(body);
    req.end();
  });
}

ipcMain.handle('persist-save', async (_e, data) => {
  try {
    const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    if (Buffer.byteLength(body, 'utf8') > MAX_SESSION_BYTES) {
      return { ok: false, error: 'Oturum verisi çok büyük (15 MB üst sınır).' };
    }
    fs.writeFileSync(persistPath(), body, 'utf8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('persist-load', async () => {
  try {
    const p = persistPath();
    if (!fs.existsSync(p)) return null;
    const st = fs.statSync(p);
    if (st.size > MAX_SESSION_BYTES) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
});

ipcMain.handle('export-to-path', async (_e, { defaultName, content }) => {
  if (!mainWindow) return { ok: false };
  const r = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.join(app.getPath('documents'), defaultName || 'export'),
    filters: [
      { name: 'JSON', extensions: ['json'] },
      { name: 'Markdown', extensions: ['md'] },
      { name: 'All', extensions: ['*'] },
    ],
  });
  if (r.canceled || !r.filePath) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(r.filePath, content, 'utf8');
    return { ok: true, path: r.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('fetch-provider-models', async (_e, { provider, apiKey }) => {
  const catalog = readModelCatalog();
  try {
    if (provider === 'openai' && apiKey) {
      const data = await httpsRequestJson({
        hostname: 'api.openai.com',
        path: '/v1/models',
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const ids = (data.data || []).map((m) => m.id).filter(isLikelyOpenAIChatModel);
      const merged = [...new Set([...(catalog.openai || []), ...ids])].sort();
      return {
        ok: true,
        models: merged.length ? merged : ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      };
    }
    if (provider === 'gemini' && apiKey) {
      const data = await httpsRequestJson({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models?key=${encodeURIComponent(String(apiKey))}`,
        method: 'GET',
      });
      const fromApi = (data.models || [])
        .filter((m) => {
          const id = m.name ? m.name.replace('models/', '') : '';
          if (!id || !id.includes('gemini') || id.includes('embedding')) return false;
          if (Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.length > 0) {
            return m.supportedGenerationMethods.includes('generateContent');
          }
          return true;
        })
        .map((m) => m.name.replace('models/', ''));
      const merged = [...new Set([...(catalog.gemini || []), ...fromApi])].sort();
      return { ok: true, models: merged };
    }
    if (provider === 'anthropic') {
      return { ok: true, models: catalog.anthropic || [] };
    }
  } catch (e) {
    return { ok: false, error: e.message, models: catalog[provider] || [] };
  }
  return { ok: true, models: catalog[provider] || [] };
});

ipcMain.handle('app-health', async (_e, { ollamaHost } = {}) => {
  const hostKey = normalizeOllamaHost(ollamaHost) || 'localhost:11434';
  const t = splitOllamaHttpTarget(hostKey);
  const userData = app.getPath('userData');
  const version = app.getVersion();
  const started = Date.now();
  if (!t) {
    return {
      ollamaReachable: false,
      error: 'invalid host',
      latencyMs: Date.now() - started,
      userData,
      version,
      platform: process.platform,
    };
  }
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: t.hostname, port: t.port, path: '/api/tags', timeout: 5000 },
      (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        let modelCount = 0;
        let parseOk = false;
        try {
          const j = JSON.parse(body);
          modelCount = (j.models || []).length;
          parseOk = true;
        } catch {
          /* ignore */
        }
        resolve({
          ollamaReachable: res.statusCode === 200 && parseOk,
          httpStatus: res.statusCode,
          modelCount,
          latencyMs: Date.now() - started,
          userData,
          version,
          platform: process.platform,
        });
      });
    });
    req.on('error', (err) => {
      resolve({
        ollamaReachable: false,
        error: err.message,
        latencyMs: Date.now() - started,
        userData,
        version,
        platform: process.platform,
      });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        ollamaReachable: false,
        error: 'timeout',
        latencyMs: Date.now() - started,
        userData,
        version,
        platform: process.platform,
      });
    });
  });
});

ipcMain.handle('open-path', async (_e, targetPath) => {
  if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: 'invalid path' };
  const allowed = resolveReadablePath(targetPath);
  if (!allowed) return { ok: false, error: 'path not allowed' };
  const err = await shell.openPath(allowed);
  return { ok: !err, error: err || undefined };
});

function buildAppMenu() {
  const deployDoc = path.join(__dirname, '..', 'docs', 'DEPLOY.md');
  const template = [];
  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: 'Hakkında' },
        { type: 'separator' },
        { role: 'services', label: 'Servisler' },
        { type: 'separator' },
        { role: 'hide', label: 'Gizle' },
        { role: 'hideOthers', label: 'Diğerlerini Gizle' },
        { role: 'unhide', label: 'Tümünü Göster' },
        { type: 'separator' },
        { role: 'quit', label: 'Çıkış' },
      ],
    });
  } else {
    template.push({
      label: 'Dosya',
      submenu: [{ role: 'quit', label: 'Çıkış' }],
    });
  }
  const viewSubmenu = [
    { role: 'reload', label: 'Yenile' },
    { role: 'forceReload', label: 'Zorla yenile' },
  ];
  if (!app.isPackaged) {
    viewSubmenu.push({ role: 'toggleDevTools', label: 'Geliştirici araçları' });
  }
  viewSubmenu.push(
    { type: 'separator' },
    { role: 'resetZoom', label: 'Yakınlaştırmayı sıfırla' },
    { role: 'zoomIn', label: 'Yakınlaştır' },
    { role: 'zoomOut', label: 'Uzaklaştır' },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Tam ekran' },
  );
  template.push({
    label: 'Görünüm',
    submenu: viewSubmenu,
  });
  template.push({
    label: 'Yardım',
    submenu: [
      {
        label: 'Dağıtım kılavuzunu aç…',
        click: () => {
          if (fs.existsSync(deployDoc)) shell.openPath(deployDoc).catch(() => undefined);
          else if (mainWindow) dialog.showMessageBox(mainWindow, { message: 'DEPLOY.md bulunamadı.', type: 'warning' });
        },
      },
      {
        label: 'Veri klasörünü göster',
        click: () => {
          shell.openPath(app.getPath('userData')).catch(() => undefined);
        },
      },
    ],
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildAppMenu();
  createWindow();
  registerV3Surface();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ROADMAP Faz 1-6: ipc:3:* uç noktaları + geriye uyumlu köprü
function registerV3Surface() {
  try {
    configStore.setApp(app);
    configStore.readConfig(); // dizinleri oluştur, eski config'i taşı
    if (mainWindow) {
      registerIpcV3Handlers(mainWindow);
      registerIpcBridge();
      registerProviderChatHandlers();
    }
  } catch (err) {
    console.error('[OllamaX] ipc-v3 başlatma hatası:', err?.message || err);
  }
}

function attachStreamTimeout(req) {
  const t = setTimeout(() => {
    try {
      req.destroy();
    } catch {
      /* ignore destroy errors */
    }
  }, STREAM_TIMEOUT_MS);
  req.on('close', () => clearTimeout(t));
}

ipcMain.on('get-models', (event, host) => {
  const hostKey = normalizeOllamaHost(host) || 'localhost:11434';
  const t = splitOllamaHttpTarget(hostKey);
  if (!t) {
    event.reply('models-list', []);
    return;
  }
  const req = http.get(
    { hostname: t.hostname, port: t.port, path: '/api/tags', timeout: API_TIMEOUT_MS },
    (res) => {
    let d = '';
    res.on('data', (c) => {
      d += c;
    });
    res.on('end', () => {
      try {
        event.reply('models-list', JSON.parse(d).models || []);
      } catch {
        event.reply('models-list', []);
      }
    });
  });
  req.on('error', () => event.reply('models-list', []));
  req.setTimeout(API_TIMEOUT_MS, () => {
    req.destroy();
    event.reply('models-list', []);
  });
});

ipcMain.on('pull-model', (event, { host, model }) => {
  const hostKey = normalizeOllamaHost(host) || 'localhost:11434';
  const t = splitOllamaHttpTarget(hostKey);
  if (!t || !model || typeof model !== 'string') {
    event.reply('pull-done', { model: String(model || ''), error: 'Geçersiz istek' });
    return;
  }
  const safeName = model.trim();
  if (!/^[a-zA-Z0-9._:@/+-]+$/.test(safeName) || safeName.length > 160) {
    event.reply('pull-done', { model: safeName, error: 'Geçersiz model adı' });
    return;
  }
  const body = JSON.stringify({ name: safeName, stream: true });
  const opts = {
    hostname: t.hostname,
    port: t.port,
    path: '/api/pull',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: STREAM_TIMEOUT_MS,
  };
  const req = http.request(opts, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        try {
          const j = JSON.parse(l);
          event.reply('pull-progress', j);
        } catch {
          /* ignore malformed chunk */
        }
      }
    });
    res.on('end', () => event.reply('pull-done', { model: safeName }));
  });
  attachStreamTimeout(req);
  req.on('error', (e) => event.reply('pull-done', { model: safeName, error: e.message }));
  req.write(body);
  req.end();
});

ipcMain.on('chat', (event, { host, model, messages, agentId, modelParams = {} }) => {
  const hostKey = normalizeOllamaHost(host) || 'localhost:11434';
  const t = splitOllamaHttpTarget(hostKey);
  if (!t) {
    event.reply('chat-chunk', { agentId, content: '\n\n❌ Geçersiz Ollama adresi.' });
    event.reply('chat-done', { agentId });
    return;
  }
  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    options: {
      temperature: Number.isFinite(Number(modelParams.temperature)) ? Math.min(2, Math.max(0, Number(modelParams.temperature))) : 0.7,
      top_p: Number.isFinite(Number(modelParams.top_p)) ? Math.min(1, Math.max(0, Number(modelParams.top_p))) : 1,
      num_predict: Number.isFinite(Number(modelParams.max_tokens)) ? Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens)))) : -1,
    },
  });
  const opts = {
    hostname: t.hostname,
    port: t.port,
    path: '/api/chat',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: STREAM_TIMEOUT_MS,
  };
  const req = http.request(opts, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const j = JSON.parse(l);
          if (j.message?.content) event.reply('chat-chunk', { agentId, content: j.message.content });
          if (j.done === true) event.reply('chat-done', { agentId });
        } catch {
          /* ignore malformed chunk */
        }
      }
    });
    res.on('end', () => {
      if (buf.trim()) {
        try {
          const j = JSON.parse(buf);
          if (j.message?.content) event.reply('chat-chunk', { agentId, content: j.message.content });
        } catch {
          /* ignore malformed chunk */
        }
      }
      event.reply('chat-done', { agentId });
    });
  });
  attachStreamTimeout(req);
  req.on('error', (e) => {
    let hint = '';
    if (e.code === 'ECONNREFUSED') {
      hint = `Ollama bu bilgisayarda çalışmıyor görünüyor (${t ? `${t.hostname}:${t.port}` : hostKey}). Ollama uygulamasını başlatın veya uçbirimde \`ollama serve\` komutunu çalıştırın. İsterseniz sağ üstten OpenAI / Anthropic / Gemini sağlayıcısına geçebilirsiniz.`;
    } else if (e.code === 'ENOTFOUND' || e.code === 'EHOSTUNREACH') {
      hint = `Ollama adresine ulaşılamadı (${t ? `${t.hostname}:${t.port}` : hostKey}). Ayarlar → Ollama Makineleri bölümünden sunucu adresini kontrol edin.`;
    } else if (e.code === 'ETIMEDOUT' || e.message === 'Request timeout') {
      hint = `Ollama yanıt vermedi (${t ? `${t.hostname}:${t.port}` : hostKey}). Sunucunun çalıştığından ve ağ erişimin olduğundan emin olun.`;
    } else {
      hint = `Bağlantı sorunu: ${e.message || e.code || 'bilinmeyen hata'}. Ollama'nın çalıştığından emin olun.`;
    }
    event.reply('chat-chunk', { agentId, content: `\n\n❌ Ollama bağlantı hatası. ${hint}` });
    event.reply('chat-done', { agentId });
  });
  req.write(body);
  req.end();
});

ipcMain.on('openai-chat', (event, { model, messages, apiKey, agentId, modelParams = {} }) => {
  if (!apiKey) {
    event.reply('chat-chunk', { agentId, content: '❌ OpenAI API key missing. Add it in Settings.' });
    event.reply('chat-done', { agentId });
    return;
  }
  const payload = { model, messages, stream: true };
  if (/^o[0-9]|^gpt-5/i.test(model)) {
    payload.max_completion_tokens = Number.isFinite(Number(modelParams.max_tokens)) ? Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens)))) : 8192;
  } else if (Number.isFinite(Number(modelParams.max_tokens))) {
    payload.max_tokens = Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens))));
  }
  if (Number.isFinite(Number(modelParams.temperature))) payload.temperature = Math.min(2, Math.max(0, Number(modelParams.temperature)));
  if (Number.isFinite(Number(modelParams.top_p))) payload.top_p = Math.min(1, Math.max(0, Number(modelParams.top_p)));
  if (Number.isFinite(Number(modelParams.frequency_penalty))) payload.frequency_penalty = Math.min(2, Math.max(-2, Number(modelParams.frequency_penalty)));
  if (Number.isFinite(Number(modelParams.presence_penalty))) payload.presence_penalty = Math.min(2, Math.max(-2, Number(modelParams.presence_penalty)));
  if (/^o[0-9]/i.test(model)) delete payload.temperature; /* o-* modelleri temperature desteklemez */
  const body = JSON.stringify(payload);
  const req = https.request(
    {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: STREAM_TIMEOUT_MS,
    },
    (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          const d = l.slice(6).trim();
          if (d === '[DONE]') {
            event.reply('chat-done', { agentId });
            continue;
          }
          try {
            const j = JSON.parse(d);
            const txt = j.choices?.[0]?.delta?.content;
            if (txt) event.reply('chat-chunk', { agentId, content: txt });
          } catch {
          /* ignore malformed chunk */
        }
        }
      });
      res.on('end', () => event.reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    event.reply('chat-chunk', { agentId, content: `❌ OpenAI Error: ${e.message}` });
    event.reply('chat-done', { agentId });
  });
  req.write(body);
  req.end();
});

ipcMain.on('anthropic-chat', (event, { model, messages, apiKey, agentId, modelParams = {} }) => {
  if (!apiKey) {
    event.reply('chat-chunk', { agentId, content: '❌ Anthropic API key missing. Add it in Settings.' });
    event.reply('chat-done', { agentId });
    return;
  }
  const sys = messages.find((m) => m.role === 'system');
  const msgs = messages.filter((m) => m.role !== 'system');
  const body = JSON.stringify({
    model,
    messages: msgs,
    ...(sys ? { system: sys.content } : {}),
    max_tokens: Number.isFinite(Number(modelParams.max_tokens)) ? Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens)))) : 8096,
    ...(Number.isFinite(Number(modelParams.temperature)) ? { temperature: Math.min(1, Math.max(0, Number(modelParams.temperature))) } : {}),
    ...(Number.isFinite(Number(modelParams.top_p)) ? { top_p: Math.min(1, Math.max(0, Number(modelParams.top_p))) } : {}),
    stream: true,
  });
  const req = https.request(
    {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: STREAM_TIMEOUT_MS,
    },
    (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          try {
            const j = JSON.parse(l.slice(6));
            const txt = j.delta?.text;
            if (txt) event.reply('chat-chunk', { agentId, content: txt });
          } catch {
          /* ignore malformed chunk */
        }
        }
      });
      res.on('end', () => event.reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    event.reply('chat-chunk', { agentId, content: `❌ Anthropic Error: ${e.message}` });
    event.reply('chat-done', { agentId });
  });
  req.write(body);
  req.end();
});

ipcMain.on('gemini-chat', (event, { model, messages, apiKey, agentId, modelParams = {} }) => {
  if (!apiKey) {
    event.reply('chat-chunk', { agentId, content: '❌ Gemini API key missing. Add it in Settings.' });
    event.reply('chat-done', { agentId });
    return;
  }
  const sys = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const generationConfig = {};
  if (Number.isFinite(Number(modelParams.temperature))) generationConfig.temperature = Math.min(2, Math.max(0, Number(modelParams.temperature)));
  if (Number.isFinite(Number(modelParams.top_p))) generationConfig.topP = Math.min(1, Math.max(0, Number(modelParams.top_p)));
  if (Number.isFinite(Number(modelParams.max_tokens))) generationConfig.maxOutputTokens = Math.min(131072, Math.max(16, Math.floor(Number(modelParams.max_tokens))));
  const body = JSON.stringify({
    contents,
    ...(sys ? { systemInstruction: { parts: [{ text: sys.content }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  });
  const req = https.request(
    {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${encodeURIComponent(sanitizeGeminiModelId(model))}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: STREAM_TIMEOUT_MS,
    },
    (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (!l.startsWith('data: ')) continue;
          const d = l.slice(6).trim();
          if (d === '[DONE]') {
            event.reply('chat-done', { agentId });
            continue;
          }
          try {
            const j = JSON.parse(d);
            const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
            if (txt) event.reply('chat-chunk', { agentId, content: txt });
          } catch {
          /* ignore malformed chunk */
        }
        }
      });
      res.on('end', () => event.reply('chat-done', { agentId }));
    },
  );
  attachStreamTimeout(req);
  req.on('error', (e) => {
    event.reply('chat-chunk', { agentId, content: `❌ Gemini Error: ${e.message}` });
    event.reply('chat-done', { agentId });
  });
  req.write(body);
  req.end();
});

/* V3.10: zenginleştirilmiş keşif reposu kataloğu */
let featuredReposCache = null;
function loadFeaturedRepos() {
  if (featuredReposCache) return featuredReposCache;
  try {
    featuredReposCache = JSON.parse(fs.readFileSync(path.join(__dirname, 'shared', 'featured-repos.json'), 'utf8'));
  } catch {
    featuredReposCache = { categories: [] };
  }
  return featuredReposCache;
}
ipcMain.on('get-featured-repos', (event) => {
  event.reply('featured-repos', loadFeaturedRepos());
});
ipcMain.on('github-search', (event, { query }) => {
  if (!query) return;
  const opts = {
    hostname: 'api.github.com',
    path: `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`,
    headers: { 'User-Agent': 'OllamaX-Ultra/3.0', Accept: 'application/vnd.github.v3+json' },
    timeout: API_TIMEOUT_MS,
  };
  const req = https.request(opts, (res) => {
    let d = '';
    res.on('data', (c) => {
      d += c;
    });
    res.on('end', () => {
      try {
        event.reply('github-results', JSON.parse(d));
      } catch {
        event.reply('github-results', { items: [] });
      }
    });
  });
  req.on('error', () => event.reply('github-results', { items: [] }));
  req.setTimeout(API_TIMEOUT_MS, () => {
    req.destroy();
    event.reply('github-results', { items: [] });
  });
  req.end();
});

ipcMain.on('git-clone', (event, { url }) => {
  if (!isAllowedGitCloneUrl(url)) {
    event.reply('exec-output', {
      type: 'stderr',
      data: 'İzin verilmeyen klon URL’i (yalnızca https:// github.com, gitlab.com, bitbucket.org, codeberg.org).\n',
    });
    event.reply('git-done', { success: false, dir: '', url: String(url || '') });
    return;
  }
  const name = safeCloneRepoName(url);
  if (!name) {
    event.reply('exec-output', { type: 'stderr', data: 'Depo adı doğrulanamadı.\n' });
    event.reply('git-done', { success: false, dir: '', url: String(url || '') });
    return;
  }
  const dir = path.join(os.homedir(), 'OllamaX-Projects');
  const target = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true });
  event.reply('exec-output', { type: 'info', data: `📥 Cloning ${url}...\n` });
  const git = spawn(isWin ? 'git.exe' : 'git', ['clone', '--', url, target], { shell: false });
  git.stdout.on('data', (d) => event.reply('exec-output', { type: 'stdout', data: d.toString() }));
  git.stderr.on('data', (d) => event.reply('exec-output', { type: 'stderr', data: d.toString() }));
  git.on('close', (code) => {
    const success = code === 0;
    event.reply('git-done', { success, dir: target, url });
    if (success) shell.openPath(target).catch(() => undefined);
  });
});

ipcMain.on('list-dir', (event, p) => {
  let targetPath = p;
  if (!path.isAbsolute(p)) {
    targetPath = path.join(os.homedir(), p);
  }
  const safe = resolveReadablePath(targetPath);
  if (!safe) {
    event.reply('dir-contents', {
      path: String(p),
      items: [],
      error: 'Erişim reddedildi: yalnızca ana klasörünüz, OllamaX-Projects veya dosya gezgininde seçtiğiniz klasör.',
    });
    return;
  }
  try {
    const items = fs
      .readdirSync(safe, { withFileTypes: true })
      .filter((f) => !f.name.startsWith('.'))
      .map((f) => ({ name: f.name, isDir: f.isDirectory() }))
      .sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
    event.reply('dir-contents', { path: safe, items });
  } catch (e) {
    event.reply('dir-contents', { path: safe, items: [], error: e.message });
  }
});

ipcMain.on('read-file', (event, p) => {
  const safe = resolveReadablePath(p);
  if (!safe) {
    event.reply('file-content', { path: p, content: 'Erişim reddedildi: izin verilen klasör dışında.' });
    return;
  }
  try {
    const st = fs.statSync(safe);
    if (!st.isFile()) {
      event.reply('file-content', { path: safe, content: 'Bu yol bir dosya değil.' });
      return;
    }
    if (st.size > MAX_PREVIEW_FILE_BYTES) {
      event.reply('file-content', {
        path: safe,
        content: `Dosya çok büyük (${st.size} bayt). Önizleme üst sınırı ${MAX_PREVIEW_FILE_BYTES / (1024 * 1024)} MB.`,
      });
      return;
    }
    event.reply('file-content', { path: safe, content: fs.readFileSync(safe, 'utf8') });
  } catch (e) {
    event.reply('file-content', { path: safe || p, content: `Hata: ${e.message}` });
  }
});

ipcMain.on('open-folder-dialog', async (event) => {
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (!r.canceled && r.filePaths.length) {
    registerUserFolder(r.filePaths[0]);
    event.reply('folder-selected', r.filePaths[0]);
  }
});

ipcMain.on('get-workspaces', (event) => {
  const dir = path.join(os.homedir(), 'OllamaX-Projects');
  if (!fs.existsSync(dir)) return event.reply('workspaces-list', []);
  try {
    const items = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isDirectory() && !f.name.startsWith('.'))
      .map((f) => f.name);
    event.reply('workspaces-list', items);
  } catch {
    event.reply('workspaces-list', []);
  }
});

ipcMain.on('get-stats', (event) => {
  const total = Math.round(os.totalmem() / 1073741824);
  const free = Math.round(os.freemem() / 1073741824);
  const used = total - free;
  let cpu = '';
  try {
    if (isWin) {
      cpu = execSync('wmic cpu get name', { timeout: 1000 }).toString().split('\n')[1].trim();
    } else {
      cpu = execSync('sysctl -n machdep.cpu.brand_string', { timeout: 1000 }).toString().trim();
    }
  } catch {
    cpu = os.cpus()[0].model;
  }
  event.reply('stats', {
    used,
    free,
    total,
    percent: Math.round((used / total) * 100),
    cpu,
    cpuCount: os.cpus().length,
    totalRamBytes: os.totalmem(),
  });
});

ipcMain.handle('hardware-profile', () => ({
  totalRamGb: Math.round(os.totalmem() / 1073741824),
  freeRamGb: Math.round(os.freemem() / 1073741824),
  cpuCount: os.cpus().length,
  platform: process.platform,
}));

const TEAM_PRESETS_PATH = path.join(__dirname, 'shared', 'team-presets.json');

ipcMain.handle('get-team-presets', () => {
  try {
    return { ok: true, data: JSON.parse(fs.readFileSync(TEAM_PRESETS_PATH, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message, data: { presets: [] } };
  }
});

const SCAN_MANIFESTS = [
  'package.json',
  'README.md',
  'README.rst',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  'requirements.txt',
  'pom.xml',
  'build.gradle',
  '.gitignore',
];

ipcMain.handle('scan-project', async (_e, rootPath) => {
  const root = resolveReadablePath(rootPath);
  if (!root) return { ok: false, error: 'Erişim reddedildi' };
  const lines = [
    '# INITIAL — proje özeti (OllamaX Ultra)',
    '',
    `_Oluşturulma: ${new Date().toISOString()}_`,
    '',
    `**Kök:** \`${root}\``,
    '',
    '## Tespit edilen dosyalar',
  ];
  const exists = (rel) => {
    try {
      return fs.existsSync(path.join(root, rel));
    } catch {
      return false;
    }
  };
  SCAN_MANIFESTS.forEach((f) => {
    if (exists(f)) lines.push(`- ${f}`);
  });
  const readSmall = (rel, max = 14000) => {
    try {
      const p = path.join(root, rel);
      const st = fs.statSync(p);
      if (!st.isFile() || st.size > max) return null;
      return fs.readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  };
  const pkg = readSmall('package.json');
  if (pkg) {
    lines.push('', '## package.json');
    try {
      const j = JSON.parse(pkg);
      lines.push(`- **name:** ${j.name || '—'}`);
      if (j.version) lines.push(`- **version:** ${j.version}`);
      if (j.description) lines.push(`- **description:** ${j.description}`);
      if (j.scripts) lines.push(`- **scripts:** ${Object.keys(j.scripts).slice(0, 20).join(', ')}`);
    } catch {
      lines.push('- (JSON ayrıştırılamadı)');
    }
  }
  const readme = readSmall('README.md', 12000) || readSmall('README.rst', 12000);
  if (readme) {
    lines.push('', '## README özü');
    lines.push(readme.slice(0, 4000));
    if (readme.length > 4000) lines.push('\n_…kısaltıldı_');
  }
  lines.push(
    '',
    '## AI için sonraki adımlar',
    '- Bağımlılıkları kur ve test komutlarını çalıştır.',
    '- Güvenlik: gizli anahtarların repoda olmadığını doğrula.',
    '- Mimari: giriş noktalarını ve veri akışını özetle.',
  );
  return { ok: true, markdown: lines.join('\n'), root };
});

ipcMain.handle('write-project-doc', async (_e, { rootPath, filename, content }) => {
  const fn = String(filename || 'INITIAL.md').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!fn.endsWith('.md')) return { ok: false, error: 'Yalnızca .md dosya adı' };
  const root = resolveReadablePath(rootPath);
  if (!root) return { ok: false, error: 'Erişim reddedildi' };
  const target = path.join(root, fn);
  const safe = resolveReadablePath(target);
  if (!safe) return { ok: false, error: 'Yol izin dışı' };
  const rel = path.relative(root, safe);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, error: 'Geçersiz hedef' };
  try {
    fs.writeFileSync(safe, String(content || ''), 'utf8');
    return { ok: true, path: safe };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('terminal-create', async (event, { cwd } = {}) => {
  if (!nodePty) {
    return { ok: false, error: 'node-pty yok. Kur: npm install; sonra: npm run rebuild-pty' };
  }
  const win = BrowserWindow.fromWebContents(event.sender);
  const raw = cwd && String(cwd).trim() ? cwd : path.join(os.homedir(), 'OllamaX-Projects');
  const base = resolveReadablePath(raw);
  if (!base) return { ok: false, error: 'Çalışma dizini izin dışı' };
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const shell = isWin ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
  const shellArgs = isWin ? [] : ['-l'];
  try {
    const p = nodePty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 100,
      rows: 26,
      cwd: base,
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    p.onData((d) => termEmit(win, { id, data: d }));
    p.onExit(() => {
      ptySessions.delete(id);
      termEmit(win, { id, exit: true });
    });
    ptySessions.set(id, { p, win });
    return { ok: true, id, cwd: base };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.on('terminal-input', (_e, { id, data }) => {
  const rec = ptySessions.get(id);
  if (rec?.p && data) {
    try {
      rec.p.write(data);
    } catch {
      /* ignore */
    }
  }
});

ipcMain.on('terminal-resize', (_e, { id, cols, rows }) => {
  const rec = ptySessions.get(id);
  if (rec?.p && cols > 2 && rows > 1 && cols < 500 && rows < 300) {
    try {
      rec.p.resize(cols, rows);
    } catch {
      /* ignore */
    }
  }
});

ipcMain.on('terminal-close', (_e, { id }) => {
  const rec = ptySessions.get(id);
  if (rec?.p) {
    try {
      rec.p.kill();
    } catch {
      /* ignore */
    }
    ptySessions.delete(id);
  }
});

app.on('before-quit', () => {
  ptySessions.forEach((rec) => {
    try {
      rec.p.kill();
    } catch {
      /* ignore */
    }
  });
  ptySessions.clear();
});
