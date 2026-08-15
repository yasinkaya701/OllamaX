#!/usr/bin/env node
/* cdp-query.js — mevcut Chromium CDP oturumunda JS ifadesi çalıştırır.
   Kullanım: node scripts/cdp-query.js '<ifade>' */
'use strict';
const http = require('http');
const WebSocket = require('ws');

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

(async () => {
  const expr = process.argv[2];
  if (!expr) { console.error('ifade gerekli'); process.exit(1); }
  const targets = JSON.parse(await fetchText('http://localhost:9222/json'));
  const page = targets.find((t) => t.type === 'page');
  if (!page) { console.error('sayfa hedefi yok'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  ws.on('open', () => ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: { expression: expr, returnByValue: true, awaitPromise: false },
  })));
  ws.on('message', (m) => {
    const d = JSON.parse(m.toString());
    if (d.id === 1) {
      if (d.error) {
        console.error('CDP ERROR:', JSON.stringify(d.error));
        ws.close();
        process.exit(1);
      }
      const res = (d.result && d.result.result) || d.result || {};
      if (res.exceptionDetails) {
        console.error('JS EXCEPTION:', res.exceptionDetails.text);
        ws.close();
        process.exit(1);
      }
      if (res.type === 'undefined') {
        console.log('(undefined)');
        ws.close();
        process.exit(0);
      }
      const v = res.value;
      if (typeof v === 'string' && v.length > 2 && v.charAt(0) === '{') {
        try { console.log(JSON.stringify(JSON.parse(v), null, 1)); } catch (e) { console.log(v); }
      } else {
        console.log(v);
      }
      ws.close();
      process.exit(0);
    }
  });
  ws.on('error', (e) => { console.error(e.message); process.exit(1); });
})();
