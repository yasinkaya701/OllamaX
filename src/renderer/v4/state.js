(function initV4State(globalScope) {
  'use strict';

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function initialState() {
    return {
      phase: 'idle',
      error: null,
      workspaces: [],
      workspace: null,
      inventory: null,
      context: null,
      skills: [],
      missions: [],
      selectedMissionId: null,
      tasksByMission: {},
      memoryHits: [],
      activity: [],
      runningMissionId: null,
      verifyingTaskId: null,
    };
  }

  function createWorkspaceStore(options = {}) {
    const api = options.api;
    if (!api) throw new Error('v4 state store requires api');
    let state = initialState();
    const listeners = new Set();

    function notify() {
      const snapshot = clone(state);
      for (const listener of listeners) listener(snapshot);
    }

    function setState(patch) {
      state = { ...state, ...(typeof patch === 'function' ? patch(clone(state)) : patch) };
      notify();
      return clone(state);
    }

    function addActivity(type, message, meta = null) {
      const entry = { id: `activity-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, message, meta, createdAt: new Date().toISOString() };
      setState((current) => ({ activity: [entry, ...current.activity].slice(0, 100) }));
      return entry;
    }

    async function loadOverview() {
      setState({ phase: 'loading', error: null });
      try {
        const [workspaces, skills] = await Promise.all([api.workspaces.list(), api.skills.list()]);
        setState({ workspaces, skills, phase: 'ready' });
        return { workspaces, skills };
      } catch (error) {
        setState({ phase: 'error', error: error.message });
        throw error;
      }
    }

    async function openWorkspace(input) {
      setState({ phase: 'loading', error: null });
      try {
        const result = await api.workspaces.open(input);
        const missions = await api.missions.list({ workspaceId: result.workspace.id });
        setState({
          phase: 'ready',
          workspace: result.workspace,
          inventory: result.inventory,
          context: result.context,
          missions,
          selectedMissionId: missions[0] ? missions[0].id : null,
          tasksByMission: {},
        });
        addActivity('workspace', `Opened ${result.workspace.name}`);
        if (missions[0]) await loadMissionTasks(missions[0].id);
        return result;
      } catch (error) {
        setState({ phase: 'error', error: error.message });
        throw error;
      }
    }

    async function refreshWorkspace(query = '') {
      if (!state.workspace) throw new Error('No workspace selected');
      const result = await api.workspaces.refresh({ workspaceId: state.workspace.id, query });
      setState({ workspace: result.workspace, inventory: result.inventory, context: result.context });
      addActivity('workspace', 'Workspace context refreshed', { invalidatedMemory: result.invalidatedMemory || 0 });
      return result;
    }

    async function refreshMissions() {
      if (!state.workspace) return [];
      const missions = await api.missions.list({ workspaceId: state.workspace.id });
      setState({ missions });
      return missions;
    }

    async function loadMissionTasks(missionId) {
      const tasks = await api.missions.tasks({ missionId });
      setState((current) => ({
        selectedMissionId: missionId,
        tasksByMission: { ...current.tasksByMission, [missionId]: tasks },
      }));
      return tasks;
    }

    async function createMissionFromSkill(input) {
      if (!state.workspace) throw new Error('No workspace selected');
      const result = await api.missions.createFromSkill({ ...input, workspaceId: state.workspace.id });
      const missions = await api.missions.list({ workspaceId: state.workspace.id });
      setState({ missions, selectedMissionId: result.mission.id });
      await loadMissionTasks(result.mission.id);
      addActivity('mission', `Created mission ${result.mission.title}`, { skill: result.provenance });
      return result;
    }

    async function runReadyBatch(missionId = state.selectedMissionId) {
      if (!missionId) throw new Error('No mission selected');
      setState({ runningMissionId: missionId, error: null });
      addActivity('execution', 'Starting ready task batch', { missionId });
      try {
        const result = await api.missions.runReady({ missionId, maxParallel: 4, permissionProfile: 'developer' });
        await Promise.all([loadMissionTasks(missionId), refreshMissions()]);
        addActivity('execution', `Finished batch with ${result.results ? result.results.length : 0} run(s)`, {
          missionId,
          selectedTaskIds: result.selectedTaskIds || [],
          deferred: result.deferred || [],
        });
        return result;
      } catch (error) {
        setState({ error: error.message });
        addActivity('error', `Execution failed: ${error.message}`, { missionId });
        throw error;
      } finally {
        setState({ runningMissionId: null });
      }
    }

    async function verifyTask(taskId) {
      if (!taskId) throw new Error('taskId is required');
      setState({ verifyingTaskId: taskId, error: null });
      addActivity('verification', 'Running verification gates', { taskId });
      try {
        const result = await api.verification.run({ taskId, permissionProfile: 'developer', stopOnRequiredFailure: true });
        if (state.selectedMissionId) await loadMissionTasks(state.selectedMissionId);
        await refreshMissions();
        addActivity('verification', result.ok ? 'Verification passed' : 'Verification blocked task completion', {
          taskId,
          evidenceIds: result.evidenceIds || [],
          failedGateIds: result.requiredFailures || [],
        });
        return result;
      } catch (error) {
        setState({ error: error.message });
        addActivity('error', `Verification failed: ${error.message}`, { taskId });
        throw error;
      } finally {
        setState({ verifyingTaskId: null });
      }
    }

    async function cancelMission(missionId = state.selectedMissionId) {
      if (!missionId) throw new Error('No mission selected');
      const result = await api.missions.cancel({ missionId, reason: 'user-requested' });
      await loadMissionTasks(missionId);
      await refreshMissions();
      addActivity('execution', 'Cancellation requested', { missionId, cancelledRunIds: result.cancelledRunIds || [] });
      return result;
    }

    async function searchMemory(query) {
      if (!state.workspace) return [];
      const hits = await api.memory.search({ workspaceId: state.workspace.id, query, limit: 8 });
      setState({ memoryHits: hits });
      return hits;
    }

    return Object.freeze({
      getState: () => clone(state),
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        listeners.add(listener);
        listener(clone(state));
        return () => listeners.delete(listener);
      },
      setState,
      addActivity,
      loadOverview,
      openWorkspace,
      refreshWorkspace,
      refreshMissions,
      loadMissionTasks,
      createMissionFromSkill,
      runReadyBatch,
      verifyTask,
      cancelMission,
      searchMemory,
    });
  }

  const exported = { initialState, createWorkspaceStore };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (globalScope) globalScope.KrevyxV4State = exported;
})(typeof window !== 'undefined' ? window : globalThis);
