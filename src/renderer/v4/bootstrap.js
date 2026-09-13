(function bootstrapKrevyxV4(globalScope) {
  'use strict';

  function createLauncher(openWorkspace) {
    let launcher = document.getElementById('krevyx-v4-launcher');
    if (launcher) return launcher;
    launcher = document.createElement('button');
    launcher.id = 'krevyx-v4-launcher';
    launcher.type = 'button';
    launcher.textContent = 'Open Krevyx v4';
    launcher.setAttribute('aria-label', 'Open Krevyx v4 engineering workspace');
    Object.assign(launcher.style, {
      position: 'fixed', right: '18px', bottom: '18px', zIndex: '11999',
      border: '1px solid rgba(120,150,255,.55)', borderRadius: '10px', padding: '9px 13px',
      background: '#101827', color: '#eaf0ff', font: '600 12px Inter, system-ui, sans-serif',
      cursor: 'pointer', boxShadow: '0 10px 30px rgba(0,0,0,.35)',
    });
    launcher.addEventListener('click', openWorkspace);
    document.body.appendChild(launcher);
    return launcher;
  }

  async function start() {
    if (!globalScope.KrevyxV4Api || !globalScope.KrevyxV4State || !globalScope.KrevyxV4WorkspaceShell) {
      throw new Error('Krevyx v4 renderer modules are incomplete');
    }

    let root = document.getElementById('krevyx-v4-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'krevyx-v4-root';
      document.body.appendChild(root);
    }

    const api = globalScope.KrevyxV4Api.createV4Api(globalScope.krevyxApi);
    const store = globalScope.KrevyxV4State.createWorkspaceStore({ api });
    let launcher = null;

    function openWorkspace() {
      root.hidden = false;
      if (launcher) launcher.hidden = true;
    }

    function closeWorkspace() {
      root.hidden = true;
      if (launcher) launcher.hidden = false;
    }

    const shell = globalScope.KrevyxV4WorkspaceShell.mountWorkspaceShell({ root, store, onClose: closeWorkspace });
    const controls = globalScope.KrevyxV4ExecutionControls
      ? globalScope.KrevyxV4ExecutionControls.mountExecutionControls({ root, store })
      : null;
    const finalization = globalScope.KrevyxV4FinalizationPanel
      ? globalScope.KrevyxV4FinalizationPanel.mountFinalizationPanel({ root, store, api })
      : null;

    launcher = createLauncher(openWorkspace);
    openWorkspace();

    try {
      await store.loadOverview();
    } catch (error) {
      console.error('[Krevyx v4] overview failed:', error && error.message ? error.message : error);
    }

    globalScope.krevyxV4 = Object.freeze({
      api,
      store,
      open: openWorkspace,
      close: closeWorkspace,
      destroy() {
        if (shell && shell.destroy) shell.destroy();
        if (controls && controls.destroy) controls.destroy();
        if (finalization && finalization.destroy) finalization.destroy();
        root.remove();
        if (launcher) launcher.remove();
      },
    });
  }

  start().catch((error) => {
    console.error('[Krevyx v4] bootstrap failed:', error && error.message ? error.message : error);
  });
})(typeof window !== 'undefined' ? window : globalThis);
