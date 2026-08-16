/* V3.18: Profil paketi, ajan-MCP atamaları ve denetim export'u panelleri */
'use strict';
(function () {
  const api = window.api;
  const q = (sel) => document.querySelector(sel);
  function toast(msg, type) {
    if (typeof window.toast === 'function') return window.toast(msg, type);
    const el = q('#toast, .toast');
    if (el) {
      el.textContent = msg;
      el.className = `${el.className.split(' ')[0]} ${type || 'info'}`;
      el.classList.remove('hidden');
      setTimeout(() => el.classList.add('hidden'), 4000);
    }
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ------------------ Profil paketi ------------------ */

  async function profileExportDialog() {
    try {
      const res = await api.invoke('ipc:3:profile-export', {});
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Dışa aktarma başarısız.');
      const payload = JSON.stringify(res.package, null, 2);
      const r = await api.invoke('export-to-path', { defaultName: 'krevyx-studio.krevyxprofile', content: payload });
      if (r && r.ok) {
        toast(`Paket dışa aktarıldı: krevyx-studio.krevyxprofile`, 'success');
      } else {
        /* export-to-path yoksa panoya kopyala */
        await navigator.clipboard.writeText(payload);
        toast('Paket panoya kopyalandı; bir dosyaya yapıştırın.', 'success');
      }
    } catch (err) {
      toast(`Hata: ${err.message}`, 'error');
    }
  }

  async function profileImportDialog() {
    try {
      const text = prompt('Yapıştırmak istediğiniz .krevyxprofile paketinin içeriğini (JSON) girin:');
      if (!text) return;
      const payload = JSON.parse(text);
      const res = await api.invoke('ipc:3:profile-import', { payload });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'İçe aktarma başarısız.');
      const { templates = 0, agents = 0, providers = 0, mcpServers = 0 } = res.imported || {};
      toast(`Paket içe aktarıldı: ${templates} şablon, ${agents} ajan, ${providers} sağlayıcı, ${mcpServers} MCP`, 'success');
      if (typeof refreshEcosystemPanels === 'function') refreshEcosystemPanels();
    } catch (err) {
      toast(`Hata: ${err.message}`, 'error');
    }
  }

  /* ------------------ Ajan-MCP atamaları ------------------ */

  let mcpSetsState = {};
  let mcpServerNames = [];
  let mcpAgents = [];

  async function loadMcpAgentSets() {
    try {
      const [setsRes, serversRes, agentsRes] = await Promise.all([
        api.invoke('ipc:3:mcp-agent-sets-get', {}),
        api.invoke('ipc:3:mcp-servers', {}),
        api.invoke('ipc:3:orchestra-discover', {}),
      ]);
      mcpSetsState = (setsRes && setsRes.ok && setsRes.sets) ? setsRes.sets : {};
      mcpServerNames = ((serversRes && serversRes.ok && serversRes.servers) || []).map((s) => s && s.name).filter(Boolean);
      const orchAgents = (agentsRes && agentsRes.ok && agentsRes.agents) || {};
      mcpAgents = Object.keys(orchAgents).length ? Object.keys(orchAgents) : ['ollama'];
      renderMcpAgentSets();
    } catch {
      /* sessiz başarısız — panel boş görünür */
    }
  }

  function renderMcpAgentSets() {
    const host = q('#settings-mcp-agent-sets');
    if (!host) return;
    if (!mcpServerNames.length) {
      host.innerHTML = '<div class="empty-note">Henüz kayıtlı MCP sunucusu yok. Sunucu ekledikten sonra atayabilirsiniz.</div>';
      return;
    }
    let html = '<div style="font-size:11px;display:grid;gap:4px">';
    html += `<div style="display:grid;grid-template-columns:110px repeat(${mcpServerNames.length}, 34px);gap:4px;align-items:center;font-weight:600">`;
    html += '<span>Ajan \\ Sunucu</span>';
    for (const n of mcpServerNames) html += `<span title="${esc(n)}" style="text-align:center;overflow:hidden;text-overflow:ellipsis">${esc(n).slice(0, 10)}</span>`;
    html += '</div>';
    for (const a of mcpAgents) {
      html += `<div style="display:grid;grid-template-columns:110px repeat(${mcpServerNames.length}, 34px);gap:4px;align-items:center">`;
      html += `<span style="overflow:hidden;text-overflow:ellipsis" title="${esc(a)}">${esc(a)}</span>`;
      const assigned = Array.isArray(mcpSetsState[a]) ? mcpSetsState[a] : null;
      for (const n of mcpServerNames) {
        const checked = assigned ? (assigned.includes(n) ? 'checked' : '') : '';
        const disabled = assigned ? '' : 'disabled title="Atanmamış — tüm sunucular görünür"';
        html += `<label style="text-align:center"><input type="checkbox" data-mcp-agent="${esc(a)}" data-mcp-server="${esc(n)}" ${checked} ${disabled}></label>`;
      }
      html += '</div>';
    }
    html += '</div>';
    host.innerHTML = html;
  }

  async function saveMcpAgentSets() {
    const sets = {};
    for (const cb of document.querySelectorAll('#settings-mcp-agent-sets input[type=checkbox]')) {
      const agent = cb.dataset.mcpAgent;
      const server = cb.dataset.mcpServer;
      if (cb.checked) (sets[agent] = sets[agent] || []).push(server);
    }
    try {
      const res = await api.invoke('ipc:3:mcp-agent-sets-set', { sets });
      if (res && res.ok) {
        mcpSetsState = res.sets || {};
        renderMcpAgentSets();
        toast('Ajan-MCP atamaları kaydedildi.', 'success');
      } else throw new Error(res && res.error ? res.error : 'Kaydedilemedi.');
    } catch (err) {
      toast(`Hata: ${err.message}`, 'error');
    }
  }

  /* ------------------ Denetim export'u ------------------ */

  function downloadString(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function auditExport(format) {
    try {
      const res = await api.invoke('ipc:3:audit-export', { format });
      if (!res || !res.ok) throw new Error(res && res.error ? res.error : 'Dışa aktarma başarısız.');
      if (format === 'json') downloadString(`krevyx-audit.json`, JSON.stringify(res.payload, null, 2), 'application/json');
      else if (format === 'csv') downloadString(`krevyx-audit.csv`, res.payload, 'text/csv');
      else downloadString(`krevyx-audit.sarif.json`, JSON.stringify(res.payload, null, 2), 'application/json');
      toast(`${res.count || 0} denetim satırı dışa aktarıldı (${format.toUpperCase()}).`, 'success');
    } catch (err) {
      toast(`Hata: ${err.message}`, 'error');
    }
  }

  /* ------------------ Bağlama ------------------ */

  function bindAll() {
    q('#btn-profile-export')?.addEventListener('click', profileExportDialog);
    q('#btn-profile-import')?.addEventListener('click', profileImportDialog);
    q('#btn-mcp-sets-save')?.addEventListener('click', saveMcpAgentSets);
    q('#btn-audit-export-json')?.addEventListener('click', () => auditExport('json'));
    q('#btn-audit-export-csv')?.addEventListener('click', () => auditExport('csv'));
    q('#btn-audit-export-sarif')?.addEventListener('click', () => auditExport('sarif'));
  }

  function init() {
    if (!api) return;
    bindAll();
    // Ayarlar modalı her açıldığında MCP atama listesini yenile
    const modal = q('#settings-modal');
    if (modal) {
      const obs = new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) loadMcpAgentSets();
      });
      obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
