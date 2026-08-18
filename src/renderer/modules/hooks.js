/*
 * hooks.js — Krevyx v3.25 Hook Yöneticisi renderer paneli (Q-UI)
 * Stil: Emerald Ledger. Hook dosyası önizleme + olay akışı.
 * Global kapsam: api, q, toast, log, esc.
 */
async function initHooks() {
  buildHooksSection();
  q('#hk-btn-load-example')?.addEventListener('click', () => void loadExample());
  q('#hk-btn-register')?.addEventListener('click', () => void registerHooks());
  q('#hk-btn-log')?.addEventListener('click', () => void showLog());
}

function buildHooksSection() {
  if (q('#hk-section')) return;
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'hk-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Hook Yöneticisi</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="hk-zone">
      <label class="hk-label">krevyx-hooks.json gövdesi</label>
      <textarea id="hk-editor" class="text-input ta-sm mono" rows="8" placeholder='{ "pre-run": [ { "name": "ornek", "body": "...", "enabled": true } ] }'></textarea>
      <div class="hk-actions">
        <button type="button" id="hk-btn-load-example" class="small-btn">Örnek Yükle</button>
        <button type="button" id="hk-btn-register" class="small-btn hk-register-btn">⚡ Kaydet</button>
      </div>
      <div id="hk-status" class="hk-status hidden"></div>
      <div class="hk-secondary">
        <button type="button" id="hk-btn-log" class="small-btn">📜 Olay Günlüğü</button>
      </div>
      <div id="hk-log" class="hk-log hidden"></div>
    </div>`;
  const quSection = q('#qu-section');
  if (quSection && quSection.parentNode) {
    quSection.parentNode.insertBefore(details, quSection.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function hkStatus(html, type) {
  const s = q('#hk-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `hk-status hk-${type || 'info'}`;
  s.textContent = html || '';
}

function loadExample() {
  const editor = q('#hk-editor');
  if (!editor) return;
  const example = {
    version: '3.25.0',
    'pre-run': [
      {
        name: 'gorev-log',
        enabled: true,
        body: 'console.log("[hook] görev başlıyor:", payload.type || ""); return { ok: true };',
      },
    ],
    'post-run': [
      { name: 'gorev-bitti', enabled: true, body: 'return { ok: true };' },
    ],
    'pre-tool': [
      { name: 'silme-engelleyici', enabled: true, body: 'if (payload.tool === "delete_file") return { ok: false, error: "Silme hook ile engellendi" }; return { ok: true };' },
    ],
  };
  editor.value = JSON.stringify(example, null, 2);
  hkStatus('Örnek yüklendi — önizleme amaçlı, "Kaydet" ile aktif olur', 'info');
}

async function registerHooks() {
  const editor = q('#hk-editor');
  if (!editor || !api) return;
  const text = editor.value.trim();
  if (!text) { hkStatus('Gövde boş', 'error'); return; }
  try {
    const parsed = await api.invoke('hooks-parse', { text });
    if (!parsed?.ok) { hkStatus(`Ayrıştırma hatası: ${parsed?.error || 'bilinmeyen'}`, 'error'); return; }
    const set = { id: `ui-${Date.now().toString(36)}`, hooks: parsed.hooks };
    const res = await api.invoke('hooks-register', { set });
    if (res?.ok) hkStatus(`Kaydedildi: ${res.registered} hook aktif (${res.skipped} atlandı)`, 'ok');
    else hkStatus(`Kayıt hatası: ${res?.error || 'bilinmeyen'}`, 'error');
  } catch {
    hkStatus('Kaydedilemedi', 'error');
  }
}

async function showLog() {
  const logBox = q('#hk-log');
  if (!logBox || !api) return;
  logBox.classList.toggle('hidden');
  try {
    const res = await api.invoke('hooks-log', { filter: {} });
    if (!res?.ok || !res.entries.length) { logBox.innerHTML = '<div class="empty-note">Olay yok.</div>'; return; }
    logBox.innerHTML = '';
    res.entries.slice(-30).reverse().forEach((e) => {
      const row = document.createElement('div');
      row.className = `hk-log-row hk-${e.ok ? 'ok' : 'fail'}`;
      row.textContent = `${e.event} · ${e.hook} · ${e.ok ? 'OK' : `HATA: ${e.error || ''}`}`;
      logBox.appendChild(row);
    });
  } catch {
    logBox.innerHTML = '<div class="empty-note">Günlük alınamadı.</div>';
  }
}

window.addEventListener('DOMContentLoaded', () => void initHooks());
