(function initV4FinalizationPanel(globalScope) {
  'use strict';

  function button(label, action) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'kxv4-btn kxv4-btn--secondary';
    element.dataset.v4FinalizationAction = action;
    element.textContent = label;
    return element;
  }

  function section(root, title) {
    const inspector = root.querySelector('.kxv4-inspector');
    if (!inspector) return null;
    let host = inspector.querySelector('[data-v4-finalization-panel]');
    if (!host) {
      host = document.createElement('section');
      host.dataset.v4FinalizationPanel = 'true';
      host.className = 'kxv4-panel-section';
      inspector.prepend(host);
    }
    host.replaceChildren();
    const heading = document.createElement('div');
    heading.className = 'kxv4-section-title';
    heading.textContent = title;
    host.appendChild(heading);
    return host;
  }

  function row(host, label, value) {
    const item = document.createElement('div');
    item.className = 'kxv4-stat-row';
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('strong');
    val.textContent = String(value == null ? '' : value);
    item.append(key, val);
    host.appendChild(item);
  }

  function renderDelivery(root, result) {
    const host = section(root, 'Delivery review');
    if (!host) return;
    row(host, 'Base', String(result.delivery.baseSha || '').slice(0, 12));
    row(host, 'Head', String(result.delivery.headSha || '').slice(0, 12));
    row(host, 'Changed files', (result.delivery.changedFiles || []).length);
    row(host, 'Diff hash', String(result.delivery.diffHash || '').slice(0, 16));
    row(host, 'Evidence', result.evidence.evidenceCount || 0);
    const files = document.createElement('div');
    files.className = 'kxv4-list-compact';
    for (const file of (result.delivery.changedFiles || []).slice(0, 30)) {
      const line = document.createElement('div');
      line.textContent = file;
      files.appendChild(line);
    }
    host.appendChild(files);
    const artifact = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Review PR artifact';
    const pre = document.createElement('pre');
    pre.textContent = result.pullRequestArtifact && result.pullRequestArtifact.body || '';
    artifact.append(summary, pre);
    host.appendChild(artifact);
  }

  function renderCost(root, result) {
    const host = section(root, 'Mission usage');
    if (!host) return;
    row(host, 'Prompt tokens', result.total.promptTokens);
    row(host, 'Completion tokens', result.total.completionTokens);
    row(host, 'Total tokens', result.total.totalTokens);
    row(host, 'Attributed cost USD', Number(result.total.costUsd || 0).toFixed(4));
  }

  function renderDiagnostics(root, result) {
    const host = section(root, 'Sanitized diagnostics');
    if (!host) return;
    row(host, 'Schema', result.schema);
    row(host, 'App version', result.appVersion || 'unknown');
    row(host, 'Recent events', (result.recentEvents || []).length);
    row(host, 'Invalid journal lines', result.runtime && result.runtime.invalidJournalLines || 0);
  }

  function mountFinalizationPanel(options = {}) {
    const root = options.root;
    const store = options.store;
    const api = options.api;
    if (!root || !store || !api) throw new Error('finalization panel requires root, store and api');

    const unsubscribe = store.subscribe((state) => {
      const header = root.querySelector('.kxv4-main__header');
      if (!header) return;
      let actions = header.querySelector('[data-v4-finalization-actions]');
      if (!state.selectedMissionId) {
        if (actions) actions.remove();
        return;
      }
      if (!actions) {
        actions = document.createElement('div');
        actions.dataset.v4FinalizationActions = 'true';
        actions.className = 'kxv4-topbar__actions';
        header.appendChild(actions);
      }
      actions.replaceChildren(button('Delivery', 'delivery'), button('Cost', 'cost'), button('Diagnostics', 'diagnostics'));
    });

    async function onClick(event) {
      const target = event.target.closest('[data-v4-finalization-action]');
      if (!target) return;
      const missionId = store.getState().selectedMissionId;
      if (!missionId) return;
      target.disabled = true;
      try {
        const action = target.dataset.v4FinalizationAction;
        if (action === 'delivery') renderDelivery(root, await api.delivery.prepare({ missionId }));
        else if (action === 'cost') renderCost(root, await api.insights.missionCost({ missionId }));
        else if (action === 'diagnostics') renderDiagnostics(root, await api.insights.diagnostics({ eventLimit: 50 }));
      } catch (error) {
        store.setState({ error: error && error.message ? error.message : String(error) });
      } finally {
        target.disabled = false;
      }
    }
    root.addEventListener('click', onClick);
    return { destroy() { unsubscribe(); root.removeEventListener('click', onClick); } };
  }

  const exported = { mountFinalizationPanel, renderDelivery, renderCost, renderDiagnostics };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4FinalizationPanel = exported;
})(typeof window !== 'undefined' ? window : globalThis);
