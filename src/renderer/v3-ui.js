/**
 * v3-ui.js — OllamaX v3.0 arayüz katmanı (Faz 1–6 entegrasyonu)
 *
 * Eski app.js'i değiştirmeden çalışır; bu dosya DOM'a yeni panelleri
 * enjekte eder ve ipc:3:* uç noktalarını render'a bağlar.
 *
 * Bağladığı özellikler:
 *  - Oturum yönetimi (session-list / session-load / session-save / session-delete)
 *  - Araç onay akışı (tool-approval-request / tool-approval-response)
 *  - AgentLoop streaming (event:token / event:thinking / event:tool-call / event:tool-result)
 *  - Anlamsal bellek paneli (memory-*)
 *  - İş akışı paneli (workflow-*)
 *  - Eklenti yöneticisi (plugins-*)
 *  - Denetim kaydı paneli (audit-log)
 *  - Görsel üretimi (/image komutu, generate-image)
 */

'use strict';

(function initV3Ui() {
  if (!window.ollamaxApi) return;
  const api = window.ollamaxApi;

  /* ------------------------------------------------------------------ */
  /* Küçük yardımcılar                                                   */
  /* ------------------------------------------------------------------ */
  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function esc(s) {
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(String(s ?? ''), { ALLOWED_TAGS: [] });
    }
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toast(msg, kind = 'info') {
    const stack = $('#toast-stack') || document.body;
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  function iconSvg(cls) {
    const paths = {
      'icon-wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
      'icon-check': '<polyline points="20 6 9 17 4 12"/>',
      'icon-x': '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      'icon-alert': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
      'icon-image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    };
    const path = paths[cls];
    if (!path) return '';
    return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
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

  const v3 = {
    invoke: (name, ...args) => api.invoke(`ipc:3:${name}`, ...args),
  };

  /* ------------------------------------------------------------------ */
  /* Tool onay modalı (agent loop write/exec onayı)                      */
  /* ------------------------------------------------------------------ */
  function buildApprovalModal() {
    const modal = h('div', { id: 'tool-approval-modal', className: 'modal hidden' });
    modal.innerHTML = `
      <div class="modal-bg"></div>
      <div class="modal-box">
        <div class="modal-hdr"><h3>Araç onayı gerekli</h3><button class="modal-x" data-x>✕</button></div>
        <div class="approval-body">
          <div class="approval-tool-name" id="approval-tool-name"></div>
          <pre class="approval-args" id="approval-args"></pre>
          <p class="approval-note">Bu araç dosya/dizin değiştirme veya komut çalıştırma yetkisi ister. Onay vermeden önce içeriği kontrol edin.</p>
        </div>
        <div class="modal-ftr">
          <button class="ghost-btn" id="btn-approval-reject">Reddet</button>
          <button class="primary-btn" id="btn-approval-approve">Onayla</button>
        </div>
      </div>`;
    return modal;
  }

  let pendingApproval = null;
  function sendApprovalDecision(decision) {
    if (!pendingApproval) return;
    const { sessionId, tool, args } = pendingApproval;
    pendingApproval = null;
    $('#tool-approval-modal').classList.add('hidden');
    api.send('tool-approval-response', { sessionId, approved: decision, tool, args });
  }

  /* ------------------------------------------------------------------ */
  /* Sekmeler: tools-panel'e yeni sekmeler                               */
  /* ------------------------------------------------------------------ */
  function buildNewTabs() {
    const tabs = [
      { id: 'workflows', label: 'İş Akışı', icon: 'M4 6h16M4 12h16M4 18h7' },
      { id: 'memory', label: 'Bellek', icon: 'M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m11.14 0l-2.83-2.83M9.76 9.76L6.93 6.93' },
      { id: 'plugins', label: 'Eklentiler', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
      { id: 'audit', label: 'Denetim', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ];
    return tabs.map((t) =>
      h('button', { className: 'ttab', 'data-ttab': t.id, type: 'button' }, hSvgIcon(t.icon), t.label),
    );
  }

  function hSvgIcon(d) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '12');
    svg.setAttribute('height', '12');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  /* ------------------------------------------------------------------ */
  /* Sol kenar çubuğu: Oturumlar bölümü                                  */
  /* ------------------------------------------------------------------ */
  function buildSessionsSection() {
    const sec = h('div', { className: 'sidebar-section' });
    sec.innerHTML = `
      <div class="sec-header">
        <span class="sec-label">Oturumlar</span>
        <button id="btn-new-session" class="sec-action">＋ Yeni</button>
      </div>
      <div id="session-list" class="session-list"></div>`;
    return sec;
  }

  async function refreshSessions() {
    const list = $('#session-list');
    if (!list) return;
    try {
      const res = await v3.invoke('session-list');
      const sessions = (res && res.ok && Array.isArray(res.sessions)) ? res.sessions : [];
      list.innerHTML = '';
      if (!sessions.length) {
        list.appendChild(h('div', { className: 'empty-note' }, 'Henüz kayıtlı oturum yok.'));
        return;
      }
      for (const s of sessions) {
        const row = h('div', { className: 'session-row', 'data-id': s.id });
        const title = (s.title && String(s.title).trim()) || `Oturum ${s.id}`;
        const ts = s.updatedAt ? new Date(s.updatedAt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        row.appendChild(h('button', { className: 'session-row-main', type: 'button', title: 'Bu oturumu aç' }, h('span', { className: 'session-row-title' }, title), h('span', { className: 'session-row-meta' }, ts)));
        const del = h('button', { className: 'session-row-del', type: 'button', title: 'Sil', 'data-del': s.id }, '✕');
        del.addEventListener('click', async () => {
          if (!window.confirm(`"${title}" oturumu silinsin mi?`)) return;
          await v3.invoke('session-delete', s.id);
          toast('Oturum silindi', 'info');
          refreshSessions();
        });
        row.appendChild(del);
        row.addEventListener('click', (e) => {
          if (e.target.closest('[data-del]')) return;
          loadSession(s.id);
        });
        list.appendChild(row);
      }
    } catch {
      list.innerHTML = '';
      list.appendChild(h('div', { className: 'empty-note' }, 'Oturumlar yüklenemedi.'));
    }
  }

  async function loadSession(id) {
    try {
      const res = await v3.invoke('session-load', id);
      if (res && res.ok) {
        if (typeof window.reloadChatWithMessages === 'function') {
          window.reloadChatWithMessages(res.session);
        } else {
          toast('Oturum yüklendi: ' + id, 'info');
        }
      } else {
        toast('Oturum yüklenemedi: ' + (res && res.error ? res.error : id), 'error');
      }
    } catch {
      toast('Oturum yüklenirken hata oluştu', 'error');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Bellek paneli                                                       */
  /* ------------------------------------------------------------------ */
  async function renderMemoryPanel() {
    const pane = $('#ttab-memory');
    if (!pane) return;
    pane.innerHTML = '';
    pane.appendChild(h('div', { className: 'search-row' },
      h('input', { id: 'memory-search-input', className: 'text-input', type: 'text', placeholder: 'Bellekte ara…' }),
      h('button', { id: 'btn-memory-search', className: 'small-btn', type: 'button' }, 'Ara'),
    ));
    const resWrap = h('div', { id: 'memory-search-results', className: 'memory-results' });
    resWrap.appendChild(h('div', { className: 'empty-note' }, 'Bellek boş; ajan döngüsü sırasında bilgi adayları burada görünür.'));
    pane.appendChild(resWrap);

    const candHdr = h('div', { className: 'sec-label' }, 'Bilgi adayları (onay bekliyor)');
    pane.appendChild(candHdr);
    const candList = h('div', { id: 'memory-candidates-list', className: 'memory-candidates' });
    pane.appendChild(candList);

    $('#btn-memory-search').addEventListener('click', async () => {
      const q = $('#memory-search-input').value.trim();
      if (!q) return;
      try {
        const res = await v3.invoke('memory-search', q, 5);
        resWrap.innerHTML = '';
        const hits = (res && res.ok && Array.isArray(res.results)) ? res.results : [];
        if (!hits.length) {
          resWrap.appendChild(h('div', { className: 'empty-note' }, 'Sonuç bulunamadı.'));
          return;
        }
        for (const hit of hits) {
          const card = h('div', { className: 'memory-card' });
          card.appendChild(h('div', { className: 'memory-card-cat' }, esc(hit.category || 'genel')));
          card.appendChild(h('div', { className: 'memory-card-body' }, esc(hit.content || '')));
          resWrap.appendChild(card);
        }
      } catch {
        resWrap.innerHTML = '';
        resWrap.appendChild(h('div', { className: 'empty-note' }, 'Arama başarısız.'));
      }
    });

    async function refreshCandidates() {
      candList.innerHTML = '';
      try {
        const res = await v3.invoke('memory-candidates');
        const items = (res && res.ok && Array.isArray(res.candidates)) ? res.candidates : [];
        if (!items.length) {
          candList.appendChild(h('div', { className: 'empty-note' }, 'Onay bekleyen aday yok.'));
          return;
        }
        for (const c of items) {
          const row = h('div', { className: 'memory-cand-row', 'data-id': c.id });
          row.appendChild(h('div', { className: 'memory-cand-body' }, esc(c.content || '')));
          const actions = h('div', { className: 'memory-cand-actions' });
          const acceptBtn = h('button', { className: 'small-btn', type: 'button' }, 'Kabul');
          const rejectBtn = h('button', { className: 'ghost-btn', type: 'button' }, 'Reddet');
          acceptBtn.addEventListener('click', async () => {
            await v3.invoke('memory-accept-candidate', c.id);
            toast('Aday belleğe kabul edildi', 'info');
            refreshCandidates();
          });
          rejectBtn.addEventListener('click', async () => {
            await v3.invoke('memory-reject-candidate', c.id);
            refreshCandidates();
          });
          actions.appendChild(acceptBtn);
          actions.appendChild(rejectBtn);
          row.appendChild(actions);
          candList.appendChild(row);
        }
      } catch {
        candList.appendChild(h('div', { className: 'empty-note' }, 'Adaylar yüklenemedi.'));
      }
    }
    refreshCandidates();
    // Periyodik yenileme
    setInterval(refreshCandidates, 30000);
  }

  /* ------------------------------------------------------------------ */
  /* İş akışı paneli                                                     */
  /* ------------------------------------------------------------------ */
  async function renderWorkflowPanel() {
    const pane = $('#ttab-workflows');
    if (!pane) return;
    pane.innerHTML = '';
    const list = h('div', { id: 'workflow-list', className: 'workflow-list' });
    pane.appendChild(list);

    const addRow = h('div', { className: 'wf-add-row' });
    const nameInput = h('input', { id: 'wf-name-input', className: 'text-input', type: 'text', placeholder: 'Yeni iş akışı adı…' });
    const addBtn = h('button', { id: 'btn-wf-add', className: 'small-btn', type: 'button' }, '＋ Oluştur');
    addRow.appendChild(nameInput);
    addRow.appendChild(addBtn);
    pane.appendChild(addRow);

    addBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      const id = name.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const res = await v3.invoke('workflow-save', { id, workflow: { id, name, steps: [] } });
      if (res && res.ok) {
        nameInput.value = '';
        toast('İş akışı oluşturuldu', 'info');
        refreshWorkflows();
      } else {
        toast('Oluşturulamadı: ' + (res && res.error ? res.error : name), 'error');
      }
    });

    async function refreshWorkflows() {
      list.innerHTML = '';
      try {
        const res = await v3.invoke('workflow-list');
        const items = (res && res.ok && Array.isArray(res.workflows)) ? res.workflows : [];
        if (!items.length) {
          list.appendChild(h('div', { className: 'empty-note' }, 'İş akışı yok; bir isim yazıp oluşturabilirsiniz. Adımlar JSON/YAML olarak agent prompt\'larında kullanılabilir.'));
          return;
        }
        for (const wf of items) {
          const row = h('div', { className: 'wf-row' });
          row.appendChild(h('span', { className: 'wf-row-name' }, esc(wf.name || wf.id)));
          const act = h('span', { className: 'wf-row-actions' });
          const runBtn = h('button', { className: 'small-btn', type: 'button' }, '▶');
          const delBtn = h('button', { className: 'ghost-btn', type: 'button' }, '✕');
          runBtn.addEventListener('click', async () => {
            const out = await v3.invoke('workflow-run', { workflow: wf });
            toast(out && out.ok ? 'İş akışı tamamlandı' : 'İş akışı tamamlanamadı', out && out.ok ? 'info' : 'error');
          });
          delBtn.addEventListener('click', async () => {
            if (!window.confirm(`"${wf.name || wf.id}" silinsin mi?`)) return;
            await v3.invoke('workflow-delete', wf.id);
            refreshWorkflows();
          });
          act.appendChild(runBtn);
          act.appendChild(delBtn);
          row.appendChild(act);
          list.appendChild(row);
        }
      } catch {
        list.appendChild(h('div', { className: 'empty-note' }, 'İş akışları yüklenemedi.'));
      }
    }
    refreshWorkflows();
  }

  /* ------------------------------------------------------------------ */
  /* Eklenti yöneticisi                                                  */
  /* ------------------------------------------------------------------ */
  async function renderPluginsPanel() {
    const pane = $('#ttab-plugins');
    if (!pane) return;
    pane.innerHTML = '';
    pane.appendChild(h('p', { className: 'keys-note' }, 'Eklentiler izole bir VM içinde çalışır; yalnızca izinli kanal üzerinden iletişim kurabilir.'));
    const list = h('div', { id: 'plugins-list', className: 'plugins-list' });
    pane.appendChild(list);
    const note = h('p', { className: 'keys-note' }, 'Eklenti kurulumu için eklenti dosyasını <code>plugins/</code> klasörüne koyup uygulamayı yeniden başlatın.');
    pane.appendChild(note);

    async function refreshPlugins() {
      list.innerHTML = '';
      try {
        const res = await v3.invoke('plugins-list');
        const items = (res && res.ok && Array.isArray(res.plugins)) ? res.plugins : [];
        if (!items.length) {
          list.appendChild(h('div', { className: 'empty-note' }, 'Yüklü eklenti yok.'));
          return;
        }
        for (const p of items) {
          const row = h('div', { className: 'plugin-row' });
          row.appendChild(h('span', { className: 'plugin-row-name' }, esc(p.name || p.id)));
          const delBtn = h('button', { className: 'ghost-btn', type: 'button' }, '✕');
          delBtn.addEventListener('click', async () => {
            if (!window.confirm(`"${p.name || p.id}" kaldırılsın mı?`)) return;
            await v3.invoke('plugins-uninstall', p.id);
            refreshPlugins();
          });
          row.appendChild(delBtn);
          list.appendChild(row);
        }
      } catch {
        list.appendChild(h('div', { className: 'empty-note' }, 'Eklentiler yüklenemedi.'));
      }
    }
    refreshPlugins();
  }

  /* ------------------------------------------------------------------ */
  /* Denetim kaydı paneli                                                */
  /* ------------------------------------------------------------------ */
  async function renderAuditPanel() {
    const pane = $('#ttab-audit');
    if (!pane) return;
    pane.innerHTML = '';
    const wrap = h('div', { className: 'audit-wrap' });
    const table = h('table', { className: 'audit-table' });
    table.innerHTML = `<thead><tr><th>Zaman</th><th>Aktör</th><th>İşlem</th><th>Süre</th></tr></thead><tbody></tbody>`;
    wrap.appendChild(table);
    const refreshBtn = h('button', { className: 'small-btn full-w', type: 'button' }, 'Yenile');
    pane.appendChild(wrap);
    pane.appendChild(refreshBtn);

    async function refresh() {
      const tbody = table.querySelector('tbody');
      tbody.innerHTML = '';
      try {
        const res = await v3.invoke('audit-log', 200);
        const entries = (res && res.ok && Array.isArray(res.entries)) ? res.entries : [];
        if (!entries.length) {
          tbody.appendChild(h('tr', {}, h('td', { colSpan: '4', className: 'empty-note' }, 'Denetim kaydı yok.')));
          return;
        }
        for (const e of entries.slice(0, 150)) {
          const tr = h('tr', {});
          tr.appendChild(h('td', {}, new Date(e.ts).toLocaleString('tr-TR')));
          tr.appendChild(h('td', {}, esc(e.actor || '')));
          tr.appendChild(h('td', { className: 'audit-action' }, esc(String(e.action || '').slice(0, 40))));
          tr.appendChild(h('td', {}, e.duration_ms != null ? `${e.duration_ms}ms` : ''));
          tbody.appendChild(tr);
        }
      } catch {
        tbody.appendChild(h('tr', {}, h('td', { colSpan: '4', className: 'empty-note' }, 'Yüklenemedi.')));
      }
    }
    refreshBtn.addEventListener('click', refresh);
    refresh();
  }

  /* ------------------------------------------------------------------ */
  /* EventChannel streaming bağlayıcıları                                */
  /* ------------------------------------------------------------------ */
  function bindEventStream() {
    api.on('event:token', (d) => {
      if (!d || !d.sessionId) return;
      appendToAgentBubble(d.sessionId, 'token', d.delta || '');
    });
    api.on('event:thinking', (d) => {
      if (!d || !d.sessionId) return;
      appendToAgentBubble(d.sessionId, 'thinking', d.delta || '');
    });
    api.on('event:tool-call', (d) => {
      if (!d || !d.sessionId) return;
      appendToolCallToAgentBubble(d.sessionId, d.name || 'araç', d.args || '');
    });
    api.on('event:tool-result', (d) => {
      if (!d || !d.sessionId) return;
      appendToolResultToAgentBubble(d.sessionId, d.ok ? 'tamamlandı' : 'hata', d.error || d.content || '');
    });
  }

  /*
   * Agent balonuna akış içeriğini ekler. Eski app.js'in balon yapısına
   * uyumlu: .agent-bubble[data-session-id] içine .bubble-stream-body koyar.
   */
  function appendToAgentBubble(sessionId, kind, text) {
    const bubbles = document.querySelectorAll(`.agent-bubble[data-session-id="${sessionId}"]`);
    const bubble = bubbles.length ? bubbles[bubbles.length - 1] : null;
    if (!bubble) return;
    let body = bubble.querySelector('.bubble-stream-body');
    if (!body) {
      body = h('div', { className: 'bubble-stream-body' });
      bubble.appendChild(body);
    }
    if (kind === 'thinking') {
      let t = body.querySelector('.stream-thinking');
      if (!t) {
        t = h('div', { className: 'stream-thinking' }, 'Düşünüyor… ');
        body.appendChild(t);
      }
      t.textContent = 'Düşünüyor… ' + (body._thinkingText = (body._thinkingText || '') + text);
      return;
    }
    let t = body.querySelector('.stream-text');
    if (!t) {
      t = h('div', { className: 'stream-text' });
      body.appendChild(t);
    }
    t.textContent = (t.textContent || '') + text;
    const chatArea = $('#chat-area');
    if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
  }

  function appendToolCallToAgentBubble(sessionId, name, argsSnippet) {
    const bubbles = document.querySelectorAll(`.agent-bubble[data-session-id="${sessionId}"]`);
    const bubble = bubbles.length ? bubbles[bubbles.length - 1] : null;
    if (!bubble) return;
    let body = bubble.querySelector('.bubble-stream-body');
    if (!body) {
      body = h('div', { className: 'bubble-stream-body' });
      bubble.appendChild(body);
    }
    body.appendChild(h('div', { className: 'stream-tool' }, `${iconSvg('icon-wrench')} ${esc(name)} ${argsSnippet ? '(' + esc(String(argsSnippet).slice(0, 80)) + ')' : ''}`));
  }

  function appendToolResultToAgentBubble(sessionId, label, detail) {
    const bubbles = document.querySelectorAll(`.agent-bubble[data-session-id="${sessionId}"]`);
    const bubble = bubbles.length ? bubbles[bubbles.length - 1] : null;
    if (!bubble) return;
    let body = bubble.querySelector('.bubble-stream-body');
    if (!body) {
      body = h('div', { className: 'bubble-stream-body' });
      bubble.appendChild(body);
    }
    body.appendChild(h('div', { className: `stream-tool-result ${label === 'hata' ? 'stream-tool-error' : ''}` }, `${label === 'hata' ? 'Hata:' : 'Tamamlandı:'} ${esc(detail || label)}`));
  }

  /* ------------------------------------------------------------------ */
  /* /image komutu (görsel üretimi)                                      */
  /* ------------------------------------------------------------------ */
  function tryImageCommand(text) {
    const m = /^\/image(?:\s+(?:"(.+)"|(\S.+)))?$/i.exec(text.trim());
    if (!m) return null;
    const prompt = m[1] || m[2] || '';
    return prompt;
  }

  async function handleGenerateImage(prompt) {
    try {
      toast('Görsel üretiliyor…', 'info');
      const res = await v3.invoke('generate-image', { prompt, provider: 'openai', size: '1024x1024' });
      if (res && res.ok && res.data) {
        const chatArea = $('#chat-area');
        const card = h('div', { className: 'image-result-card' });
        card.appendChild(h('img', { src: res.data, alt: esc(prompt), className: 'image-result-img' }));
        card.appendChild(h('div', { className: 'image-result-caption' }, esc(prompt)));
        chatArea.appendChild(card);
        chatArea.scrollTop = chatArea.scrollHeight;
      } else {
        toast('Görsel üretilemedi: ' + (res && res.error ? res.error : ''), 'error');
      }
    } catch (err) {
      toast('Görsel üretimi sırasında hata: ' + String(err.message || err), 'error');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Araç kullanım paneli (tools-list / tool-execute)                    */
  /* ------------------------------------------------------------------ */
  async function renderToolExecutionPanel() {
    const pane = $('#ttab-tools-exec');
    if (!pane) return;
    pane.innerHTML = '';
    pane.appendChild(h('p', { className: 'keys-note' }, 'Ajan araçlarını el ile çağırmak için bu paneli kullanın. Write/exec katmanındaki araçlar kullanıcı onayı ister.'));
    const select = h('select', { id: 'tool-select', className: 'text-input full-w' });
    pane.appendChild(select);
    const argsArea = h('textarea', { id: 'tool-args-input', className: 'text-input ta-md full-w', placeholder: '{"path": "deneme.txt", "content": "…"}' });
    pane.appendChild(argsArea);
    const runBtn = h('button', { id: 'btn-tool-run', className: 'primary-btn full-w', type: 'button' }, 'Çalıştır');
    pane.appendChild(runBtn);
    const outEl = h('pre', { id: 'tool-exec-output', className: 'tool-exec-output' });
    pane.appendChild(outEl);

    async function refreshTools() {
      select.innerHTML = '';
      try {
        const res = await v3.invoke('tools-list');
        const items = (res && res.ok && Array.isArray(res.tools)) ? res.tools : [];
        for (const t of items) {
          select.appendChild(h('option', { value: t.name }, `${t.display_name || t.name} [${t.tier}]`));
        }
      } catch {
        select.appendChild(h('option', {}, 'Yüklenemedi'));
      }
    }
    refreshTools();

    runBtn.addEventListener('click', async () => {
      const name = select.value;
      let args = {};
      try {
        args = argsArea.value.trim() ? JSON.parse(argsArea.value) : {};
      } catch {
        toast('Argüman JSON değil', 'error');
        return;
      }
      outEl.textContent = 'Çalışıyor…';
      const res = await v3.invoke('tool-execute', { name, args });
      if (res && res.error) {
        outEl.textContent = `[HATA] ${res.error}${res.content ? ': ' + res.content : ''}`;
      } else {
        outEl.textContent = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Kurulum: DOM'a enjekte et ve bağla                                  */
  /* ------------------------------------------------------------------ */
  function mount() {
    // 1. Araç onay modalı
    document.body.appendChild(buildApprovalModal());
    $('#btn-approval-approve').addEventListener('click', () => sendApprovalDecision(true));
    $('#btn-approval-reject').addEventListener('click', () => sendApprovalDecision(false));
    Array.from(document.querySelectorAll('#tool-approval-modal .modal-x, #tool-approval-modal .modal-bg')).forEach((x) =>
      x.addEventListener('click', () => sendApprovalDecision(false)),
    );

    // 2. Tool onay akışı yakalayıcı
    api.on('tool-approval-request', (d) => {
      if (!d) return;
      pendingApproval = d;
      $('#approval-tool-name').textContent = d.tool || 'Bilinmeyen araç';
      $('#approval-args').textContent = JSON.stringify(d.args || {}, null, 2).slice(0, 4000);
      $('#tool-approval-modal').classList.remove('hidden');
    });

    // 3. Oturumlar bölümü (sidebar'a, agents bölümünden sonra)
    const sidebar = $('#sidebar');
    if (sidebar) {
      const agentSec = sidebar.querySelector('.sidebar-section');
      const sessionsSec = buildSessionsSection();
      if (agentSec && agentSec.nextSibling) {
        sidebar.insertBefore(sessionsSec, agentSec.nextSibling);
      } else {
        sidebar.insertBefore(sessionsSec, sidebar.firstChild);
      }
      $('#btn-new-session').addEventListener('click', () => {
        v3.invoke('session-save', { title: `Oturum ${new Date().toLocaleString('tr-TR')}` }).then(() => {
          toast('Oturum kaydedildi', 'info');
          refreshSessions();
        });
      });
      refreshSessions();
    }

    // 4. Yeni sekmeler (tools-panel)
    const toolsTabs = $('.tools-tabs');
    if (toolsTabs) {
      buildNewTabs().forEach((t) => toolsTabs.appendChild(t));
    }
    const toolsPanel = $('#tools-panel');
    if (toolsPanel) {
      toolsPanel.appendChild(h('div', { className: 'ttab-pane', id: 'ttab-workflows' }));
      toolsPanel.appendChild(h('div', { className: 'ttab-pane', id: 'ttab-memory' }));
      toolsPanel.appendChild(h('div', { className: 'ttab-pane', id: 'ttab-plugins' }));
      toolsPanel.appendChild(h('div', { className: 'ttab-pane', id: 'ttab-audit' }));
      toolsPanel.appendChild(h('div', { className: 'ttab-pane', id: 'ttab-tools-exec' }));
      // Sekme geçişlerine yeni id'leri de dahil et
      document.querySelectorAll('.ttab').forEach((b) => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.ttab').forEach((x) => x.classList.toggle('active', x === b));
          document.querySelectorAll('.ttab-pane').forEach((p) =>
            p.classList.toggle('active', p.id === `ttab-${b.dataset.ttab}`),
          );
        });
      });
      renderWorkflowPanel();
      renderMemoryPanel();
      renderPluginsPanel();
      renderAuditPanel();
      renderToolExecutionPanel();
    }

    // 5. Streaming bağla
    bindEventStream();

    // 6. /image komutunu mesaj kutusuna bağla (Enter'a basmadan önce kontrol)
    const input = $('#msg-input');
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          const prompt = tryImageCommand(input.value);
          if (prompt !== null) {
            e.preventDefault();
            e.stopImmediatePropagation();
            input.value = '';
            handleGenerateImage(prompt);
          }
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
