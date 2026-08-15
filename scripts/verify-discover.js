#!/usr/bin/env node
/**
 * verify-discover.js — GitHub Discovery (Featured Repos) UI doğrulaması.
 * serve-ui-test.js sunucusunu başlatır, CDP ile bağlanır ve şunları kontrol eder:
 *  1. Katalog yüklenip grid'e render edildi
 *  2. Kategori pilleri render edildi
 *  3. Kategori filtresi çalışıyor
 *  4. Rich repo kartı meta verisi (yıldız, dil) görünüyor
 *
 * Kullanım: node scripts/verify-discover.js [port]
 */
'use strict';
const http = require('http');
const net = require('net');

const PORT = Number(process.argv[2]) || 9393;
const BASE = `http://localhost:${PORT}`;
const CHECKS = [];
function check(name, pass) { CHECKS.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}`); }

async function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function connectCDP() {
  const targets = JSON.parse(await fetchText('http://localhost:9222/json'));
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('CDP sayfa hedefi bulunamadı');
  const WebSocket = require('ws');
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function cdpCall(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify({ id, method, params }));
    const timer = setTimeout(() => reject(new Error(`timeout: ${method}`)), 8000);
    const handler = (msg) => {
      const d = JSON.parse(msg.toString());
      if (d.id === id) {
        clearTimeout(timer);
        ws.off('message', handler);
        if (d.error) reject(new Error(`${method}: ${JSON.stringify(d.error)}`));
        else resolve(d.result);
      }
    };
    ws.on('message', handler);
  });
}

async function evalInPage(ws, expr) {
  const r = await cdpCall(ws, 1, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  const res = (r && r.result) || r || {};
  if (res.exceptionDetails) throw new Error(`page eval fail: ${res.exceptionDetails.text}`);
  if (res.type === 'undefined') return undefined;
  let v = res.value;
  if (typeof v === 'string' && v.length > 2 && v.charAt(0) === '{') { try { v = JSON.parse(v); } catch (e) { /* string kalır */ } }
  return v;
}

async function main() {
  // 1. HTTP kontrolü: HTML'de yeni yapı var mı
  const html = await fetchText(BASE + '/');
  check('HTML contains #repo-discover', html.includes('repo-discover'));
  check('HTML contains featured grid placeholder', html.includes('repo-discover') && html.includes('repo-cat-bar'));

  // 2. CDP ile render doğrulaması
  const ws = await connectCDP();
  try {
    const debugDump = await evalInPage(ws, `JSON.stringify({ gridChild: (document.getElementById('repo-discover')||{innerHTML:''}).innerHTML.slice(0,300), acc: (document.getElementById('acc-featured')||{textContent:''}).textContent.slice(0,100), stateCat: typeof state !== 'undefined' ? state.currentRepoCat : 'no-state', catalogKeys: typeof FEATURED_REPOS_CATALOG !== 'undefined' ? Object.keys(FEATURED_REPOS_CATALOG||{}) : 'no-var' })`);
    console.log('DEBUG:', debugDump);
    const repoCount = await evalInPage(ws, `document.querySelectorAll('#repo-chips .repo-chip-rich').length`);
    check('Zengin repo kartları grid\'de render edildi', repoCount > 0);

    const pillCount = await evalInPage(ws, `document.querySelectorAll('#repo-cat-bar .tmpl-cat-pill').length`);
    check('Kategori pilleri render edildi', pillCount >= 5);

    // Kategori filtresi testi (önce Tümü'ne dön, tüm bölümleri say)
    const pills = await evalInPage(ws, `Array.from(document.querySelectorAll('#repo-cat-bar .tmpl-cat-pill')).map(p => p.textContent.trim())`);
    check('En az iki kategori var', pills.length >= 2);
    if (pills.length >= 2) {
      await evalInPage(ws, `(function(){var p=Array.from(document.querySelectorAll('#repo-cat-bar .tmpl-cat-pill')).find(x=>x.textContent==='Tümü');if(p)p.click();})()`);
      await new Promise((r) => setTimeout(r, 400));
      const secCount = await evalInPage(ws, `document.querySelectorAll('#repo-chips .repo-cat-sec').length`);
      check('Kategori bölümleri render edildi (Tümü → 4)', secCount === 4);

      await evalInPage(ws, `(function(){var p=Array.from(document.querySelectorAll('#repo-cat-bar .tmpl-cat-pill')).find(x=>x.textContent==='AI Foundations');if(p)p.click();})()`);
      await new Promise((r) => setTimeout(r, 400));
      const filtered = await evalInPage(ws, `document.querySelectorAll('#repo-chips .repo-chip-rich').length`);
      check('Kategori filtresi çalışıyor (AI Foundations → 2)', filtered === 2);
    }

    const starMeta = await evalInPage(ws, `!!document.querySelector('.rcr-meta') && document.querySelector('.rcr-meta').textContent.includes('★')`);
    check('Kartlarda yıldız/dil meta verisi görünüyor', starMeta);

    // Kart tıklaması → GitHub aramasına yönlendirme
    await evalInPage(ws, `(function(){var c=document.querySelector('#repo-chips .repo-chip-rich');if(c)c.click();})()`);
    const ghInput = await evalInPage(ws, `document.getElementById('github-search-input').value`);
    check('Kart tıklaması GitHub arama girişini dolduruyor', ghInput.length > 0);
  } finally {
    ws.close();
  }

  const failed = CHECKS.filter((c) => !c.pass);
  console.log(`\n${CHECKS.length} kontrol: ${failed.length === 0 ? 'TÜMÜ BAŞARILI ✓' : `${failed.length} HATALI ✗`}`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('DOĞRULAMA HATASI:', e.message);
  process.exit(2);
});
