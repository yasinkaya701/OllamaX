/**
 * config-store.js — Şema-sürümlü konfigürasyon depolama (F1.2)
 *
 * Veri düzeni:
 *   userData/ollamax/
 *     config.json            — settings, providers, agents, workspaces (şema v3)
 *     sessions/{sessionId}.json — sohbet oturum mesajları
 *     legacy-sessions.json   — v2 geçmişinden taşınan oturumlar
 *     checkpoints/           — ajan döngüsü checkpoint'leri
 *     memory/                — semantic memory (Faz 3)
 *     generated/             — üretlen medya
 *     plugins/               — eklentiler (Faz 5)
 *     audit.jsonl            — denetim kayıtları (Faz 6)
 *
 * Kurallar:
 *  - Atomic write (yeni dosyaya yaz + rename) ile config korunur
 *  - ENV: ön ekli API key'ler disk yerine process.env'den okunur
 *  - migration otomatik uygulanır (v2 -> v3), orijinal .bak olarak saklanır
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { migrateConfig, getSchemaVersion, CURRENT_SCHEMA_VERSION } = require('./config-migrations');

const MAX_CONFIG_BYTES = 2 * 1024 * 1024; // 2MB config tavanı
const MAX_SESSION_BYTES = 15 * 1024 * 1024; // 15MB oturum tavanı (mevcut davranış)

let app = null; // electron.app referansı (setApp ile verilir)

function setApp(electronApp) {
  app = electronApp;
}

function userDataDir() {
  if (!app) return path.join(os.homedir(), '.ollamax');
  return app.getPath('userData');
}

function ollamaxRoot() {
  return path.join(userDataDir(), 'ollamax');
}

function configPath() {
  return path.join(ollamaxRoot(), 'config.json');
}

function sessionsDir() {
  return path.join(ollamaxRoot(), 'sessions');
}

function checkpointsDir() {
  return path.join(ollamaxRoot(), 'checkpoints');
}

function memoryDir() {
  return path.join(ollamaxRoot(), 'memory');
}

function generatedDir() {
  return path.join(ollamaxRoot(), 'generated');
}

function pluginsDir() {
  return path.join(ollamaxRoot(), 'plugins');
}

function auditLogPath() {
  return path.join(ollamaxRoot(), 'audit.jsonl');
}

function legacySessionsPath() {
  return path.join(ollamaxRoot(), 'legacy-sessions.json');
}

function sessionPath(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64);
  if (!safe) throw new Error('Geçersiz oturum kimliği');
  return path.join(sessionsDir(), `${safe}.json`);
}

/**
 * ENV: ön ekli string'i env'den çözer; ön ek yoksa olduğu gibi döner.
 */
function resolveApiKey(value) {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('ENV:')) {
    const envName = value.slice(4).trim();
    return envName ? process.env[envName] || '' : '';
  }
  return value;
}

function stripEnv(value) {
  if (typeof value !== 'string') return '';
  return value.startsWith('ENV:') ? value.slice(4) : value;
}

function ensureDirs() {
  for (const dir of [ollamaxRoot(), sessionsDir(), checkpointsDir(), memoryDir(), generatedDir(), pluginsDir()]) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        /* disk izni yoksa degrade */
      }
    }
  }
}

/**
 * Dosyaya atomic JSON yazımı: temp -> rename. Aynı dosya sisteminde rename
 * atomiktir; çökme durumunda eski dosya korunur.
 */
function atomicWriteJson(filePath, data) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.tmp-${process.pid}`);
  const body = JSON.stringify(data, null, 2);
  if (Buffer.byteLength(body, 'utf8') > MAX_CONFIG_BYTES) {
    throw new Error(`Config boyutu tavanı aştı (2 MB).`);
  }
  fs.writeFileSync(tmp, body, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const st = fs.statSync(filePath);
    if (st.size > MAX_CONFIG_BYTES) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Config'i okur, migration uygular, cache'de tutar.
 * Geriye uyum: eski chat-session.json (userData/chat-session.json) açılışta
 * otomatik taşınır, orijinal .bak olarak bırakılır.
 */
let configCache = null;

function readConfig() {
  if (configCache) return configCache;
  ensureDirs();
  // Yeni yol
  let config = readJsonSafe(configPath());
  let migratedLegacy = false;

  // Eski yol (geriye uyum): userData/chat-session.json
  if (!config) {
    const legacy = readJsonSafe(path.join(userDataDir(), 'chat-session.json'));
    if (legacy) {
      config = migrateConfig(legacy, CURRENT_SCHEMA_VERSION);
      migratedLegacy = true;
      // Orijinali .bak olarak bırak
      try {
        fs.renameSync(
          path.join(userDataDir(), 'chat-session.json'),
          path.join(userDataDir(), 'chat-session.json.bak'),
        );
      } catch {
        /* ignore */
      }
      try {
        atomicWriteJson(configPath(), config);
      } catch {
        /* ignore */
      }
    }
  }

  if (!config) {
    config = defaultConfig();
    try {
      atomicWriteJson(configPath(), config);
    } catch {
      /* ignore */
    }
  } else {
    const version = getSchemaVersion(config);
    if (version !== CURRENT_SCHEMA_VERSION) {
      config = migrateConfig(config, CURRENT_SCHEMA_VERSION);
      if (config) {
        try {
          atomicWriteJson(configPath(), config);
        } catch {
          /* ignore */
        }
      }
    }
    if (migratedLegacy) {
      // Legacy geçmiş oturumlarını legacy-sessions.json içine yerleştir
      try {
        const legacySessions = readJsonSafe(legacySessionsPath()) || { sessions: [] };
        const incoming = Array.isArray(config.sessions) ? config.sessions : [];
        if (incoming.length && !legacySessions.sessions.length) {
          legacySessions.sessions = incoming;
          atomicWriteJson(legacySessionsPath(), legacySessions);
        }
        // config'teki sessions alanını kaldır (mesajlar artık sessions/ dizininde)
        delete config.sessions;
        configCache = config;
        return config;
      } catch {
        /* continue with sessions in config as-is */
      }
    }
  }

  configCache = config;
  return config;
}

function defaultConfig() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    app: { theme: 'dark', language: 'tr', ghostMode: false, defaultProvider: 'ollama' },
    providers: {
      ollama: { hosts: ['localhost:11434'], defaultHostId: 'default', pollInterval: 30000 },
      openai: { apiKey: '', modelFallback: ['gpt-5.5', 'gpt-5.3', 'gpt-5', 'gpt-4o'] },
      anthropic: { apiKey: '' },
      gemini: { apiKey: '' },
    },
    agents: [],
    workspaces: [],
  };
}

function writeConfig(config) {
  ensureDirs();
  atomicWriteJson(configPath(), config);
  configCache = config;
  return true;
}

function updateConfig(updater) {
  const config = readConfig();
  const next = updater(config);
  if (!next || typeof next !== 'object') throw new Error('config updater geçersiz sonuç döndürdü');
  next.schemaVersion = CURRENT_SCHEMA_VERSION;
  writeConfig(next);
  return next;
}

/**
 * Config'teki tüm ENV: değerlerini çözerek API key'leri döndürür.
 * Geriye uyum: renderer'ın state.settings{openai,anthropic,gemini} beklentisi
 * için resolve edilmiş değerler verilir (diskte ENV: kalır).
 */
function resolvedProviders(config) {
  const p = (config && config.providers) || {};
  return {
    ollama: { hosts: Array.isArray(p.ollama?.hosts) ? p.ollama.hosts : ['localhost:11434'] },
    openai: resolveApiKey(p.openai?.apiKey),
    anthropic: resolveApiKey(p.anthropic?.apiKey),
    gemini: resolveApiKey(p.gemini?.apiKey),
  };
}

/**
 * Oturum dosyasını okur (sessions/{id}.json)
 */
function readSession(sessionId) {
  return readJsonSafe(sessionPath(sessionId));
}

/**
 * Oturum dosyasını atomic olarak yazar.
 */
function writeSession(sessionId, data) {
  ensureDirs();
  const p = sessionPath(sessionId);
  const body = JSON.stringify(data || {});
  if (Buffer.byteLength(body, 'utf8') > MAX_SESSION_BYTES) {
    return { ok: false, error: 'Oturum verisi çok büyük (15 MB üst sınır).' };
  }
  try {
    atomicWriteJson(p, data);
    return { ok: true, path: p };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Listeleme: sessions/ altındaki oturum kimlikleri
 */
function listSessions() {
  ensureDirs();
  try {
    return fs
      .readdirSync(sessionsDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5))
      .sort();
  } catch {
    return [];
  }
}

function deleteSession(sessionId) {
  try {
    fs.unlinkSync(sessionPath(sessionId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  setApp,
  userDataDir,
  ollamaxRoot,
  configPath,
  sessionsDir,
  checkpointsDir,
  memoryDir,
  generatedDir,
  pluginsDir,
  auditLogPath,
  sessionPath,
  resolveApiKey,
  stripEnv,
  atomicWriteJson,
  readConfig,
  writeConfig,
  updateConfig,
  defaultConfig,
  resolvedProviders,
  readSession,
  writeSession,
  listSessions,
  deleteSession,
  CURRENT_SCHEMA_VERSION,
  MAX_CONFIG_BYTES,
  MAX_SESSION_BYTES,
};
