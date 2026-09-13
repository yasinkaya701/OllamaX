(function initV4ExecutionControls(globalScope) {
  'use strict';

  const TASK_PLAN_CHANNEL = 'ipc:4:task:plan';

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

  function button(label, action, disabled, secondary = false) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = secondary ? 'kxv4-btn kxv4-btn--secondary' : 'kxv4-btn kxv4-btn--primary';
    element.dataset.v4ExecutionAction = action;
    element.textContent = label;
    element.disabled = Boolean(disabled);
    return element;
  }

  function taskRuntimeInput(task) {
    return Array.isArray(task && task.inputs)
      ? task.inputs.find((item) => item && item.kind === 'skill-runtime') || null
      : null;
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
        button('Cancel runs', 'cancel-mission', !state.runningMissionId, true),
      );
    }

    const tasks = state.selectedMissionId ? (state.tasksByMission[state.selectedMissionId] || []) : [];
    for (const card of root.querySelectorAll('[data-v4-task]')) {
      const taskId = card.getAttribute('data-v4-task');
      const task = tasks.find((item) => item.id === taskId);
      let holder = card.querySelector('[data-v4-runtime-controls]');
      const runtime = taskRuntimeInput(task);
      const needsPlan = Boolean(task && runtime && (!Array.isArray(runtime.toolPlan) || runtime.toolPlan.length === 0)
        && !['RUNNING', 'VERIFYING', 'COMPLETE', 'FAILED', 'CANCELLED'].includes(task.status));
      const needsVerification = Boolean(task && task.status === 'VERIFYING');

      if (!needsPlan && !needsVerification) {
        if (holder) holder.remove();
        continue;
      }
      if (!holder) {
        holder = document.createElement('div');
        holder.dataset.v4RuntimeControls = 'true';
        holder.className = 'kxv4-topbar__actions';
        card.appendChild(holder);
      }
      const controls = [];
      if (needsPlan) controls.push(button('Generate implementation plan', `plan:${task.id}`, false, true));
      if (needsVerification) {
        controls.push(button(
          state.verifyingTaskId === task.id ? 'Verifying…' : 'Run verification gates',
          `verify:${task.id}`,
          state.verifyingTaskId === task.id,
        ));
      }
      holder.replaceChildren(...controls);
    }
  }

  function mountExecutionControls(options = {}) {
    const root = options.root;
    const store = options.store;
    const bridge = options.bridge || (globalScope && globalScope.krevyxApi);
    if (!root || !store) throw new Error('execution controls require root and store');

    const unsubscribe = store.subscribe((state) => render(root, state));
    const inboxHandle = globalScope && globalScope.KrevyxV4ApprovalInbox && bridge
      ? globalScope.KrevyxV4ApprovalInbox.mountApprovalInbox({ root, bridge })
      : null;

    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-v4-execution-action]');
      if (!target) return;
      const action = target.dataset.v4ExecutionAction || '';
      try {
        if (action === 'run-ready') await store.runReadyBatch();
        else if (action === 'cancel-mission') await store.cancelMission();
        else if (action.startsWith('verify:')) await store.verifyTask(action.slice('verify:'.length));
        else if (action.startsWith('plan:')) {
          if (!bridge || typeof bridge.invoke !== 'function') throw new Error('IPC bridge unavailable');
          const taskId = action.slice('plan:'.length);
          target.disabled = true;
          target.textContent = 'Planning with local model…';
          const response = await bridge.invoke(TASK_PLAN_CHANNEL, { taskId });
          if (!response || response.ok !== true) {
            const message = response && response.error && response.error.message ? response.error.message : 'Planner request failed';
            throw new Error(message);
          }
          await store.loadMissionTasks(store.getState().selectedMissionId);
          store.addActivity('planning', 'Generated trusted implementation plan', {
            taskId,
            model: response.data && response.data.task && taskRuntimeInput(response.data.task)?.planner?.model || null,
          });
        }
      } catch (error) {
        store.setState({ error: error && error.message ? error.message : String(error) });
        store.addActivity('error', error && error.message ? error.message : String(error));
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

    return {
      destroy() {
        unsubscribe();
        if (inboxHandle && inboxHandle.destroy) inboxHandle.destroy();
      },
    };
  }

  const exported = {
    TASK_PLAN_CHANNEL,
    inferPackageManager,
    buildSkillInput,
    taskRuntimeInput,
    mountExecutionControls,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4ExecutionControls = exported;
})(typeof window !== 'undefined' ? window : globalThis);
