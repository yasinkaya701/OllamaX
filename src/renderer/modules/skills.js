/*
 * skills.js — Krevyx v3.26 Yetenek paneli (orch/skills)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initSkillsPanel() {
  buildSkillsSection();
  q('#sk-btn-list')?.addEventListener('click', () => void listSkills());
  q('#sk-btn-plan')?.addEventListener('click', () => void planSkill());
}

function buildSkillsSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#sk-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'sk-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Yetenekler</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="sk-zone">
      <label class="sk-label">Görev metni</label>
      <textarea id="sk-task" class="text-input ta-sm" rows="3" placeholder="Örn: commit et ve testleri çalıştır"></textarea>
      <div class="sk-actions">
        <button type="button" id="sk-btn-list" class="small-btn">☰ Liste</button>
        <button type="button" id="sk-btn-plan" class="small-btn sk-primary-btn">✦ Plan Üret</button>
      </div>
      <div id="sk-status" class="sk-status hidden"></div>
      <div id="sk-result" class="sk-result hidden"></div>
    </div>`;
  const existing = q('#pp-section') || q('#rt-section');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setSkStatus(html, type) {
  const s = q('#sk-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `sk-status sk-${type || 'info'}`;
  s.textContent = html || '';
}

async function listSkills() {
  setSkStatus('Yetenekler yükleniyor…', 'info');
  const result = q('#sk-result');
  if (result) { result.classList.add('hidden'); result.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:skills:list', { opts: {} });
    if (result) { result.classList.remove('hidden'); result.textContent = JSON.stringify(res, null, 2); }
    setSkStatus(res && res.ok ? `${(res.skills || []).length} yetenek listelendi` : 'Yükleme başarısız', res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setSkStatus('Hata: ' + esc(String(e)), 'error');
  }
}

async function planSkill() {
  const taskText = q('#sk-task')?.value || '';
  if (!taskText.trim()) { setSkStatus('Görev metni gerekli', 'error'); return; }
  setSkStatus('Eşleştirme ve plan üretimi…', 'info');
  const result = q('#sk-result');
  if (result) { result.classList.add('hidden'); result.textContent = ''; }
  try {
    const currentApi = getApi();
    const matched = await currentApi.invoke('kx326:skills:match', { taskText });
    let plan = { ok: false, error: 'Eşleşen yetenek yok' };
    if (matched && matched.ok && matched.skills && matched.skills.length) {
      plan = await currentApi.invoke('kx326:skills:plan', { skillId: matched.skills[0].skill, vars: {} });
    }
    if (result) { result.classList.remove('hidden'); result.textContent = JSON.stringify({ matched, plan }, null, 2); }
    setSkStatus(plan && plan.ok ? 'Plan hazır' : 'Yetenek bulunamadı', plan && plan.ok ? 'ok' : 'info');
  } catch (e) {
    setSkStatus('Hata: ' + esc(String(e)), 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initSkillsPanel());
