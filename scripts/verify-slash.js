'use strict';
/* V3.9: Slash komutları doğrulaması — CDP ile UI + yerleşik regex mantığı */
const http = require('http');

const CDP_BASE = 'http://localhost:9222';

function getJson(base, path) {
  return new Promise((res) => {
    http.get(`${base}${path}`, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { res(JSON.parse(d)); } catch { res(null); } });
    }).on('error', () => res(null));
  });
}

const results = [];
async function t(name, fn) {
  try {
    const r = await fn();
    const ok = r === true || r === 1;
    results.push({ name, ok, detail: !ok && r !== undefined ? String(r).slice(0, 120) : '' });
    console.log(ok ? `✓ ${name}` : `✗ ${name} (${results[results.length - 1].detail})`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message.slice(0, 120) });
    console.log(`✗ ${name} (${e.message.slice(0, 120)})`);
  }
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
    console.error('CDP hedefleri alınamadı');
    process.exitCode = 2;
    return;
  }
  const target = targets.find((x) => x.type === 'page' && x.url.includes('localhost:9393')) || targets[0];
  const wsUrl = target.webSocketDebuggerUrl;
  console.log('CDP hedefi:', wsUrl);

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

  /* Güncel dosyaların yüklenmesi için sayfayı yeniden aç */
  await call('Page.reload', { ignoreCache: true });
  await new Promise((r) => setTimeout(r, 1500));

  const evalJs = async (fn) => {
    const r = await call('Runtime.evaluate', { expression: `(${fn.toString()})()`, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.text || r.exceptionDetails.exception?.description || 'eval error'));
    return r.result.value;
  };

  const q = (sel) => document.querySelector(sel);

  /* 1) UI: modül yüklendi mi */
  await t('Prompt builder modülü yüklendi', async () =>
    await evalJs(() => typeof window.Krevyx?.promptBuilder === 'object' && typeof window.Krevyx.promptBuilder.trySlash === 'function'));

  /* 2) Regex mantığı: trySlash doğru komutları yakalıyor, yabancılara dokunmuyor */
  await t('Sohbet alanı temizlendi', async () =>
    await evalJs(() => { window.Krevyx.clearChat(); return true; }));
  await t('trySlash komut eşleşme mantığı (unit)', async () =>
    await evalJs(() => {
      const pb = window.Krevyx.promptBuilder;
      let out = true;
      window.Krevyx.clearChat();
      out = out && pb.trySlash('/prompt bir seo ajanı yap') === true;
      out = out && pb.trySlash('/improve') === true;
      out = out && pb.trySlash('/summarize') === true;
      out = out && pb.trySlash('/extract') === true;
      out = out && pb.trySlash('/translate') === true;
      out = out && pb.trySlash('/bilinmeyenKomut') === false;
      out = out && pb.trySlash('normal mesaj') === false;
      return out;
    }));

  /* 3) UI: window.Krevyx.state/md/save erişilebilir */
  await t('window.Krevyx.state/md/save erişimi', async () =>
    await evalJs(() => typeof window.Krevyx.state === 'object' && typeof window.Krevyx.md === 'function' && typeof window.Krevyx.save === 'function'));

  /* 4) Komut tüketimi: her slash komutu kendi AI balonunu oluşturur; /prompt için "çalıştı…" kullanıcı balonu oluşur */
  await t('Komut tüketimi öncesinde sohbet temizlendi', async () =>
    await evalJs(() => { window.Krevyx.clearChat(); return true; }));
  await t('Komut tüketimi: 5 komut 5 AI balonu üretti, normal mesajlar tüketildi', async () =>
    await evalJs(() => {
      const pb = window.Krevyx.promptBuilder;
      window.Krevyx.clearChat();
      pb.trySlash('/prompt bir seo ajanı yap');
      pb.trySlash('/improve');
      pb.trySlash('/summarize');
      pb.trySlash('/extract');
      pb.trySlash('/translate');
      pb.trySlash('/bilinmeyenKomut');
      pb.trySlash('normal mesaj');
      const area = q('#chat-area');
      return area && area.querySelectorAll('.msg-ai').length === 5 && area.querySelectorAll('.msg-user').length === 1;
    }));

  const n = results.filter((r) => r.ok).length;
  console.log(`${n}/${results.length} test geçti`);
  process.exitCode = n === results.length ? 0 : 1;
  socket.close();
  process.exit();
}

run().catch((e) => { console.error('Fatal:', e.message); process.exitCode = 1; process.exit(); });
