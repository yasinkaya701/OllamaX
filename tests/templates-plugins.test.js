/**
 * tests/templates-plugins.test.js — V3.17 (Topluluk & Ekosistem) birim testleri
 *
 * - templates.js: listTemplates (gömülü + kullanıcı), saveTemplate, deleteTemplate
 * - plugins/loader.js: validateManifest, installPlugin, uninstallPlugin, listPlugins
 */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');

/* electron gerektiren modülleri izole etmek için mock'lar */
jest.mock('electron', () => ({}), { virtual: true });

/* config-store'un userData yolunu geçici dizine yönlendir */
const configStore = require('../src/main/config/config-store');

let tmpDir;
beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v317-'));
  configStore.setApp({ getPath: () => tmpDir });
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

/* audit-log electron/ipc log gerektirmez ama main-process'te fs yazar; mock */
jest.mock('../src/main/audit-log', () => ({
  logEntry: () => {},
}));

const tpl = require('../src/main/agents/templates');
const { validateManifest, installPlugin, uninstallPlugin, listPlugins, loadAll } = require('../src/main/plugins/loader');

describe('templates.js — şablon yönetimi', () => {
  test('gömülü starter paketi listelenir', () => {
    const list = tpl.listTemplates();
    const ids = list.map((t) => t.id);
    expect(ids).toContain('code-review');
    expect(ids).toContain('refactoring');
    expect(ids).toContain('daily-standup');
    expect(list[0].source).toMatch(/^bundled:/);
  });

  test('saveTemplate kullanıcı dizinine yazar', () => {
    const res = tpl.saveTemplate({ id: 'test-tpl', label: 'Test', category: 'kod', prompt: 'Merhaba {{date}}' });
    expect(res.ok).toBe(true);
    const dir = tpl.templateDir();
    expect(fs.existsSync(path.join(dir, 'test-tpl.json'))).toBe(true);
  });

  test('listTemplates kullanıcı şablonunu gömülüleri override eder', () => {
    tpl.saveTemplate({ id: 'code-review', label: 'Override CR', category: 'kod', prompt: 'override' });
    const found = tpl.listTemplates().find((t) => t.id === 'code-review');
    expect(found.label).toBe('Override CR');
    expect(found.source).toBe('user');
  });

  test('deleteTemplate yalnızca kullanıcı şablonunu siler', () => {
    tpl.saveTemplate({ id: 'del-me', label: 'Silinecek', prompt: 'x' });
    expect(tpl.deleteTemplate('del-me').ok).toBe(true);
    expect(tpl.listTemplates().find((t) => t.id === 'del-me')).toBeUndefined();
    /* kullanıcı override'i silinince gömülü şablon yeniden görünür (kaynak: bundled) */
    const pre = tpl.deleteTemplate('code-review');
    expect(pre.ok).toBe(true);
    const found = tpl.listTemplates().find((t) => t.id === 'code-review');
    expect(found).toBeDefined();
    expect(found.source).toBe('bundled:starter');
  });

  test('geçersiz kimliklerle güvenli davranır', () => {
    expect(tpl.deleteTemplate('').ok).toBe(false);
    expect(tpl.saveTemplate({ id: 'a b!c' }).ok).toBe(true);
    const files = fs.readdirSync(tpl.templateDir());
    expect(files.some((f) => !/^[A-Za-z0-9_-]+\.json$/.test(f))).toBe(false);
  });

  test('prompt değişkenleri interpolasyon desteği', () => {
    const out = tpl.interpolatePrompt('Tarih: {{date}} — OS: {{os}}', { model: 'llama3' });
    expect(out).toContain(new Date().toISOString().slice(0, 10));
    expect(out).toContain('OS: ');
  });
});

describe('plugins/loader.js — eklenti altyapısı', () => {
  const goodManifest = {
    id: 'ornek-eklenti',
    name: 'Örnek Eklenti',
    version: '1.0.0',
    main: 'index.js',
    permissions: [],
  };
  const noopCode = 'pluginApi.log("merhaba");';

  test('manifest doğrulaması geçerli paketi kabul eder', () => {
    expect(validateManifest(goodManifest)).toBeNull();
  });

  test('geçersiz manifestleri reddeder', () => {
    expect(validateManifest(null)).not.toBeNull();
    expect(validateManifest({ id: 'A B', name: 'X', version: '1.0.0', main: 'a.js', permissions: [] })).not.toBeNull();
    expect(validateManifest({ ...goodManifest, version: 'dev' })).not.toBeNull();
    expect(validateManifest({ ...goodManifest, permissions: 'x' })).not.toBeNull();
  });

  test('installPlugin paketi diske yazar ve listelenir', () => {
    loadAll(async () => {});
    const res = installPlugin({ manifest: goodManifest, code: noopCode });
    expect(res.ok).toBe(true);
    const dir = path.join(require('../src/main/plugins/loader').pluginsDir(), 'ornek-eklenti');
    expect(fs.existsSync(path.join(dir, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'index.js'))).toBe(true);
    const ps = listPlugins();
    expect(ps.find((p) => p.id === 'ornek-eklenti')).toBeDefined();
  });

  test('duplicate kurulum reddedilir', () => {
    const res = installPlugin({ manifest: goodManifest, code: noopCode });
    expect(res.ok).toBe(false);
  });

  test('eksik code ile kurulum reddedilir', () => {
    const res = installPlugin({ manifest: { ...goodManifest, id: 'yeni-eklenti' }, code: '' });
    expect(res.ok).toBe(false);
  });

  test('uninstallPlugin kaldırır', () => {
    const dir = path.join(require('../src/main/plugins/loader').pluginsDir(), 'ornek-eklenti');
    expect(uninstallPlugin('ornek-eklenti').ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
    expect(listPlugins().find((p) => p.id === 'ornek-eklenti')).toBeUndefined();
    expect(uninstallPlugin('var-olmayan').ok).toBe(false);
  });
});
