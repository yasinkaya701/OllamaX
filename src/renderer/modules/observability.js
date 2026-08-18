/*
 * observability.js — Krevyx v3.26 Gözlemlenebilirlik paneli (orch/observability)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initObservabilityPanel() {
  buildObservabilitySection();
  q('#ob-btn-refresh')?.addEventListener('click', () => void refreshMetrics());
  q('#ob-btn-health')?.addEventListener('click', () => void loadHealth());
}

function buildObservabilitySection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#ob-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'ob-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Gözlemlenebilirlik</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="ob-zone">
      <div class="ob-actions">
        <button type="button" id="ob-btn-refresh" class="small-btn ob-primary-btn">↻ Metrikleri Tazele</button>
        <button type="button" id="ob-btn-health" class="small-btn">♡ Sağlık</button>
      </div>
      <div id="ob-status" class="ob-status hidden"></div>
      <div id="ob-metrics" class="ob-metrics hidden"></div>
    </div>`;
  const existing = q('#gd-section') || q('#bd-section');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setObStatus(html, type) {
  const s = q('#ob-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `ob-status ob-${type || 'info'}`;
  s.textContent = html || '';
}

async function refreshMetrics() {
  setObStatus('Metrikler yükleniyor…', 'info');
  const box = q('#ob-metrics');
  if (box) { box.classList.add('hidden'); box.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:obs:snapshot', { types: [] });
    if (box) { box.classList.remove('hidden'); box.textContent = JSON.stringify(res, null, 2); }
    const m = res && res.metrics ? Object.keys(res.metrics) : [];
    setObStatus(`${m.length || 0} metrik penceresi`, res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setObStatus('Hata: ' + esc(String(e)), 'error');
  }
}

async function loadHealth() {
  const box = q('#ob-metrics');
  if (box) { box.classList.add('hidden'); box.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:obs:health', {});
    if (box) { box.classList.remove('hidden'); box.textContent = JSON.stringify(res, null, 2); }
    const rate = res && res.errorRate != null ? Math.round(res.errorRate * 100) : 0;
    setObStatus(`Hata oranı: %${rate}`, res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setObStatus('Hata: ' + esc(String(e)), 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initObservabilityPanel());
