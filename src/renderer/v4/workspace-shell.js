(function initV4WorkspaceShell(globalScope) {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function statusClass(status) {
    return `kxv4-status kxv4-status--${String(status || 'unknown').toLowerCase()}`;
  }

  function renderMissionList(state) {
    if (!state.missions.length) return '<div class="kxv4-empty">No missions yet.</div>';
    return state.missions.map((mission) => `
      <button class="kxv4-mission ${state.selectedMissionId === mission.id ? 'is-selected' : ''}" data-v4-mission="${escapeHtml(mission.id)}">
        <span class="kxv4-mission__title">${escapeHtml(mission.title)}</span>
        <span class="${statusClass(mission.status)}">${escapeHtml(mission.status)}</span>
      </button>`).join('');
  }

  function renderTasks(state) {
    const tasks = state.selectedMissionId ? (state.tasksByMission[state.selectedMissionId] || []) : [];
    if (!state.selectedMissionId) return '<div class="kxv4-empty kxv4-empty--large">Create or select a mission.</div>';
    if (!tasks.length) return '<div class="kxv4-empty kxv4-empty--large">Mission has no tasks.</div>';
    return tasks.map((task) => {
      const runtimeInput = Array.isArray(task.inputs) ? task.inputs.find((item) => item && item.kind === 'skill-runtime') : null;
      const tools = runtimeInput && runtimeInput.allowedTools ? runtimeInput.allowedTools : [];
      return `
        <article class="kxv4-task" data-v4-task="${escapeHtml(task.id)}">
          <div class="kxv4-task__header">
            <div>
              <div class="kxv4-task__title">${escapeHtml(task.title)}</div>
              <div class="kxv4-task__meta">${escapeHtml(task.id)}</div>
            </div>
            <span class="${statusClass(task.status)}">${escapeHtml(task.status)}</span>
          </div>
          ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ''}
          <div class="kxv4-task__chips">
            ${(task.dependencies || []).map((id) => `<span class="kxv4-chip">depends: ${escapeHtml(id.slice(0, 10))}</span>`).join('')}
            ${tools.map((tool) => `<span class="kxv4-chip kxv4-chip--tool">${escapeHtml(tool)}</span>`).join('')}
          </div>
          <div class="kxv4-task__criteria">
            ${(task.acceptanceCriteria || []).map((item) => `<div>✓ ${escapeHtml(item)}</div>`).join('')}
          </div>
        </article>`;
    }).join('');
  }

  function renderIsolation(state) {
    if (!state.selectedMissionId) {
      return `
        <section class="kxv4-panel-section">
          <div class="kxv4-section-title">Mission isolation</div>
          <span class="kxv4-muted">Select a mission to inspect its isolated worktree.</span>
        </section>`;
    }
    const review = (state.reviewByMission || {})[state.selectedMissionId];
    if (!review) {
      return `
        <section class="kxv4-panel-section">
          <div class="kxv4-section-title">Mission isolation</div>
          <span class="kxv4-muted">Loading isolation state…</span>
        </section>`;
    }
    if (!review.exists) {
      return `
        <section class="kxv4-panel-section">
          <div class="kxv4-section-title">Mission isolation</div>
          <div class="kxv4-stat-row"><span>Status</span><strong>NOT CREATED</strong></div>
          <div class="kxv4-muted">A detached worktree will be created automatically on first planning, execution, or verification.</div>
          <button data-v4-action="refresh-isolation" class="kxv4-btn kxv4-btn--secondary kxv4-btn--compact">Refresh review</button>
        </section>`;
    }

    const changedFiles = review.changedFiles || [];
    const untrackedFiles = review.untrackedFiles || [];
    const preview = review.diffPreview || '';
    return `
      <section class="kxv4-panel-section">
        <div class="kxv4-section-title">Mission isolation <span>${review.dirty || review.aheadCommits ? 'CHANGED' : 'CLEAN'}</span></div>
        <div class="kxv4-stat-row"><span>HEAD</span><strong>${escapeHtml(String(review.headSha || '').slice(0, 12))}</strong></div>
        <div class="kxv4-stat-row"><span>Base</span><strong>${escapeHtml(String(review.baseSha || '').slice(0, 12))}</strong></div>
        <div class="kxv4-stat-row"><span>Ahead commits</span><strong>${Number(review.aheadCommits || 0)}</strong></div>
        <div class="kxv4-stat-row"><span>Changed files</span><strong>${changedFiles.length}</strong></div>
        <div class="kxv4-stat-row"><span>Untracked</span><strong>${untrackedFiles.length}</strong></div>
        <div class="kxv4-list-compact">
          ${changedFiles.slice(0, 12).map((file) => `<div title="${escapeHtml(file)}">${escapeHtml(file)}</div>`).join('') || '<span class="kxv4-muted">No tracked changes.</span>'}
        </div>
        ${review.diffStat ? `<pre class="kxv4-diff-stat">${escapeHtml(review.diffStat)}</pre>` : ''}
        <details class="kxv4-review-details">
          <summary>Diff preview${review.diffPreviewTruncated ? ' · truncated' : ''}</summary>
          <pre class="kxv4-diff-preview">${escapeHtml(preview || 'No tracked diff.')}</pre>
        </details>
        ${untrackedFiles.length ? `<div class="kxv4-muted">Untracked file contents are intentionally not included in the diff preview.</div>` : ''}
        <button data-v4-action="refresh-isolation" class="kxv4-btn kxv4-btn--secondary kxv4-btn--compact">Refresh review</button>
      </section>`;
  }

  function renderContext(state) {
    const context = state.context || {};
    const files = context.entries || [];
    const memory = context.memory || [];
    return `
      ${renderIsolation(state)}
      <section class="kxv4-panel-section">
        <div class="kxv4-section-title">Context pack</div>
        <div class="kxv4-stat-row"><span>Files</span><strong>${files.length}</strong></div>
        <div class="kxv4-stat-row"><span>Bytes</span><strong>${Number(context.totalBytes || 0).toLocaleString()}</strong></div>
        <div class="kxv4-list-compact">
          ${files.slice(0, 8).map((file) => `<div title="${escapeHtml(file.path)}">${escapeHtml(file.path)}</div>`).join('') || '<span class="kxv4-muted">No context yet.</span>'}
        </div>
      </section>
      <section class="kxv4-panel-section">
        <div class="kxv4-section-title">Active memory</div>
        <div class="kxv4-list-compact">
          ${memory.slice(0, 8).map((item) => `<div><b>${escapeHtml(item.kind)}</b> · ${escapeHtml(item.content)}</div>`).join('') || '<span class="kxv4-muted">No active memory selected.</span>'}
        </div>
      </section>`;
  }

  function renderActivity(state) {
    return state.activity.slice(0, 12).map((item) => `
      <div class="kxv4-activity-item">
        <span>${escapeHtml(item.type)}</span>
        <strong>${escapeHtml(item.message)}</strong>
        <time>${escapeHtml(new Date(item.createdAt).toLocaleTimeString())}</time>
      </div>`).join('') || '<div class="kxv4-empty">No activity yet.</div>';
  }

  function render(root, state) {
    const workspace = state.workspace;
    root.innerHTML = `
      <div class="kxv4-shell ${state.phase === 'loading' ? 'is-loading' : ''}">
        <header class="kxv4-topbar">
          <div>
            <div class="kxv4-eyebrow">Krevyx v4 · Evidence-backed engineering</div>
            <h1>${workspace ? escapeHtml(workspace.name) : 'Local Agent Workspace'}</h1>
            <div class="kxv4-subtitle">${workspace ? escapeHtml(workspace.rootPath) : 'Open a repository to build a mission.'}</div>
          </div>
          <div class="kxv4-topbar__actions">
            ${workspace ? '<button data-v4-action="refresh" class="kxv4-btn kxv4-btn--secondary">Refresh context</button>' : ''}
            <button data-v4-action="close" class="kxv4-btn kxv4-btn--ghost">Return to classic</button>
          </div>
        </header>
        ${state.error ? `<div class="kxv4-error">${escapeHtml(state.error)}</div>` : ''}
        <div class="kxv4-grid">
          <aside class="kxv4-sidebar">
            <section class="kxv4-panel-section">
              <div class="kxv4-section-title">Workspace</div>
              ${workspace ? `
                <div class="kxv4-workspace-card">
                  <strong>${escapeHtml(workspace.name)}</strong>
                  <span>${escapeHtml((workspace.repositoryMetadata || {}).activeBranch || 'detached')}</span>
                  <small>${escapeHtml((workspace.indexState || {}).inventoryHash || '')}</small>
                </div>` : `
                <form data-v4-open-form class="kxv4-stack">
                  <input name="rootPath" class="kxv4-input" placeholder="/path/to/repository" required>
                  <button class="kxv4-btn kxv4-btn--primary" type="submit">Open workspace</button>
                </form>`}
            </section>
            <section class="kxv4-panel-section">
              <div class="kxv4-section-title">Missions <span>${state.missions.length}</span></div>
              <div class="kxv4-mission-list">${renderMissionList(state)}</div>
            </section>
            ${workspace ? `
              <section class="kxv4-panel-section">
                <div class="kxv4-section-title">New mission</div>
                <form data-v4-mission-form class="kxv4-stack">
                  <select name="skillId" class="kxv4-input">
                    ${state.skills.map((skill) => `<option value="${escapeHtml(skill.id)}">${escapeHtml(skill.title)} · ${escapeHtml(skill.version)}</option>`).join('')}
                  </select>
                  <input name="focus" class="kxv4-input" placeholder="Mission focus / problem">
                  <button class="kxv4-btn kxv4-btn--primary" type="submit">Create from skill</button>
                </form>
              </section>` : ''}
          </aside>
          <main class="kxv4-main">
            <div class="kxv4-main__header">
              <div>
                <div class="kxv4-section-title">Mission execution</div>
                <div class="kxv4-muted">Tasks are not complete until required evidence gates pass.</div>
              </div>
            </div>
            <div class="kxv4-task-list">${renderTasks(state)}</div>
          </main>
          <aside class="kxv4-inspector">
            ${renderContext(state)}
          </aside>
        </div>
        <section class="kxv4-activity">
          <div class="kxv4-section-title">Activity</div>
          <div class="kxv4-activity-list">${renderActivity(state)}</div>
        </section>
      </div>`;
  }

  function defaultSkillInput(skill, focus) {
    const input = {};
    for (const key of (skill && skill.inputKeys) || []) {
      if (key === 'focus' || key === 'problem') input[key] = focus;
      else if (key === 'packageManager') input[key] = 'pnpm';
      else if (key === 'testScript') input[key] = 'test:ci';
      else if (key === 'lintScript') input[key] = 'lint';
      else input[key] = focus;
    }
    return input;
  }

  function mountWorkspaceShell(options = {}) {
    const root = options.root;
    const store = options.store;
    if (!root || !store) throw new Error('workspace shell requires root and store');
    const unsubscribe = store.subscribe((state) => render(root, state));

    root.addEventListener('click', async (event) => {
      const missionButton = event.target.closest('[data-v4-mission]');
      if (missionButton) {
        await store.loadMissionTasks(missionButton.getAttribute('data-v4-mission'));
        return;
      }
      const action = event.target.closest('[data-v4-action]');
      if (!action) return;
      const id = action.getAttribute('data-v4-action');
      if (id === 'refresh') await store.refreshWorkspace('current mission and changed files');
      if (id === 'refresh-isolation') await store.refreshMissionReview(store.getState().selectedMissionId);
      if (id === 'close' && typeof options.onClose === 'function') options.onClose();
    });

    root.addEventListener('submit', async (event) => {
      if (event.target.matches('[data-v4-open-form]')) {
        event.preventDefault();
        const data = new FormData(event.target);
        await store.openWorkspace({ rootPath: data.get('rootPath') });
      }
      if (event.target.matches('[data-v4-mission-form]')) {
        event.preventDefault();
        const data = new FormData(event.target);
        const skillId = String(data.get('skillId') || '');
        const focus = String(data.get('focus') || '').trim() || 'production readiness';
        const skill = store.getState().skills.find((item) => item.id === skillId);
        await store.createMissionFromSkill({ skillId, skillInput: defaultSkillInput(skill, focus) });
      }
    });

    return { destroy: unsubscribe };
  }

  const exported = { escapeHtml, defaultSkillInput, renderIsolation, render, mountWorkspaceShell };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4WorkspaceShell = exported;
})(typeof window !== 'undefined' ? window : globalThis);
