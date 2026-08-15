/**
 * orchestrator-view.js — Krevyx v3.2 sub-agent orkestrasyon görünümü (Plan 2.6)
 *
 * Lead agent alt ajanlarını bu panelde gösterir: her sub-agent için
 * hedef, durum, ilerleme yüzdesi ve son çıktı özeti. ipc:4:orchestrator:*
 * uçları eklendiğinde gerçek zamanlı akışa bağlanır; yoksa mevcut
 * ipc:3:* akışlarından türetilir.
 */
'use strict';
(function initOrchestratorView() {
  if (!window.krevyxApi) return;
  const api = window.krevyxApi;

  function esc(s) {
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(String(s ?? ''), { ALLOWED_TAGS: [] });
    }
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const subs = new Map(); // agentId -> { id, name, goal, status, progress, lastOutput }

  function render(root) {
    root.innerHTML = '';
    const entries = Array.from(subs.values());
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 9h6v6H9z"/></svg><p><strong>Aktif sub-agent yok</strong></p><p>Lead ajan alt görevleri atadığında burada listelenir.</p>`;
      root.appendChild(empty);
      return;
    }
    for (const sub of entries) {
      const card = document.createElement('div');
      card.className = 'task-entry';
      card.style.flexDirection = 'column';
      card.style.alignItems = 'flex-start';
      card.style.gap = '6px';
      card.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;width:100%">
          <span class="te-status" style="background:var(--v3-${sub.status === 'done' ? 'ok' : sub.status === 'error' ? 'danger' : sub.status === 'working' ? 'info' : 'warn'})"></span>
          <strong style="color:var(--v3-text-primary)">${esc(sub.name || sub.id)}</strong>
          <span class="te-meta">${esc(sub.status || 'idle')}</span>
          <span class="te-meta" style="margin-left:0">${sub.progress != null ? `%${sub.progress}` : ''}</span>
        </div>
        ${sub.goal ? `<div style="color:var(--v3-text-secondary);font-size:12px">${esc(sub.goal)}</div>` : ''}
        ${sub.lastOutput ? `<div style="color:var(--v3-text-muted);font-size:11px;font-family:var(--v3-font-mono)">${esc(String(sub.lastOutput).slice(0, 120))}</div>` : ''}`;
      root.appendChild(card);
    }
  }

  function bind() {
    api.on('orchestrator:subagents', (d) => {
      if (!d || !Array.isArray(d.subagents)) return;
      for (const s of d.subagents) subs.set(s.id, { ...subs.get(s.id), ...s });
      const root = document.getElementById('orchestrator-root');
      if (root) render(root);
    });
    api.on('orchestrator:subagent-update', (d) => {
      if (!d || !d.id) return;
      const cur = subs.get(d.id);
      subs.set(d.id, { ...(cur || { id: d.id }), ...d });
      const root = document.getElementById('orchestrator-root');
      if (root) render(root);
    });
  }

  const Orchestrator = {
    /** Test/manuel kullanım: tek sub-agent durumunu güncelle */
    updateSubAgent(d) {
      if (!d || !d.id) return;
      const cur = subs.get(d.id);
      subs.set(d.id, { ...(cur || { id: d.id }), ...d });
      const root = document.getElementById('orchestrator-root');
      if (root) render(root);
    },
    render,
    clear() {
      subs.clear();
      const root = document.getElementById('orchestrator-root');
      if (root) render(root);
    },
  };

  window.Krevyx = window.Krevyx || {};
  window.Krevyx.orchestrator = Orchestrator;
  bind();
})();
