/**
 * updater.js — Krevyx v3.24 Otomatik Güncelleme Bildirimi
 *
 * Electron-updater gibi ağır bir bağımlılık getirmeden, GitHub Releases
 * üzerindeki `latest.yml` + API uçlarını kullanarak güncelleme denetimi yapar.
 *
 * Davranış:
 *  - Uygulama açılışında (app ready + pencere oluşunca) arka planda tek
 *    denetim: `checkForUpdate()` — sonuç 24 saat bellekte önbelleklenir.
 *  - Yeni sürüm varsa mainWindow'a `update:available` olayı yayılır;
 *    renderer toast bildirimi gösterir (indir / sürüm notları / ertele).
 *  - Denetim hiç sessiz hata atmaz: zaman aşımı + bozuk yanıt toleranslı.
 *  - GitHub Actions otomatik-release'in yüklediği `latest.yml` sürüm
 *    bilgisi birincil kaynak; API ikincil kaynaktır.
 *
 * Test edilebilirlik: tüm ağ erişimi `options.fetch` üzerinden inject
 * edilir; varsayılan implementasyon production'da kullanılır.
 */
'use strict';

const https = require('https');
const { app } = require('electron');

const REPO_OWNER = 'yasinkaya701';
const REPO_NAME = 'OllamaX';
const FEED_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/latest.yml`;
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const RELEASES_BASE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const ASSET_PREFIX = 'Krevyx-Ultra-';

let lastResult = null;
let lastCheckedAt = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

/**
 * Basit semver karşılaştırma: `a` < `b` ise true döner.
 * Ön-ekler (pre-release) sürüm numarası eşitse daha düşük sayılır.
 */
function isOlderThan(a, b) {
  const norm = (v) => String(v || '').replace(/^v/, '').trim();
  const parts = (v) => norm(v).split(/[-+]/);
  const [aCore, aPre] = parts(a);
  const [bCore, bPre] = parts(b);
  const cmpCore = compareCore(aCore, bCore);
  if (cmpCore !== 0) return cmpCore < 0;
  if (aPre === undefined) return false; // aynı core, pre'siz olan daha yeni
  if (bPre === undefined) return true;
  return String(aPre) < String(bPre);
}

function compareCore(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function currentAppVersion() {
  try {
    return String(app.getVersion ? app.getVersion() : process.env.npm_package_version || '0.0.0');
  } catch {
    return String(process.env.npm_package_version || '0.0.0');
  }
}

/** Varsayılan HTTP GET — zaman aşımı toleranslı, sadece HTTPS. */
function defaultGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      try {
        req.destroy();
      } catch {
        /* noop */
      }
      reject(new Error('update-timeout'));
    }, timeoutMs);
    let req;
    try {
      req = https.get(url, { headers: { 'User-Agent': 'Krevyx-Updater/3.24', Accept: 'application/json' } }, (res) => {
        clearTimeout(t);
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Yönlendirmeyi tek seviye takip et
          defaultGet(res.headers.location, timeoutMs).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`update-http-${res.statusCode}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });
      req.on('error', (err) => {
        clearTimeout(t);
        reject(err);
      });
    } catch (err) {
      clearTimeout(t);
      reject(err);
    }
  });
}

/** latest.yml satırlarını ayrıştır: version + platform asset'leri. */
function parseLatestYml(text) {
  if (!text || typeof text !== 'string') return null;
  const versionLine = text.split(/\r?\n/).find((l) => l.startsWith('version:'));
  if (!versionLine) return null;
  const version = versionLine.split(':').slice(1).join(':').trim();
  if (!version) return null;
  const files = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^(- \S+\.appimage|- \S+\.dmg|- \S+\.exe|- \S+\.yml)$/i.test(line.trim());
    if (line.trim().startsWith('- ') && line.includes('.')) {
      const name = line.trim().slice(2);
      if (/\.(appimage|dmg|exe|yml)$/i.test(name)) files.push(name);
    }
  }
  return { version, files };
}

/**
 * Güncelleme denetimi. Sonuç:
 *  { available: boolean, currentVersion, latestVersion, releaseUrl,
 *    assets: {win, mac, linux, changelog}, source, checkedAt }
 */
async function checkForUpdate(options = {}) {
  const now = Date.now();
  if (lastResult && now - lastCheckedAt < CACHE_TTL_MS) return lastResult;

  const fetchImpl = options.fetch || defaultGet;
  let version = null;
  let assets = { win: null, mac: null, linux: null, changelog: `${RELEASES_BASE}` };
  let source = 'none';

  // 1) Birincil kaynak: latest.yml (GitHub Actions tarafından yüklenir)
  try {
    const yml = await fetchImpl(FEED_URL, 8000);
    const parsed = parseLatestYml(yml);
    if (parsed?.version) {
      version = parsed.version;
      source = 'latest.yml';
      for (const f of parsed.files || []) {
        const lower = f.toLowerCase();
        if (lower.endsWith('.exe')) assets.win = `${RELEASES_BASE}/download/${encodeURIComponent(f)}`;
        else if (lower.endsWith('.dmg')) assets.mac = `${RELEASES_BASE}/download/${encodeURIComponent(f)}`;
        else if (lower.endsWith('.appimage')) assets.linux = `${RELEASES_BASE}/download/${encodeURIComponent(f)}`;
      }
    }
  } catch {
    // latest.yml yoksa API'ye düş
  }

  // 2) İkincil kaynak: GitHub API (asset adlarından sürümü çöz)
  if (!version) {
    try {
      const json = await fetchImpl(API_URL, 8000);
      const data = JSON.parse(json);
      if (data?.tag_name) {
        version = String(data.tag_name).replace(/^v/, '');
        source = 'github-api';
        assets.changelog = data.html_url || assets.changelog;
        for (const a of data.assets || []) {
          const lower = (a.name || '').toLowerCase();
          if (lower.includes('krevyx') && lower.endsWith('.exe') && !assets.win) assets.win = a.browser_download_url;
          if (lower.includes('krevyx') && lower.endsWith('.dmg') && !assets.mac) assets.mac = a.browser_download_url;
          if (lower.includes('krevyx') && lower.endsWith('.appimage') && !assets.linux) assets.linux = a.browser_download_url;
        }
      }
    } catch {
      // Ağ yok → sessiz
    }
  }

  const current = currentAppVersion();
  const available = Boolean(version) && isOlderThan(current, version);
  lastResult = {
    available,
    currentVersion: current,
    latestVersion: version || current,
    releaseUrl: assets.changelog,
    assets,
    source,
    checkedAt: now,
  };
  lastCheckedAt = now;
  return lastResult;
}

/** Ana süreçten çağrılır: bildirim kanalı mainWindow'dan geçer. */
function notifyUpdate(mainWindow, result) {
  if (!mainWindow || !result?.available) return;
  try {
    mainWindow.webContents.send('ipc:3:update:available', {
      latestVersion: result.latestVersion,
      currentVersion: result.currentVersion,
      assets: result.assets,
      releaseUrl: result.releaseUrl,
    });
  } catch {
    // pencere kapanmış olabilir — sessiz
  }
}

/** Açılış otomatik denetimi (bir kere). */
async function startAutoCheck(mainWindow, options = {}) {
  if (options.offline) return null;
  try {
    const result = await checkForUpdate(options);
    notifyUpdate(mainWindow, result);
    return result;
  } catch {
    return null;
  }
}

function resetCacheForTest() {
  lastResult = null;
  lastCheckedAt = 0;
}

module.exports = {
  checkForUpdate,
  startAutoCheck,
  parseLatestYml,
  isOlderThan,
  currentAppVersion,
  resetCacheForTest,
  REPO_OWNER,
  REPO_NAME,
  RELEASES_BASE,
};
