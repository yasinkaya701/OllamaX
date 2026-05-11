const STORAGE_KEY = 'ollamax_v4_permanent';
const api = typeof window !== 'undefined' && window.ollamaxApi ? window.ollamaxApi : null;

const PROMPT_TEMPLATES = [
  {
    id: 'research',
    icon: '🔬',
    label: 'Research Assistant',
    prompt:
      'You are a principal researcher. For every request: (1) Restate the question and unknowns. (2) Produce a short Plan with numbered steps. (3) List Assumptions and Risks. (4) Deliver findings with headings; prefer primary sources and flag speculation. (5) If data is missing, ask up to 3 precise questions. Respect file/terminal boundaries given by the app.',
  },
  {
    id: 'coding',
    icon: '💻',
    label: 'Coding Expert',
    prompt:
      'You are a staff engineer. Default output: Plan → Design → Code (minimal repro) → Tests/verification steps → Rollout notes. Name trade-offs and security implications. Use small, reviewable diffs. If repo context is unclear, ask for file paths or constraints before coding.',
  },
  {
    id: 'writing',
    icon: '✍️',
    label: 'Writing Assistant',
    prompt:
      'You are an editorial lead. Clarify audience and goal if missing. Produce an outline, then polished prose with clear headings. Keep tone adaptable; flag legal/medical limits.',
  },
  {
    id: 'data',
    icon: '📊',
    label: 'Data Analyst',
    prompt:
      'You are a senior data analyst. Inspect data definitions, quality, and bias. Suggest SQL/Python with comments, charts that fit the question, and decision-ready metrics. Note caveats.',
  },
  {
    id: 'devops',
    icon: '🚀',
    label: 'DevOps Engineer',
    prompt:
      'You are a principal DevOps engineer. Prefer declarative infra, least privilege, and observable systems. Include rollback and secret-handling notes. Ask for cloud/target OS if needed.',
  },
  {
    id: 'tutor',
    icon: '🎓',
    label: 'Learning Tutor',
    prompt:
      "You are a patient tutor. Use step-by-step reasoning, quick checks for understanding, and analogies. Adjust difficulty to the learner's answers.",
  },
  {
    id: 'creative',
    icon: '🎨',
    label: 'Creative Thinker',
    prompt:
      'You are a creative director. Diverge with options, converge with a recommended path and rationale. Note feasibility and brand constraints when relevant.',
  },
  {
    id: 'review',
    icon: '🔍',
    label: 'Code Reviewer',
    prompt:
      'You are a strict but kind reviewer. Structure: Summary → Blockers → Nits → Test gaps → Security/perf notes. Reference patterns, not people.',
  },
  {
    id: 'lead',
    icon: '⭐',
    label: 'Orchestrator',
    prompt:
      'You are the Lead Agent. Always respond with: (A) Plan — 3–7 bullets. (B) Delegation — use //CALL:AgentName task for sequential work, or //CALL_PARALLEL:AgentName task for tasks that may run independently in the same turn. Use exact agent display names. (C) Synthesis — after sub-agents finish, integrate results, resolve conflicts, and give final recommendations. If requirements are ambiguous, ask concise questions before delegating.',
  },
];

const FEATURED_REPOS = [
  { q: 'karpathy/nanoGPT', label: 'nanoGPT', icon: '🧠', desc: 'Minimal GPT training from scratch' },
  { q: 'ollama/ollama', label: 'Ollama', icon: '🦙', desc: 'Run LLMs locally' },
  { q: 'ggerganov/llama.cpp', label: 'llama.cpp', icon: '⚡', desc: 'LLM inference in C/C++' },
  { q: 'langchain-ai/langchain', label: 'LangChain', icon: '🔗', desc: 'LLM application framework' },
  { q: 'openai/whisper', label: 'Whisper', icon: '🎤', desc: 'Speech recognition by OpenAI' },
  { q: 'huggingface/transformers', label: 'Transformers', icon: '🤗', desc: 'State-of-the-art ML models' },
  { q: 'AUTOMATIC1111 stable-diffusion', label: 'Stable Diffusion', icon: '🎨', desc: 'Image generation AI' },
  { q: 'microsoft autogen', label: 'AutoGen', icon: '🤖', desc: 'Multi-agent conversation framework' },
  { q: 'openai/openai-cookbook', label: 'OpenAI Cookbook', icon: '📖', desc: 'OpenAI API examples & guides' },
  { q: 'comfyanonymous ComfyUI', label: 'ComfyUI', icon: '🎛️', desc: 'Node-based Stable Diffusion UI' },
  { q: 'continuedev/continue', label: 'Continue', icon: '🔧', desc: 'Open-source AI code assistant' },
  { q: 'lobehub/lobe-chat', label: 'LobeChat', icon: '💬', desc: 'Modern ChatGPT/Claude UI' },
];

const MODEL_LISTS = { ollama: [], openai: [], anthropic: [], gemini: [] };

const MODEL_FALLBACK = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o3-mini', 'o4-mini'],
  anthropic: ['claude-3-5-sonnet-20241022', 'claude-sonnet-4-20250514'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
};

const state = {
  agents: [],
  history: [],
  settings: {
    openai: '',
    anthropic: '',
    gemini: '',
    ollamaHost: 'localhost:11434',
    ollamaMachines: [],
    defaultOllamaMachineId: 'default',
  },
  currentProvider: 'ollama',
  currentModel: '',
  currentDir: '',
  processing: false,
  logCount: 0,
  _delegating: false,
  _delegateQueue: [],
  _activeStreams: Object.create(null),
  _streamListenersBound: false,
  _statsRam: { total: 0, free: 0 },
  ollamaModelSizes: {},
  _terminalId: null,
  _terminalDataUnsub: null,
  _xterm: null,
  _fitAddon: null,
  _termResizeObs: null,
};

let persistTimer = null;

const q = (s) => document.querySelector(s);
const qa = (s) => [...document.querySelectorAll(s)];

function ensureOllamaMachines() {
  if (!Array.isArray(state.settings.ollamaMachines) || state.settings.ollamaMachines.length === 0) {
    state.settings.ollamaMachines = [
      { id: 'default', label: 'Bu bilgisayar', host: state.settings.ollamaHost || 'localhost:11434' },
    ];
  }
  if (!state.settings.defaultOllamaMachineId) state.settings.defaultOllamaMachineId = 'default';
  const def = state.settings.ollamaMachines.find((m) => m.id === state.settings.defaultOllamaMachineId);
  if (def?.host) state.settings.ollamaHost = def.host;
}

function syncOllamaHostFromDefaultMachine() {
  ensureOllamaMachines();
  state.settings.ollamaHost = hostForOllamaMachine(state.settings.defaultOllamaMachineId);
}

function hostForOllamaMachine(machineId) {
  const mid = machineId || state.settings.defaultOllamaMachineId || 'default';
  const m = state.settings.ollamaMachines.find((x) => x.id === mid);
  return m?.host || state.settings.ollamaHost || 'localhost:11434';
}

function defaultOllamaHost() {
  ensureOllamaMachines();
  return hostForOllamaMachine(state.settings.defaultOllamaMachineId);
}

function resolveOllamaHostForAgent(agent) {
  const prov = agent.provider || 'ollama';
  if (prov !== 'ollama') return defaultOllamaHost();
  return hostForOllamaMachine(agent.ollamaMachineId);
}

function renderOllamaMachineSelects() {
  const sel = q('#agent-ollama-machine');
  if (!sel) return;
  sel.innerHTML = '';
  ensureOllamaMachines();
  state.settings.ollamaMachines.forEach((m) => {
    sel.add(new Option(`${m.label} (${m.host})`, m.id));
  });
  const def = state.settings.defaultOllamaMachineId || 'default';
  sel.value = def;
}

function renderSettingsMachinesList() {
  const host = q('#ollama-machines-list');
  if (!host) return;
  ensureOllamaMachines();
  host.innerHTML = '';
  state.settings.ollamaMachines.forEach((m) => {
    const row = document.createElement('div');
    row.className = 'machine-row';
    row.dataset.id = m.id;
    const isDef = m.id === state.settings.defaultOllamaMachineId;
    row.innerHTML = `
      <label class="machine-def"><input type="radio" name="ollama-default-machine" value="${esc(m.id)}" ${isDef ? 'checked' : ''}/> Varsayılan</label>
      <input type="text" class="text-input machine-label" placeholder="Etiket" value="${esc(m.label)}" data-k="label"/>
      <input type="text" class="text-input machine-host" placeholder="host:port" value="${esc(m.host)}" data-k="host"/>
      <button type="button" class="small-btn machine-remove" ${state.settings.ollamaMachines.length < 2 ? 'disabled' : ''}>Sil</button>
    `;
    row.querySelector('.machine-remove').addEventListener('click', () => {
      if (state.settings.ollamaMachines.length < 2) return;
      state.settings.ollamaMachines = state.settings.ollamaMachines.filter((x) => x.id !== m.id);
      if (state.settings.defaultOllamaMachineId === m.id) {
        state.settings.defaultOllamaMachineId = state.settings.ollamaMachines[0].id;
      }
      renderSettingsMachinesList();
    });
    row.querySelectorAll('input[data-k]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const mm = state.settings.ollamaMachines.find((x) => x.id === m.id);
        if (mm) mm[inp.dataset.k] = inp.value.trim();
      });
    });
    row.querySelector('input[name="ollama-default-machine"]').addEventListener('change', (e) => {
      if (e.target.checked) state.settings.defaultOllamaMachineId = m.id;
    });
    host.appendChild(row);
  });
}
const on = (id, ev, fn) => {
  const el = q('#' + id);
  if (el) el.addEventListener(ev, fn);
};

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
    api.send('get-stats');
    api.send('get-workspaces');
    setInterval(() => api.send('get-stats'), 6000);
    runHealthCheck();
    setInterval(runHealthCheck, 45000);
    void hydrateTeamPresets();
  }
  bindFeaturedAccordion();
  bindGithubResultsAccordion();
  bindKeyboardShortcuts();
  log('OllamaX Ultra v4 ready', 'success');
  toast('OllamaX Ultra yüklendi · modeller senkronize edildi', 'success', 2800);
}

async function hydrateModelCatalog() {
  if (!api) {
    MODEL_LISTS.openai = [...MODEL_FALLBACK.openai];
    MODEL_LISTS.anthropic = [...MODEL_FALLBACK.anthropic];
    MODEL_LISTS.gemini = [...MODEL_FALLBACK.gemini];
    return;
  }
  try {
    const c = await api.invoke('get-model-catalog');
    if (c?.openai?.length) MODEL_LISTS.openai = c.openai;
    if (c?.anthropic?.length) MODEL_LISTS.anthropic = c.anthropic;
    if (c?.gemini?.length) MODEL_LISTS.gemini = c.gemini;
  } catch {
    MODEL_LISTS.openai = [...MODEL_FALLBACK.openai];
    MODEL_LISTS.anthropic = [...MODEL_FALLBACK.anthropic];
    MODEL_LISTS.gemini = [...MODEL_FALLBACK.gemini];
  }
}

async function bootstrapCloudModels() {
  if (!api) return;
  const order = ['anthropic'];
  if (state.settings.openai?.trim()) order.push('openai');
  if (state.settings.gemini?.trim()) order.push('gemini');
  for (const prov of order) {
    try {
      const key =
        prov === 'openai'
          ? state.settings.openai
          : prov === 'gemini'
            ? state.settings.gemini
            : state.settings.anthropic || '';
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
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      q('#msg-input')?.focus();
    }
    if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      q('#tools-panel')?.classList.toggle('hidden');
    }
    if (mod && e.key === ',') {
      e.preventDefault();
      openModal('settings-modal');
    }
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

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s?.agents?.length) state.agents = s.agents;
    if (s?.settings && typeof s.settings === 'object') {
      for (const k of ['openai', 'anthropic', 'gemini', 'ollamaHost']) {
        if (typeof s.settings[k] === 'string') state.settings[k] = s.settings[k];
      }
      if (Array.isArray(s.settings.ollamaMachines) && s.settings.ollamaMachines.length) {
        state.settings.ollamaMachines = s.settings.ollamaMachines;
      }
      if (typeof s.settings.defaultOllamaMachineId === 'string') {
        state.settings.defaultOllamaMachineId = s.settings.defaultOllamaMachineId;
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
  [['openai-model-rows', 'openai'], ['anthropic-model-rows', 'anthropic'], ['gemini-model-rows', 'gemini']].forEach(([id, prov]) => {
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

function bindFeaturedAccordion() {
  const det = q('#acc-featured');
  if (!det) return;
  try {
    if (localStorage.getItem('ollamax_acc_featured') === '1') det.setAttribute('open', '');
    if (localStorage.getItem('ollamax_acc_featured') === '0') det.removeAttribute('open');
  } catch {
    /* ignore */
  }
  det.addEventListener('toggle', () => {
    try {
      localStorage.setItem('ollamax_acc_featured', det.open ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
}

function bindGithubResultsAccordion() {
  const det = q('#acc-github-results');
  if (!det) return;
  try {
    if (localStorage.getItem('ollamax_acc_github') === '0') det.removeAttribute('open');
    if (localStorage.getItem('ollamax_acc_github') === '1') det.setAttribute('open', '');
  } catch {
    /* ignore */
  }
  det.addEventListener('toggle', () => {
    try {
      localStorage.setItem('ollamax_acc_github', det.open ? '1' : '0');
    } catch {
      /* ignore */
    }
  });
}

function renderTemplates() {
  const list = q('#template-list');
  list.innerHTML = '';
  PROMPT_TEMPLATES.forEach((t) => {
    const d = document.createElement('div');
    d.className = 'tmpl-item';
    d.innerHTML = `<span class="tmpl-icon">${t.icon}</span><span class="tmpl-label">${t.label}</span>`;
    d.addEventListener('click', () => {
      q('#agent-prompt').value = t.prompt;
      openModal('agent-modal');
    });
    list.appendChild(d);
  });
  const pills = q('#prompt-pills');
  pills.innerHTML = '';
  PROMPT_TEMPLATES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'tmpl-pill';
    b.textContent = `${t.icon} ${t.label}`;
    b.addEventListener('click', () => {
      q('#agent-prompt').value = t.prompt;
    });
    pills.appendChild(b);
  });
}

function renderFeaturedRepos() {
  const el = q('#repo-chips');
  el.innerHTML = '';
  FEATURED_REPOS.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'repo-chip';
    b.innerHTML = `<span class="chip-icon">${r.icon}</span><div><div class="chip-name">${r.label}</div><div class="chip-desc">${r.desc}</div></div>`;
    b.addEventListener('click', () => {
      q('#github-search-input').value = r.q;
      showToolsTab('github');
      if (!q('#tools-panel').classList.contains('hidden')) runGithubSearch();
      else {
        q('#tools-panel').classList.remove('hidden');
        runGithubSearch();
      }
    });
    el.appendChild(b);
  });
}

function populateModelSelect(provider) {
  state.currentProvider = provider;
  const sel = q('#model-select');
  sel.innerHTML = '';
  const models = MODEL_LISTS[provider] || [];
  if (!models.length) sel.innerHTML = '<option>No models loaded</option>';
  else models.forEach((m) => sel.appendChild(new Option(m, m)));
  if (models.length) {
    sel.selectedIndex = 0;
    state.currentModel = models[0];
  }
  updateModelLabel();
  qa('.prov-btn').forEach((b) => b.classList.toggle('active', b.dataset.provider === provider));
}

function updateModelLabel() {
  const m = q('#model-select').value;
  const lbl = q('#current-model-label');
  if (lbl) lbl.textContent = m ? `${state.currentProvider}/${m}` : '—';
}

async function syncCloudModels() {
  const p = state.currentProvider;
  if (p === 'ollama') {
    if (api) api.send('get-models', defaultOllamaHost());
    toast('Ollama model listesi yenilendi', 'info');
    return;
  }
  if (!api) return;
  let key = '';
  if (p === 'openai') key = state.settings.openai;
  if (p === 'gemini') key = state.settings.gemini;
  if (p === 'anthropic') key = state.settings.anthropic || '';
  if ((p === 'openai' || p === 'gemini') && !key.trim()) {
    toast('Önce Araçlar → API anahtarını kaydedin', 'warn');
    return;
  }
  toast(`${p} modelleri çekiliyor…`, 'info', 2000);
  const res = await api.invoke('fetch-provider-models', { provider: p, apiKey: key });
  if (!res.ok && res.error) {
    toast(res.error, 'error', 6000);
    showErrorBanner(res.error);
    return;
  }
  hideErrorBanner();
  const models = res.models || [];
  if (models.length) {
    MODEL_LISTS[p] = models;
    buildApiModelRows();
    populateModelSelect(p);
    toast(`${p}: ${models.length} model`, 'success');
  } else toast('Model dönmedi', 'warn');
}

function exportChatJson() {
  const payload = JSON.stringify({ exportedAt: new Date().toISOString(), history: state.history, agents: state.agents }, null, 2);
  if (api) {
    api
      .invoke('export-to-path', { defaultName: 'ollamax-chat.json', content: payload })
      .then((r) => {
        if (r.ok) toast(`Saved ${r.path}`, 'success');
        else if (!r.canceled) toast(r.error || 'Export failed', 'error');
      });
  } else {
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ollamax-chat.json';
    a.click();
    toast('Download started', 'info');
  }
}

function exportChatMarkdown() {
  let md = `# OllamaX Ultra export\n\n_Generated: ${new Date().toISOString()}_\n\n`;
  state.history.forEach((h) => {
    md += `## ${h.role === 'user' ? 'User' : 'Assistant'}\n\n${h.content}\n\n---\n\n`;
  });
  if (api) {
    api.invoke('export-to-path', { defaultName: 'ollamax-chat.md', content: md }).then((r) => {
      if (r.ok) toast(`Saved ${r.path}`, 'success');
      else if (!r.canceled) toast(r.error || 'Export failed', 'error');
    });
  } else {
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ollamax-chat.md';
    a.click();
  }
}

function bindGlobalStreamListeners() {
  if (!api || state._streamListenersBound) return;
  state._streamListenersBound = true;
  api.on('chat-chunk', (d) => {
    const h = state._activeStreams[d.agentId];
    if (h && h.onChunk) h.onChunk(d);
  });
  api.on('chat-done', (d) => {
    const h = state._activeStreams[d.agentId];
    if (h && h.onDone) h.onDone(d);
  });
}

function bindAll() {
  on('btn-hide-sidebar', 'click', () => {
    q('#sidebar').classList.add('collapsed');
    q('#btn-show-sidebar').classList.remove('hidden');
  });
  on('btn-show-sidebar', 'click', () => {
    q('#sidebar').classList.remove('collapsed');
    q('#btn-show-sidebar').classList.add('hidden');
  });

  qa('.prov-btn').forEach((b) =>
    b.addEventListener('click', () => {
      populateModelSelect(b.dataset.provider);
      if (b.dataset.provider === 'ollama' && api) api.send('get-models', defaultOllamaHost());
    }),
  );
  on('model-select', 'change', () => {
    state.currentModel = q('#model-select').value;
    updateModelLabel();
  });

  on('btn-sync-cloud-models', 'click', () => syncCloudModels());
  on('btn-export-json', 'click', () => exportChatJson());
  on('btn-export-md', 'click', () => exportChatMarkdown());

  on('btn-toggle-tools', 'click', () => {
    const panel = q('#tools-panel');
    const nowHidden = panel.classList.toggle('hidden');
    const btn = q('#btn-toggle-tools');
    if (btn) btn.setAttribute('aria-expanded', String(!nowHidden));
  });
  on('btn-health-refresh', 'click', () => runHealthCheck());
  on('btn-open-userdata', 'click', async () => {
    if (!api) return;
    try {
      const h = await api.invoke('app-health', { ollamaHost: defaultOllamaHost() });
      if (h.userData) await api.invoke('open-path', h.userData);
    } catch (e) {
      toast('Klasör açılamadı', 'error');
    }
  });
  qa('.ttab').forEach((b) => b.addEventListener('click', () => showToolsTab(b.dataset.ttab)));

  on('btn-send', 'click', sendMessage);
  on('btn-clear-chat', 'click', clearChat);
  q('#msg-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  q('#msg-input').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
    q('#char-count').textContent = e.target.value.length;
  });

  on('btn-add-agent', 'click', () => {
    populateAgentModelSelect('ollama');
    renderOllamaMachineSelects();
    const wrap = q('#agent-ollama-machine-wrap');
    if (wrap) wrap.classList.remove('hidden');
    openModal('agent-modal');
  });
  on('btn-save-agent', 'click', saveAgent);
  on('agent-provider', 'change', (e) => {
    populateAgentModelSelect(e.target.value);
    renderOllamaMachineSelects();
    const wrap = q('#agent-ollama-machine-wrap');
    if (wrap) wrap.classList.toggle('hidden', e.target.value !== 'ollama');
  });

  on('btn-settings', 'click', () => {
    renderSettingsMachinesList();
    openModal('settings-modal');
  });
  on('btn-add-ollama-machine', 'click', () => {
    ensureOllamaMachines();
    state.settings.ollamaMachines.push({
      id: `m-${Date.now()}`,
      label: 'Sunucu',
      host: '192.168.1.10:11434',
    });
    renderSettingsMachinesList();
  });
  on('btn-save-settings', 'click', () => void saveSettings());
  on('btn-save-keys', 'click', () => void saveApiKeys());

  qa('.modal-bg,.modal-x,.modal-x-btn').forEach((el) =>
    el.addEventListener('click', () => {
      el.closest('.modal')?.classList.add('hidden');
    }),
  );

  on('btn-github-search', 'click', runGithubSearch);
  q('#github-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runGithubSearch();
  });

  on('btn-open-folder', 'click', () => api && api.send('open-folder-dialog'));
  on('btn-attach', 'click', () => api && api.send('open-folder-dialog'));
  on('btn-go-parent', 'click', () => {
    if (state.currentDir && api) {
      const sep = state.currentDir.includes('\\') ? '\\' : '/';
      const parts = state.currentDir.split(sep).filter(Boolean);
      parts.pop();
      const parent = (sep === '/' ? '/' : '') + parts.join(sep) || sep;
      api.send('list-dir', parent);
    }
  });
  on('btn-close-preview', 'click', () => q('#file-preview').classList.add('hidden'));

  on('btn-pull-model', 'click', () => {
    const m = q('#pull-model-input').value.trim();
    if (m && api) {
      api.send('pull-model', { host: defaultOllamaHost(), model: m });
      q('#pull-progress').classList.remove('hidden');
      log(`Pulling ${m}…`, 'info');
    }
  });

  on('console-toggle', 'click', () => q('#system-console').classList.toggle('collapsed'));
  on('btn-refresh-workspace', 'click', () => api && api.send('get-workspaces'));

  on('btn-load-team', 'click', () => {
    const id = q('#team-preset-select')?.value;
    if (!id) {
      toast('Önce bir ekip seçin', 'warn');
      return;
    }
    applyTeamPreset(id);
  });

  on('btn-terminal-open', 'click', () => void startEmbeddedTerminal());
  on('btn-terminal-close', 'click', () => {
    tearDownTerminal();
    const dock = q('#terminal-dock');
    if (dock) dock.classList.add('hidden', 'collapsed');
  });
  on('btn-terminal-collapse', 'click', () => {
    q('#terminal-dock')?.classList.toggle('collapsed');
    try {
      state._fitAddon?.fit();
    } catch {
      /* ignore */
    }
  });

  // GHOST MODE LOGIC
  on('btn-toggle-ghost', 'click', async () => {
    const isActive = document.body.classList.toggle('ghost-active');
    if (api) {
      // Electron üzerinden pencere saydamlığını ayarla
      await api.invoke('set-window-opacity', isActive ? 0.45 : 1.0);
    }
    toast(isActive ? 'Hayalet Modu: Aktif' : 'Hayalet Modu: Kapalı', 'info');
  });

  // QUEST LOG LOGIC
  on('btn-toggle-quests', 'click', () => {
    q('#quest-log')?.classList.toggle('hidden');
  });
  on('btn-close-quests', 'click', () => {
    q('#quest-log')?.classList.add('hidden');
  });
  on('btn-add-quest', 'click', () => {
    const inp = q('#quest-input');
    const text = inp.value.trim();
    if (!text) return;
    addQuest(text);
    inp.value = '';
  });
  q('#quest-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = e.target.value.trim();
      if (text) {
        addQuest(text);
        e.target.value = '';
      }
    }
  });
}

function addQuest(text) {
  const list = q('#quest-list');
  if (list.querySelector('.empty-note')) list.innerHTML = '';
  
  const id = 'q-' + Date.now();
  const div = document.createElement('div');
  div.className = 'quest-item';
  div.innerHTML = `
    <input type="checkbox" class="qi-check" id="${id}">
    <span class="qi-text">${esc(text)}</span>
    <button class="del-x" style="opacity:1">✕</button>
  `;
  
  div.querySelector('.qi-check').addEventListener('change', (e) => {
    div.querySelector('.qi-text').classList.toggle('done', e.target.checked);
    log(`Quest updated: ${text}`, 'info');
  });
  
  div.querySelector('.del-x').addEventListener('click', () => {
    div.remove();
    if (!list.children.length) list.innerHTML = '<div class="empty-note">No active quests.</div>';
  });
  
  list.appendChild(div);
  log(`New Quest: ${text}`, 'success');
}

function bindIPC() {
  api.on('models-list', (models) => {
    MODEL_LISTS.ollama = models.map((m) => m.name);
    const list = q('#local-models-list');
    list.innerHTML = '';
    if (!models.length) {
      list.innerHTML = '<div class="empty-note">No models. Run: <code>ollama pull llama3.2:1b</code></div>';
      return;
    }
    state.ollamaModelSizes = {};
    models.forEach((m) => {
      if (m?.name) state.ollamaModelSizes[m.name] = typeof m.size === 'number' ? m.size : 0;
      const d = document.createElement('div');
      d.className = 'model-item';
      const sz = m.size ? `${(m.size / 1e9).toFixed(1)} GB` : '';
      d.innerHTML = `<span class="mi-name">${esc(m.name)}</span><span class="mi-size">${sz}</span>`;
      d.addEventListener('click', () => {
        if (state.currentProvider === 'ollama') {
          populateModelSelect('ollama');
          setTimeout(() => {
            q('#model-select').value = m.name;
            state.currentModel = m.name;
            updateModelLabel();
          }, 30);
        }
        log(`Model: ${m.name}`, 'info');
      });
      list.appendChild(d);
    });
    if (state.currentProvider === 'ollama') populateModelSelect('ollama');
    log(`${models.length} local models loaded`, 'success');
    renderRamModelAdvisor();
  });

  api.on('stats', (d) => {
    q('#ram-text').textContent = `${d.used}/${d.total} GB`;
    const bar = q('#ram-bar');
    bar.style.width = `${d.percent}%`;
    bar.style.background = d.percent > 85 ? 'var(--red)' : d.percent > 65 ? 'var(--orange)' : 'var(--green)';
    if (d.cpu) q('#cpu-text').textContent = d.cpu.length > 35 ? `${d.cpu.slice(0, 33)}…` : d.cpu;
    state._statsRam = { total: d.total || 0, free: d.free || 0 };
    renderRamModelAdvisor();
  });

  api.on('github-results', (data) => renderGithubResults(data));
  api.on('exec-output', (d) => log(d.data.trimEnd(), d.type === 'stderr' ? 'warn' : 'info'));

  api.on('git-done', (d) => {
    log(d.success ? `✅ Cloned to: ${d.dir}` : '❌ Clone failed', d.success ? 'success' : 'error');
    if (!d.success) toast('Git clone failed', 'error');
    if (d.success) {
      state.currentDir = d.dir;
      showToolsTab('files');
      q('#tools-panel').classList.remove('hidden');
      api.send('get-workspaces');
      api.send('list-dir', d.dir);
      toast('Workspace opened in Files', 'success');
      void runProjectOnboarding(d.dir);
      setTimeout(() => {
        addUserBubble(`Analyze the project at ${d.dir}`);
        state.history.push({
          role: 'user',
          content: `The project at ${d.dir} has been cloned. Please analyze its structure and tell me how to run or use it.`,
        });
        const lead = state.agents.find((a) => a.role === 'lead') || state.agents[0];
        runAgent(lead);
        save();
      }, 800);
    }
  });

  api.on('dir-contents', ({ path: p, items, error: dirErr }) => {
    state.currentDir = p;
    q('#file-breadcrumb').textContent = p;
    const tree = q('#file-tree');
    tree.innerHTML = '';
    if (dirErr) {
      tree.innerHTML = `<div class="empty-note">${esc(dirErr)}</div>`;
      toast(dirErr, 'error', 5000);
      return;
    }
    if (!items.length) {
      tree.innerHTML = '<div class="empty-note">Klasör boş</div>';
      return;
    }
    items.forEach((it) => {
      const d = document.createElement('div');
      d.className = `file-item${it.isDir ? ' is-dir' : ''}`;
      d.innerHTML = `<span>${it.isDir ? '📁' : '📄'}</span><span class="fi-name">${esc(it.name)}</span>`;
      d.addEventListener('click', () => {
        const fp = `${p.replace(/[/\\]$/, '')}${p.includes('\\') ? '\\' : '/'}${it.name}`;
        it.isDir ? api.send('list-dir', fp) : api.send('read-file', fp);
      });
      tree.appendChild(d);
    });
  });

  api.on('folder-selected', (folder) => {
    void runProjectOnboarding(folder);
    api.send('list-dir', folder);
    showToolsTab('files');
    q('#tools-panel').classList.remove('hidden');
  });

  api.on('file-content', ({ path: p, content }) => {
    q('#preview-filename').textContent = p.split(/[/\\]/).pop();
    q('#preview-content').textContent = content;
    q('#file-preview').classList.remove('hidden');
  });

  api.on('pull-progress', (d) => {
    const bar = q('#pull-bar');
    const status = q('#pull-status');
    if (d.total && d.completed) bar.style.width = `${Math.round((d.completed / d.total) * 100)}%`;
    if (d.status) status.textContent = d.status;
  });

  api.on('pull-done', (d) => {
    q('#pull-progress').classList.add('hidden');
    api.send('get-models', defaultOllamaHost());
    log(`Pull done: ${d.model}`, 'success');
    toast(`Pull finished: ${d.model}`, d.error ? 'error' : 'success');
  });

  api.on('workspaces-list', (items) => {
    const list = q('#workspace-list');
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<div class="empty-note">No projects yet.</div>';
      return;
    }
    items.forEach((name) => {
      const d = document.createElement('div');
      d.className = 'ws-item';
      d.innerHTML = `<span class="ws-icon">📂</span><span class="ws-name">${esc(name)}</span>`;
      d.addEventListener('click', () => {
        const fp = `OllamaX-Projects/${name}`;
        api.send('list-dir', fp);
        showToolsTab('files');
        q('#tools-panel').classList.remove('hidden');
      });
      list.appendChild(d);
    });
  });
}

function runGithubSearch() {
  const v = q('#github-search-input').value.trim();
  if (!v) return;
  q('#github-results-list').innerHTML = '<div class="empty-note">Searching…</div>';
  if (api) {
    api.send('github-search', { query: v });
    return;
  }
  fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(v)}&sort=stars&per_page=10`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
    .then((r) => r.json())
    .then((data) => renderGithubResults(data))
    .catch(() => {
      q('#github-results-list').innerHTML = '<div class="empty-note">Search failed.</div>';
    });
}

function renderGithubResults(data) {
  const list = q('#github-results-list');
  list.innerHTML = '';
  if (!data.items?.length) {
    list.innerHTML = '<div class="empty-note">Sonuç yok.</div>';
    return;
  }
  data.items.forEach((repo) => {
    const cloneUrl = typeof repo.clone_url === 'string' ? repo.clone_url : '';
    const d = document.createElement('div');
    d.className = 'repo-card';
    const nameEl = document.createElement('div');
    nameEl.className = 'rc-name';
    nameEl.textContent = repo.full_name || '';
    const metaEl = document.createElement('div');
    metaEl.className = 'rc-meta';
    metaEl.textContent = `⭐ ${(repo.stargazers_count || 0).toLocaleString()} · ${repo.language || '?'}`;
    const descEl = document.createElement('div');
    descEl.className = 'rc-desc';
    descEl.textContent = (repo.description || '').slice(0, 90);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'clone-btn';
    btn.textContent = '⬇ Klonla';
    btn.addEventListener('click', () => {
      if (!cloneUrl.startsWith('https://')) {
        toast('Geçersiz klon adresi', 'error');
        return;
      }
      if (api) {
        api.send('git-clone', { url: cloneUrl });
        btn.textContent = '⏳ Klonlanıyor…';
        btn.disabled = true;
        log(`git clone ${cloneUrl}`, 'info');
      } else log('Electron IPC not available for cloning.', 'error');
    });
    d.appendChild(nameEl);
    d.appendChild(metaEl);
    d.appendChild(descEl);
    d.appendChild(btn);
    list.appendChild(d);
  });
  log(`${data.items.length} repos found`, 'success');
}

function populateAgentModelSelect(provider) {
  const sel = q('#agent-model-select');
  sel.innerHTML = '';
  const models = provider === 'ollama' ? MODEL_LISTS.ollama : MODEL_LISTS[provider] || [];
  if (!models.length) sel.add(new Option(provider === 'ollama' ? '— No local models (pull one first) —' : '— Sync API models in top bar —', ''));
  else models.forEach((m) => sel.add(new Option(m, m)));
}

function saveAgent() {
  const name = q('#agent-name').value.trim();
  const provider = q('#agent-provider').value;
  const model = q('#agent-model-select').value;
  if (!name || !model) {
    toast('Name and model required', 'warn');
    return;
  }
  const ollamaMachineId =
    provider === 'ollama' ? q('#agent-ollama-machine')?.value || state.settings.defaultOllamaMachineId : undefined;
  state.agents.push({
    id: Date.now().toString(),
    name,
    model,
    provider,
    prompt: q('#agent-prompt').value.trim(),
    role: q('#agent-role').value,
    active: true,
    ...(ollamaMachineId ? { ollamaMachineId } : {}),
  });
  save();
  renderAgentList();
  closeModal('agent-modal');
  q('#agent-name').value = '';
  q('#agent-prompt').value = '';
  q('#agent-provider').value = 'ollama';
  populateAgentModelSelect('ollama');
  log(`Agent added: ${name} (${provider}/${model})`, 'success');
  toast(`Agent ${name} created`, 'success');
}

async function saveApiKeys() {
  state.settings.openai = q('#openai-key').value.trim();
  state.settings.anthropic = q('#anthropic-key').value.trim();
  state.settings.gemini = q('#gemini-key').value.trim();
  save();
  updateApiDots();
  log('API keys saved ✓', 'success');
  toast('API anahtarları kaydedildi · modeller güncelleniyor', 'success');
  await bootstrapCloudModels();
  buildApiModelRows();
  populateModelSelect(state.currentProvider);
}

async function saveSettings() {
  ensureOllamaMachines();
  if (api) {
    for (const m of state.settings.ollamaMachines) {
      const raw = (m.host || '').trim() || 'localhost:11434';
      try {
        const v = await api.invoke('normalize-ollama-host', raw);
        if (!v?.ok || !v.host) {
          toast(`${m.label || m.id}: ${v?.error || 'Geçersiz adres'}`, 'error');
          return;
        }
        m.host = v.host;
      } catch {
        toast('Ollama adresi doğrulanamadı', 'error');
        return;
      }
    }
    const defRadio = q('#ollama-machines-list')?.querySelector('input[name="ollama-default-machine"]:checked');
    if (defRadio?.value) state.settings.defaultOllamaMachineId = defRadio.value;
  }
  syncOllamaHostFromDefaultMachine();
  save();
  closeModal('settings-modal');
  if (api) {
    api.send('get-models', defaultOllamaHost());
    runHealthCheck();
  }
  log('Ayarlar kaydedildi', 'success');
  toast('Ollama makineleri güncellendi', 'info');
}

function updateApiDots() {
  const set = (id, has) => {
    const el = q('#' + id);
    if (el) {
      el.style.background = has ? 'var(--green)' : 'var(--text3)';
      el.title = has ? 'Key saved ✓' : 'No key set';
      el.style.transition = 'background 0.4s';
    }
  };
  set('dot-openai', !!state.settings.openai);
  set('dot-anthropic', !!state.settings.anthropic);
  set('dot-gemini', !!state.settings.gemini);
}

async function sendMessage() {
  const inp = q('#msg-input');
  const text = inp.value.trim();
  if (!text || state.processing) return;
  const active = state.agents.filter((a) => a.active);
  if (!active.length) {
    toast('Select at least one agent', 'warn');
    return;
  }
  inp.value = '';
  inp.style.height = 'auto';
  q('#char-count').textContent = '0';
  q('#chat-area .welcome-screen')?.remove();
  addUserBubble(text);
  state.history.push({ role: 'user', content: text });
  save();
  state.processing = true;
  setStatus('processing');
  await Promise.all(active.map((a) => runAgent(a)));
  state.processing = false;
  setStatus('ready');
}

function runAgent(agent) {
  return new Promise((resolve) => {
    if (!api) {
      addAIBubble('⚠️ Run inside Electron for chat.', 'System', agent);
      resolve();
      return;
    }
    const bubble = addAIBubble('', agent.name, agent);
    let full = '';
    let done = false;

    const prov = agent.provider || state.currentProvider;
    const model = agent.model || q('#model-select').value;

    let sysPrompt = agent.prompt || '';
    if (agent.role === 'lead') {
      const others = state.agents
        .filter((a) => a.id !== agent.id)
        .map((a) => {
          const mach =
            a.provider === 'ollama' && a.ollamaMachineId
              ? ` @${state.settings.ollamaMachines.find((m) => m.id === a.ollamaMachineId)?.label || a.ollamaMachineId}`
              : '';
          return `${a.name} (${a.provider}${mach})`;
        })
        .join(', ');
      sysPrompt += `\n\n[ORCHESTRATION CONTEXT]: Available agents: ${others}. Use //CALL:AgentName task for sequential delegation, or //CALL_PARALLEL:AgentName task for parallel-friendly subtasks. One directive per block; use exact display names.`;
    }

    const msgs = [...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []), ...state.history];
    log(`${agent.name} [${prov}] → ${model}`, 'info');

    if (prov === 'ollama') api.send('chat', { agentId: agent.id, host: resolveOllamaHostForAgent(agent), model, messages: msgs });
    else if (prov === 'openai') api.send('openai-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.openai });
    else if (prov === 'anthropic') api.send('anthropic-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.anthropic });
    else if (prov === 'gemini') api.send('gemini-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.gemini });

    const onChunk = (d) => {
      full += d.content;
      bubble.innerHTML = md(full);
      scrollChat();
    };
    const onDone = () => {
      if (done) return;
      done = true;
      cleanup();
      if (full) state.history.push({ role: 'assistant', content: full, agentName: agent.name, provider: prov });
      save();
      if (agent.role === 'lead') enqueueDelegation(agent, full);
      log(`${agent.name} done (${full.length} chars)`, 'success');
      resolve();
    };
    function cleanup() {
      delete state._activeStreams[agent.id];
    }
    state._activeStreams[agent.id] = { onChunk, onDone };
    setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        toast(`${agent.name}: stream timeout`, 'warn');
        resolve();
      }
    }, 185000);
  });
}

function enqueueDelegation(lead, content) {
  const calls = typeof window.parseDelegateCalls === 'function' ? window.parseDelegateCalls(content) : [];
  if (!calls.length) return;
  calls.forEach((c) =>
    state._delegateQueue.push({ lead, name: c.name, task: c.task, parallel: !!c.parallel }),
  );
  processDelegationQueue();
}

async function runSingleDelegationJob(job) {
  const target = state.agents.find((a) => a.name.toLowerCase() === job.name.toLowerCase());
  if (!target) {
    toast(`"${job.name}" adlı ajan yok`, 'warn');
    return;
  }
  log(`⭐ ${job.lead.name} → ${target.name}${job.parallel ? ' (paralel)' : ''}`, 'info');
  const area = q('#chat-area');
  const tag = el('div', 'delegation-tag');
  tag.innerHTML = `<span>⚡</span> <strong>${esc(target.name)}</strong>${job.parallel ? ' <span class="par-badge">PAR</span>' : ''}`;
  area.appendChild(tag);
  scrollChat();
  state.history.push({ role: 'user', content: `[Delegated from ${job.lead.name}]: ${job.task}` });
  save();
  await runAgent(target);
}

async function processDelegationQueue() {
  if (state._delegating) return;
  state._delegating = true;
  while (state._delegateQueue.length) {
    const peek = state._delegateQueue[0];
    if (peek.parallel) {
      const batch = [];
      while (state._delegateQueue.length && state._delegateQueue[0].parallel) {
        batch.push(state._delegateQueue.shift());
      }
      await Promise.all(batch.map((job) => runSingleDelegationJob(job)));
    } else {
      const job = state._delegateQueue.shift();
      await runSingleDelegationJob(job);
    }
  }
  state._delegating = false;
}

function addUserBubble(text) {
  const area = q('#chat-area');
  const w = el('div', 'msg-wrap msg-user');
  const b = el('div', 'bubble user-bub');
  b.textContent = text;
  w.appendChild(b);
  area.appendChild(w);
  scrollChat();
}

function addAIBubble(text, name, agent) {
  const area = q('#chat-area');
  const w = el('div', 'msg-wrap msg-ai');
  if (name) {
    const l = el('div', 'agent-lbl');
    const prov = agent?.provider || '';
    const provBadge = prov && prov !== 'ollama' ? ` <span class="prov-badge prov-${prov}">${prov.toUpperCase()}</span>` : '';
    l.innerHTML = esc(name) + provBadge;
    w.appendChild(l);
  }
  const b = el('div', 'bubble ai-bub');
  b.innerHTML = text ? md(text) : '<span class="dots">●●●</span>';
  w.appendChild(b);
  area.appendChild(w);
  scrollChat();
  return b;
}

function clearChat() {
  q('#chat-area').innerHTML =
    '<div class="welcome-screen"><img src="../../assets/logo.png" class="welcome-logo" alt="OllamaX"><h1>OllamaX Ultra</h1><p class="welcome-lead">Yerel Ollama ve bulut modelleri</p><p class="welcome-sub">Sağdaki <strong>Araçlar</strong> ile API ve dosyalara erişin.</p><p class="kbd-hint"><kbd>⌘</kbd><kbd>K</kbd> sohbet · <kbd>⌘</kbd><kbd>L</kbd> araçlar <span class="kbd-win">(<kbd>Ctrl</kbd> Windows)</span></p></div>';
  state.history = [];
  save();
  toast('Chat cleared', 'info');
}

function refreshChatFromHistory() {
  const area = q('#chat-area');
  area.innerHTML = '';
  if (!state.history.length) {
    area.innerHTML =
      '<div class="welcome-screen"><img src="../../assets/logo.png" class="welcome-logo" alt="OllamaX"><h1>OllamaX Ultra</h1><p>Professional AI Agent Studio</p></div>';
    return;
  }
  state.history.forEach((h) => {
    if (h.role === 'user') {
      addUserBubble(h.content);
    } else {
      const ag = state.agents.find((a) => a.name === h.agentName) || state.agents[0];
      const bubble = addAIBubble('', h.agentName || 'Assistant', ag);
      bubble.innerHTML = md(h.content || '');
    }
  });
  scrollChat();
}

function md(raw) {
  const blocks = [];
  const PH = (i) => `@@CODEBLOCK_${i}@@`;
  const s0 = String(raw);
  const s = s0.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    let highlighted = esc(code);
    if (typeof hljs !== 'undefined' && hljs.highlight) {
      try {
        const L = (lang || 'plaintext').trim();
        const r = hljs.getLanguage(L) ? hljs.highlight(code, { language: L }) : hljs.highlightAuto(code);
        highlighted = r.value;
      } catch {
        highlighted = esc(code);
      }
    }
    const idx = blocks.length;
    const escapedCode = esc(code).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    blocks.push(
      `<pre class="hljs" style="position:relative"><button class="code-copy-btn" onclick="(function(btn){const t=btn.nextElementSibling?.textContent||'';navigator.clipboard.writeText(t).then(()=>{btn.textContent='✓ Copied';setTimeout(()=>{btn.textContent='Copy'},1800)}).catch(()=>{});})(this)">Copy</button><code class="language-${esc((lang || 'plaintext').trim())}">${highlighted}</code></pre>`
    );
    return PH(idx);
  });
  let s2 = esc(s);
  s2 = s2
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^###\s(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s(.+)$/gm, '<h1>$1</h1>')
    .replace(/^\|(.+)\|$/gm, (row) => {
      const cells = row.split('|').filter((_, i, a) => i > 0 && i < a.length - 1);
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/g, (block) => {
      const rows = block.trim().split('\n').filter(r => r.includes('<tr>'));
      const clean = rows.filter(r => !r.includes('---'));
      if (!clean.length) return '';
      const [head, ...body] = clean;
      const headRow = head.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>');
      return `<table class="md-table"><thead>${headRow}</thead><tbody>${body.join('')}</tbody></table>`;
    })
    .replace(/^[-*]\s(.+)$/gm, '<li>$1</li>')
    .replace(/\n/g, '<br>');
  let html = s2.replace(/@@CODEBLOCK_(\d+)@@/g, (_, i) => blocks[+i]);
  if (typeof DOMPurify !== 'undefined') {
    html = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'object', 'embed', 'base', 'link', 'meta'],
      FORBID_ATTR: ['onerror', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onmouseenter'],
      ADD_ATTR: ['onclick'],
    });
  }
  return html;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function scrollChat() {
  const a = q('#chat-area');
  if (a) a.scrollTop = a.scrollHeight;
}
function setStatus(t) {
  const p = q('#status-pill');
  p.className = 'status-pill ' + t;
  p.textContent = t === 'processing' ? '● İşleniyor…' : '● Hazır';
}

async function runHealthCheck() {
  if (!api) return;
  const dot = q('#conn-ollama-dot');
  const label = q('#conn-ollama-label');
  const meta = q('#conn-backend-meta');
  if (label) label.textContent = 'Ollama: kontrol…';
  if (dot) dot.className = 'conn-dot';
  try {
    const h = await api.invoke('app-health', { ollamaHost: defaultOllamaHost() });
    if (h.platform) document.body.dataset.platform = h.platform;
    const ok = h.ollamaReachable;
    if (dot) dot.className = `conn-dot ${ok ? 'ok' : 'err'}`;
    if (label) {
      label.textContent = ok
        ? `Ollama: bağlı (${h.modelCount} model · ${h.latencyMs} ms)`
        : `Ollama: erişilemiyor (${h.error || 'ayarları kontrol edin'})`;
    }
    if (meta) {
      const os =
        h.platform === 'darwin' ? 'macOS' : h.platform === 'win32' ? 'Windows' : h.platform || '?';
      meta.textContent = `Uygulama v${h.version} · ${os}`;
    }
  } catch {
    if (dot) dot.className = 'conn-dot err';
    if (label) label.textContent = 'Ollama: kontrol hatası';
  }
}
function log(msg, type = 'info') {
  const out = q('#console-output');
  if (!out) return;
  const d = el('div', 'log-l log-' + type);
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
  state.logCount++;
  const b = q('#log-count');
  if (b) b.textContent = state.logCount;
  if (type === 'error') q('#system-console')?.classList.remove('collapsed');
}
function openModal(id) {
  q('#' + id)?.classList.remove('hidden');
}
function closeModal(id) {
  q('#' + id)?.classList.add('hidden');
}
function showToolsTab(id) {
  qa('.ttab').forEach((b) => b.classList.toggle('active', b.dataset.ttab === id));
  qa('.ttab-pane').forEach((p) => p.classList.toggle('active', p.id === 'ttab-' + id));
}
