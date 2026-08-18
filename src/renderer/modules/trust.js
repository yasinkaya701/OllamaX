/*
 * trust.js — Krevyx v3.25 Güven Paneli renderer modülü (T-UI)
 * Stil: Emerald Ledger. Release doğrulama, denetim sorgulama, gizli tarama.
 * Global kapsam: api, q, toast, log, esc.
 */
async function initTrust() {
  buildTrustSection();
  q('#tr-btn-scan-env')?.addEventListener('click', () => void scanEnvSecrets());
  q('#tr-btn-audit-query')?.addEventListener('click', () => void auditQuery());
  q('#tr-btn-release-check')?.addEventListener('click', () => void releaseCheck());
}

function buildTrustSection() {
  if (q('#tr-section')) return;
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'tr-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Güven &amp; Denetim</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="tr-zone">
      <div class="tr-grid">
        <button type="button" id="tr-btn-scan-env" class="small-btn tr-btn">🔍 Ortam Gizli Taraması</button>
        <button type="button" id="tr-btn-release-check" class="small-btn tr-btn">📦 Release Doğrula</button>
        <button type="button" id="tr-btn-audit-query" class="small-btn tr-btn">📜 Son Denetim</button>
      </div>
      <div id="tr-status" class="tr-status hidden"></div>
      <div id="tr-results" class="tr-results"></div>
    </div>`;
  const hkSection = q('#hk-section');
  if (hkSection && hkSection.parentNode) {
    hkSection.parentNode.insertBefore(details, hkSection.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function trStatus(html, type) {
  const s = q('#tr-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `tr-status tr-${type || 'info'}`;
  s.textContent = html || '';
}

function trResults(html) {
  const box = q('#tr-results');
  if (!box) return;
  box.innerHTML = html || '';
}

async function scanEnvSecrets() {
  if (!api) return;
  trStatus('Ortam taranıyor…', 'info');
  try {
    const res = await api.invoke('secrets-scan-env', {});
    if (!res?.ok) { trStatus(`Hata: ${res?.error || 'bilinmeyen'}`, 'error'); return; }
    const summary = await api.invoke('secrets-summarize', { findings: res.findings });
    if (res.findings.length) {
      trStatus(`${res.findings.length} bulgu (${summary?.verdict || '?'})`, 'warn');
      trResults(res.findings.slice(0, 25).map((f) =>
        `<div class="tr-finding tr-${f.severity}"><span class="tr-finding-rule">${esc(f.rule)}</span><span class="tr-finding-env">${esc(f.env || '')}</span></div>`,
      ).join(''));
    } else {
      trStatus('Ortam temiz — bulgu yok', 'ok');
      trResults('');
    }
  } catch {
    trStatus('Tarama başarısız', 'error');
  }
}

async function releaseCheck() {
  if (!api) return;
  trStatus('Release doğrulanıyor…', 'info');
  try {
    const res = await fetch('https://api.github.com/repos/yasinkaya701/OllamaX/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) { trStatus('GitHub erişilemedi', 'error'); return; }
    const release = await res.json();
    const urlRes = await api.invoke('trust-build-asset-url', { releaseData: release, platform: navigator.platform?.toLowerCase().includes('mac') ? 'darwin' : process ? 'linux' : 'linux' });
    if (urlRes?.ok) {
      trStatus(`✓ Asset: ${urlRes.asset.name} (${(urlRes.asset.size || 0).toLocaleString()} B)`, 'ok');
      trResults(`<div class="tr-finding tr-ok">İndirme adresi: ${esc(urlRes.asset.browser_download_url || '')}</div>`);
    } else {
      trStatus('Asset bulunamadı', 'warn');
    }
  } catch {
    trStatus('Doğrulama yapılamadı', 'error');
  }
}

async function auditQuery() {
  if (!api) return;
  trStatus('Denetim kayıtları alınıyor…', 'info');
  try {
    /* ipc-v3'teki audit-verify benzeri bir sorgu — v325 uçları kuruluysa kullan */
    const res = await api.invoke('ipc:3:audit2-query', { filePath: '' });
    if (res?.ok && res.entries) {
      trStatus(`${res.total} kayıt`, 'ok');
      trResults(res.entries.slice(0, 20).map((e) =>
        `<div class="tr-finding"><span class="tr-finding-rule">${esc(e.action || '')}</span><span>${esc((e.actor || '') + ' · ' + (e.ts || ''))}</span></div>`,
      ).join(''));
      return;
    }
    trStatus('Denetim kaydı yok veya erişilemedi', 'info');
    trResults('');
  } catch {
    trStatus('Sorgulanamadı', 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initTrust());
