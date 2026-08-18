/*
 * queue.js — Krevyx v3.25 Görev Kuyruğu renderer paneli (Q-UI)
 * Stil: Emerald Ledger. Kuyruk durumu, görev ekleme, duraklat/devam.
 * Global kapsam: api, q, toast, log, esc.
 */
async function initQueue() {
  buildQueueSection();
  q('#qu-btn-add')?.addEventListener('click', () => void addTask());
  q('#qu-btn-pause')?.addEventListener('click', () => void togglePause());
  q('#qu-btn-refresh')?.addEventListener('click', () => void refreshQueue());
  q('#qu-btn-demo')?.addEventListener('click', () => void runDemo());
}

function buildQueueSection() {
  if (q('#qu-section')) return;
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'qu-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Görev Kuyruğu</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="qu-zone">
      <div class="qu-toolbar">
        <button type="button" id="qu-btn-refresh" class="small-btn" title="Yenile">↻</button>
        <button type="button" id="qu-btn-pause" class="small-btn">⏸ Duraklat</button>
        <span id="qu-state-badge" class="qu-badge qu-running">aktif</span>
      </div>
      <textarea id="qu-task-input" class="text-input ta-sm" rows="3" placeholder="Görev açıklaması…"></textarea>
      <div class="qu-add-row">
        <select id="qu-priority-select" class="text-input qu-prio">
          <option value="-1">Düşük</option>
          <option value="0" selected>Normal</option>
          <option value="1">Yüksek</option>
        </select>
        <button type="button" id="qu-btn-add" class="small-btn qu-add-btn">+ Kuyruğa Al</button>
      </div>
      <div id="qu-tasks" class="qu-tasks"><div class="empty-note">Kuyruk boş.</div></div>
      <div class="qu-secondary">
        <button type="button" id="qu-btn-demo" class="small-btn">▶ Demo akışı</button>
      </div>
    </div>`;
  const dfSection = q('#df-section');
  if (dfSection && dfSection.parentNode) {
    dfSection.parentNode.insertBefore(details, dfSection.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

async function refreshQueue() {
  if (!api) return;
  try {
    const st = await api.invoke('queue-state', { name: 'default' });
    const badge = q('#qu-state-badge');
    if (badge && st?.ok) {
      badge.textContent = st.paused ? 'durakladı' : 'aktif';
      badge.className = `qu-badge ${st.paused ? 'qu-paused' : 'qu-running'}`;
    }
    const peek = await api.invoke('queue-peek', { name: 'default', limit: 10 });
    const box = q('#qu-tasks');
    if (!box || !peek?.ok) return;
    box.innerHTML = '';
    if (!peek.tasks.length) { box.innerHTML = '<div class="empty-note">Kuyruk boş.</div>'; return; }
    peek.tasks.forEach((t) => {
      const row = document.createElement('div');
      row.className = `qu-task-row qu-${t.status}`;
      row.innerHTML = `
        <span class="qu-task-type">${esc(t.type)}</span>
        <span class="qu-task-payload">${esc(typeof t.payload === 'string' ? t.payload.slice(0, 40) : JSON.stringify(t.payload || {}).slice(0, 40))}</span>
        <span class="qu-task-status">${t.status}</span>`;
      box.appendChild(row);
    });
  } catch { /* sessiz */ }
}

async function addTask() {
  const input = q('#qu-task-input');
  const text = input?.value.trim();
  if (!text || !api) return;
  const prioSel = q('#qu-priority-select');
  const priority = prioSel ? Number(prioSel.value) || 0 : 0;
  try {
    let res = await api.invoke('queue-state', { name: 'default' });
    if (!res?.ok || (res.counts && false)) {
      await api.invoke('queue-create', { name: 'default' });
    }
    const addRes = await api.invoke('queue-add', { name: 'default', task: { type: 'user', priority, payload: text } });
    if (addRes?.ok) {
      input.value = '';
      toast('Görev kuyruğa alındı', 'success');
      await refreshQueue();
    } else {
      toast(`Eklenemedi: ${addRes?.error || 'bilinmeyen'}`, 'error');
    }
  } catch {
    toast('Kuyruk erişilemedi', 'error');
  }
}

async function togglePause() {
  if (!api) return;
  try {
    const st = await api.invoke('queue-state', { name: 'default' });
    if (st?.ok && st.paused) await api.invoke('queue-resume', { name: 'default' });
    else await api.invoke('queue-pause', { name: 'default' });
    await refreshQueue();
  } catch { /* sessiz */ }
}

async function runDemo() {
  if (!api) return;
  try {
    await api.invoke('queue-create', { name: 'default' });
    for (const t of ['Görev A — bağımlılık kurulumu', 'Görev B — derleme', 'Görev C — test koşumu']) {
      await api.invoke('queue-add', { name: 'default', task: { type: 'demo', priority: 0, payload: t } });
    }
    toast('Demo görevleri eklendi', 'success');
    await refreshQueue();
  } catch {
    toast('Demo başlatılamadı', 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initQueue());
