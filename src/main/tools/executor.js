/**
 * tools/executor.js — Araç çalıştırıcı (F2.1)
 *
 * main.js'teki mevcut IPC implementasyonlarını (read-file, list-dir,
 * scan-project, git-clone, terminal-create) araç semantiğine sarar.
 * Tüm dosya erişimi resolveReadablePath sandbox'ından geçer; tüm spawn
 * çağrıları argüman dizisi ile (shell:false) yapılır.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { resolveReadablePath, isAllowedGitCloneUrl } = require('../../main-security');
const { validateToolArgs, isDangerousCommand } = require('./registry');
const configStore = require('../config/config-store');
const auditLog = require('../audit-log');

const MAX_FILE_READ_BYTES = 2 * 1024 * 1024;

/**
 * Sandbox köklerini çözer: home + workspace + user_selected klasörler
 */
function allowedRoots(manifest) {
  const roots = [];
  if (!manifest || !manifest.sandbox || !manifest.sandbox.roots) return roots;
  for (const r of manifest.sandbox.roots) {
    if (r === 'home') roots.push(os.homedir());
    if (r === 'workspace') {
      // Workspace kökleri kullanıcı seçimiyle registerUserFolder üzerinden
      // readableRoots'a eklenir; ek olarak config'teki workspaces listesi
      // doğrudan root olarak eklenir.
      const config = configStore.readConfig();
      for (const w of config?.workspaces || []) {
        if (w && typeof w.path === 'string' && w.path.trim()) roots.push(path.resolve(w.path));
      }
    }
    if (r === 'user_selected') {
      // Terminal/klasör seçiciyle açılan son klasör: config'te saklanır
      const last = (configStore.readConfig()?.app?.lastSelectedFolder || '').trim();
      if (last) roots.push(last);
    }
  }
  return roots;
}

function resolvePathWithSandbox(args, manifest) {
  const input = args && typeof args.path === 'string' ? args.path : (args && typeof args.root_path === 'string' ? args.root_path : null);
  if (!input) return { ok: false, error: 'Geçersiz yol.' };
  const resolved = resolveReadablePath(input, allowedRoots(manifest));
  if (!resolved) return { ok: false, error: 'Yol sandbox dışı veya geçersiz.' };
  return { ok: true, path: resolved };
}

async function readTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: `[HATA] ${r.error}`, error: r.error };
  try {
    if (!fs.existsSync(r.path)) return { content: `[HATA] Dosya bulunamadı: ${r.path}`, error: 'not_found' };
    const st = fs.statSync(r.path);
    if (st.isDirectory()) {
      const entries = fs.readdirSync(r.path);
      return { content: entries.map((e) => e).join('\n'), type: 'dir_listing', path: r.path };
    }
    if (st.size > MAX_FILE_READ_BYTES) {
      return { content: `[HATA] Dosya 2MB üst sınırını aşıyor (${st.size} bayt).`, error: 'too_large' };
    }
    const content = fs.readFileSync(r.path, 'utf8');
    return { content, type: 'text', path: r.path };
  } catch (err) {
    return { content: `[HATA] ${err.message}`, error: err.message };
  }
}

function listDirTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: r.error, error: r.error };
  try {
    const entries = fs.readdirSync(r.path, { withFileTypes: true }).map((d) => `${d.isDirectory() ? '[DIR]' : '[FILE]'} ${d.name}`);
    return { content: entries.join('\n'), type: 'dir_listing', path: r.path };
  } catch (err) {
    return { content: err.message, error: err.message };
  }
}

function createFileTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: r.error, error: r.error };
  if (typeof args.content !== 'string') return { content: 'İçerik eksik.', error: 'no_content' };
  try {
    fs.mkdirSync(path.dirname(r.path), { recursive: true });
    if (fs.existsSync(r.path)) {
      return { content: '[HATA] Dosya zaten var; düzenlemek için edit_file kullanın.', error: 'exists' };
    }
    fs.writeFileSync(r.path, args.content, 'utf8');
    return { content: `Dosya oluşturuldu: ${r.path}`, type: 'created', path: r.path };
  } catch (err) {
    return { content: err.message, error: err.message };
  }
}

function editFileTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: r.error, error: r.error };
  if (typeof args.content !== 'string') return { content: 'İçerik eksik.', error: 'no_content' };
  try {
    if (!fs.existsSync(r.path)) {
      fs.mkdirSync(path.dirname(r.path), { recursive: true });
    }
    fs.writeFileSync(r.path, args.content, 'utf8');
    return { content: `Dosya güncellendi: ${r.path}`, type: 'edited', path: r.path };
  } catch (err) {
    return { content: err.message, error: err.message };
  }
}

function appendFileTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: r.error, error: r.error };
  if (typeof args.content !== 'string') return { content: 'İçerik eksik.', error: 'no_content' };
  try {
    fs.mkdirSync(path.dirname(r.path), { recursive: true });
    fs.appendFileSync(r.path, args.content + (args.content.endsWith('\n') ? '' : '\n'), 'utf8');
    return { content: `Dosyaya eklendi: ${r.path}`, type: 'appended', path: r.path };
  } catch (err) {
    return { content: err.message, error: err.message };
  }
}

function deleteFileTool(args, manifest) {
  const r = resolvePathWithSandbox(args, manifest);
  if (!r.ok) return { content: r.error, error: r.error };
  try {
    if (!fs.existsSync(r.path)) return { content: '[HATA] Dosya bulunamadı.', error: 'not_found' };
    fs.unlinkSync(r.path);
    return { content: `Dosya silindi: ${r.path}`, type: 'deleted', path: r.path };
  } catch (err) {
    return { content: err.message, error: err.message };
  }
}

function terminalTool(args /* , manifest */) {
  const cmd = args && typeof args.command === 'string' ? args.command.trim() : '';
  if (!cmd) return { content: 'Komut eksik.', error: 'no_command' };
  if (isDangerousCommand(cmd)) {
    return { content: `[REDDEDİLDİ] Tehlikeli komut engellendi: ${cmd.split(/\s/)[0]}`, error: 'dangerous_command' };
  }
  // Asıl PTY çalıştırma main.js'teki ptySessions üzerinden yapılır;
  // burada yalnızca validasyon + meta döner.
  return { content: `TERM_READY:${cmd}`, type: 'term_ready', command: cmd };
}

function gitCloneTool(args) {
  const url = args && typeof args.url === 'string' ? args.url.trim() : '';
  if (!url) return { content: 'URL eksik.', error: 'no_url' };
  if (!isAllowedGitCloneUrl(url)) {
    return { content: `[REDDEDİLDİ] İzin verilmeyen git URL'si: ${url}`, error: 'url_not_allowed' };
  }
  return { content: `GIT_READY:${url}`, type: 'git_ready', url };
}

/**
 * Ana yürütücü: manifest tier'a göre route eder.
 */
async function executeTool(manifest, args, context = {}) {
  const started = process.hrtime.bigint();
  if (!manifest) {
    return { content: '[HATA] Bilinmeyen araç.', error: 'unknown_tool' };
  }
  if (!validateToolArgs(manifest, args)) {
    return { content: '[HATA] Araç argümanları şemaya uymuyor.', error: 'invalid_args' };
  }
  if (manifest.tier === 'exec' && args && typeof args.command === 'string' && isDangerousCommand(args.command)) {
    return { content: `[REDDEDİLDİ] Tehlikeli komut: ${args.command.split(/\s/)[0]}`, error: 'dangerous_command' };
  }

  let result;
  try {
    switch (manifest.name) {
      case 'read_file':
        result = await readTool(args, manifest);
        break;
      case 'list_dir':
        result = listDirTool(args, manifest);
        break;
      case 'scan_project': {
        // Mevcut scan-project IPC davranışına yönlendirme (asıl iş main.js'te)
        result = { content: `SCAN_READY:${args.root_path}`, type: 'scan_ready', path: args.root_path };
        break;
      }
      case 'create_file':
        result = createFileTool(args, manifest);
        break;
      case 'edit_file':
        result = editFileTool(args, manifest);
        break;
      case 'append_file':
        result = appendFileTool(args, manifest);
        break;
      case 'delete_file':
        result = deleteFileTool(args, manifest);
        break;
      case 'terminal_execute':
        result = terminalTool(args, manifest);
        break;
      case 'git_clone':
        result = gitCloneTool(args);
        break;
      case 'search_memory': {
        // Faz 3 memory modülü register edilirse devralır
        result = { content: '[BİLGİ] Bellek modülü henüz hazır değil.', type: 'pending' };
        break;
      }
      case 'memory_add': {
        result = { content: '[BİLGİ] Bellek modülü henüz hazır değil.', type: 'pending' };
        break;
      }
      case 'generate_image': {
        result = { content: `IMG_READY:${JSON.stringify({ prompt: args.prompt, provider: args.provider || 'openai', size: args.size || '1024x1024' })}`, type: 'img_ready' };
        break;
      }
      /* V3.18: tarayıcı kontrol araçları */
      case 'browser_navigate': {
        const browser = require('./browser');
        const navRes = await browser.navigate(args.url);
        result = { content: `NAV:${JSON.stringify(navRes)}`, type: 'browser_nav', ...navRes };
        break;
      }
      case 'browser_screenshot': {
        const browser = require('./browser');
        const shotRes = await browser.screenshot();
        result = { content: `[EKRAN] base64 PNG alındı (${shotRes.base64 ? Math.round((shotRes.base64.length * 3) / 4 / 1024) : 0} KB)`, type: 'browser_shot', ...shotRes };
        break;
      }
      case 'browser_click': {
        const browser = require('./browser');
        const clickRes = await browser.click(args.target);
        result = { content: `[TIKLAMA] ${clickRes.status}`, type: 'browser_click', ...clickRes };
        break;
      }
      case 'browser_type': {
        const browser = require('./browser');
        const typeRes = await browser.typeText(args.selector, args.text);
        result = { content: `[YAZMA] ${typeRes.status}`, type: 'browser_type', ...typeRes };
        break;
      }
      default:
        result = { content: `[HATA] Desteklenmeyen araç: ${manifest.name}`, error: 'unsupported' };
    }
  } catch (err) {
    result = { content: `[HATA] ${err.message}`, error: err.message };
  }

  const durationMs = Number(((process.hrtime.bigint() - started) / BigInt(1000000)).toString());
  auditLog.logEntry(context.actor || 'agent', `tool:${manifest.name}`, { tool: manifest.name, tier: manifest.tier, ok: !result.error }, durationMs);
  return result;
}

module.exports = {
  executeTool,
  allowedRoots,
  resolvePathWithSandbox,
  readTool,
  listDirTool,
  createFileTool,
  editFileTool,
  appendFileTool,
  deleteFileTool,
  terminalTool,
  gitCloneTool,
};
