/*
 * budget.js — Krevyx v3.26 Bütçe paneli (orch/budget-engine)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initBudgetPanel() {
  buildBudgetSection();
  q('#bd-btn-create')?.addEventListener('click', () => void createBudget());
  q('#bd-btn-refresh')?.addEventListener('click', () => void refreshQuota());
}

function buildBudgetSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#bd-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'bd-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Bütçe Motoru</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="bd-zone">
      <label class="bd-label">Tutar (USD)</label>
      <input type="number" id="bd-amount" class="text-input" placeholder="0.05" step="0.01" min="0" />
      <div class="bd-row">
        <select id="bd-type" class="text-input"><option value="perTask">Görev başı</option><option value="daily">Günlük</option><option value="global">Global</option></select>
        <button type="button" id="bd-btn-create" class="small-btn bd-primary-btn">＋ Oluştur</button>
      </div>
      <div class="bd-actions">
        <button type="button" id="bd-btn-refresh" class="small-btn">↻ Tazele</button>
      </div>
      <div id="bd-status" class="bd-status hidden"></div>
      <div id="bd-quota" class="bd-quota hidden"></div>
    </div>`;
  const existing = q('#sk-section') || q('#pp-section');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setBdStatus(html, type) {
  const s = q('#bd-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `bd-status bd-${type || 'info'}`;
  s.textContent = html || '';
}

let _lastBudgetId = null;

async function createBudget() {
  const amount = parseFloat(q('#bd-amount')?.value || '0');
  const type = q('#bd-type')?.value || 'perTask';
  if (!amount || amount <= 0) { setBdStatus('Pozitif bir tutar gerekli', 'error'); return; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:budget:create', { spec: { type, limit: amount } });
    if (res && res.ok && res.budget) {
      _lastBudgetId = res.budget.id;
      const spend = await currentApi.invoke('kx326:budget:spend', { budgetId: res.budget.id, amount: 0, opts: {} });
      setBdStatus(`Bütçe oluşturuldu (${type})`, 'ok');
      renderQuota(spend && spend.ok ? spend : null);
    } else {
      setBdStatus('Oluşturma başarısız', 'error');
    }
  } catch (e) {
    setBdStatus('Hata: ' + esc(String(e)), 'error');
  }
}

async function refreshQuota() {
  if (!_lastBudgetId) { setBdStatus('Önce bir bütçe oluştur', 'info'); return; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:budget:quota', { budgetId: _lastBudgetId });
    renderQuota(res && res.ok ? res : null);
    setBdStatus(res && res.ok ? 'Kalan tazelendi' : 'Kalan alınamadı', res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setBdStatus('Hata: ' + esc(String(e)), 'error');
  }
}

function renderQuota(qres) {
  const box = q('#bd-quota');
  if (!box) return;
  box.classList.toggle('hidden', !qres);
  if (!qres) return;
  const pct = Math.round((qres.ratio || 0) * 100);
  box.innerHTML = `
    <div class="bd-bar-wrap" aria-hidden="true"><div class="bd-bar" style="width:${pct}%"></div></div>
    <div class="bd-numbers">Harcanan: $${qres.spent || 0} / Kalan: $${qres.remaining || 0} (${pct}%)</div>`;
}

window.addEventListener('DOMContentLoaded', () => void initBudgetPanel());
