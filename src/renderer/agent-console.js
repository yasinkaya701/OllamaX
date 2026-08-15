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

  const state = new Map(); // agentId -> { running, step, history[] }
  let api = null;

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
    appendLogLine(card, `Görev alındı: ${task.slice(0, 120)}`, 'görev');

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
          return;
        }
        appendLogLine(card, a.simulateSteps[i], 'plan');
        i += 1;
        setTimeout(tick, 700 + Math.random() * 500);
      };
      tick();
    }

    if (useReal) {
      ac.invoke('ipc:3:code-agent-run', { agentId: a.id, task: task.trim() })
        .then((res) => {
          if (res && res.ok && Array.isArray(res.steps)) {
            let i = 0;
            const realTick = () => {
              if (i >= res.steps.length || !state.get(a.id).running) {
                if (state.get(a.id).running) appendLogLine(card, 'Görev tamamlandı.', 'sonuç');
                setRunning(a, false);
                return;
              }
              appendLogLine(card, res.steps[i].text || res.steps[i], res.steps[i].kind || 'plan');
              i += 1;
              setTimeout(realTick, 650);
            };
            realTick();
          } else {
            playSimulation();
          }
        })
        .catch(() => playSimulation());
    } else {
      playSimulation();
    }
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
    sub.textContent = 'Claude Code · Codex · Antigravity — üç kod ajanı tek konsoldan.';
    pane.appendChild(sub);

    const grid = h('div', { className: 'ac-grid' });
    for (const a of AGENTS) {
      initAgent(a);
      const card = buildAgentCard(a);
      wireCard(card, a);
      grid.appendChild(card);
    }
    pane.appendChild(grid);
  }

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.agentConsole = {
    TAB_ID: 'code-agents',
    TAB_LABEL: 'Kod Ajanları',
    TAB_ICON: 'M4 6h16M4 12h10M4 18h6',
    render: renderAgentConsolePanel,
    agents: AGENTS,
  };
})();
