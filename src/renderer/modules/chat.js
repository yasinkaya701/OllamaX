/*
 * chat.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

async function sendMessage() {
  const inp = q('#msg-input');
  const text = inp.value.trim();
  if (!text || state.processing) return;
  const active = state.agents.filter((a) => a.active);
  if (!active.length) {
    toast('Select at least one agent', 'warn');
    return;
  }
  /* v3.18.1: Model/Ollama yokken göndermeyi sessizce değil, açıkça reddet */
  if (getBackendHealthy() === false || (getBackendHealthy() === null && !(await preflightBackend()))) {
    const hint = q('#send-blocked-hint');
    if (hint) {
      hint.textContent = "Ollama erişilemiyor veya model yüklenmedi — Ayarlar → Makineler'den kontrol edin.";
      hint.classList.remove('hidden');
      setTimeout(() => hint.classList.add('hidden'), 6000);
    }
    toast('Ollama erişilemiyor — gönderilemedi (ayarları kontrol edin)', 'error');
    return;
  }
  const isComposer = COMPOSER.mode === 'code' && (state.history.length === 0 || !window.__composerTaskSent);
  inp.value = '';
  inp.style.height = 'auto';
  q('#char-count').textContent = '0';
  if (window.Krevyx?.tryGoalSlash && window.Krevyx.tryGoalSlash(text)) {
    state.processing = false;
    setStatus('ready');
    log('Canvas hedefi: ' + text, 'info');
    return;
  }
  if (window.Krevyx?.agentConsole?.tryChainSlash && window.Krevyx.agentConsole.tryChainSlash(text)) {
    state.processing = false;
    setStatus('ready');
    log('Zincir ajan görevi: ' + text, 'info');
    return;
  }
  /* v3.9: prompt builder modülüne api/q erişimi */
  window.api = api;
  window.q = q;
  window.Krevyx = window.Krevyx || {};
  window.Krevyx.state = state;
  window.Krevyx.md = md;
  window.Krevyx.save = save;
  if (window.Krevyx?.promptBuilder?.trySlash && window.Krevyx.promptBuilder.trySlash(text)) {
    state.processing = false;
    setStatus('ready');
    log('Slash komutu: ' + text, 'info');
    return;
  }
  q('#chat-area .welcome-screen')?.remove();
  addUserBubble(text);
  state.history.push({ role: 'user', content: text });
  if (isComposer) {
    /* Composer modunda ilk gönderim: tek görev olarak işletilir ve bağlam dosyaları yüklenir */
    window.__composerTaskSent = true;
    const task = composerAddTask(text, COMPOSER.files);
    composerUpdateTask(task, 'running');
    await composerLoadFileContents();
  }
  save();
  state.processing = true;
  setStatus('processing');
  try {
    await Promise.all(active.map((a) => runAgent(a)));
  } finally {
    state.processing = false;
    setStatus('ready');
    if (isComposer) {
      const last = COMPOSER.tasks.find((t) => t.status === 'running');
      if (last) composerUpdateTask(last, 'done');
      window.__composerTaskSent = false;
    }
  }
}
async function composerLoadFileContents() {
  if (!COMPOSER.files.length) return;
  for (const f of COMPOSER.files) {
    if (f.isDir) continue;
    if (!f._content) {
      try {
        const res = await api.invoke('composer-file-read', f.path);
        f._content = res.ok ? res.content : `[OKUNAMADI: ${res.error || 'erişim reddi'}]`;
      } catch (e) {
        f._content = `[HATA: ${e.message}]`;
      }
    }
  }
}

function resolveModelParamsForAgent(agent) {
  const def = state.settings.modelParams || {};
  const ov = (agent.modelParams && typeof agent.modelParams === 'object') ? agent.modelParams : {};
  const merged = { ...def, ...ov };
  const out = {};
  for (const k of ['temperature', 'top_p', 'max_tokens', 'frequency_penalty', 'presence_penalty']) {
    if (Number.isFinite(Number(merged[k]))) out[k] = Number(merged[k]);
  }
  return Object.keys(out).length ? out : null;
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
    if (COMPOSER.files.length) sysPrompt += buildComposerFileContext();

    const msgs = [...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []), ...state.history];
    const modelParams = resolveModelParamsForAgent(agent);
    log(`${agent.name} [${prov}] → ${model}` + (modelParams ? ` (temp ${modelParams.temperature}, top_p ${modelParams.top_p}, max ${modelParams.max_tokens})` : ''), 'info');

    if (prov === 'ollama') api.send('chat', { agentId: agent.id, host: resolveOllamaHostForAgent(agent), model, messages: msgs, modelParams });
    else if (prov === 'openai') api.send('openai-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.openai, modelParams });
    else if (prov === 'anthropic') api.send('anthropic-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.anthropic, modelParams });
    else if (prov === 'gemini') api.send('gemini-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.gemini, modelParams });
    else if (prov === 'manus') api.send('manus-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings['manus'], modelParams });
    else if (CLOUD_PROVIDERS.includes(prov)) api.send('multi-chat', {
      provider: prov,
      agentId: agent.id,
      model,
      messages: msgs,
      apiKey: prov === 'azure' ? state.settings.azureApiKey
        : prov === 'aws-bedrock' ? state.settings.bedrockAccessKeyId
          : prov === 'lmstudio' ? ''
            : prov === 'custom' ? state.settings.customApiKey
              : state.settings[prov],
      options: {
        endpoint: prov === 'azure' ? state.settings.azureEndpoint
          : prov === 'lmstudio' ? state.settings.lmstudioEndpoint || 'http://localhost:1234'
            : prov === 'custom' ? state.settings.customEndpoint || ''
              : '',
        region: state.settings.bedrockRegion || '',
        awsAccessKeyId: state.settings.bedrockAccessKeyId || '',
        awsSecretAccessKey: state.settings.bedrockSecretAccessKey || '',
        apiVersion: '2024-02-15-preview',
      },
      modelParams,
    });

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
  log(`${job.lead.name} → ${target.name}${job.parallel ? ' (paralel)' : ''}`, 'info');
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
    '<div class="welcome-screen"><img src="../../assets/logo.png" class="welcome-logo" alt="Krevyx"><h1>Krevyx Ultra</h1><p class="welcome-lead">Yerel Ollama ve bulut modelleri</p><p class="welcome-sub">Sağdaki <strong>Araçlar</strong> ile API ve dosyalara erişin.</p><p class="kbd-hint"><kbd>⌘</kbd><kbd>K</kbd> sohbet · <kbd>⌘</kbd><kbd>L</kbd> araçlar <span class="kbd-win">(<kbd>Ctrl</kbd> Windows)</span></p></div>';
  state.history = [];
  save();
  toast('Chat cleared', 'info');
}

function refreshChatFromHistory() {
  const area = q('#chat-area');
  area.innerHTML = '';
  if (!state.history.length) {
    area.innerHTML =
      '<div class="welcome-screen"><img src="../../assets/logo.png" class="welcome-logo" alt="Krevyx"><h1>Krevyx Ultra</h1><p>Professional AI Agent Studio</p></div>';
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
    /* v3.18.1: sağlık durumu gönderme ön kontrolünde kullanılır */
    backendHealthy = Boolean(ok) && Number(h?.modelCount || 0) > 0;
    /* v3.18.1: erişilemiyorken gönder butonunu görsel olarak devre dışı bırak */
    const sendBtn = q('#btn-send');
    if (sendBtn) sendBtn.disabled = !backendHealthy;
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
/* ============ V3.17 — Topluluk & Ekosistem panelleri (Şablonlar + Eklentiler) ============ */
/**
 * ecosystem-panels.js — V3.17 (Topluluk & Ekosistem)
 *
 * Ayarlar modalı içindeki iki yeni panel:
 *  - Şablonlar: ana süreçten canlı liste (gömülü + kullanıcı), kategori filtresi,
 *    yeni şablon kaydetme, düzenleme, silme, dışa aktarma (paylaşım JSON),
 *    içe aktarma (dosya veya yapıştırılan JSON).
 *  - Eklentiler: kurulu eklentilerin listesi ve durumu, eklenti ayar panelleri,
 *    JSON paket kurulumu, kaldırma.
 *
 * Bu dosya app.js'in sonuna eklenir; app.js'teki `q`, `qa`, `on`, `api`, `toast`,
 * `openModal`, `closeModal` yardımcılarına ve `window.Krevyx` alanına dayanır.
 */

'use strict';

/* ------------------------------ HELPERS ------------------------------ */

let __tplState = { templates: [], filter: 'Tümü' };

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function safeCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* ------------------------------ TEMPLATES ------------------------------ */

