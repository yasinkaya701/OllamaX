/*
 * composer.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

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

/* ============================================================
 * V3.8 COMPOSER MODU (Cursor Composer benzeri)
 * Sohbet/Composer modu, dosya bağlamı (@file), görev listesi
 * ============================================================ */
const COMPOSER = {
  mode: 'chat',
  files: [],          // { path, name, size }
  pickerDir: '',      // son açılan dizin
  tasks: [],          // { id, title, files, status, startedAt }
  _taskId: 0,
};
function composerSetMode(mode) {
  COMPOSER.mode = mode;
  qa('#composer-mode-chips .cm-chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === mode));
  qa('#composer-mode-chips .cm-add-btn').forEach((b) => b.classList.toggle('hidden', mode !== 'code'));
  const hint = q('#composer-mode-hint');
  const input = q('#msg-input');
  if (mode === 'code') {
    if (hint) hint.textContent = 'Composer modu: dosya bağlamıyla kod görevleri';
    if (input) input.placeholder = 'Görevi yazın… (Ctrl+Enter görev gönder, Shift+Enter satır)';
  } else {
    if (hint) hint.textContent = 'Sohbet modu: aktif ajanlarla diyalog';
    if (input) input.placeholder = 'Ajanlara yazın… (Enter gönder, Shift+Enter satır)';
  }
  composerRenderFiles();
  save();
}
function composerRenderFiles() {
  const box = q('#composer-files');
  if (!box) return;
  box.classList.toggle('hidden', !COMPOSER.files.length);
  box.innerHTML = COMPOSER.files.map((f, i) =>
    `<span class="cm-file${f.isDir ? ' cm-file-dir' : ''}" title="${esc(f.path)}">${f.isDir ? '📁 ' : '📄 '}${esc(f.name)}<button type="button" class="cm-file-x" data-i="${i}" title="Kaldır">✕</button></span>`,
  ).join('');
  box.querySelectorAll('.cm-file-x').forEach((b) => b.addEventListener('click', () => {
    COMPOSER.files.splice(Number(b.dataset.i), 1);
    composerRenderFiles();
    save();
  }));
}
async function composerAddContext(path, name, isDir) {
  const entry = { path, name, isDir: !!isDir };
  if (COMPOSER.files.some((f) => f.path === path)) {
    toast('Bu bağlam zaten ekli', 'warn');
    return;
  }
  if (isDir) {
    COMPOSER.files.push(entry);
    composerRenderFiles();
    save();
    log(`Klasör bağlamı eklendi: ${name}`, 'info');
    return;
  }
  try {
    const res = await api.invoke('composer-file-read', path);
    if (!res.ok) { toast(res.error || 'Dosya okunamadı', 'error'); return; }
    entry.size = res.size;
    COMPOSER.files.push(entry);
    composerRenderFiles();
    save();
    log(`Bağlam dosyası eklendi: ${name} (${res.size} bayt)`, 'info');
  } catch (e) {
    toast(e.message, 'error');
  }
}
function buildComposerFileContext() {
  if (!COMPOSER.files.length) return '';
  const parts = COMPOSER.files.map((f) => {
    if (f.isDir) return `## DİZİN: ${f.name}\n(Yol: ${f.path} — içerik, modelin sorarak veya mevcut bağlamdan değerlendirmesi içindir.)`;
    try {
      const raw = f._content ? f._content.toString().slice(0, 120000) : '';
      return `## DOSYA: ${f.name} (${f.path})\n\`\`\`text\n${raw}\n\`\`\``;
    } catch { return `## DOSYA: ${f.name} (okunamadı)`; }
  });
  return `\n\n[COMPOSER BAĞLAMI — REFERANS DOSYALAR]\n${parts.join('\n\n')}\n[/COMPOSER BAĞLAMI]`;
}
function composerAddTask(title, files) {
  COMPOSER._taskId += 1;
  const task = { id: COMPOSER._taskId, title, files: files.map((f) => f.name).join(', '), status: 'queued', startedAt: Date.now() };
  COMPOSER.tasks.unshift(task);
  if (COMPOSER.tasks.length > 50) COMPOSER.tasks.length = 50;
  composerRenderTasks();
  q('#composer-task-panel')?.classList.remove('hidden');
  return task;
}
function composerUpdateTask(task, status) {
  task.status = status;
  composerRenderTasks();
}
function composerRenderTasks() {
  const box = q('#composer-task-list');
  if (!box) return;
  box.classList.toggle('hidden', !COMPOSER.tasks.length);
  box.innerHTML = COMPOSER.tasks.map((t) =>
    `<div class="ct-item" data-status="${t.status}" data-task-id="${t.id}"><div class="ct-head"><span class="ct-dot"></span><span class="ct-title">${esc(t.title)}</span></div><div class="ct-files">${esc(t.files)}</div></div>`,
  ).join('');
  box.querySelectorAll('.ct-item').forEach((el) => el.addEventListener('click', () => {
    const t = COMPOSER.tasks.find((x) => x.id === Number(el.dataset.taskId));
    if (t) addUserBubble(`Görev: ${t.title} (${t.status})${t.files ? ' · Bağlam: ' + t.files : ''}`, t.status === 'done' ? 'var(--green)' : undefined);
  }));
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
    } catch {
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
    refreshAppearanceSettings();
    refreshAdvancedParams();
    refreshCostPanel();
    refreshSecurityPanel();
    openModal('settings-modal');
  });

  /* V3.15 (A2-2): bütçe limitleri kaydetme */
  on('btn-cost-save-budgets', 'click', async () => {
    if (!api) return;
    const inputs = qa('#cost-budget-inputs input');
    const budgets = {};
    for (const inp of inputs) {
      const v = Number((inp.value || '').trim());
      if (Number.isFinite(v) && v > 0) budgets[inp.dataset.provider] = v;
    }
    try {
      const res = await api.invoke('cost-budgets-set', { budgets });
      if (res?.ok) {
        toast('Bütçe limitleri kaydedildi · soft stop etkin', 'success');
        void refreshCostPanel();
      } else {
        toast(res?.error || 'Kaydedilemedi', 'error');
      }
    } catch {
      toast('Bütçe kaydı başarısız', 'error');
    }
  });

  /* V3.15 (A2-4): CSV raporu indir */
  on('btn-cost-csv', 'click', async () => {
    if (!api) return;
    try {
      const res = await api.invoke('cost-csv', { month: q('#cost-month-label')?.textContent?.trim() || undefined });
      const csv = res?.csv;
      if (typeof csv === 'string' && csv.length) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'krevyx-cost-report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Rapor indirildi', 'success');
      } else {
        toast('Bu ay için veri yok', 'info');
      }
    } catch {
      toast('Rapor oluşturulamadı', 'error');
    }
  });

  /* V3.14 (A1): ağ modu çip geçişi */
  qa('#security-mode-chips .theme-chip').forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (!api) return;
      const mode = chip.dataset.netmode;
      try {
        const res = await api.invoke('network-mode-set', { mode });
        if (res?.ok) {
          toast(mode === 'local-only' ? 'Air-gapped mod etkin · yalnız yerel sağlayıcılar' : 'Normal mod · bulut sağlayıcılar açık', 'success');
          qa('#security-mode-chips .theme-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          void refreshSecurityPanel();
        } else {
          toast(res?.error || 'Mod değiştirilemedi', 'error');
        }
      } catch {
        toast('Ağ modu değiştirilemedi', 'error');
      }
    });
  });

  /* V3.14 (A1-1): düz metin anahtarları kasaya taşı */
  on('btn-security-carry-keys', 'click', async () => {
    if (!api) return;
    const moved = [];
    try {
      for (const p of ['openai', 'anthropic', 'gemini', 'openrouter', 'xai', 'mistral', 'deepseek', 'cohere', 'perplexity', 'together', 'groq', 'cerebras', 'fireworks', 'replicate']) {
        const raw = state.settings[p] || '';
        if (typeof raw === 'string' && raw.trim() && !raw.startsWith('VAULT:')) {
          const ref = await api.invoke('vault-set', { provider: p, key: raw.trim() });
          if (ref?.ok) moved.push(p);
        }
      }
      if (moved.length) {
        toast(`${moved.length} sağlayıcı anahtarı kasaya taşındı (${moved.join(', ')})`, 'success');
        void refreshSecurityPanel();
      } else {
        toast('Taşınacak düz metin anahtar bulunamadı', 'info');
      }
    } catch {
      toast('Anahtar taşıma başarısız', 'error');
    }
  });

  // V3.1: Görünüm çip seçimleri — anında önizleme (saveSettings'te de kalıcı kaydedilir)
  qa('#settings-theme-chips .theme-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      qa('#settings-theme-chips .theme-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (chip.dataset.theme && window.Krevyx?.theme?.apply) window.Krevyx.theme.applySystemOr(chip.dataset.theme);
    });
  });
  qa('#settings-density-chips .theme-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      qa('#settings-density-chips .theme-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      if (chip.dataset.density && window.Krevyx?.layout?.setDensity) window.Krevyx.layout.setDensity(chip.dataset.density);
    });
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

  /* V3.8 Composer bağlamaları */
  qa('#composer-mode-chips .cm-chip').forEach((c) => c.addEventListener('click', () => composerSetMode(c.dataset.mode)));
  on('btn-composer-add', 'click', () => {
    if (!api) return;
    const dir = state.currentDir || `krevyx-Projects`;
    api.send('list-dir', dir);
    showToolsTab('files');
    q('#tools-panel').classList.remove('hidden');
    q('#file-tree').dataset.composerMode = '1';
  });
  on('btn-composer-folder', 'click', () => api && api.send('open-folder-dialog'));
  on('btn-clear-composer-tasks', 'click', () => {
    COMPOSER.tasks = [];
    composerRenderTasks();
    q('#composer-task-panel')?.classList.add('hidden');
  });

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
    const arr = Array.isArray(models) ? models : [];
    MODEL_LISTS.ollama = arr.map((m) => (typeof m === 'string' ? m : m?.name || ''));
    const domList = q('#local-models-list');
    domList.innerHTML = '';
    if (!arr.length) {
      domList.innerHTML = '<div class="empty-note">No models. Run: <code>ollama pull llama3.2:1b</code></div>';
      return;
    }
    state.ollamaModelSizes = {};
    arr.forEach((m) => {
      const name = typeof m === 'string' ? m : m?.name || '';
      const size = typeof m === 'string' ? 0 : m?.size || 0;
      if (name) state.ollamaModelSizes[name] = typeof size === 'number' ? size : 0;
      const d = document.createElement('div');
      d.className = 'model-item';
      d.dataset.model = name;
      const sz = size ? `${(size / 1e9).toFixed(1)} GB` : '';
      d.innerHTML = `<span class="mi-name">${esc(name)}</span><span class="mi-size">${sz}</span>`;
      d.addEventListener('click', () => {
        if (state.currentProvider === 'ollama') {
          populateModelSelect('ollama');
          setTimeout(() => {
            q('#model-select').value = name;
            state.currentModel = name;
            updateModelLabel();
          }, 30);
        }
        log(`Model: ${name}`, 'info');
      });
      domList.appendChild(d);
    });
    if (state.currentProvider === 'ollama') populateModelSelect('ollama');
    log(`${arr.length} local models loaded`, 'success');
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
  api.on('featured-repos', (data) => {
    if (data?.categories?.length) FEATURED_REPOS_CATALOG = data;
    renderFeaturedRepos();
    renderFeaturedRepoFreshness();
  });
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
      d.innerHTML = `<span class="fi-icon">${iconSvg(it.isDir ? "icon-folder" : "icon-file")}</span><span class="fi-name">${esc(it.name)}</span>`;
      d.addEventListener('click', () => {
        const fp = `${p.replace(/[/\\]$/, '')}${p.includes('\\') ? '\\' : '/'}${it.name}`;
        if (tree.dataset.composerMode) {
          void composerAddContext(fp, it.name, it.isDir);
          q('#composer-task-panel')?.classList.remove('hidden');
          return;
        }
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
      d.innerHTML = `<span class="ws-icon">${iconSvg('icon-folder-open')}</span><span class="ws-name">${esc(name)}</span>`;
      d.addEventListener('click', () => {
        const fp = `krevyx-Projects/${name}`;
        api.send('list-dir', fp);
        showToolsTab('files');
        q('#tools-panel').classList.remove('hidden');
      });
      list.appendChild(d);
    });
  });

  /* ===== V3.12: Orkestrasyon IPC ===== */
  api.on('agent-discover', (data) => renderOrchestrationAgents(data));
  api.on('agent-output', (d) => handleOrchOutput(d));
  api.on('agent-chain-progress', (d) => handleOrchChainProgress(d));
}

