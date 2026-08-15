'use strict';

/**
 * agent-console.js — OllamaX v3.4 "AI Coding Console" modülü
 *
 * Üç kod ajanını tek arayüzden kontrol eder (Tricolor Pro: siyah / beyaz / zümrüt #00a878):
 *   - Claude Code (Anthropic)
 *   - Codex (OpenAI)
 *   - Antigravity (Google)
 *
 * Her ajan için: durum kartı (bağlı/model/versiyon), görev giriş kutusu,
 * canli log akışı (plan → adım → sonuç zinciri) ve görev geçmişi.
 * Gerçek ortamda native CLI köprüsüne (ipc:3:code-agent-*) bağlanır;
 * mock/test ortamunda simüle edilmiş akış sunar.
 */
(function initAgentConsole() {
  if (typeof window === 'undefined') return;

  const AGENTS = [
    {
      id: 'claude-code',
      label: 'Claude Code',
      vendor: 'Anthropic',
      modelDefault: 'claude-sonnet-4-5',
      statusDefault: 'bağlı',
      simulateSteps: [
        '[plan] Görevi ayrıştırdı: kapsam 3 dosya, tahmini adım 5',
        '[keşif] src/renderer/app.js içinde ilgili bölge bulundu',
        '[düzenle] src/renderer/app.js — 12 satır değiştirildi',
        '[test] jest akışı başlatıldı → 103/103 geçti',
        '[sonuç] Görev tamamlandı · diff uygulandı',
      ],
    },
    {
      id: 'codex',
      label: 'Codex',
      vendor: 'OpenAI',
      modelDefault: 'o4-codex',
      statusDefault: 'bağlı',
      simulateSteps: [
        '[plan] 2 değişiklik noktası tespit edildi',
        '[patch] index.html — başlık hiyerarşisi iyileştirildi',
        '[patch] styles.css — radyus token güncellendi',
        '[commit] auto-commit oluşturuldu (2 dosya)',
        '[sonuç] Pull request hazır: improvements-2026-08',
      ],
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      vendor: 'Google',
      modelDefault: 'gemini-2.5-pro',
      statusDefault: 'bağlı',
      simulateSteps: [
        '[keşif] repo yapısı indekslendi: 48 dosya tarandı',
        '[inceleme] v3-ui.js içinde performans riski bulundu',
        '[öneri] virtualize list önerisi uygulandı',
        '[sonuç] İnceleme özeti oluşturuldu · 0 kritik bulgu',
      ],
    },
  ];

  const state = new Map(); // agentId -> { running, step, history[], output }
  let api = null;
  const chain = { enabled: false, order: ['claude-code', 'codex', 'antigravity'], running: false, index: 0, rootTask: '' };

  function buildChainPrompt(a, prevAgent, prevTask, prevOutput) {
    const prev = AGENTS.find((x) => x.id === prevAgent);
    const out = Array.isArray(prevOutput) ? prevOutput.map((o) => o.text).filter(Boolean).join(' | ') : String(prevOutput || '').slice(0, 300);
    return `${prev.label} sonuçları: ${out} — ${prevTask} — devamı: ${a.label} bu çıktıyı işleyip ilerlet.`;
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) el.setAttribute(k, v);
    }
    for (const c of children) {
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  function getApi() {
    if (!api && window.ollamaxApi) api = window.ollamaxApi;
    return api;
  }

  function toast(msg, kind = 'info') {
    const stack = document.querySelector('#toast-stack') || document.body;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }

  function initAgent(a) {
    state.set(a.id, { running: false, step: 0, history: [] });
  }

  /* ------------------------------------------------------------------ */
  /* Ajan kartı                                                          */
  /* ------------------------------------------------------------------ */
  function buildAgentCard(a) {
    const card = h('div', { className: 'ac-card', 'data-agent': a.id });

    const header = h('div', { className: 'ac-head' });
    header.appendChild(h('span', { className: 'ac-name' }, a.label));
    header.appendChild(h('span', { className: 'ac-vendor' }, a.vendor));
    header.appendChild(h('span', { className: 'ac-dot ok', 'data-dot': 'status' }, ''));
    header.appendChild(h('span', { className: 'ac-status-text', 'data-text': 'status' }, a.statusDefault));

    const meta = h('div', { className: 'ac-meta' });
    meta.appendChild(h('span', { className: 'ac-model', 'data-model': true }, `model: ${a.modelDefault}`));
    const nextBadge = h('span', { className: 'ac-next hidden', 'data-next': true }, '');
    meta.appendChild(nextBadge);

    const inputRow = h('div', { className: 'ac-input-row' });
    const input = h('input', {
      type: 'text',
      placeholder: `${a.label} için görev yaz…`,
      className: 'ac-input',
      'data-input': true,
    });
    const runBtn = h('button', { className: 'ac-run', 'data-run': true, type: 'button' }, 'Çalıştır');
    const stopBtn = h('button', { className: 'ac-stop hidden', 'data-stop': true, type: 'button' }, 'Durdur');
    inputRow.appendChild(input);
    inputRow.appendChild(runBtn);
    inputRow.appendChild(stopBtn);

    const log = h('div', { className: 'ac-log', 'data-log': true });
    log.appendChild(h('div', { className: 'ac-log-empty' }, 'Henüz görev yok — bir görev yazıp Çalıştır deyin.'));

    card.appendChild(header);
    card.appendChild(meta);
    card.appendChild(inputRow);
    card.appendChild(log);
    return card;
  }

  function setRunning(a, running) {
    const s = state.get(a.id);
    if (!s) return;
    s.running = running;
    s.step = 0;
    if (!running) s.output = null;
    const card = $(`[data-agent="${a.id}"]`);
    if (!card) return;
    const runBtn = card.querySelector('[data-run]');
    const stopBtn = card.querySelector('[data-stop]');
    const input = card.querySelector('[data-input]');
    const dot = card.querySelector('[data-dot="status"]');
    const statusText = card.querySelector('[data-text="status"]');
    if (runBtn) runBtn.classList.toggle('hidden', running);
    if (stopBtn) stopBtn.classList.toggle('hidden', !running);
    if (input) input.disabled = running;
    if (dot) dot.classList.toggle('running', running);
    if (statusText) statusText.textContent = running ? 'çalışıyor…' : a.statusDefault;
  }

  function appendLogLine(card, line, kind) {
    const log = card.querySelector('[data-log]');
    if (!log) return;
    const empty = log.querySelector('.ac-log-empty');
    if (empty) empty.remove();
    const row = h('div', { className: 'ac-log-line' });
    const stamp = h('span', { className: 'ac-stamp' }, new Date().toLocaleTimeString('tr-TR', { hour12: false }));
    const tag = h('span', { className: `ac-tag ac-tag-${kind}` }, kind.toUpperCase());
    const text = h('span', { className: 'ac-line-text' }, line);
    row.appendChild(stamp);
    row.appendChild(tag);
    row.appendChild(text);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    const s = state.get(card.dataset.agent);
    if (s) s.history.push({ time: Date.now(), kind, text: line });
  }

  function runAgentTask(a, task) {
    if (!task.trim()) return;
    setRunning(a, true);
    const card = $(`[data-agent="${a.id}"]`);
    if (!card) return;
    const isChainStep = chain.running;
    appendLogLine(card, `${isChainStep ? `Zincir adımı (${chain.index + 1}/${chain.order.length}) — ` : ''}Görev alındı: ${task.slice(0, 120)}`, 'görev');

    const ac = getApi();
    const useReal = ac && typeof ac.invoke === 'function';

    function playSimulation() {
      let i = 0;
      const tick = () => {
        if (i >= a.simulateSteps.length || !state.get(a.id).running) {
          if (state.get(a.id).running) {
            appendLogLine(card, 'Görev tamamlandı.', 'sonuç');
          }
          setRunning(a, false);
          onAgentDone(a, card);
          return;
        }
        appendLogLine(card, a.simulateSteps[i], 'plan');
        i += 1;
        setTimeout(tick, 700 + Math.random() * 500);
      };
      tick();
    }

    if (useReal) {
      const useOrchestra = chain.running; // zincir modunda backend handoff protokolünü kullan
      const channel = useOrchestra ? 'ipc:3:orchestra-run' : 'ipc:3:code-agent-run';
      ac.invoke(channel, { agentId: a.id, task: task.trim(), chain: useOrchestra ? { root: chain.rootTask, pos: chain.index } : null })
        .then((res) => {
          if (res && res.ok && Array.isArray(res.steps)) {
            let i = 0;
            const realTick = () => {
              if (i >= res.steps.length || !state.get(a.id).running) {
                if (state.get(a.id).running) appendLogLine(card, 'Görev tamamlandı.', 'sonuç');
                setRunning(a, false);
                onAgentDone(a, card);
                return;
              }
              appendLogLine(card, res.steps[i].text || res.steps[i], res.steps[i].kind || 'plan');
              i += 1;
              setTimeout(realTick, 650);
            };
            realTick();
          } else if (res && res.missing) {
            appendLogLine(card, `Gerçek CLI bulunamadı: ${res.error || 'kurulu değil'}. Simülasyon moduna geçiliyor.`, 'sonuç');
            toast(`${a.label} CLI bulunamadı — simülasyon modu`, 'warn');
            playSimulation();
          } else {
            appendLogLine(card, `Gerçek köprü döndü: ${res && res.error ? res.error : 'bilinmeyen yanıt'}. Simülasyon moduna geçiliyor.`, 'sonuç');
            playSimulation();
          }
        })
        .catch(() => playSimulation());
    } else {
      playSimulation();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Zincir orkestrasyonu: lider ajan sonuçlarını sonraki ajana aktarır  */
  /* ------------------------------------------------------------------ */
  function onAgentDone(a, _card) {
    if (!chain.running) return;
    const s = state.get(a.id);
    if (s) s.output = s.history.slice(-6);
    scheduleNext();
  }

  function scheduleNext() {
    chain.index += 1;
    if (chain.index >= chain.order.length || chain.running === false) {
      chain.running = false;
      chain.index = 0;
      refreshChainBadges();
      appendLogLine($('[data-agent="claude-code"]'), 'Zincir tamamlandı: tüm ajanlar görevini tamamladı.', 'sonuç');
      toast('Zincir tamamlandı', 'info');
      return;
    }
    setTimeout(runNextInChain, 900);
  }

  function runNextInChain() {
    const nextId = chain.order[chain.index];
    const next = AGENTS.find((x) => x.id === nextId);
    if (!next) { scheduleNext(); return; }
    refreshChainBadges();
    const prevId = chain.order[chain.index - 1];
    const prevOut = (state.get(prevId) || {}).output || [];
    const prompt = buildChainPrompt(next, prevId, chain.rootTask, prevOut);
    runAgentTask(next, prompt);
  }

  function startChain(firstAgent, task) {
    if (chain.running) return;
    chain.running = true;
    chain.index = 0;
    chain.rootTask = task;
    chain.order = [firstAgent, ...chain.order.filter((id) => id !== firstAgent)];
    const ac = getApi();
    // Backend handoff protokolü varsa (orchestra-chain) tüm zincir anahtarsız lokal ajanlarla backend'de koşar
    if (ac && typeof ac.invoke === 'function') {
      ac.invoke('ipc:3:orchestra-chain', { order: chain.order, task: task.trim() })
        .then((res) => {
          if (res && res.ok && Array.isArray(res.steps)) {
            res.steps.forEach((s) => {
              const a = AGENTS.find((x) => x.id === s.agent) || { id: s.agent, label: s.agent };
              const card = $(`[data-agent="${s.agent}"]`);
              if (s.result && Array.isArray(s.result.steps)) {
                s.result.steps.forEach((st) => {
                  if (card) appendLogLine(card, `${a.label}: ${st.text || st}`, st.kind || 'plan');
                });
                appendLogLine(card || $('[data-agent="claude-code"]'), `${a.label} adımı tamamlandı`, 'sonuç');
              } else if (s.result && !s.result.ok) {
                if (card) appendLogLine(card, `${a.label} hatası: ${s.result.error || 'bilinmeyen'}`, 'sonuç');
                toast(`${a.label} adımında zincir durdu`, 'warn');
              }
            });
            chain.running = false;
            chain.index = chain.order.length;
            refreshChainBadges();
            const leader = $('[data-agent="claude-code"]');
            if (leader) appendLogLine(leader, 'Zincir tamamlandı: tüm ajanlar görevini tamamladı.', 'sonuç');
            toast('Zincir tamamlandı', 'info');
          } else {
            fallbackChain(firstAgent, task);
          }
        })
        .catch(() => fallbackChain(firstAgent, task));
      return;
    }
    fallbackChain(firstAgent, task);
  }

  function fallbackChain(firstAgent, task) {
    runAgentTask(AGENTS.find((a) => a.id === firstAgent), task);
  }

  function refreshChainBadges() {
    AGENTS.forEach((a) => {
      const card = $(`[data-agent="${a.id}"]`);
      const badge = card?.querySelector('[data-next]');
      if (!badge) return;
      if (!chain.enabled || !chain.running) {
        badge.classList.add('hidden');
        return;
      }
      const idx = chain.order.indexOf(a.id);
      if (idx === -1) { badge.classList.add('hidden'); return; }
      const nextId = chain.order[idx + 1];
      if (!nextId) {
        badge.textContent = 'zincirin sonu';
      } else {
        const next = AGENTS.find((x) => x.id === nextId);
        badge.textContent = `sonraki: ${next ? next.label : nextId}`;
      }
      badge.classList.remove('hidden');
    });
  }

  async function detectAgentConnections() {
    const ac = getApi();
    if (!ac || typeof ac.invoke !== 'function') return;
    try {
      const res = await ac.invoke('ipc:3:orchestra-discover', null);
      if (res && res.ok && res.agents) {
        for (const [id, info] of Object.entries(res.agents)) {
          const card = $(`[data-agent="${id}"]`);
          const dot = card?.querySelector('[data-dot="status"]');
          const statusText = card?.querySelector('[data-text="status"]');
          if (!dot) continue;
          const reachable = info.connected === true || info.reachable === true || info.executable;
          if (reachable) {
            dot.classList.remove('off');
            dot.classList.add('ok');
            if (statusText) statusText.textContent = info.kind === 'http' ? 'bağlı (Ollama)' : 'bağlı (CLI)';
          } else {
            dot.classList.remove('ok');
            dot.classList.add('off');
            if (statusText) statusText.textContent = 'CLI yok';
          }
        }
      }
    } catch {
      /* tesir ortamında algılama sessizce geçer */
    }
  }

  function toggleChain(enabled) {
    chain.enabled = enabled;
    const grid = $('[data-chain-grid]');
    if (grid) grid.classList.toggle('ac-chain-on', enabled);
    refreshChainBadges();
    toast(enabled ? 'Zincir modu açık: ajanlar sırayla birbirine prompt aktarır' : 'Zincir modu kapalı', 'info');
  }

  function wireCard(card, a) {
    const runBtn = card.querySelector('[data-run]');
    const stopBtn = card.querySelector('[data-stop]');
    const input = card.querySelector('[data-input]');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (input && input.value.trim()) runAgentTask(a, input.value);
      });
    }
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (input.value.trim()) runAgentTask(a, input.value);
        }
      });
    }
    if (stopBtn) {
      stopBtn.addEventListener('click', () => {
        appendLogLine(card, 'Çalışma kullanıcı tarafından durduruldu.', 'sonuç');
        setRunning(a, false);
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Panel render                                                        */
  /* ------------------------------------------------------------------ */
  function renderAgentConsolePanel() {
    const pane = $('#ttab-code-agents');
    if (!pane) return;
    pane.innerHTML = '';

    const head = h('div', { className: 'sec-label' });
    head.textContent = 'AI Coding Console';
    pane.appendChild(head);

    const sub = h('div', { className: 'ac-sub' });
    sub.textContent = 'Claude Code · Codex · Antigravity · Ollama — anahtarsız lokal orkestra, tek konsol.';
    pane.appendChild(sub);

    const chainRow = h('div', { className: 'ac-chain-row' });
    const chainLabel = h('span', { className: 'ac-chain-label' }, 'Zincir modu: lider ajan sonucu sonraki ajana otomatik prompt olarak aktarır');
    const chainToggle = h('button', { className: 'ac-chain-switch', type: 'button', 'aria-pressed': 'false' }, h('span', { className: 'ac-chain-knob' }, ''));
    chainToggle.addEventListener('click', () => {
      const on = !chain.enabled;
      chainToggle.classList.toggle('ac-chain-on', on);
      chainToggle.setAttribute('aria-pressed', String(on));
      toggleChain(on);
    });
    chainRow.appendChild(chainLabel);
    chainRow.appendChild(chainToggle);
    pane.appendChild(chainRow);

    const grid = h('div', { className: 'ac-grid', 'data-chain-grid': true });
    for (const a of AGENTS) {
      initAgent(a);
      const card = buildAgentCard(a);
      wireCard(card, a);
      grid.appendChild(card);
    }
    pane.appendChild(grid);
    detectAgentConnections();
  }

  /* ------------------------------------------------------------------ */
  /* /chain slash komutu: /chain claude-code → antigravity: <görev>       */
  /* ------------------------------------------------------------------ */
  function tryChainSlash(raw) {
    const m = /^\/chain\s+(.+)$/.exec(raw.trim());
    if (!m) return false;
    const rest = m[1];
    const colonIdx = rest.indexOf(':');
    if (colonIdx === -1) return false;
    const agentsPart = rest.slice(0, colonIdx).trim();
    const task = rest.slice(colonIdx + 1).trim();
    if (!task) return false;
    const order = agentsPart.split(/→|->|,| /).map((s) => s.trim()).filter(Boolean).filter((s) => AGENTS.some((a) => a.id === s));
    if (order.length === 0) return false;
    const pane = $('#ttab-code-agents');
    if (pane && !pane.classList.contains('active')) {
      const tab = $('[data-ttab="code-agents"]');
      if (tab) tab.click();
    }
    chain.order = order;
    startChain(order[0], task);
    return true;
  }

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.agentConsole = {
    TAB_ID: 'code-agents',
    TAB_LABEL: 'Kod Ajanları',
    TAB_ICON: 'M4 6h16M4 12h10M4 18h6',
    render: renderAgentConsolePanel,
    agents: AGENTS,
    tryChainSlash,
    startChain,
    toggleChain,
    chain,
  };
})();
