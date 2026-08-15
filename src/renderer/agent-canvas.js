/**
 * agent-canvas.js — Krevyx v3.2 ajan deneyimi (Plan Bölüm 2.2–2.5)
 *
 * Agent Canvas: plan bandı, çalışma bandı, bağlam bandı.
 * Araç çağrısı kartları, onay modları (tek tek / oturum / kalıcı),
 * ajan durum çubuğu ve görev zaman çizelgesi renderer tarafını sağlar.
 *
 * Backend tarafı henüz ipc:4:* uçlarını barındırmadan bu modül
 * ipc:3:* akışlarından türetilen olaylarla da çalışır (geriye uyumlu).
 */
'use strict';
(function initAgentCanvas() {
  if (!window.krevyxApi) return;
  const api = window.krevyxApi;

  function $(sel, root = document) {
    return root ? root.querySelector(sel) : null;
  }

  function esc(s) {
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(String(s ?? ''), { ALLOWED_TAGS: [] });
    }
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const STORAGE_KEY = 'Krevyx_canvas_v1';
  let state = {
    status: 'idle',
    goal: '',
    plan: [],
    currentTask: '',
    steps: [],
    budget: null, // { used, limit } (istek/bağlam)
    context: [], // { label, value }
    tasks: [], // görev zaman çizelgesi
    approvalMode: 'per-call', // per-call | session | permanent
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    if (saved.approvalMode) state.approvalMode = saved.approvalMode;
  } catch {
    /* ignore */
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ approvalMode: state.approvalMode }));
  }

  /* ------------------------------------------------------------------ */
  /* Canvas bileşeni                                                      */
  /* ------------------------------------------------------------------ */
  function buildCanvas() {
    const canvas = document.createElement('div');
    canvas.id = 'agent-canvas';
    canvas.className = 'agent-canvas';
    canvas.innerHTML = `
      <div class="ac-band" id="ac-goal-band">
        <div class="ac-band-title"><span>Hedef</span><span class="ac-budget" id="ac-budget"></span></div>
        <div class="ac-context-row" id="ac-goal-text">Henüz hedef yok — /goal &lt;hedef&gt; ile başlayın.</div>
      </div>
      <div class="ac-band hidden" id="ac-plan-band">
        <div class="ac-band-title"><span>Plan</span><button class="v3-icon-btn" id="ac-toggle-plan" type="button" aria-label="Planı daralt" title="Daralt">‹</button></div>
        <div class="ac-steps" id="ac-steps"></div>
      </div>
      <div class="ac-band hidden" id="ac-working-band">
        <div class="ac-band-title"><span>Çalışıyor</span><span id="ac-current-task" class="ac-budget"></span></div>
        <div class="ac-steps" id="ac-working-steps"></div>
      </div>
      <div class="ac-band hidden" id="ac-context-band">
        <div class="ac-band-title"><span>Bağlam</span></div>
        <div id="ac-context"></div>
      </div>`;
    return canvas;
  }

  function mountCanvas() {
    const chatArea = $('#chat-area');
    if (!chatArea || $('#agent-canvas')) return;
    const canvas = buildCanvas();
    chatArea.insertBefore(canvas, chatArea.firstChild);
    refreshAll();
    setCanvasVisible(false);
  }
  mountCanvas();

  function setCanvasVisible(v) {
    const canvas = $('#agent-canvas');
    if (!canvas) return;
    canvas.classList.toggle('hidden', !v);
    const collapsed = !v && state._userCollapsed;
    if (collapsed) canvas.style.display = 'none';
  }

  function escStatus(s) {
    const allowed = ['idle', 'planning', 'working', 'awaiting-approval', 'done', 'error'];
    return allowed.includes(s) ? s : 'idle';
  }

  function refreshPlanBand() {
    const band = $('#ac-plan-band');
    const steps = $('#ac-steps');
    if (!band || !steps) return;
    if (!state.plan.length) { band.classList.add('hidden'); return; }
    band.classList.remove('hidden');
    steps.innerHTML = '';
    for (const st of state.plan) {
      const el = document.createElement('div');
      el.className = `ac-step ${escStatus(st.status || 'pending')}`;
      el.textContent = st.label || '';
      el.title = st.detail || '';
      steps.appendChild(el);
    }
  }

  function refreshWorkingBand() {
    const band = $('#ac-working-band');
    const steps = $('#ac-working-steps');
    if (!band || !steps) return;
    if (!state.currentTask && !state.steps.length) { band.classList.add('hidden'); return; }
    band.classList.remove('hidden');
    const task = $('#ac-current-task');
    if (task) task.textContent = state.currentTask || '';
    steps.innerHTML = '';
    for (const st of state.steps) {
      const el = document.createElement('div');
      el.className = `ac-step ${escStatus(st.status || 'pending')}`;
      el.textContent = st.label || '';
      steps.appendChild(el);
    }
  }

  function refreshGoalBand() {
    const txt = $('#ac-goal-text');
    const budget = $('#ac-budget');
    if (txt) txt.textContent = state.goal || 'Henüz hedef yok — /goal <hedef> ile başlayın.';
    if (budget) {
      if (state.budget && state.budget.limit) {
        const pct = Math.min(100, Math.round((state.budget.used / state.budget.limit) * 100));
        budget.textContent = `%${pct} (${state.budget.used}/${state.budget.limit})`;
        budget.className = `ac-budget${pct >= 90 ? ' danger' : pct >= 70 ? ' warn' : ''}`;
      } else {
        budget.textContent = '';
      }
    }
  }

  function refreshContextBand() {
    const band = $('#ac-context-band');
    const wrap = $('#ac-context');
    if (!band || !wrap) return;
    if (!state.context.length) { band.classList.add('hidden'); return; }
    band.classList.remove('hidden');
    wrap.innerHTML = '';
    for (const c of state.context) {
      const row = document.createElement('div');
      row.className = 'ac-context-row';
      row.innerHTML = `<strong>${esc(c.label)}:</strong> ${esc(c.value)}`;
      wrap.appendChild(row);
    }
  }

  function refreshAll() {
    refreshGoalBand();
    refreshPlanBand();
    refreshWorkingBand();
    refreshContextBand();
  }

  /* ------------------------------------------------------------------ */
  /* Araç çağrısı kartı (plan 2.3) — diff desteğiyle                      */
  /* ------------------------------------------------------------------ */
  function buildToolCard({ name, args, tier, content }) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    const tierLabel = tier === 'exec' ? 'exec' : tier === 'write' ? 'write' : 'read';
    card.innerHTML = `
      <div class="tc-head">
        <span class="tc-name">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          ${esc(name)}
          <span class="tier-badge ${tierLabel}">${tierLabel}</span>
        </span>
        <span class="tc-meta">${esc(typeof args === 'string' ? args : JSON.stringify(args || {}))}</span>
      </div>
      <div class="tc-body">${content ? esc(String(content).slice(0, 2000)) : ''}</div>`;
    const toggle = document.createElement('button');
    toggle.className = 'tc-expand';
    toggle.type = 'button';
    toggle.textContent = 'Tamamını göster';
    toggle.addEventListener('click', () => {
      const body = card.querySelector('.tc-body');
      const expanded = body.dataset.expanded === '1';
      body.dataset.expanded = expanded ? '0' : '1';
      body.style.maxHeight = expanded ? '150px' : '';
      toggle.textContent = expanded ? 'Tamamını göster' : 'Daralt';
    });
    card.appendChild(toggle);
    return card;
  }

  function buildDiffCard({ additions, deletions }) {
    const card = document.createElement('div');
    card.className = 'tool-card';
    const head = document.createElement('div');
    head.className = 'tc-head';
    head.innerHTML = `<span class="tc-name">Değişiklik diff</span><span class="tc-meta">${additions.length} eklendi · ${deletions.length} silindi</span>`;
    card.appendChild(head);
    const body = document.createElement('div');
    body.className = 'tc-body';
    for (const line of additions) {
      body.innerHTML += `<div class="diff-line add"><span class="diff-mark">+</span><span>${esc(line)}</span></div>`;
    }
    for (const line of deletions) {
      body.innerHTML += `<div class="diff-line del"><span class="diff-mark">−</span><span>${esc(line)}</span></div>`;
    }
    card.appendChild(body);
    return card;
  }

  /* ------------------------------------------------------------------ */
  /* Onay modları (plan 2.4)                                              */
  /* ------------------------------------------------------------------ */
  // Onay modu etiketleri (plan 2.4): Ayarlar sayfasına eklendiğinde kullanılacak
  const APPROVAL_LABELS = {
    'per-call': 'Her araç için sor',
    'session': 'Bu oturum boyunca hatırla',
    'permanent': 'Kalıcı olarak izin ver',
  };

  function buildApprovalBanner() {
    const bar = document.createElement('div');
    bar.className = 'agent-status-bar';
    bar.dataset.status = 'awaiting-approval';
    bar.innerHTML = `
      <span class="asb-dot"></span>
      <span class="asb-label" id="asb-label">Araç onayı bekleniyor…</span>
      <span class="asb-actions">
        <label class="approval-remember"><input type="checkbox" id="ac-approval-remember"> Bu oturum için hatırla</label>
        <button class="v3-btn-ghost" id="btn-ac-reject" type="button">Reddet</button>
        <button class="v3-btn-primary" id="btn-ac-approve" type="button">Onayla</button>
      </span>`;
    return bar;
  }

  /* ------------------------------------------------------------------ */
  /* Olay bağlayıcıları                                                   */
  /* ------------------------------------------------------------------ */
  function bind() {
    const api_ = window.krevyxApi;
    api_.on('event:plan', (d) => {
      if (!d) return;
      state.goal = d.goal || state.goal;
      state.plan = Array.isArray(d.steps) ? d.steps.map((s) => ({ ...s, status: 'pending' })) : [];
      setCanvasVisible(true);
      refreshAll();
    });
    api_.on('event:status', (d) => {
      if (!d) return;
      state.status = escStatus(d.status);
      if (d.task) state.currentTask = d.task;
      if (d.steps) state.steps = d.steps;
      if (d.budget) state.budget = d.budget;
      if (Array.isArray(d.context)) state.context = d.context;
      refreshAll();
    });
    api_.on('event:tool-call', (d) => {
      if (!d || !d.sessionId) return;
      const card = buildToolCard({
        name: d.name || 'araç',
        args: d.args,
        tier: d.tier,
        content: d.content || '',
      });
      appendToSession(sessionIdBubble(d.sessionId), card);
      refreshWorkingBand();
    });
    api_.on('event:diff', (d) => {
      if (!d || !d.sessionId) return;
      appendToSession(sessionIdBubble(d.sessionId), buildDiffCard({ additions: d.additions || [], deletions: d.deletions || [] }));
    });
    api_.on('agent:approval-request', (d) => {
      if (!d) return;
      showApprovalBanner(d);
    });
    api_.on('agent:approval-decided', () => {
      hideApprovalBanner();
    });
    api_.on('event:goal-update', (d) => {
      if (!d) return;
      state.goal = d.goal || '';
      refreshGoalBand();
    });
    api_.on('task:timeline', (d) => {
      if (!d || !Array.isArray(d.tasks)) return;
      state.tasks = d.tasks;
      renderTaskTimeline();
    });
  }

  function sessionIdBubble(sessionId) {
    const bubbles = document.querySelectorAll(`.agent-bubble[data-session-id="${sessionId}"]`);
    return bubbles.length ? bubbles[bubbles.length - 1] : null;
  }

  function appendToSession(bubble, node) {
    if (!bubble) return;
    let body = bubble.querySelector('.bubble-stream-body');
    if (!body) {
      body = document.createElement('div');
      body.className = 'bubble-stream-body';
      bubble.appendChild(body);
    }
    body.appendChild(node);
    const chatArea = $('#chat-area');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }

  /* ------------------------------------------------------------------ */
  /* Onay banner yönetimi                                                 */
  /* ------------------------------------------------------------------ */
  function showApprovalBanner(d) {
    hideApprovalBanner();
    const banner = buildApprovalBanner();
    const label = $('#asb-label');
    if (label && d) label.textContent = `Onay bekleniyor: ${esc(d.tool || '')} ${d.args ? '(' + esc(JSON.stringify(d.args).slice(0, 60)) + ')' : ''}`;
    const container = $('#agent-status-bar-container') || document.body;
    container.appendChild(banner);
    $('#btn-ac-approve').addEventListener('click', () => decideApproval(true));
    $('#btn-ac-reject').addEventListener('click', () => decideApproval(false));
    $('#ac-approval-remember').addEventListener('change', (e) => {
      state.approvalMode = e.target.checked ? 'session' : 'per-call';
      persist();
    });
    $('#ac-approval-remember').checked = state.approvalMode === 'session' || state.approvalMode === 'permanent';
  }

  function hideApprovalBanner() {
    const b = document.querySelector('.agent-status-bar[data-status="awaiting-approval"]');
    b?.remove();
  }

  function decideApproval(approved) {
    const api_ = window.krevyxApi;
    const remember = $('#ac-approval-remember')?.checked || false;
    api_.send('tool-approval-response', {
      approved,
      remember,
      mode: remember ? (state.approvalMode || 'session') : 'per-call',
      ts: Date.now(),
    });
    hideApprovalBanner();
  }

  /* ------------------------------------------------------------------ */
  /* Görev zaman çizelgesi (plan 2.7)                                     */
  /* ------------------------------------------------------------------ */
  function renderTaskTimeline() {
    const root = $('#task-timeline');
    if (!root) return;
    root.innerHTML = '';
    if (!state.tasks.length) {
      root.appendChild(emptyState('Görev zaman çizelgesi boş', 'Ajan hedefe ulaşırken attığı adımlar burada listelenir.'));
      return;
    }
    const list = document.createElement('div');
    list.className = 'task-timeline';
    for (const t of state.tasks) {
      const row = document.createElement('div');
      row.className = 'task-entry';
      const st = t.status === 'done' ? 'var(--v3-ok)' : t.status === 'failed' ? 'var(--v3-danger)' : 'var(--v3-warn)';
      row.innerHTML = `<span class="te-status" style="background:${st}"></span><span>${esc(t.title || t.action || '')}</span><span class="te-meta">${esc(t.at ? new Date(t.at).toLocaleTimeString('tr-TR') : '')}</span>`;
      if (t.undoable) {
        const comp = document.createElement('div');
        comp.className = 'task-compensation';
        const undoBtn = document.createElement('button');
        undoBtn.className = 'v3-btn-ghost';
        undoBtn.type = 'button';
        undoBtn.textContent = 'Geri al';
        undoBtn.addEventListener('click', async () => {
          try {
            await api.send('task:compensate', { taskId: t.id });
            comp.textContent = 'Geri alındı';
          } catch {
            comp.textContent = 'Geri alınamadı';
          }
        });
        comp.appendChild(undoBtn);
        row.appendChild(comp);
      }
      list.appendChild(row);
    }
    root.appendChild(list);
  }

  function emptyState(title, body) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M8 12h8M12 8v8"/></svg><p><strong>${esc(title)}</strong></p><p>${esc(body)}</p>`;
    return el;
  }

  /* ------------------------------------------------------------------ */
  /* Yerleşik yardımcı API                                                */
  /* ------------------------------------------------------------------ */
  const AgentCanvas = {
    buildCanvas, // plan 2.2: sonraki fazda tam DOM üretimi aktif edilecek
    approvalLabels: APPROVAL_LABELS,
    setGoal(goal) { state.goal = goal; refreshGoalBand(); setCanvasVisible(!!goal); },
    setPlan(steps) { state.plan = steps.map((s) => ({ ...s, status: 'pending' })); refreshPlanBand(); setCanvasVisible(true); },
    stepStatus(idx, status) {
      if (state.plan[idx]) state.plan[idx].status = status;
      refreshPlanBand();
    },
    setBudget(used, limit) { state.budget = { used, limit }; refreshGoalBand(); },
    pushContext(label, value) { state.context.push({ label, value }); refreshContextBand(); setCanvasVisible(true); },
    setApprovalMode(m) { state.approvalMode = m; persist(); },
    getApprovalMode() { return state.approvalMode; },
    refresh: refreshAll,
  };

  window.Krevyx = window.Krevyx || {};
  window.Krevyx.agentCanvas = AgentCanvas;

  // Komut paleti kayıt
  if (window.Krevyx?.palette) {
    window.Krevyx.palette.register({ group: 'actions', label: 'Ajan canvas\'ını aç/kapat', run: () => {
      state._userCollapsed = !state._userCollapsed;
      setCanvasVisible(!state._userCollapsed);
    } });
  }

  // /goal slash komutu desteği: sendMessage öncesi çağrılır; true dönerse mesaj tüketilir
  function tryGoalSlash(text) {
    if (!text.startsWith('/goal')) return false;
    const goal = text.replace(/^\/goal\s*/i, '').trim();
    if (!goal) { setCanvasVisible(true); return true; }
    state.goal = goal;
    setCanvasVisible(true);
    refreshGoalBand();
    // Lead olmayan senaryoda hedef verildiğinde canvas üzerinden plan bekletilir
    return true;
  }
  window.Krevyx.tryGoalSlash = tryGoalSlash;

  bind();
})();
