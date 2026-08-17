/*
 * core.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

function toast(message, type = 'info', ms = 4200) {
  const stack = q('#toast-stack');
  if (!stack) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  stack.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity .25s';
    setTimeout(() => t.remove(), 260);
  }, ms);
}

function showErrorBanner(msg) {
  const b = q('#error-banner');
  if (!b) return;
  b.innerHTML = '';
  b.appendChild(document.createTextNode(msg));
  const x = document.createElement('button');
  x.type = 'button';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '×';
  x.onclick = () => {
    b.classList.add('hidden');
    b.innerHTML = '';
  };
  b.appendChild(x);
  b.classList.remove('hidden');
}

function hideErrorBanner() {
  const b = q('#error-banner');
  if (b) {
    b.innerHTML = '';
    b.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', () => void init());

async function init() {
  loadState();
  await loadPersistedSession();
  ensureOllamaMachines();
  if (api && Array.isArray(state.settings.ollamaMachines)) {
    for (const m of state.settings.ollamaMachines) {
      if (!m?.host) continue;
      try {
        const v = await api.invoke('normalize-ollama-host', m.host);
        if (v?.ok && v.host) m.host = v.host;
      } catch {
        /* keep */
      }
    }
    syncOllamaHostFromDefaultMachine();
  }
  await hydrateModelCatalog();
  await loadRichProfiles();
  buildApiModelRows();
  renderAgentList();
  renderTemplates();
  renderFeaturedRepos();
  bindAll();
  populateModelSelect('ollama');
  updateApiDots();
  if (api) {
    bindGlobalStreamListeners();
    bindIPC();
    await bootstrapCloudModels();
    buildApiModelRows();
    populateModelSelect(state.currentProvider);
    api.send('get-models', defaultOllamaHost());
    loadFeaturedReposCatalog();
    api.send('get-stats');
    api.send('get-workspaces');
    setInterval(() => api.send('get-stats'), 6000);
    runHealthCheck();
    setInterval(runHealthCheck, 45000);
    void hydrateTeamPresets();
    initOrchestration();
  }
  bindFeaturedAccordion();
  bindGithubResultsAccordion();
  bindKeyboardShortcuts();
  log('Krevyx Ultra v4 ready', 'success');
  toast('Krevyx Ultra yüklendi · modeller senkronize edildi', 'success', 2800);
}

async function hydrateModelCatalog() {
  if (!api) {
    for (const pid of CLOUD_PROVIDERS) MODEL_LISTS[pid] = [...(MODEL_FALLBACK[pid] || [])];
    return;
  }
  try {
    const c = await api.invoke('get-model-catalog');
    for (const pid of CLOUD_PROVIDERS) {
      if (c?.[pid]?.length) MODEL_LISTS[pid] = c[pid];
    }
  } catch {
    for (const pid of CLOUD_PROVIDERS) MODEL_LISTS[pid] = [...(MODEL_FALLBACK[pid] || [])];
  }
}

async function bootstrapCloudModels() {
  if (!api) return;
  const order = ['anthropic'];
  if (state.settings.openai?.trim()) order.push('openai');
  if (state.settings.gemini?.trim()) order.push('gemini');
  for (const pid of CLOUD_PROVIDERS) {
    if (pid === 'azure' || pid === 'aws-bedrock' || pid === 'lmstudio' || pid === 'custom') continue;
    if (state.settings[pid]?.trim()) order.push(pid);
  }
  for (const prov of order) {
    try {
      const key =
        prov === 'openai'
          ? state.settings.openai
          : prov === 'gemini'
            ? state.settings.gemini
            : state.settings[prov] || '';
      const res = await api.invoke('fetch-provider-models', { provider: prov, apiKey: key });
      if (res.ok && Array.isArray(res.models) && res.models.length) MODEL_LISTS[prov] = res.models;
    } catch {
      /* keep catalog */
    }
  }
}

function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    // V3.1 klavye katmanı (keymap.js) komutlarına devret
    if (window.Krevyx?.keymap) {
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        void window.Krevyx.keymap.execute('composer.focus');
        return;
      }
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void window.Krevyx.keymap.execute('sidebar.tools.toggle');
        return;
      }
      if (mod && e.key === ',') {
        e.preventDefault();
        void window.Krevyx.keymap.execute('settings.open');
        return;
      }
      if (mod && e.key.toLowerCase() === 'd' && e.shiftKey) {
        e.preventDefault();
        void window.Krevyx.keymap.execute('theme.toggle');
        return;
      }
      if (mod && e.key.toLowerCase() === 'm' && e.shiftKey) {
        e.preventDefault();
        void window.Krevyx.keymap.execute('memory.search');
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void window.Krevyx.keymap.execute('composer.send');
        return;
      }
    }
    // Legacy davranışlar (geriye uyumluluk)
    if (mod && (e.key === '`' || e.code === 'Backquote')) {
      e.preventDefault();
      const dock = q('#terminal-dock');
      if (dock?.classList.contains('hidden')) {
        void startEmbeddedTerminal();
      } else {
        dock?.classList.toggle('collapsed');
        try {
          state._fitAddon?.fit();
        } catch {
          /* ignore */
        }
      }
    }
  });
}

/* V3.1 keymap komut tanımları (Plan 1.5) */
if (window.Krevyx?.keymap) {
  window.Krevyx.keymap.on('composer.focus', () => q('#msg-input')?.focus());
  window.Krevyx.keymap.on('sidebar.tools.toggle', () => q('#tools-panel')?.classList.toggle('hidden'));
  window.Krevyx.keymap.on('settings.open', () => openModal('settings-modal'));
  window.Krevyx.keymap.on('theme.toggle', () => window.Krevyx?.theme?.toggle());
  window.Krevyx.keymap.on('composer.send', () => q('#btn-send')?.click());
  window.Krevyx.keymap.on('onboarding.replay', () => window.Krevyx?.onboarding?.replay());
  window.Krevyx.keymap.on('memory.search', () => {
    // Bellek paneli varsa sekmeyi aç ve arama kutusuna odaklan
    const memTab = document.querySelector('[data-ttab="memory"]');
    if (memTab) void memTab.click();
    const memInput = q('#memory-search-input') || q('#mem-search');
    memInput?.focus();
  });
}

async function loadPersistedSession() {
  if (!api) {
    return;
  }
  try {
    const disk = await api.invoke('persist-load');
    if (disk && typeof disk === 'object') {
      if (Array.isArray(disk.agents) && disk.agents.length) state.agents = disk.agents;
      if (disk.settings && typeof disk.settings === 'object') {
        for (const k of ['openai', 'anthropic', 'gemini']) {
          if (typeof disk.settings[k] === 'string') state.settings[k] = disk.settings[k];
        }
        if (typeof disk.settings.ollamaHost === 'string') {
          try {
            const v = await api.invoke('normalize-ollama-host', disk.settings.ollamaHost);
            if (v?.ok && v.host) state.settings.ollamaHost = v.host;
          } catch {
            /* keep default */
          }
        }
        if (Array.isArray(disk.settings.ollamaMachines) && disk.settings.ollamaMachines.length) {
          state.settings.ollamaMachines = disk.settings.ollamaMachines;
        }
        if (typeof disk.settings.defaultOllamaMachineId === 'string') {
          state.settings.defaultOllamaMachineId = disk.settings.defaultOllamaMachineId;
        }
      }
      ensureOllamaMachines();
      q('#openai-key').value = state.settings.openai || '';
      q('#anthropic-key').value = state.settings.anthropic || '';
      q('#gemini-key').value = state.settings.gemini || '';
  q('#openrouter-key').value = state.settings['openrouter'] || '';
  q('#xai-key').value = state.settings['xai'] || '';
  q('#mistral-key').value = state.settings['mistral'] || '';
  q('#deepseek-key').value = state.settings['deepseek'] || '';
  q('#cohere-key').value = state.settings['cohere'] || '';
  q('#perplexity-key').value = state.settings['perplexity'] || '';
  q('#together-key').value = state.settings['together'] || '';
  q('#groq-key').value = state.settings['groq'] || '';
  q('#cerebras-key').value = state.settings['cerebras'] || '';
  q('#fireworks-key').value = state.settings['fireworks'] || '';
  q('#replicate-key').value = state.settings['replicate'] || '';
  q('#azure-endpoint').value = state.settings.azureEndpoint || '';
  q('#azure-key').value = state.settings.azureApiKey || '';
  q('#bedrock-region').value = state.settings.bedrockRegion || '';
  q('#bedrock-access-key').value = state.settings.bedrockAccessKeyId || '';
  q('#bedrock-secret-key').value = state.settings.bedrockSecretAccessKey || '';
  q('#lmstudio-endpoint').value = state.settings.lmstudioEndpoint || '';
  q('#custom-endpoint').value = state.settings.customEndpoint || '';
  q('#custom-key').value = state.settings.customApiKey || '';
  q('#manus-key').value = state.settings['manus'] || '';
      if (Array.isArray(disk.history) && disk.history.length) {
        state.history = disk.history;
        refreshChatFromHistory();
      }
      renderAgentList();
      updateApiDots();
      toast('Session restored from disk', 'info', 3000);
    }
  } catch (err) {
    log(`Persist load: ${err.message}`, 'warn');
  }
}

function schedulePersist() {
  if (!api) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      await api.invoke('persist-save', {
        agents: state.agents,
        settings: state.settings,
        history: state.history,
        savedAt: new Date().toISOString(),
      });
    } catch (e) {
      log(`Persist save failed: ${e.message}`, 'warn');
    }
  }, 500);
}

/* V3.9/v3.23: diğer modüllere (prompt builder vb.) erken erişim.
 * md/save/clearChat chat.js'te tanımlı ve core.js daha önce yüklendiği
 * için doğrudan atama ReferenceError üretir; tembel (getter) bağlama ile
 * ilk erişimde chat.js'ten çözülür. */
window.Krevyx = window.Krevyx || {};
window.Krevyx.state = state;
Object.defineProperty(window.Krevyx, 'md', {
  get() {
    return typeof md !== 'undefined' ? md : null;
  },
  configurable: true,
  enumerable: true,
});
Object.defineProperty(window.Krevyx, 'save', {
  get() {
    return typeof save !== 'undefined' ? save : null;
  },
  configurable: true,
  enumerable: true,
});
Object.defineProperty(window.Krevyx, 'clearChat', {
  get() {
    return typeof clearChat !== 'undefined' ? clearChat : null;
  },
  configurable: true,
  enumerable: true,
});
/* api app.js'te tanımlı (core.js'ten sonra yüklenir) — tembel bağlama */
Object.defineProperty(window, 'api', {
  get() {
    return typeof api !== 'undefined' ? api : null;
  },
  configurable: true,
  enumerable: true,
});

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s?.agents?.length) state.agents = s.agents;
    if (s?.settings && typeof s.settings === 'object') {
      for (const k of ['openai', 'anthropic', 'gemini', 'ollamaHost', 'openrouter', 'xai', 'mistral', 'deepseek', 'cohere', 'perplexity', 'together', 'groq', 'cerebras', 'fireworks', 'replicate', 'azure', 'aws-bedrock', 'lmstudio', 'custom', 'manus']) {
        if (typeof s.settings[k] === 'string') state.settings[k] = s.settings[k];
      }
      if (Array.isArray(s.settings.ollamaMachines) && s.settings.ollamaMachines.length) {
        state.settings.ollamaMachines = s.settings.ollamaMachines;
      }
      if (typeof s.settings.defaultOllamaMachineId === 'string') {
        state.settings.defaultOllamaMachineId = s.settings.defaultOllamaMachineId;
      }
      if (s.settings.modelParams && typeof s.settings.modelParams === 'object') {
        for (const k of ['temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty']) {
          if (Number.isFinite(Number(s.settings.modelParams[k]))) state.settings.modelParams[k] = Number(s.settings.modelParams[k]);
        }
      }
      if (typeof s.settings.behaviorProfile === 'string' && ['precise', 'balanced', 'creative', 'fast'].includes(s.settings.behaviorProfile)) {
        state.settings.behaviorProfile = s.settings.behaviorProfile;
      }
    }
  } catch {
    /* ignore */
  }
  if (!state.agents.length) {
    state.agents = [
      {
        id: 'master',
        name: 'Master AI',
        model: 'llama3.2:1b',
        provider: 'ollama',
        prompt: 'You are a helpful AI assistant.',
        role: 'lead',
        active: true,
      },
    ];
  }
  q('#openai-key').value = state.settings.openai || '';
  q('#anthropic-key').value = state.settings.anthropic || '';
  q('#gemini-key').value = state.settings.gemini || '';
  ensureOllamaMachines();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ agents: state.agents, settings: state.settings }));
  } catch {
    /* ignore */
  }
  schedulePersist();
}

function buildApiModelRows() {
  const rowBindings = [['openai-model-rows','openai'],['anthropic-model-rows','anthropic'],['gemini-model-rows','gemini']].concat(CLOUD_PROVIDERS.filter((x)=>!['openai','anthropic','gemini'].includes(x)).map((pid)=>[pid+'-model-rows', pid]));
  rowBindings.forEach(([id, prov]) => {
    const host = q('#' + id);
    if (!host) return;
    host.innerHTML = '';
    const models = MODEL_LISTS[prov] || [];
    models.forEach((model) => {
      const el = document.createElement('div');
      el.className = 'api-model-row';
      el.dataset.model = model;
      el.dataset.provider = prov;
      el.innerHTML = `${esc(model)} <span class="model-tag">◆</span>`;
      el.addEventListener('click', () => {
        populateModelSelect(prov);
        setTimeout(() => {
          q('#model-select').value = model;
          state.currentModel = model;
          updateModelLabel();
        }, 30);
        qa('.api-model-row').forEach((r) => r.classList.remove('selected'));
        el.classList.add('selected');
        log(`Model selected: ${prov}/${model}`, 'info');
      });
      host.appendChild(el);
    });
  });
}

function renderAgentList() {
  const list = q('#agent-list');
  list.innerHTML = '';
  state.agents.forEach((a) => {
    const d = document.createElement('div');
    d.className = 'agent-card' + (a.active ? ' active' : '');
    const machHint =
      a.provider === 'ollama' && a.ollamaMachineId
        ? ` · ${esc(state.settings.ollamaMachines.find((m) => m.id === a.ollamaMachineId)?.label || a.ollamaMachineId)}`
        : '';
    d.innerHTML = `<div class="a-dot"></div><div class="a-info"><div class="a-name">${esc(a.name)}${a.role === 'lead' ? '<span class="lead-tag">LEAD</span>' : ''}</div><div class="a-model">${esc(a.model)}${machHint}</div></div><button class="del-x" data-id="${a.id}">✕</button>`;
    d.querySelector('.del-x').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget?.getAttribute('data-id');
      if (state.agents.length > 1 && id) {
        state.agents = state.agents.filter((x) => x.id !== id);
        save();
        renderAgentList();
      }
    });
    d.addEventListener('click', () => {
      a.active = !a.active;
      save();
      renderAgentList();
    });
    list.appendChild(d);
  });
  renderAgentStrip();
}

function renderAgentStrip() {
  const host = q('#agent-strip-list');
  if (!host) return;
  host.innerHTML = '';
  state.agents.forEach((a) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'strip-card' + (a.active ? ' on' : '');
    const prov = (a.provider || 'ollama').toUpperCase();
    card.innerHTML = `<span class="strip-dot"></span><span class="strip-name">${esc(a.name)}</span><span class="strip-meta">${prov} · ${esc(a.model)}</span>`;
    card.addEventListener('click', () => {
      a.active = !a.active;
      save();
      renderAgentList();
    });
    host.appendChild(card);
  });
}

async function runProjectOnboarding(rootDir) {
  if (!api || !rootDir) return;
  try {
    const scan = await api.invoke('scan-project', rootDir);
    if (!scan.ok || !scan.markdown) {
      if (scan.error) log(`scan-project: ${scan.error}`, 'warn');
      return;
    }
    const w = await api.invoke('write-project-doc', {
      rootPath: rootDir,
      filename: 'INITIAL.md',
      content: scan.markdown,
    });
    if (w.ok) toast('INITIAL.md oluşturuldu (proje kökü)', 'success', 5500);
    else if (w.error) toast(w.error, 'error', 5000);
  } catch (e) {
    log(`onboarding: ${e.message}`, 'warn');
  }
}

function pickModelForHint(hint) {
  const list = MODEL_LISTS.ollama || [];
  if (!list.length) return 'llama3.2:1b';
  const n = list.length;
  if (hint === 'small') return list[Math.min(2, n - 1)] || list[0];
  if (hint === 'large') return list[Math.max(0, n - 1)] || list[0];
  return list[Math.floor(n / 2)] || list[0];
}

async function hydrateTeamPresets() {
  const sel = q('#team-preset-select');
  if (!sel || !api) return;
  try {
    const r = await api.invoke('get-team-presets');
    if (!r?.ok) return;
    sel.innerHTML = '<option value="">— Ekip seçin —</option>';
    (r.data.presets || []).forEach((p) => {
      sel.add(new Option(p.label, p.id));
    });
  } catch {
    /* ignore */
  }
}

function applyTeamPreset(presetId) {
  if (!presetId || !api) return;
  void (async () => {
    const r = await api.invoke('get-team-presets');
    if (!r?.ok) {
      toast('Ekip listesi yüklenemedi', 'error');
      return;
    }
    const preset = (r.data.presets || []).find((p) => p.id === presetId);
    if (!preset?.agents?.length) return;
    if (
      !window.confirm(
        `Mevcut ${state.agents.length} ajan yerine "${preset.label}" (${preset.agents.length} ajan) yüklensin mi?`,
      )
    ) {
      return;
    }
    ensureOllamaMachines();
    const defMid = state.settings.defaultOllamaMachineId || 'default';
    state.agents = preset.agents.map((a, i) => ({
      id: `team-${Date.now()}-${i}`,
      name: a.name,
      model: pickModelForHint(a.modelHint || 'medium'),
      provider: a.provider || 'ollama',
      prompt: a.prompt || '',
      role: a.role === 'lead' ? 'lead' : 'sub',
      active: true,
      ...((a.provider || 'ollama') === 'ollama' ? { ollamaMachineId: defMid } : {}),
    }));
    save();
    renderAgentList();
    toast(`Ekip yüklendi: ${preset.label}`, 'success');
  })();
}

function renderRamModelAdvisor() {
  const el = q('#ram-model-advisor');
  if (!el) return;
  const total = state._statsRam.total || 0;
  const names = MODEL_LISTS.ollama || [];
  if (!total || !names.length) {
    el.hidden = true;
    return;
  }
  const sizes = state.ollamaModelSizes;
  const scored = names.map((n) => ({ n, sz: sizes[n] || 0 })).filter((x) => x.sz > 0).sort((a, b) => a.sz - b.sz);
  let maxBytes = total * 0.35 * 1024 ** 3;
  if (total <= 8) maxBytes = 4.5e9;
  if (total >= 32) maxBytes = 26e9;
  const picks = scored.filter((x) => x.sz <= maxBytes).slice(0, 5);
  if (!picks.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.innerHTML = `<div class="adv-title">Yerel model önerisi (~${total} GB RAM)</div><p class="adv-hint">Boyutlar Ollama listesinden; tıklayınca çekme başlar.</p><ul class="adv-list">${picks
    .map(
      (p) =>
        `<li><button type="button" class="adv-pull" data-m="${esc(p.n)}">${esc(p.n)}</button> <span class="adv-sz">${(p.sz / 1e9).toFixed(1)} GB</span></li>`,
    )
    .join('')}</ul>`;
  el.querySelectorAll('.adv-pull').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mn = btn.getAttribute('data-m');
      if (!mn || !api) return;
      q('#pull-model-input').value = mn;
      api.send('pull-model', { host: defaultOllamaHost(), model: mn });
      q('#pull-progress').classList.remove('hidden');
      toast(`Çekiliyor: ${mn}`, 'info');
    });
  });
}

function tearDownTerminal() {
  if (state._terminalDataUnsub) {
    state._terminalDataUnsub();
    state._terminalDataUnsub = null;
  }
  if (state._termResizeObs) {
    try {
      state._termResizeObs.disconnect();
    } catch {
      /* ignore */
    }
    state._termResizeObs = null;
  }
  if (state._terminalId && api) {
    try {
      api.send('terminal-close', { id: state._terminalId });
    } catch {
      /* ignore */
    }
  }
  state._terminalId = null;
  if (state._xterm) {
    try {
      state._xterm.dispose();
    } catch {
      /* ignore */
    }
    state._xterm = null;
  }
  state._fitAddon = null;
}

async function startEmbeddedTerminal() {
  if (!api) return;
  if (typeof window.Terminal === 'undefined') {
    toast('xterm yüklenemedi (ağ / CSP)', 'error');
    return;
  }
  tearDownTerminal();
  const cwd = state.currentDir || undefined;
  const res = await api.invoke('terminal-create', { cwd });
  if (!res?.ok || !res.id) {
    toast(res?.error || 'Terminal başlatılamadı', 'error', 7000);
    return;
  }
  const term = new window.Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontFamily: 'JetBrains Mono, ui-monospace, monospace',
    theme: { background: '#0a0e14', foreground: '#e6edf3' },
  });
  const fitMod = window.FitAddon;
  const FitCtor =
    fitMod && (typeof fitMod.FitAddon === 'function' ? fitMod.FitAddon : typeof fitMod === 'function' ? fitMod : null);
  if (FitCtor) {
    state._fitAddon = new FitCtor();
    term.loadAddon(state._fitAddon);
  }
  const mount = q('#terminal-mount');
  mount.innerHTML = '';
  term.open(mount);
  if (state._fitAddon) state._fitAddon.fit();
  term.onData((d) => {
    if (state._terminalId) api.send('terminal-input', { id: state._terminalId, data: d });
  });
  state._terminalDataUnsub = api.on('terminal-data', (payload) => {
    if (!payload || payload.id !== res.id) return;
    if (payload.exit) {
      toast('Terminal oturumu kapandı', 'info');
      return;
    }
    if (payload.data) term.write(payload.data);
  });
  state._terminalId = res.id;
  state._xterm = term;
  const dock = q('#terminal-dock');
  if (dock) dock.classList.remove('hidden', 'collapsed');
  const ro = new ResizeObserver(() => {
    try {
      state._fitAddon?.fit();
      if (state._terminalId && term.cols && term.rows) {
        api.send('terminal-resize', { id: state._terminalId, cols: term.cols, rows: term.rows });
      }
    } catch {
      /* ignore */
    }
  });
  ro.observe(mount);
  state._termResizeObs = ro;
  toast(`Terminal: ${res.cwd || ''}`, 'success', 3000);
}

