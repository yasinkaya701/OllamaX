/**
 * plugins/loader.js — Eklenti yükleme ve sandbox (F5.1, ADR-003)
 *
 * Eklenti yapısı: userData/Krevyx/plugins/{id}/
 *   manifest.json + index.js (+ opsiyonel assets)
 *
 * Sandbox kuralları:
 *  - Eklenti kodu Node vm.Context içinde çalışır
 *  - Yalnızca manifest.permissions listesindeki IPC'leri çağırabilir
 *  - child_process, fs raw, net, require dışı her şey yasak
 *  - pluginApi üzerinden komut kayıt + ayar paneli ekleme
 *  - Crash-loop koruması: 3 hata ardışık -> eklenti devre dışı
 */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const configStore = require('../config/config-store');
const auditLog = require('../audit-log');

const MAX_PLUGIN_LOAD_MS = 5000;
const MAX_INIT_ERRORS = 3;

/**
 * Manifest doğrulaması
 */
function validateManifest(m) {
  if (!m || typeof m !== 'object') return 'manifest eksik';
  if (typeof m.id !== 'string' || !/^[a-z0-9.\-_]{2,64}$/.test(m.id)) return 'geçersiz eklenti kimliği';
  if (typeof m.name !== 'string' || !m.name.trim()) return 'eklenti adı eksik';
  if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(m.version)) return 'geçersiz sürüm';
  if (typeof m.main !== 'string' || !m.main.endsWith('.js')) return 'geçersiz ana dosya';
  if (!Array.isArray(m.permissions)) return 'permissions dizisi gerekli';
  for (const p of m.permissions) {
    if (typeof p !== 'string' || p.length > 80) return `geçersiz izin: ${p}`;
  }
  return null;
}

class PluginSandbox {
  constructor(id, manifest, pluginDir) {
    this.id = id;
    this.manifest = manifest;
    this.pluginDir = pluginDir;
    this.active = true;
    this.initErrors = 0;
    this.api = {
      commands: new Map(),
      settingsPanels: [],
      grantedPermissions: new Set(manifest.permissions || []),
    };
  }

  /**
   * Eklentiye verilen kısıtlı pluginApi nesnesi
   */
  buildPluginApi(ipcInvoke) {
    const self = this;
    return {
      registerCommand(name, handler) {
        if (typeof name !== 'string' || typeof handler !== 'function') return;
        self.api.commands.set(name, handler);
      },
      addSettingsPanel(title, html) {
        self.api.settingsPanels.push({ title: String(title || ''), html: String(html || '') });
      },
      invokeIPC(channel, payload) {
        if (!self.api.grantedPermissions.has(channel)) {
          throw new Error(`İzin dışı IPC: ${channel}`);
        }
        return ipcInvoke(channel, payload);
      },
      log(msg) {
        console.log(`[plugin:${self.id}] ${msg}`);
      },
    };
  }

  async load(ipcInvoke) {
    const mainPath = path.join(this.pluginDir, this.manifest.main);
    if (!fs.existsSync(mainPath)) return { ok: false, error: 'Ana dosya bulunamadı.' };
    const source = fs.readFileSync(mainPath, 'utf8');

    const pluginApi = this.buildPluginApi(ipcInvoke);
    const context = vm.createContext({
      pluginApi,
      console: { log: (...a) => console.log(`[plugin:${this.id}]`, ...a), error: (...a) => console.error(`[plugin:${this.id}]`, ...a) },
      setTimeout,
      setInterval,
      clearTimeout,
      clearInterval,
      JSON,
      Promise,
      Array,
      Object,
      String,
      Number,
      Boolean,
      Math,
      Date,
      Error,
      RegExp,
      URL,
      Buffer,
      undefined,
    });

    try {
      const script = new vm.Script(`(function(pluginApi){ ${source}\n})(pluginApi);`, {
        filename: `plugin-${this.id}.js`,
      });
      const timeoutHandle = setTimeout(() => this.initErrors += 0, MAX_PLUGIN_LOAD_MS);
      script.runInContext(context, { timeout: MAX_PLUGIN_LOAD_MS });
      clearTimeout(timeoutHandle);
      auditLog.logEntry('plugin', 'plugin:loaded', { id: this.id, version: this.manifest.version });
      return { ok: true };
    } catch (err) {
      this.initErrors += 1;
      if (this.initErrors >= MAX_INIT_ERRORS) this.active = false;
      auditLog.logEntry('plugin', 'plugin:load-failed', { id: this.id, error: String(err.message).slice(0, 200) });
      return { ok: false, error: err.message };
    }
  }
}

/**
 * Global eklenti yönetimi
 */
const plugins = new Map();

function pluginsDir() {
  return configStore.pluginsDir();
}

function listPluginDirs() {
  try {
    if (!fs.existsSync(pluginsDir())) return [];
    return fs
      .readdirSync(pluginsDir())
      .map((d) => path.join(pluginsDir(), d))
      .filter((d) => fs.statSync(d).isDirectory());
  } catch {
    return [];
  }
}

function loadAll(ipcInvoke) {
  const results = [];
  for (const dir of listPluginDirs()) {
    const manifestPath = path.join(dir, 'manifest.json');
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      results.push({ dir, ok: false, error: 'manifest okunamadı' });
      continue;
    }
    const err = validateManifest(manifest);
    if (err) {
      results.push({ dir, ok: false, error: err });
      continue;
    }
    const sandbox = new PluginSandbox(manifest.id, manifest, dir);
    plugins.set(manifest.id, sandbox);
    void sandbox.load(ipcInvoke).then((r) => results.push({ dir, ...r, id: manifest.id }));
  }
  return results;
}

function uninstallPlugin(id) {
  const sandbox = plugins.get(id);
  if (!sandbox) return { ok: false, error: 'Eklenti bulunamadı.' };
  sandbox.active = false;
  plugins.delete(id);
  try {
    const dir = path.join(pluginsDir(), id);
    fs.rmSync(dir, { recursive: true, force: true });
    auditLog.logEntry('user', 'plugin:uninstalled', { id });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function listPlugins() {
  return [...plugins.entries()].map(([id, s]) => ({
    id,
    name: s.manifest.name,
    version: s.manifest.version,
    description: s.manifest.description || '',
    permissions: s.manifest.permissions || [],
    active: s.active,
    settingsPanels: s.api.settingsPanels,
  }));
}

module.exports = {
  validateManifest,
  PluginSandbox,
  loadAll,
  uninstallPlugin,
  listPlugins,
  pluginsDir,
};
