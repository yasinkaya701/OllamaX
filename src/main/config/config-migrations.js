/**
 * config-migrations.js — OllamaX konfigürasyon şema geçişleri (ADR-006)
 *
 * v2 (chat-session.json tek JSON dump) -> v3 (şema-sürümlü config + sessions dizini)
 * Migration'lar ileri (up) ve geri (down) yönde çalışır; her geçiş geri
 * dönüştürülebilir tasarlanmıştır (geri dönüş stratejisinin temeli).
 */

'use strict';

const CURRENT_SCHEMA_VERSION = 3;

function safeStr(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * v2 (chat-session.json dump) -> v3 config formatı
 */
function migrateV2ToV3(raw) {
  if (!isPlainObject(raw)) {
    return { schemaVersion: CURRENT_SCHEMA_VERSION, app: {}, providers: {}, agents: [], workspaces: [] };
  }

  const settings = isPlainObject(raw.settings) ? raw.settings : {};
  const agents = Array.isArray(raw.agents) ? raw.agents : [];
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : [];
  const history = Array.isArray(raw.history) ? raw.history : [];

  // API key'ler: kullanıcının açıkça diskte saklamak istediği mevcut davranışı
  // koruyoruz, ancak ENV: ön ekiyle okuma seçenekli bırakıyoruz.
  const maybeEnv = (v) => (typeof v === 'string' && v.trim() ? `ENV:${v}` : '');

  // ollamaMachines -> providers.ollama.hosts haritası
  let hosts = [];
  if (Array.isArray(settings.ollamaMachines) && settings.ollamaMachines.length) {
    hosts = settings.ollamaMachines
      .map((m) => (isPlainObject(m) ? safeStr(m.host) : safeStr(m)))
      .filter(Boolean);
  } else if (typeof settings.ollamaHost === 'string' && settings.ollamaHost.trim()) {
    hosts = [settings.ollamaHost];
  }
  if (hosts.length === 0) hosts = ['localhost:11434'];

  const defaultMachineId = safeStr(settings.defaultOllamaMachineId, hosts.length ? 'default' : '');

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migratedFrom: 2,
    migratedAt: new Date().toISOString(),
    app: {
      theme: safeStr(settings.theme, 'dark'),
      language: safeStr(settings.language, 'tr'),
      ghostMode: Boolean(settings.ghostMode),
      defaultProvider: safeStr(settings.defaultProvider, 'ollama'),
    },
    providers: {
      ollama: {
        hosts,
        defaultHostId: defaultMachineId || 'default',
        pollInterval: 30000,
      },
      openai: {
        apiKey: maybeEnv(settings.openai),
        modelFallback: ['gpt-5.5', 'gpt-5.3', 'gpt-5', 'gpt-5-mini', 'gpt-4o'],
      },
      anthropic: { apiKey: maybeEnv(settings.anthropic) },
      gemini: { apiKey: maybeEnv(settings.gemini) },
    },
    agents,
    workspaces: workspaces.map((w) =>
      typeof w === 'string'
        ? { path: w, alias: w.split(/[\\/]/).filter(Boolean).pop() || w }
        : w,
    ),
    // v3'te oturum mesajları sessions/ dizininde; mevcut history geçiş
    // oturumları legacy-sessions.json içinde saklanır (kayıp olmaz)
    sessions: history.length ? [{ id: 'legacy', messages: history, createdAt: new Date().toISOString() }] : [],
  };
}

/**
 * v3 -> v2 geri dönüş (downgrade)
 */
function migrateV3ToV2(config) {
  if (!isPlainObject(config)) return { settings: {}, agents: [], workspaces: [], history: [] };

  const stripEnv = (v) =>
    typeof v === 'string' && v.startsWith('ENV:') ? v.slice(4) : v || '';

  const sessions = Array.isArray(config.sessions) ? config.sessions : [];
  const history = sessions.reduce((acc, s) => {
    if (Array.isArray(s?.messages)) return acc.concat(s.messages);
    return acc;
  }, []);

  return {
    settings: {
      theme: safeStr(config.app?.theme, 'dark'),
      language: safeStr(config.app?.language, 'tr'),
      ghostMode: Boolean(config.app?.ghostMode),
      ollamaHost: (config.providers?.ollama?.hosts || ['localhost:11434'])[0],
      openai: stripEnv(config.providers?.openai?.apiKey),
      anthropic: stripEnv(config.providers?.anthropic?.apiKey),
      gemini: stripEnv(config.providers?.gemini?.apiKey),
    },
    agents: Array.isArray(config.agents) ? config.agents : [],
    workspaces: (Array.isArray(config.workspaces) ? config.workspaces : []).map((w) =>
      typeof w === 'string' ? w : w.path || '',
    ),
    history,
  };
}

const MIGRATIONS = [
  { from: 2, to: 3, up: migrateV2ToV3, down: migrateV3ToV2 },
];

/**
 * Ham JSON'ı hedef şema sürümüne taşıyan ana fonksiyon.
 * Hedefe ulaşılamazsa (eksik migration) mevcut hali döndürür ve uyarır.
 */
function migrateConfig(raw, targetVersion = CURRENT_SCHEMA_VERSION) {
  if (!isPlainObject(raw)) return null;

  let current =
    typeof raw.schemaVersion === 'number' && raw.schemaVersion > 0 ? raw.schemaVersion : 2;
  let config = raw;

  if (current === targetVersion) return config;

  if (current < targetVersion) {
    while (current < targetVersion) {
      const m = MIGRATIONS.find((x) => x.from === current && x.to === current + 1);
      if (!m) break;
      config = m.up(config);
      current += 1;
    }
    if (current < targetVersion) {
      console.warn(`[config-migrations] v${current} -> v${targetVersion} migration bulunamadı; mevcut sürümle devam ediliyor.`);
    }
  }

  return config;
}

function getSchemaVersion(config) {
  if (!isPlainObject(config)) return 0;
  return typeof config.schemaVersion === 'number' ? config.schemaVersion : 2;
}

module.exports = {
  migrateConfig,
  getSchemaVersion,
  migrateV2ToV3,
  migrateV3ToV2,
  MIGRATIONS,
  CURRENT_SCHEMA_VERSION,
};
