/*
 * github.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

function allFeaturedRepos() {
  if (FEATURED_REPOS_CATALOG?.categories?.length) {
    return FEATURED_REPOS_CATALOG.categories.flatMap((c) =>
      c.repos.map((r) => ({ q: r.query, label: r.name.split('/').pop(), cssClass: c.icon, desc: r.desc, stars: r.stars, lang: r.lang, fullName: r.name, repoUrl: `https://github.com/${r.name}` })),
    );
  }
  return FEATURED_REPOS_FALLBACK.map((r) => ({ ...r, fullName: r.label, repoUrl: `https://github.com/search?q=${encodeURIComponent(r.q)}` }));
}

/* --- v3.0 ikon sistemi (AI slop temizliği: emoji yerine SVG) --- */
const ICON_SVGS = {
  'icon-flask': '<path d="M10 2v6.292a4 4 0 0 0-1.17 2.12L6.6 16a3 3 0 0 0 2.87 4h5.06a3 3 0 0 0 2.87-4l-2.23-5.59A4 4 0 0 0 14 8.29V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/>',
  'icon-code': '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  'icon-shield': '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'icon-build': '<path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><path d="M9 20v-5h6v5"/><path d="M9 12h.01M15 12h.01"/>',
  'icon-wand': '<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8l1.4 1.4"/><path d="M17.8 6.2l1.4-1.4"/><path d="M12.2 11.8l-1.4 1.4"/><path d="M12.2 6.2L10.8 4.8"/><path d="M15 9l-9 9-3 1 1-3 9-9z"/>',
  'icon-clipboard': '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  'icon-search': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'icon-star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'icon-brain': '<path d="M12 5a3 3 0 1 0-5.99.22 3 3 0 0 0-3.3 3.6A3 3 0 0 0 4 15a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3 3 3 0 0 0-1.31-2.48 3 3 0 0 0-2.7-3.3A3 3 0 0 0 12 5z"/><path d="M12 5v17"/>',
  'icon-llama': '<path d="M7 10c0-3 2-5 5-5h4v6"/><path d="M6 22V9"/><path d="M10 22v-8h4v8"/><path d="M4 4h2M7 2h2"/>',
  'icon-link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  'icon-mic': '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  'icon-hug': '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  'icon-palette': '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20 4 4 0 0 0 4-4c0-1.5-1-2.5-2-3-.5-.25-1-.5-1-1.5s1-2 2-2h2a3 3 0 0 0 3-3 10 10 0 0 0-8-6z"/>',
  'icon-bot': '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/>',
  'icon-book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'icon-dial': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>',
  'icon-wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'icon-chat': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  'icon-folder': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  'icon-file': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  'icon-folder-open': '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.2 10h13a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  'icon-zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
};
function iconSvg(cls) {
  const path = ICON_SVGS[cls];
  if (!path) return '';
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const MODEL_LISTS = { ollama: [], openai: [], anthropic: [], gemini: [], openrouter: [], xai: [], mistral: [], deepseek: [], cohere: [], perplexity: [], together: [], groq: [], cerebras: [], fireworks: [], replicate: [], azure: [], "aws-bedrock": [], lmstudio: [], custom: [] };
const CLOUD_PROVIDERS = ['openai','anthropic','gemini','openrouter', 'xai', 'mistral', 'deepseek', 'cohere', 'perplexity', 'together', 'groq', 'cerebras', 'fireworks', 'replicate', 'azure', 'aws-bedrock', 'lmstudio', 'custom', 'manus'];

const MODEL_FALLBACK = {
  openai: ['gpt-5.5', 'gpt-5.3', 'gpt-5', 'gpt-5-mini', 'gpt-4o', 'gpt-4.1', 'o5-mini', 'o4-mini'],
  anthropic: ['claude-sonnet-5-20260630', 'claude-opus-4-8', 'claude-sonnet-4-20250514'],
  gemini: ['gemini-3.7-flash', 'gemini-3-pro', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  manus: ['manus'],
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
    modelParams: { temperature: 0.7, top_p: 1, max_tokens: 8192 },
    behaviorProfile: 'precise',
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

