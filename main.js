const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const http = require('http');
const https = require('https');
const os = require('os');

let mainWindow;

app.whenReady().then(() => {
    mainWindow = new BrowserWindow({
        width: 1500, height: 920, minWidth: 900, minHeight: 600,
        backgroundColor: '#0d1117',
        titleBarStyle: 'hiddenInset',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false }
    });
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) mainWindow.loadFile('index.html'); });

// ── Ollama: list local models ────────────────────────────────────
ipcMain.on('get-models', (event, host) => {
    http.get(`http://${host || 'localhost:11434'}/api/tags`, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { event.reply('models-list', JSON.parse(d).models || []); } catch { event.reply('models-list', []); } });
    }).on('error', () => event.reply('models-list', []));
});

// ── Ollama: pull model ────────────────────────────────────────────
ipcMain.on('pull-model', (event, { host, model }) => {
    const body = JSON.stringify({ name: model, stream: true });
    const opts = {
        hostname: (host || 'localhost:11434').split(':')[0],
        port: parseInt((host || 'localhost:11434').split(':')[1] || '11434'),
        path: '/api/pull', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, res => {
        let buf = '';
        res.on('data', c => {
            buf += c.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const l of lines) {
                try { const j = JSON.parse(l); event.reply('pull-progress', j); } catch {}
            }
        });
        res.on('end', () => event.reply('pull-done', { model }));
    });
    req.on('error', e => event.reply('pull-done', { model, error: e.message }));
    req.write(body); req.end();
});

// ── Ollama: chat (real streaming, line-by-line JSON) ────────────
ipcMain.on('chat', (event, { host, model, messages, agentId }) => {
    const body = JSON.stringify({ model, messages, stream: true });
    const opts = {
        hostname: (host || 'localhost:11434').split(':')[0],
        port: parseInt((host || 'localhost:11434').split(':')[1] || '11434'),
        path: '/api/chat', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = http.request(opts, res => {
        let buf = '';
        res.on('data', c => {
            buf += c.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const l of lines) {
                if (!l.trim()) continue;
                try {
                    const j = JSON.parse(l);
                    if (j.message?.content) event.reply('chat-chunk', { agentId, content: j.message.content });
                    if (j.done === true) event.reply('chat-done', { agentId });
                } catch {}
            }
        });
        res.on('end', () => { if (buf.trim()) { try { const j = JSON.parse(buf); if (j.message?.content) event.reply('chat-chunk', { agentId, content: j.message.content }); } catch {} } event.reply('chat-done', { agentId }); });
    });
    req.on('error', e => { event.reply('chat-chunk', { agentId, content: `\n\n❌ Ollama bağlantı hatası: ${e.message}` }); event.reply('chat-done', { agentId }); });
    req.write(body); req.end();
});

// ── OpenAI: chat (SSE streaming) ────────────────────────────────
ipcMain.on('openai-chat', (event, { model, messages, apiKey, agentId }) => {
    if (!apiKey) { event.reply('chat-chunk', { agentId, content: '❌ OpenAI API key missing. Add it in Settings.' }); event.reply('chat-done', { agentId }); return; }
    const body = JSON.stringify({ model, messages, stream: true });
    const req = https.request({
        hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) }
    }, res => {
        let buf = '';
        res.on('data', c => {
            buf += c.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const l of lines) {
                if (!l.startsWith('data: ')) continue;
                const d = l.slice(6).trim();
                if (d === '[DONE]') { event.reply('chat-done', { agentId }); continue; }
                try { const j = JSON.parse(d); const txt = j.choices?.[0]?.delta?.content; if (txt) event.reply('chat-chunk', { agentId, content: txt }); } catch {}
            }
        });
        res.on('end', () => event.reply('chat-done', { agentId }));
    });
    req.on('error', e => { event.reply('chat-chunk', { agentId, content: `❌ OpenAI Error: ${e.message}` }); event.reply('chat-done', { agentId }); });
    req.write(body); req.end();
});

// ── Anthropic: chat (SSE streaming) ─────────────────────────────
ipcMain.on('anthropic-chat', (event, { model, messages, apiKey, agentId }) => {
    if (!apiKey) { event.reply('chat-chunk', { agentId, content: '❌ Anthropic API key missing. Add it in Settings.' }); event.reply('chat-done', { agentId }); return; }
    const sys = messages.find(m => m.role === 'system');
    const msgs = messages.filter(m => m.role !== 'system');
    const body = JSON.stringify({ model, messages: msgs, ...(sys ? { system: sys.content } : {}), max_tokens: 8096, stream: true });
    const req = https.request({
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
        let buf = '';
        res.on('data', c => {
            buf += c.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const l of lines) {
                if (!l.startsWith('data: ')) continue;
                try { const j = JSON.parse(l.slice(6)); const txt = j.delta?.text; if (txt) event.reply('chat-chunk', { agentId, content: txt }); } catch {}
            }
        });
        res.on('end', () => event.reply('chat-done', { agentId }));
    });
    req.on('error', e => { event.reply('chat-chunk', { agentId, content: `❌ Anthropic Error: ${e.message}` }); event.reply('chat-done', { agentId }); });
    req.write(body); req.end();
});

// ── Google Gemini: chat (SSE streaming) ─────────────────────────
ipcMain.on('gemini-chat', (event, { model, messages, apiKey, agentId }) => {
    if (!apiKey) { event.reply('chat-chunk', { agentId, content: '❌ Gemini API key missing. Add it in Settings.' }); event.reply('chat-done', { agentId }); return; }
    const sys = messages.find(m => m.role === 'system');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    const body = JSON.stringify({ contents, ...(sys ? { systemInstruction: { parts: [{ text: sys.content }] } } : {}) });
    const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
        let buf = '';
        res.on('data', c => {
            buf += c.toString();
            const lines = buf.split('\n'); buf = lines.pop();
            for (const l of lines) {
                if (!l.startsWith('data: ')) continue;
                const d = l.slice(6).trim();
                if (d === '[DONE]') { event.reply('chat-done', { agentId }); continue; }
                try { const j = JSON.parse(d); const txt = j.candidates?.[0]?.content?.parts?.[0]?.text; if (txt) event.reply('chat-chunk', { agentId, content: txt }); } catch {}
            }
        });
        res.on('end', () => event.reply('chat-done', { agentId }));
    });
    req.on('error', e => { event.reply('chat-chunk', { agentId, content: `❌ Gemini Error: ${e.message}` }); event.reply('chat-done', { agentId }); });
    req.write(body); req.end();
});

// ── GitHub search ────────────────────────────────────────────────
ipcMain.on('github-search', (event, { query }) => {
    if (!query) return;
    const opts = { hostname: 'api.github.com', path: `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=10`, headers: { 'User-Agent': 'OllamaX-Ultra/3.0', 'Accept': 'application/vnd.github.v3+json' } };
    https.get(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { event.reply('github-results', JSON.parse(d)); } catch { event.reply('github-results', { items: [] }); } }); }).on('error', () => event.reply('github-results', { items: [] }));
});

// ── Cross-platform shell ──────────────────────────────────────────
const isWin = process.platform === 'win32';
const shell = isWin ? 'cmd' : 'bash';
const shellArg = isWin ? '/c' : '-c';

// ── Git clone ────────────────────────────────────────────────────
ipcMain.on('git-clone', (event, { url }) => {
    const name = url.split('/').pop().replace('.git', '');
    const dir = path.join(os.homedir(), 'OllamaX-Projects');
    const target = path.join(dir, name);
    fs.mkdirSync(dir, { recursive: true });
    event.reply('exec-output', { type: 'info', data: `📥 Cloning ${url}...\n` });
    const git = spawn(isWin ? 'git.exe' : 'git', ['clone', url, target]);
    git.stdout.on('data', d => event.reply('exec-output', { type: 'stdout', data: d.toString() }));
    git.stderr.on('data', d => event.reply('exec-output', { type: 'stderr', data: d.toString() }));
    git.on('close', code => event.reply('git-done', { success: code === 0, dir: target, url }));
});

// ── Exec command ─────────────────────────────────────────────────
ipcMain.on('exec-command', (event, { command }) => {
    const proc = spawn(shell, [shellArg, command], { cwd: os.homedir() });
    proc.stdout.on('data', d => event.reply('exec-output', { type: 'stdout', data: d.toString() }));
    proc.stderr.on('data', d => event.reply('exec-output', { type: 'stderr', data: d.toString() }));
    proc.on('close', code => event.reply('exec-output', { type: 'stdout', data: `[exit: ${code}]\n` }));
});

// ── File system ───────────────────────────────────────────────────
ipcMain.on('list-dir', (event, p) => {
    let targetPath = p;
    if (!path.isAbsolute(p)) {
        targetPath = path.join(os.homedir(), p);
    }
    try {
        const items = fs.readdirSync(targetPath, { withFileTypes: true })
            .filter(f => !f.name.startsWith('.'))
            .map(f => ({ name: f.name, isDir: f.isDirectory() }))
            .sort((a, b) => b.isDir - a.isDir || a.name.localeCompare(b.name));
        event.reply('dir-contents', { path: targetPath, items });
    } catch(e) { event.reply('dir-contents', { path: targetPath, items: [], error: e.message }); }
});
ipcMain.on('read-file', (event, p) => {
    try { event.reply('file-content', { path: p, content: fs.readFileSync(p, 'utf8') }); }
    catch(e) { event.reply('file-content', { path: p, content: `Error: ${e.message}` }); }
});
ipcMain.on('write-file', (event, { filePath, content }) => {
    try { fs.writeFileSync(filePath, content, 'utf8'); event.reply('exec-output', { type: 'stdout', data: `✅ Written: ${filePath}\n` }); }
    catch(e) { event.reply('exec-output', { type: 'stderr', data: `❌ Write error: ${e.message}\n` }); }
});
ipcMain.on('open-folder-dialog', async event => {
    const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
    if (!r.canceled && r.filePaths.length) event.reply('folder-selected', r.filePaths[0]);
});

// ── Workspaces ───────────────────────────────────────────────────
ipcMain.on('get-workspaces', event => {
    const dir = path.join(os.homedir(), 'OllamaX-Projects');
    if (!fs.existsSync(dir)) return event.reply('workspaces-list', []);
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true })
            .filter(f => f.isDirectory() && !f.name.startsWith('.'))
            .map(f => f.name);
        event.reply('workspaces-list', items);
    } catch { event.reply('workspaces-list', []); }
});

// ── Hardware stats ────────────────────────────────────────────────
ipcMain.on('get-stats', event => {
    const total = Math.round(os.totalmem() / 1073741824);
    const free  = Math.round(os.freemem()  / 1073741824);
    const used  = total - free;
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
    event.reply('stats', { used, free, total, percent: Math.round((used / total) * 100), cpu });
});
