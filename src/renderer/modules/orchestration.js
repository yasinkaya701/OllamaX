/*
 * orchestration.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

async function initOrchestration() {
  await discoverOrchAgents();
  q('#btn-orch-discover')?.addEventListener('click', () => void discoverOrchAgents());
  q('#btn-orch-run')?.addEventListener('click', () => void runOrchChain());
  buildOrchChainToggles();
}

async function discoverOrchAgents() {
  if (!api) return;
  try {
    const res = await api.invoke('agent-discover-all');
    if (res?.ok && res.agents) {
      orchAgents = res.agents;
      api.send('agent-discover', res.agents);
    }
  } catch {
    /* sessionda görünecek */
  }
}

function renderOrchestrationAgents(agents) {
  const box = q('#orch-agents');
  if (!box) return;
  box.innerHTML = '';
  const entries = Object.entries(agents);
  if (!entries.length) {
    box.innerHTML = '<div class="empty-note">Ajan bulunamadı.</div>';
    return;
  }
  entries.forEach(([id, info]) => {
    const row = document.createElement('div');
    row.className = 'orch-agent-row';
    row.innerHTML = `
      <span class="oa-status ${info.reachable ? 'up' : ''}" title="${info.reachable ? 'Erişilebilir' : 'Erişilemiyor'}"></span>
      <span class="oa-label">${esc(info.label || id)}</span>
      <span class="oa-sub">${info.executable ? esc(info.executable) : '—'}</span>
    `;
    box.appendChild(row);
  });
  buildOrchChainToggles();
}

function buildOrchChainToggles() {
  const box = q('#orch-chain-toggles');
  if (!box) return;
  box.innerHTML = '';
  ORCH_CHAIN_ORDER.forEach((id) => {
    const info = orchAgents[id];
    const available = info?.reachable;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `orch-chain-toggle${orchChainActive.includes(id) ? ' active' : ''}`;
    btn.disabled = !available;
    btn.textContent = info?.label || id;
    btn.title = available ? `${info.label} — zincire ekle` : `${info?.label || id} — kurulu değil`;
    btn.addEventListener('click', () => {
      const idx = orchChainActive.indexOf(id);
      if (idx >= 0) {
        orchChainActive.splice(idx, 1);
      } else {
        orchChainActive.push(id);
      }
      buildOrchChainToggles();
    });
    box.appendChild(btn);
  });
  buildOrchHeadSelect();
}

/* V3.16 (F3-2): şef ajan seçim listesini zincirdeki aktif ajanlara göre doldur */
function buildOrchHeadSelect() {
  const sel = q('#orch-head-agent');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '';
  ORCH_CHAIN_ORDER.forEach((id) => {
    const info = orchAgents[id];
    const active = orchChainActive.includes(id);
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = (info?.label || id) + (active ? '' : ' (devre dışı)');
    opt.disabled = !active;
    sel.appendChild(opt);
  });
  if (orchChainActive.length && orchChainActive.includes(prev)) sel.value = prev;
  else if (orchChainActive.length) sel.value = orchChainActive[0];
  else sel.value = ORCH_CHAIN_ORDER[0];
}

async function runOrchChain() {
  if (!api || orchChainActive.length < 1) {
    toast('Zincire en az bir ajan ekleyin (tıkla: Claude Code, Codex, Antigravity)', 'warn');
    return;
  }
  const task = q('#orch-task')?.value.trim();
  if (!task) {
    toast('Görev girin', 'warn');
    return;
  }
  const btn = q('#btn-orch-run');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Çalışıyor…'; }

  /* Chat alanına "Orkestra şefi başlatıldı" mesajı */
  addUserBubble(`Orkestrasyon zinciri başlatıldı: ${orchChainActive.map((id) => orchAgents[id]?.label || id).join(' → ')}`);
  state.history.push({ role: 'user', content: `[Orkestrasyon] Zincir: ${orchChainActive.join(' → ')} — Görev: ${task}` });
  appendStreamCard('SYSTEM', `Zincir başlatıldı: ${orchChainActive.map((id) => orchAgents[id]?.label || id).join(' → ')}`);

  /* V3.16 (F3-2): şef ajan seçimi + prompt forwarding bayrağı */
  const headSel = q('#orch-head-agent');
  let headAgent = headSel && headSel.value ? headSel.value : orchChainActive[0];
  if (headAgent && !orchChainActive.includes(headAgent)) headAgent = orchChainActive[0];
  const forwardPrompt = !!(q('#orch-forward-prompt')?.checked);
  api.send('agent-chain', { order: [...orchChainActive], task, forwardPrompt, headAgent });
}

function handleOrchOutput(d) {
  const label = orchAgents[d.agentId]?.label || d.agentId;
  if (d.result?.ok) {
    const steps = d.result.steps || [];
    const text = steps.map((s) => (typeof s === 'string' ? s : s.text)).filter(Boolean).join('\n') || 'Bilgi alındı.';
    appendStreamCard(label, text);
  } else {
    appendStreamCard(label, `❌ ${d.result?.error || 'Hata'}`);
  }
}

function handleOrchChainProgress(d) {
  if (d.done) {
    const btn = q('#btn-orch-run');
    if (btn) { btn.disabled = false; btn.textContent = '▶ Zincir Çalıştır'; }
    if (d.error) {
      appendStreamCard('SYSTEM', `❌ Zincir hata: ${d.error}`);
    } else if (d.result) {
      const ok = d.result.ok;
      appendStreamCard('SYSTEM', ok ? `✅ Zincir tamamlandı (${d.result.steps?.length || 0} ajan)` : '❌ Zincir hatalı sonlandı');
      state.history.push({ role: 'assistant', content: `[Orkestrasyon tamamlandı] ok=${ok}` });
    }
    save();
    return;
  }
  if (d.text && d.agent) {
    let txt = d.text;
    try { txt = JSON.parse(txt); } catch { /* zaten metin */ }
    const label = orchAgents[d.agent]?.label || d.agent;
    if (typeof txt === 'object' && txt.steps) {
      txt.steps.forEach((s) => {
        const t = typeof s === 'string' ? s : s.text;
        if (t) appendStreamCard(label, t);
      });
    } else if (typeof txt === 'string') {
      appendStreamCard(label, txt);
    }
  }
}

function appendStreamCard(agentLabel, text) {
  const chat = q('#chat-area');
  if (!chat) return;
  const card = document.createElement('div');
  card.className = 'orch-stream-card';
  card.innerHTML = `<div class="osc-agent">${esc(agentLabel)}</div><div class="osc-body" style="white-space:pre-wrap;">${esc(text)}</div>`;
  chat.appendChild(card);
  chat.scrollTop = chat.scrollHeight;
}

