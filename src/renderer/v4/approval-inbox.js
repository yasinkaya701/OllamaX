(function initV4ApprovalInbox(globalScope) {
  'use strict';

  const LIST_CHANNEL = 'ipc:4:approval:list';
  const RESOLVE_CHANNEL = 'ipc:4:approval:resolve';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function previewText(preview) {
    const entries = Object.entries(preview || {});
    if (!entries.length) return 'No argument preview';
    return entries.map(([key, value]) => {
      const text = Array.isArray(value) ? value.join(' ') : String(value == null ? '' : value);
      return `${key}: ${text}`;
    }).join('\n');
  }

  function render(root, requests) {
    const inspector = root.querySelector('.kxv4-inspector');
    if (!inspector) return;
    let host = inspector.querySelector('[data-v4-approval-inbox]');
    if (!host) {
      host = document.createElement('section');
      host.dataset.v4ApprovalInbox = 'true';
      host.className = 'kxv4-panel-section';
      inspector.prepend(host);
    }
    host.innerHTML = `
      <div class="kxv4-section-title">Approval inbox <span>${requests.length}</span></div>
      ${requests.length ? requests.map((request) => `
        <article class="kxv4-approval-card">
          <div class="kxv4-task__header">
            <strong>${escapeHtml(request.toolId)}</strong>
            <span class="kxv4-status kxv4-status--blocked">${escapeHtml(request.risk || 'high')}</span>
          </div>
          <p>${escapeHtml(request.reason || 'Explicit approval required.')}</p>
          <pre class="kxv4-approval-preview">${escapeHtml(previewText(request.preview))}</pre>
          <div class="kxv4-topbar__actions">
            <button class="kxv4-btn kxv4-btn--primary" data-v4-approval="approve" data-request-id="${escapeHtml(request.id)}">Approve</button>
            <button class="kxv4-btn kxv4-btn--ghost" data-v4-approval="deny" data-request-id="${escapeHtml(request.id)}">Deny</button>
          </div>
        </article>`).join('') : '<div class="kxv4-muted">No privileged operation is waiting.</div>'}
    `;
  }

  function mountApprovalInbox(options = {}) {
    const root = options.root;
    const bridge = options.bridge || (globalScope && globalScope.krevyxApi);
    if (!root || !bridge || typeof bridge.invoke !== 'function') {
      throw new Error('approval inbox requires root and IPC bridge');
    }
    let destroyed = false;
    let polling = false;

    async function refresh() {
      if (destroyed || polling || root.hidden) return;
      polling = true;
      try {
        const response = await bridge.invoke(LIST_CHANNEL, {});
        const requests = response && response.ok === true && Array.isArray(response.data) ? response.data : [];
        render(root, requests);
      } catch {
        // Approval UI is additive; a polling failure must not break the workspace.
      } finally {
        polling = false;
      }
    }

    root.addEventListener('click', async (event) => {
      const action = event.target.closest('[data-v4-approval]');
      if (!action) return;
      const requestId = action.getAttribute('data-request-id');
      const approved = action.getAttribute('data-v4-approval') === 'approve';
      action.disabled = true;
      try {
        await bridge.invoke(RESOLVE_CHANNEL, { requestId, approved });
      } finally {
        await refresh();
      }
    });

    const interval = setInterval(refresh, 800);
    if (typeof interval.unref === 'function') interval.unref();
    refresh();

    return {
      refresh,
      destroy() {
        destroyed = true;
        clearInterval(interval);
      },
    };
  }

  const exported = { LIST_CHANNEL, RESOLVE_CHANNEL, previewText, mountApprovalInbox };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4ApprovalInbox = exported;
})(typeof window !== 'undefined' ? window : globalThis);
