#!/usr/bin/env node
/**
 * verify-composer.js — V3.8 Composer UI doğrulaması (CDP ile).
 * Sunucu: localhost:9393 (scripts/serve-ui-test.js), Chromium headless CDP.
 * Sıfır bağımlılık; node'un built-in fetch/WebSocket kullanımı için ws yok —
 * Chromium CDP'ye HTTP + websocket üzerinden bağlanır.
 */
'use strict';
const http = require('http');

const URL_BASE = 'http://localhost:9393';
const CDP_BASE = 'http://localhost:9222';
let failures = 0;
let total = 0;

function t(name, fn) {
  return Promise.resolve().then(fn)
    .then((ok) => { total += 1; if (!ok) failures += 1; console.log(`${ok ? '✓' : '✗'} ${name}`); return ok; })
    .catch((e) => { total += 1; failures += 1; console.log(`✗ ${name} — ${e.message}`); });
}

function getJson(path) {
  return new Promise((res, rej) => {
    http.get(`${URL_BASE}${path}`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

async function run() {
  const targets = await new Promise((res) => {
    http.get(`${CDP_BASE}/json`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } });
    }).on('error', () => res(null));
  });
  if (!targets || !targets.length) {
    console.error('CDP hedefleri alınamadı — Chromium başlatın:');
    console.error('  chromium --headless --disable-gpu --remote-debugging-port=9222 --no-sandbox');
    process.exitCode = 2;
    return;
  }
  const target = targets.find((x) => x.type === 'page' && x.url.includes('localhost:9393')) || targets[0];
  const wsUrl = target.webSocketDebuggerUrl;
  console.log('CDP hedefi:', wsUrl);

  // Node 22 global WebSocket yeterli (events tabanlı, CDP uyumlu)
  const WS = globalThis.WebSocket;

  let id = 0;
  const socket = new WS(wsUrl);
  const pending = new Map();
  socket.addEventListener('message', (ev) => {
    const msg = JSON.parse(String(ev.data));
    const p = pending.get(msg.id);
    if (p) { pending.delete(msg.id); if (msg.error) p.reject(new Error(JSON.stringify(msg.error))); else p.resolve(msg.result); }
  });
  await new Promise((res, rej) => {
    socket.addEventListener('open', res);
    socket.addEventListener('error', rej);
  });
  const call = (method, params = {}) =>
    new Promise((res, rej) => { pending.set(++id, { resolve: res, reject: rej }); socket.send(JSON.stringify({ id, method, params })); });

  const evalJs = async (fn) => {
    const r = await call('Runtime.evaluate', { expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval hatası');
    return r.result.value;
  };

  await call('Page.navigate', { url: URL_BASE + '/' });
  await new Promise((r) => setTimeout(r, 1500));

  await t('Composer mod çipleri render', async () =>
    await evalJs(() => document.querySelectorAll('#composer-mode-chips .cm-chip').length === 2));

  await t('Composer mod değiştirme (code) + bağlam butonları görünür', async () =>
    await evalJs(() => {
      const chips = [...document.querySelectorAll('#composer-mode-chips .cm-chip')];
      chips.find((c) => c.dataset.mode === 'code').click();
      const visible = [...document.querySelectorAll('#composer-mode-chips .cm-add-btn')].filter((b) => !b.classList.contains('hidden')).length;
      const active = document.querySelector('#composer-mode-chips .cm-chip.active').dataset.mode === 'code';
      return visible === 2 && active;
    }));

  await t('Code modda input placeholder değişir', async () =>
    await evalJs(() => q('#msg-input').placeholder.includes('Görevi yazın')));

  await t('Composer görev paneli bağlam eklenince görünür ve görev kaydı oluşur', async () =>
    await evalJs(async () => {
      const api = window.Krevyx?.api || window.krevyxApi;
      if (!window.composerAddTask) return 'fn-yok';
      const task = window.composerAddTask('CDP test görevi', []);
      window.composerUpdateTask?.(task, 'running');
      const panelVisible = !q('#composer-task-panel').classList.contains('hidden');
      const listVisible = !q('#composer-task-list').classList.contains('hidden');
      const count = q('#composer-task-list').querySelectorAll('.ct-item').length;
      return panelVisible && listVisible && count === 1;
    }));

  await t('Profil detay paneli (çift tık) çalışır', async () =>
    await evalJs(async () => {
      const chip = document.querySelector('#settings-profile-chips .theme-chip');
      if (!chip) return 'profil-cipi-yok';
      await window.Krevyx.loadRichProfiles?.();
      if (!window.Krevyx.getProfileInfo?.('precise')?.markdown) return 'md-yok';
      const show = window.Krevyx.showProfileDetail;
      if (!show) return false;
      show('precise');
      return !document.getElementById('profile-detail-panel').classList.contains('hidden');
    }));

  socket.close();
  console.log(`\n${total - failures}/${total} test geçti`);
  process.exitCode = failures ? 1 : 0;
}

run().catch((e) => { console.error('Fatal:', e); process.exitCode = 2; });
