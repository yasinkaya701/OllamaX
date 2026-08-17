'use strict';
/**
 * @jest-environment node
 * v324-updater.test.js — Krevyx v3.24: Otomatik güncelleme bildirim modülü
 *
 * updater.js'in ağ erişimi `options.fetch` üzerinden inject edildiği için
 * gerçek GitHub'a çıkılmadan tam davranış testi yapılır:
 *  - isOlderThan: semver + pre-release karşılaştırması
 *  - parseLatestYml: latest.yml ayrıştırma (geçerli / bozuk / boş)
 *  - checkForUpdate: latest.yml başarısı, API fallback'i, ağ hatası toleransı
 *  - önbellek TTL'si ve resetCacheForTest
 *
 * Electron `app` modülü jest için mock edilir (package.json üzerinden).
 */
const path = require('path');

/* --- Electron mock: test başında kurulmalıdır (require öncesi) --- */
jest.mock('electron', () => ({
  app: { getVersion: () => '3.23.0' },
}));

/* eslint-disable global-require */
const updater = require('../src/main/update/updater');

/* ------------------------------------------------------------------ */
describe('isOlderThan (semver karşılaştırma)', () => {
  const { isOlderThan } = updater;
  test('minor güncelleme daha yeni', () => expect(isOlderThan('3.23.0', '3.24.0')).toBe(true));
  test('patch güncelleme daha yeni', () => expect(isOlderThan('3.23.0', '3.23.1')).toBe(true));
  test('major güncelleme daha yeni', () => expect(isOlderThan('3.23.0', '4.0.0')).toBe(true));
  test('aynı sürüm yeni değil', () => expect(isOlderThan('3.23.0', '3.23.0')).toBe(false));
  test('v öneki toleransı', () => expect(isOlderThan('v3.23.0', '3.24.0')).toBe(true));
  test('pre-release, ayni core: pre-li surum daha eski', () => {
    expect(isOlderThan('3.24.0-alpha.1', '3.24.0')).toBe(true);
    expect(isOlderThan('3.24.0', '3.24.0-rc.1')).toBe(false);
  });
  test('pre-release sıralaması dizge karışıtlığı', () =>
    expect(isOlderThan('3.24.0-alpha', '3.24.0-beta')).toBe(true));
  test('eksik alan toleransı', () => expect(isOlderThan('3.23', '3.23.1')).toBe(true));
});

/* ------------------------------------------------------------------ */
describe('parseLatestYml', () => {
  const { parseLatestYml } = updater;
  const yml = [
    'version: 3.24.0',
    'files:',
    '  - Krevyx-Ultra-3.24.0.exe',
    '  - Krevyx-Ultra-3.24.0-arm64.dmg',
    '  - Krevyx-Ultra-3.24.0.AppImage',
    '  - Krevyx-Ultra-3.24.0.yml',
  ].join('\n');
  test('geçerli latest.yml: sürüm + platform dosyaları', () => {
    const p = parseLatestYml(yml);
    expect(p.version).toBe('3.24.0');
    expect(p.files).toContain('Krevyx-Ultra-3.24.0.AppImage');
    expect(p.files).toContain('Krevyx-Ultra-3.24.0-arm64.dmg');
    expect(p.files.some((f) => f.endsWith('.exe'))).toBe(true);
  });
  test('bozuk içerik → null', () => {
    expect(parseLatestYml('merhaba dünya')).toBeNull();
    expect(parseLatestYml('')).toBeNull();
    expect(parseLatestYml(null)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
function fakeFetch(responses) {
  return async (url) => {
    const hit = responses.find((r) => url.includes(r.urlKey));
    if (!hit || hit.error) throw new Error(hit ? hit.error : 'update-http-404');
    return hit.body;
  };
}

describe('checkForUpdate', () => {
  beforeEach(() => updater.resetCacheForTest());

  test('latest.yml başarısı → available doğru çözülür', async () => {
    const result = await updater.checkForUpdate({
      fetch: fakeFetch([{ urlKey: 'latest/download/latest.yml', body: 'version: 3.24.0\nfiles:\n  - Krevyx-Ultra-3.24.0.AppImage\n  - Krevyx-Ultra-3.24.0-arm64.dmg\n  - Krevyx-Ultra-3.24.0.exe\n' }]),
    });
    expect(result.available).toBe(true);
    expect(result.latestVersion).toBe('3.24.0');
    expect(result.currentVersion).toBe('3.23.0');
    expect(result.source).toBe('latest.yml');
    expect(result.assets.linux).toContain('Krevyx-Ultra-3.24.0.AppImage');
    expect(result.assets.mac).toContain('arm64.dmg');
  });

  test('yeni sürüm yoksa available=false', async () => {
    const result = await updater.checkForUpdate({
      fetch: fakeFetch([{ urlKey: 'latest/download/latest.yml', body: 'version: 3.23.0\nfiles:\n  - Krevyx-Ultra-3.23.0.AppImage\n' }]),
    });
    expect(result.available).toBe(false);
  });

  test('latest.yml yoksa GitHub API fallback', async () => {
    const body = JSON.stringify({
      tag_name: 'v3.25.0',
      html_url: 'https://github.com/yasinkaya701/OllamaX/releases/tag/v3.25.0',
      assets: [
        { name: 'Krevyx-Ultra-3.25.0.exe', browser_download_url: 'https://x/u.exe' },
        { name: 'Krevyx-Ultra-3.25.0-arm64.dmg', browser_download_url: 'https://x/u.dmg' },
        { name: 'Krevyx-Ultra-3.25.0.AppImage', browser_download_url: 'https://x/u.AppImage' },
      ],
    });
    const result = await updater.checkForUpdate({
      fetch: async (url) => {
        if (url.includes('latest.yml')) throw new Error('update-http-404');
        if (url.includes('api.github')) return body;
        throw new Error('bilinmeyen uç');
      },
    });
    expect(result.available).toBe(true);
    expect(result.latestVersion).toBe('3.25.0');
    expect(result.source).toBe('github-api');
    expect(result.assets.win).toBe('https://x/u.exe');
  });

  test('tüm ağ uçları kapalıysa sessizce available=false (app kırılmaz)', async () => {
    await expect(
      updater.checkForUpdate({ fetch: async () => { throw new Error('ağ yok'); } }),
    ).resolves.toMatchObject({ available: false, currentVersion: '3.23.0' });
  });

  test('24 saatlik önbellek aynı sonucu döner', async () => {
    const fetchFn = fakeFetch([{ urlKey: 'latest/download/latest.yml', body: 'version: 3.24.0\n' }]);
    const a = await updater.checkForUpdate({ fetch: fetchFn });
    const b = await updater.checkForUpdate({ fetch: fetchFn });
    expect(b).toBe(a); // aynı nesne — önbellekten
  });

  test('resetCacheForTest önbelleği bozar', async () => {
    const fetchFn = fakeFetch([{ urlKey: 'latest/download/latest.yml', body: 'version: 3.24.0\n' }]);
    const a = await updater.checkForUpdate({ fetch: fetchFn });
    updater.resetCacheForTest();
    const b = await updater.checkForUpdate({ fetch: fetchFn });
    expect(b).not.toBe(a);
  });
});

/* ------------------------------------------------------------------ */
describe('startAutoCheck', () => {
  beforeEach(() => updater.resetCacheForTest());
  test('mainWindow olmadan da fırlatmaz; result döner', async () => {
    const result = await updater.startAutoCheck(null, {
      fetch: fakeFetch([{ urlKey: 'latest/download/latest.yml', body: 'version: 3.24.0\nfiles:\n  - Krevyx-Ultra-3.24.0.AppImage\n' }]),
    });
    expect(result.available).toBe(true);
  });
  test('offline seçeneği null döner, ağa çıkmaz', async () => {
    const probe = jest.fn(async () => { throw new Error('çağrılmamalı'); });
    await expect(updater.startAutoCheck(null, { offline: true, fetch: probe })).resolves.toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });
});
