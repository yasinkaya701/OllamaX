(function initV4ExecutionControls(globalScope) {
  'use strict';

  function inferPackageManager(state) {
    const files = (((state || {}).inventory || {}).files || []).map((file) => file.path);
    if (files.includes('pnpm-lock.yaml')) return 'pnpm';
    if (files.includes('yarn.lock')) return 'yarn';
    if (files.includes('bun.lockb') || files.includes('bun.lock')) return 'bun';
    return 'npm';
  }

  function buildSkillInput(skill, focus, state) {
    const input = {};
    const packageManager = inferPackageManager(state);
    for (const key of (skill && skill.inputKeys) || []) {
      if (key === 'focus' || key === 'problem') input[key] = focus;
      else if (key === 'packageManager') input[key] = packageManager;
      else if (key === 'testScript') input[key] = 'test:ci';
      else if (key === 'lintScript') input[key] = 'lint';
      else input[key] = focus;
    }
    return input;
  }

  function button(label, action, disabled) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = 'kxv4-btn kxv4-btn--primary';
    element.dataset.v4ExecutionAction = action;
    element.textContent = label;
    element.disabled = Boolean(disabled);
    return element;
  }

  function render(root, state) {
    const header = root.querySelector('.kxv4-main__header');
    if (header && state.selectedMissionId) {
      let actions = header.querySelector('[data-v4-execution-actions]');
      if (!actions) {
        actions = document.createElement('div');
        actions.dataset.v4ExecutionActions = 'true';
        actions.className = 'kxv4-topbar__actions';
        header.appendChild(actions);
      }
      actions.replaceChildren(
        button(state.runningMissionId ? 'Running…' : 'Run ready tasks', 'run-ready', Boolean(state.runningMissionId)),
        button('Cancel runs', 'cancel-mission', !state.runningMissionId),
      );
    }

    for (const card of root.querySelectorAll('[data-v4-task]')) {
      const taskId = card.getAttribute('data-v4-task');
      const tasks = state.selectedMissionId ? (state.tasksByMission[state.selectedMissionId] || []) : [];
      const task = tasks.find((item) => item.id === taskId);
      const existing = card.querySelector('[data-v4-verify-control]');
      if (!task || task.status !== 'VERIFYING') {
        if (existing) existing.remove();
        continue;
      }
      const holder = existing || document.createElement('div');
      holder.dataset.v4VerifyControl = 'true';
      holder.className = 'kxv4-task__criteria';
      holder.replaceChildren(button(
        state.verifyingTaskId === task.id ? 'Verifying…' : 'Run verification gates',
        `verify:${task.id}`,
        state.verifyingTaskId === task.id,
      ));
      if (!existing) card.appendChild(holder);
    }
  }

  function mountExecutionControls(options = {}) {
    const root = options.root;
    const store = options.store;
    if (!root || !store) throw new Error('execution controls require root and store');

    const unsubscribe = store.subscribe((state) => render(root, state));

    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-v4-execution-action]');
      if (!target) return;
      const action = target.dataset.v4ExecutionAction || '';
      try {
        if (action === 'run-ready') await store.runReadyBatch();
        else if (action === 'cancel-mission') await store.cancelMission();
        else if (action.startsWith('verify:')) await store.verifyTask(action.slice('verify:'.length));
      } catch {
        // Store owns user-visible error/activity state.
      }
    });

    root.addEventListener('submit', async (event) => {
      if (!event.target.matches('[data-v4-mission-form]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const data = new FormData(event.target);
      const skillId = String(data.get('skillId') || '');
      const focus = String(data.get('focus') || '').trim() || 'production readiness';
      const state = store.getState();
      const skill = state.skills.find((item) => item.id === skillId);
      try {
        await store.createMissionFromSkill({ skillId, skillInput: buildSkillInput(skill, focus, state) });
      } catch {
        // Store owns user-visible error/activity state.
      }
    }, true);

    return { destroy: unsubscribe };
  }

  const exported = { inferPackageManager, buildSkillInput, mountExecutionControls };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4ExecutionControls = exported;
})(typeof window !== 'undefined' ? window : globalThis);
