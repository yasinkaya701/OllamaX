/*
 * plans.js — Krevyx v3.25 Plan Modu renderer paneli (P-UI)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, log, esc, save.
 */
async function initPlans() {
  buildPlansSection();
  q('#pl-btn-plan')?.addEventListener('click', () => void runBuildPlan());
  q('#pl-serialize-btn')?.addEventListener('click', () => void runSerialize());
  q('#pl-parse-btn')?.addEventListener('click', () => void runParse());
  q('#pl-clear-btn')?.addEventListener('click', () => { clearPlan(); });
  q('#pl-risk-estimate')?.addEventListener('click', () => void runEstimate());
  if (!api) return;
  const mem = localStorage.getItem('Krevyx_pl_prompt');
  if (mem) q('#pl-prompt').value = mem;
}

function buildPlansSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#pl-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'pl-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Yeniden Denetçi</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="pl-zone">
      <label class="pl-label">Görev tanımı</label>
      <textarea id="pl-prompt" class="text-input ta-sm" rows="4" placeholder="Örn: config.js dosyasındaki eski uç noktayı yeni API'ye güncelle, testleri çalıştır"></textarea>
      <div class="pl-actions">
        <button type="button" id="pl-btn-plan" class="small-btn pl-primary-btn">⊕ Plan Oluştur</button>
        <button type="button" id="pl-risk-estimate" class="small-btn">≈ Tahmin</button>
      </div>
      <div id="pl-status" class="pl-status hidden"></div>
      <div id="pl-steps" class="pl-steps"></div>
      <div class="pl-secondary-row">
        <button type="button" id="pl-serialize-btn" class="small-btn">⬇ JSON</button>
        <button type="button" id="pl-parse-btn" class="small-btn">⬆ Doğrula</button>
        <button type="button" id="pl-clear-btn" class="small-btn">✕ Temizle</button>
      </div>
      <div id="pl-serial" class="pl-serial hidden"></div>
    </div>`;
  const orchestration = q('#acc-orchestration');
  if (orchestration && orchestration.parentNode) {
    orchestration.parentNode.insertBefore(details, orchestration.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

let lastPlan = null;

function setStatus(html, type) {
  const s = q('#pl-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `pl-status pl-${type || 'info'}`;
  s.textContent = html || '';
}

function renderSteps(plan) {
  const box = q('#pl-steps');
  if (!box) return;
  box.innerHTML = '';
  if (!plan || !plan.steps || !plan.steps.length) return;
  plan.steps.forEach((step, i) => {
    const row = document.createElement('div');
    row.className = 'pl-step-row';
    const riskCls = step.risk >= 8 ? 'pl-high' : step.risk >= 5 ? 'pl-mid' : 'pl-low';
    row.innerHTML = `
      <span class="pl-step-idx">${i + 1}</span>
      <span class="pl-step-type">${esc(step.type)}</span>
      <span class="pl-step-target">${esc(step.target || '—')}</span>
      <span class="pl-step-risk ${riskCls}" title="Risk: ${step.risk}/10">${step.risk}${step.blocked ? ' ⛔' : ''}</span>`;
    if (step.reason) row.title = esc(step.reason);
    box.appendChild(row);
  });
}

async function runBuildPlan() {
  const prompt = q('#pl-prompt').value.trim();
  if (!prompt) { toast('Görev tanımı boş', 'error'); return; }
  try {
    localStorage.setItem('Krevyx_pl_prompt', prompt);
  } catch { /* ignore */ }
  if (!api) { toast('Electron API yok', 'error'); return; }
  setStatus('Plan oluşturuluyor…', 'info');
  try {
    const res = await api.invoke('plan-build', { prompt });
    if (!res.ok) { setStatus(`Hata: ${res.error}`, 'error'); return; }
    lastPlan = res.plan;
    renderSteps(res.plan);
    setStatus(`${res.plan.steps.length} adım · risk ${res.plan.risk || ''}`, 'ok');
    log('Plan oluşturuldu: ' + res.plan.id, 'info');
  } catch (err) {
    setStatus('Plan oluşturulamadı', 'error');
  }
}

async function runEstimate() {
  const prompt = q('#pl-prompt').value.trim();
  if (!prompt || !api) return;
  try {
    const res = await api.invoke('plan-estimate', { prompt });
    if (res?.ok) setStatus(`Tahmini adım sayısı: ${res.steps}`, 'info');
  } catch { /* sessiz */ }
}

async function runSerialize() {
  if (!lastPlan || !api) { toast('Önce plan oluştur', 'error'); return; }
  const res = await api.invoke('plan-serialize', { plan: lastPlan });
  const box = q('#pl-serial');
  if (!box) return;
  box.classList.remove('hidden');
  if (res?.ok) {
    box.textContent = res.json;
    try { navigator.clipboard.writeText(res.json); toast('Plan JSON panoya kopyalandı', 'success'); } catch { /* ignore */ }
  } else {
    box.textContent = `Hata: ${res?.error || 'bilinmeyen'}`;
  }
}

async function runParse() {
  const box = q('#pl-serial');
  const text = box?.textContent?.trim();
  if (!text || !api) { toast('JSON yok; önce ⬇ JSON ile çıkar', 'error'); return; }
  const res = await api.invoke('plan-parse', { json: text });
  if (res?.ok) {
    lastPlan = res.plan;
    renderSteps(res.plan);
    setStatus(`Plan doğrulandı: ${res.plan.steps.length} adım`, 'ok');
    box.classList.add('hidden');
  } else {
    setStatus(`Doğrulama hatası: ${res?.error || 'bilinmeyen'}`, 'error');
  }
}

function clearPlan() {
  lastPlan = null;
  renderSteps(null);
  setStatus('', 'info');
  const box = q('#pl-serial');
  if (box) box.classList.add('hidden');
}

window.addEventListener('DOMContentLoaded', () => void initPlans());
