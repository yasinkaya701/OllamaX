/**
 * tests/config-migrations.test.js — config-migrations ve config-store testleri
 *
 * NOT: config-store electron.app gerektirir; bu testlerde setApp(null) ile
 * userData varsayılanı kullanılır ve geçici dizin üzerinde çalışır.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  migrateConfig,
  migrateV2ToV3,
  migrateV3ToV2,
  migrateV3ToV4,
  migrateV4ToV3,
  getSchemaVersion,
  CURRENT_SCHEMA_VERSION,
} = require('../src/main/config/config-migrations');

const configStore = require('../src/main/config/config-store');
const { isFeatureEnabled, normalizeFeatures } = require('../src/main/config/feature-flags');

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-test-'));
  // electron.app yerine geçici yol döndüren sahte app
  configStore.setApp({ getPath: () => tmpDir });
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('migrateV2ToV3', () => {
  test('eski chat-session formatını v3 config\'e taşır', () => {
    const raw = {
      settings: {
        openai: 'test-openai-key',
        anthropic: 'test-anthropic-key',
        gemini: 'test-gemini-key',
        ollamaHost: '192.168.1.5:11434',
        theme: 'light',
      },
      agents: [{ id: 'dev', name: 'Dev', model: 'llama3.2:1b' }],
      workspaces: ['/home/user/proje'],
      history: [{ role: 'user', content: 'merhaba' }],
    };
    const v3 = migrateV2ToV3(raw);
    expect(v3.schemaVersion).toBe(3);
    expect(v3.migratedFrom).toBe(2);
    expect(v3.app.theme).toBe('light');
    expect(v3.providers.openai.apiKey).toBe('ENV:test-openai-key');
    expect(v3.providers.anthropic.apiKey).toBe('ENV:test-anthropic-key');
    expect(v3.providers.gemini.apiKey).toBe('ENV:test-gemini-key');
    expect(v3.providers.ollama.hosts).toEqual(['192.168.1.5:11434']);
    expect(v3.agents[0].id).toBe('dev');
    expect(v3.workspaces[0].path).toBe('/home/user/proje');
    expect(v3.sessions[0].messages[0].content).toBe('merhaba');
  });

  test('ollamaMachines dizisini host haritasına çevirir', () => {
    const raw = {
      settings: {
        ollamaMachines: [{ host: 'host1:11434' }, { host: 'host2:11434' }],
        defaultOllamaMachineId: 'host2',
      },
      agents: [],
    };
    const v3 = migrateV2ToV3(raw);
    expect(v3.providers.ollama.hosts).toEqual(['host1:11434', 'host2:11434']);
    expect(v3.providers.ollama.defaultHostId).toBe('host2');
  });

  test('boş/bozuk girişte varsayılan config üretir', () => {
    const v3 = migrateV2ToV3({ settings: {} });
    expect(v3.schemaVersion).toBe(3);
    expect(v3.providers.ollama.hosts).toEqual(['localhost:11434']);
    expect(v3.providers.openai.apiKey).toBe('');
    expect(Array.isArray(v3.agents)).toBe(true);
    expect(Array.isArray(v3.workspaces)).toBe(true);
    expect(v3.sessions).toEqual([]);
  });

  test('null girdide null değil güvenli obje döndürmez - config null ise migrateConfig null döner', () => {
    expect(migrateConfig(null)).toBeNull();
    expect(migrateConfig([])).toBeNull();
    expect(migrateConfig('metin')).toBeNull();
  });
});

describe('migrateV3ToV2', () => {
  test('geri dönüş v2 formatı üretir', () => {
    const v3 = {
      schemaVersion: 3,
      app: { theme: 'dark', language: 'tr', ghostMode: true },
      providers: {
        ollama: { hosts: ['localhost:11434'] },
        openai: { apiKey: 'ENV:test-openai' },
        anthropic: { apiKey: 'ENV:test-anthropic' },
        gemini: { apiKey: 'test-gemini' },
      },
      agents: [{ id: 'a1' }],
      workspaces: [{ path: '/home/user/p' }],
      sessions: [{ messages: [{ role: 'user', content: 'hi' }] }],
    };
    const v2 = migrateV3ToV2(v3);
    expect(v2.settings.openai).toBe('test-openai');
    expect(v2.settings.anthropic).toBe('test-anthropic');
    expect(v2.settings.gemini).toBe('test-gemini');
    expect(v2.settings.ghostMode).toBe(true);
    expect(v2.agents[0].id).toBe('a1');
    expect(v2.workspaces[0]).toBe('/home/user/p');
    expect(v2.history[0].content).toBe('hi');
  });
});

describe('v3 -> v4 feature flag migration', () => {
  test('v3 config v4Workspace kapalı olacak şekilde v4 olur', () => {
    const v3 = { schemaVersion: 3, app: { theme: 'dark' }, providers: {}, agents: [], workspaces: [] };
    const v4 = migrateV3ToV4(v3);
    expect(v4.schemaVersion).toBe(4);
    expect(v4.features).toEqual({ v4Workspace: false });
    expect(v4.app.theme).toBe('dark');
  });

  test('mevcut feature alanlarını korur ve yalnızca açık true değerini etkin sayar', () => {
    const v4 = migrateV3ToV4({ schemaVersion: 3, features: { experimentalOther: true, v4Workspace: 'yes' } });
    expect(v4.features.experimentalOther).toBe(true);
    expect(v4.features.v4Workspace).toBe(false);
  });

  test('v4 -> v3 downgrade feature alanını kaldırır', () => {
    const v3 = migrateV4ToV3({ schemaVersion: 4, features: { v4Workspace: true }, app: { theme: 'dark' } });
    expect(v3.schemaVersion).toBe(3);
    expect(v3.features).toBeUndefined();
    expect(v3.app.theme).toBe('dark');
  });
});

describe('migrateConfig zinciri', () => {
  test('v2 -> güncel şema zinciri v4\'e ulaşır', () => {
    const v4 = migrateConfig(
      { settings: { openai: 'test-key' }, agents: [], workspaces: [], history: [] },
      CURRENT_SCHEMA_VERSION,
    );
    expect(getSchemaVersion(v4)).toBe(4);
    expect(v4.features.v4Workspace).toBe(false);
  });

  test('v3 config varsayılan hedefte v4\'e taşınır', () => {
    const cfg = { schemaVersion: 3, providers: { ollama: { hosts: ['h'] } } };
    const migrated = migrateConfig(cfg);
    expect(migrated).not.toBe(cfg);
    expect(migrated.schemaVersion).toBe(4);
    expect(isFeatureEnabled(migrated, 'v4Workspace')).toBe(false);
  });

  test('zaten güncel şemadaysa aynı nesne döner', () => {
    const cfg = { schemaVersion: CURRENT_SCHEMA_VERSION, features: { v4Workspace: false } };
    expect(migrateConfig(cfg)).toBe(cfg);
  });

  test('getSchemaVersion eksik sürümde 2 kabul eder', () => {
    expect(getSchemaVersion({ settings: {} })).toBe(2);
    expect(getSchemaVersion(null)).toBe(0);
  });
});

describe('feature flag helpers', () => {
  test('eksik flag default-off davranır', () => {
    expect(normalizeFeatures({})).toEqual({ v4Workspace: false });
    expect(isFeatureEnabled({}, 'v4Workspace')).toBe(false);
    expect(isFeatureEnabled({ features: { v4Workspace: true } }, 'v4Workspace')).toBe(true);
    expect(isFeatureEnabled({ features: { v4Workspace: 'true' } }, 'v4Workspace')).toBe(false);
    expect(isFeatureEnabled({}, 'bilinmeyen')).toBe(false);
  });
});

describe('configStore (geçici dizin)', () => {
  test('readConfig yeni kurulumda güncel şema config yazıyor', () => {
    const cfg = configStore.readConfig();
    expect(cfg.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(cfg.providers.ollama.hosts).toContain('localhost:11434');
    // Fresh config'te alan henüz fiziksel olarak bulunmasa bile runtime default-deny davranır.
    expect(isFeatureEnabled(cfg, 'v4Workspace')).toBe(false);
  });

  test('updateConfig ve readConfig tutarlı', () => {
    configStore.updateConfig((c) => ({ ...c, app: { ...(c.app || {}), theme: 'light' } }));
    expect(configStore.readConfig().app.theme).toBe('light');
  });

  test('resolvedProviders ENV: değerlerini çözer', () => {
    process.env.KREYX_TEST_KEY = 'secret-for-test';
    configStore.updateConfig((c) => ({
      ...c,
      providers: { ...c.providers, openai: { apiKey: 'ENV:KREYX_TEST_KEY' } },
    }));
    const providers = configStore.resolvedProviders(configStore.readConfig());
    expect(providers.openai).toBe('secret-for-test');
    delete process.env.KREYX_TEST_KEY;
  });

  test('resolveApiKey ön ek olmayan değeri olduğu gibi döner', () => {
    expect(configStore.resolveApiKey('plain-test-value')).toBe('plain-test-value');
    expect(configStore.resolveApiKey('')).toBe('');
    expect(configStore.resolveApiKey(null)).toBe('');
  });

  test('session CRUD', () => {
    const data = { messages: [{ role: 'user', content: 'test' }], createdAt: new Date().toISOString() };
    const r1 = configStore.writeSession('test-session', data);
    expect(r1.ok).toBe(true);
    const loaded = configStore.readSession('test-session');
    expect(loaded.messages[0].content).toBe('test');
    expect(configStore.listSessions()).toContain('test-session');
    const r2 = configStore.deleteSession('test-session');
    expect(r2.ok).toBe(true);
    expect(configStore.readSession('test-session')).toBeNull();
  });

  test('geçersiz oturum kimliği güvenli hale getirilir (traversal önlenir)', () => {
    const p1 = configStore.sessionPath('../hack');
    const p2 = configStore.sessionPath('../../../etc/passwd');
    expect(p1).not.toContain('..');
    expect(p2).not.toContain('..');
    expect(p1.endsWith('hack.json')).toBe(true);
    expect(p2.endsWith('etcpasswd.json')).toBe(true);
    expect(() => configStore.sessionPath('')).toThrow();
  });

  test('session 15MB üst sınır kontrolü', () => {
    const big = { messages: new Array(500000).fill('a'.repeat(60)) };
    const r = configStore.writeSession('big-session', big);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('15 MB');
  });

  test('atomicWriteJson 2MB tavanı aşan config\'i reddeder', () => {
    expect(() => configStore.atomicWriteJson(path.join(tmpDir, 'big.json'), { x: 'a'.repeat(3_000_000) })).toThrow();
  });
});