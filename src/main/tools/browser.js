/**
 * tools/browser.js — Tarayıcı kontrol ajan araçları (v3.18)
 *
 * Hafif bir CDP (Chrome DevTools Protocol) istemcisi ile platformdaki
 * Chromium tabanlı tarayıcıyı (chrome, chromium, brave, edge) headless
 * modda başlatır ve ajanlara şu araçları verir:
 *
 *   browser_navigate   sayfaya git, başlık + metin özeti döndür
 *   browser_screenshot ekran görüntüsünü base64 al
 *   browser_click      seçiciye tıkla (CSS seçici veya metin)
 *   browser_type       alana metin yaz
 *
 * Tarayıcı yalnızca ajan isteğiyle açılır, işlem bittiğinde kapanır
 * (sayfa başına tek oturum; kalıcı oturum tutulmaz). Ağustos 2026'da
 * yalnızca Antigravity'de bulunan tarayıcı kontrol yeteneğinin Krevyx'e
 * taşınması — açık kaynak ve yerel çalışma koşullarıyla.
 *
 * Güvenlik: air-gapped modda tüm tarayıcı araçları reddedilir;
 * sadece http(s) şemalarına izin verilir.
 */
'use strict';
const http = require('http');
const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');

const FIND_BINARY = process.platform === 'win32' ? 'where.exe' : 'which';
const CANDIDATES = process.platform === 'win32'
  ? ['chrome', 'msedge', 'chromium']
  : ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable', 'msedge', 'brave-browser'];

function findChromium() {
  try {
    const out = execFileSync(FIND_BINARY, CANDIDATES, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n')[0].trim() || null;
  } catch {
    return null;
  }
}

let cdpSession = null;

function cdRequest(wsLike, id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      wsLike.emit('cdp-timeout');
      reject(new Error(`CDP zaman aşımı: ${method}`));
    }, 30000);
    const onMessage = (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg && msg.id === id) {
        clearTimeout(timer);
        wsLike.off('message', onMessage);
        if (msg.error) {
          reject(new Error(msg.error.message || 'CDP hatası'));
        } else {
          resolve(msg.result);
        }
      }
    };
    wsLike.on('message', onMessage);
    const frame = buildWsFrame(JSON.stringify({ id, method, params }));
    wsLike.write(frame);
  });
}

function buildWsFrame(payload) {
  const buf = Buffer.from(payload, 'utf8');
  const header = Buffer.alloc(buf.length < 126 ? 2 : buf.length < 65536 ? 4 : 10);
  header[0] = 0x81;
  if (buf.length < 126) {
    header[1] = buf.length;
  } else if (buf.length < 65536) {
    header[1] = 126;
    header.writeUInt16BE(buf.length, 2);
  } else {
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(buf.length, 6);
  }
  return Buffer.concat([header, buf]);
}

function connectWs(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.get({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname || '/',
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': Buffer.from(String(Date.now())).toString('base64').slice(0, 24),
        'Sec-WebSocket-Version': '13',
      },
      timeout: 10000,
    });
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error('WebSocket bağlantısı zaman aşımı'));
    }, 10000);
    req.on('upgrade', (_res, socket) => {
      clearTimeout(timeout);
      resolve(socket);
    });
    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.end();
  });
}

async function launchBrowser() {
  const binary = findChromium();
  if (!binary) throw new Error('Chromium tabanlı tarayıcı bulunamadı (chrome/chromium/edge).');
  const port = 9222;
  const tmpDir = path.join(os.tmpdir(), `krevyx-browser-${process.pid}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const args = [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--no-first-run',
    '--disable-gpu',
    `--user-data-dir=${tmpDir}`,
    'about:blank',
  ];
  const { spawn } = require('child_process');
  const proc = spawn(binary, args, { stdio: 'ignore', detached: process.platform !== 'win32' });
  // Tarayıcının açılmasını bekle
  for (let i = 0; i < 25; i += 1) {
    await new Promise((r) => setTimeout(r, 200));
    try {
      const res = await httpGet(`http://127.0.0.1:${port}/json/version`);
      if (res && res.webSocketDebuggerUrl) {
        return { proc, tmpDir, wsUrl: res.webSocketDebuggerUrl };
      }
    } catch {
      /* tekrar dene */
    }
  }
  throw new Error('Tarayıcı CDP bağlantısı kurulamadı.');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 5000 }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch {
          reject(new Error('Yanıt ayrıştırılamadı'));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Zaman aşımı'));
    });
  });
}

async function getPageTarget(wsUrl) {
  const targets = await httpGet(wsUrl.replace('/devtools/browser/', '/json'));
  const page = (Array.isArray(targets) ? targets : []).find((t) => t.type === 'page');
  return page ? page.webSocketDebuggerUrl : null;
}

function isValidUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Yeni bir tarayıcı oturumu açar, sayfaya gider ve içerik özetini döndürür.
 */
async function navigate(urlStr) {
  if (!isValidUrl(urlStr)) throw new Error('Yalnızca http/https adreslerine izin verilir.');
  const browser = await launchBrowser();
  try {
    const pageWs = await getPageTarget(browser.wsUrl);
    if (!pageWs) throw new Error('Sayfa hedefi alınamadı.');
    const ws = await connectWs(pageWs);
    cdpSession = { ws, browser };
    await cdRequest(ws, 1, 'Page.enable', {});
    await cdRequest(ws, 2, 'Page.navigate', { url: urlStr });
    await cdRequest(ws, 3, 'Runtime.enable', {});
    // Sayfanın yüklenmesini ve içeriğini al
    await new Promise((r) => setTimeout(r, 2500));
    const { result } = await cdRequest(ws, 4, 'Runtime.evaluate', {
      expression: `JSON.stringify({title: document.title, text: document.body ? document.body.innerText.slice(0, 3000) : '', links: Array.from(document.querySelectorAll('a[href^=http]')).slice(0,10).map(a=>a.href)})`,
      returnByValue: true,
    });
    let content = {};
    try {
      content = JSON.parse(result && result.result ? result.result.value : '{}');
    } catch {
      content = { title: '', text: '', links: [] };
    }
    return { title: content.title || '', summary: (content.text || '').slice(0, 2000), links: content.links || [] };
  } catch (err) {
    try {
      await closeBrowser();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function screenshot() {
  if (!cdpSession) throw new Error('Tarayıcı oturumu açık değil.');
  const { ws } = cdpSession;
  const { data } = await cdRequest(ws, 5, 'Page.captureScreenshot', { format: 'png' });
  return { base64: data, note: 'base64 PNG' };
}

async function click(selectorOrText) {
  if (!cdpSession) throw new Error('Tarayıcı oturumu açık değil.');
  const { ws } = cdpSession;
  const isSelector = selectorOrText.startsWith('.') || selectorOrText.startsWith('#') || /^[a-zA-Z][\w-]*>/.test(selectorOrText);
  const js = isSelector
    ? `(() => { const el = document.querySelector(${JSON.stringify(selectorOrText)}); if (!el) return 'not_found'; el.click(); return 'clicked'; })()`
    : `(() => { for (const el of document.querySelectorAll('a,button,input,span,div')) { if ((el.textContent||'').trim() === ${JSON.stringify(selectorOrText)} || (el.value||'') === ${JSON.stringify(selectorOrText)}) { el.click(); return 'clicked'; } } return 'not_found'; })()`;
  const { result } = await cdRequest(ws, 6, 'Runtime.evaluate', { expression: js, returnByValue: true });
  const status = (result && result.result && result.result.value) || 'unknown';
  return { status };
}

async function typeText(selector, text) {
  if (!cdpSession) throw new Error('Tarayıcı oturumu açık değil.');
  const { ws } = cdpSession;
  const js = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'not_found'; el.focus(); el.value = ${JSON.stringify(String(text))}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); return 'typed'; })()`;
  const { result } = await cdRequest(ws, 7, 'Runtime.evaluate', { expression: js, returnByValue: true });
  const status = (result && result.result && result.result.value) || 'unknown';
  return { status };
}

async function closeBrowser() {
  if (cdpSession) {
    try {
      cdpSession.ws.destroy();
    } catch {
      /* ignore */
    }
    if (cdpSession.browser && cdpSession.browser.proc) {
      try {
        cdpSession.browser.proc.kill();
        if (process.platform !== 'win32' && cdpSession.browser.proc.detached) {
          try {
            process.kill(-cdpSession.browser.proc.pid);
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    }
    if (cdpSession.browser && cdpSession.browser.tmpDir) {
      try {
        fs.rmSync(cdpSession.browser.tmpDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    cdpSession = null;
  }
}

module.exports = {
  navigate,
  screenshot,
  click,
  typeText,
  closeBrowser,
  findChromium,
  isValidUrl,
};
