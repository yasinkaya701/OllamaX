/*
 * guard.js — Krevyx v3.26 Güvenlik paneli (guard + diff-gate + policy)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initGuardPanel() {
  buildGuardSection();
  q('#gd-btn-check')?.addEventListener('click', () => void checkPermission());
  q('#gd-btn-diff')?.addEventListener('click', () => void analyzeDiff());
  q('#gd-btn-policy')?.addEventListener('click', () => void loadPolicy());
}

function buildGuardSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#gd-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'gd-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Güvenlik Kapısı</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="gd-zone">
      <div class="gd-row">
        <select id="gd-role" class="text-input"><option value="agent">agent</option><option value="orchestrator">orchestrator</option><option value="lead">lead</option><option value="admin">admin</option></select>
        <input type="text" id="gd-cap" class="text-input" placeholder="tools.run.readonly" />
        <button type="button" id="gd-btn-check" class="small-btn gd-primary-btn">✓ Denetle</button>
      </div>
      <label class="gd-label">Diff (git diff çıktısı veya yapışkan)</label>
      <textarea id="gd-diff" class="text-input ta-sm ta-mono" rows="4" placeholder="+ yeni satır"></textarea>
      <div class="gd-actions">
        <button type="button" id="gd-btn-diff" class="small-btn">Δ Fark Analizi</button>
        <button type="button" id="gd-btn-policy" class="small-btn">¶ Politika</button>
      </div>
      <div id="gd-status" class="gd-status hidden"></div>
      <div id="gd-report" class="gd-report hidden"></div>
    </div>`;
  const existing = q('#bd-section') || q('#sk-section');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setGdStatus(html, type) {
  const s = q('#gd-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `gd-status gd-${type || 'info'}`;
  s.textContent = html || '';
}

async function checkPermission() {
  const role = q('#gd-role')?.value || '';
  const capability = q('#gd-cap')?.value || '';
  if (!capability.trim()) { setGdStatus('Yetenek kimliği gerekli', 'error'); return; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:guard:permission', { role, capability });
    setGdStatus(res && res.allowed ? `İzinli (${role})` : 'İzinli değil', res && res.allowed ? 'ok' : 'warn');
  } catch (e) {
    setGdStatus('Hata: ' + esc(String(e)), 'error');
  }
}

async function analyzeDiff() {
  const diffText = q('#gd-diff')?.value || '';
  if (!diffText.trim()) { setGdStatus('Diff içeriği gerekli', 'error'); return; }
  setGdStatus('Risk analizi…', 'info');
  const report = q('#gd-report');
  if (report) { report.classList.add('hidden'); report.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:guard:diff-gate', { diffText, opts: {} });
    if (report) { report.classList.remove('hidden'); report.textContent = JSON.stringify(res, null, 2); }
    const decisionLabel = res && res.decision === 'approved' ? 'Onaylı' : res && res.decision === 'review' ? 'İnceleme gerekli' : 'Engellendi';
    setGdStatus(`Karar: ${decisionLabel} (skor ${res && res.score != null ? res.score : '—'})`, res && res.decision === 'approved' ? 'ok' : res && res.decision === 'review' ? 'warn' : 'error');
  } catch (e) {
    setGdStatus('Hata: ' + esc(String(e)), 'error');
  }
}

async function loadPolicy() {
  const report = q('#gd-report');
  if (report) { report.classList.add('hidden'); report.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:guard:policy', { op: 'get', payload: null });
    if (report) { report.classList.remove('hidden'); report.textContent = JSON.stringify(res, null, 2); }
    setGdStatus('Politika yüklendi', 'ok');
  } catch (e) {
    setGdStatus('Hata: ' + esc(String(e)), 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initGuardPanel());
