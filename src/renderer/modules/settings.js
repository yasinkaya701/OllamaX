/*
 * settings.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

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
  state.settings['openrouter'] = (q('#openrouter-key').value || '').trim();
  state.settings['xai'] = (q('#xai-key').value || '').trim();
  state.settings['mistral'] = (q('#mistral-key').value || '').trim();
  state.settings['deepseek'] = (q('#deepseek-key').value || '').trim();
  state.settings['cohere'] = (q('#cohere-key').value || '').trim();
  state.settings['perplexity'] = (q('#perplexity-key').value || '').trim();
  state.settings['together'] = (q('#together-key').value || '').trim();
  state.settings['groq'] = (q('#groq-key').value || '').trim();
  state.settings['cerebras'] = (q('#cerebras-key').value || '').trim();
  state.settings['fireworks'] = (q('#fireworks-key').value || '').trim();
  state.settings['replicate'] = (q('#replicate-key').value || '').trim();
  state.settings.azureEndpoint = (q('#azure-endpoint').value || '').trim();
  state.settings.azureApiKey = (q('#azure-key').value || '').trim();
  state.settings.bedrockRegion = (q('#bedrock-region').value || '').trim();
  state.settings.bedrockAccessKeyId = (q('#bedrock-access-key').value || '').trim();
  state.settings.bedrockSecretAccessKey = (q('#bedrock-secret-key').value || '').trim();
  state.settings.lmstudioEndpoint = (q('#lmstudio-endpoint').value || '').trim();
  state.settings.customEndpoint = (q('#custom-endpoint').value || '').trim();
  state.settings.customApiKey = (q('#custom-key').value || '').trim();
  state.settings['manus'] = (q('#manus-key').value || '').trim();
  save();
  updateApiDots();
  log('API keys saved ✓', 'success');
  toast('API anahtarları kaydedildi · modeller güncelleniyor', 'success');
  await bootstrapCloudModels();
  buildApiModelRows();
  populateModelSelect(state.currentProvider);
}

/* V3.15 (A2-2): maliyet ve bütçe panelini yeniler */
const COST_COMPARE = { cursorPro: 40, claudeMax: 200 }; // $/ay sabit karşılaştırma referansları
async function refreshCostPanel() {
  const totalEl = q('#cost-total-amount');
  const monthEl = q('#cost-month-label');
  const rowsEl = q('#cost-provider-rows');
  const inputsEl = q('#cost-budget-inputs');
  if (!api || !totalEl) return;
  try {
    const [totalsRes, budgetsRes] = await Promise.all([
      api.invoke('cost-totals', {}),
      api.invoke('cost-budgets-get', {}),
    ]);
    const totals = totalsRes?.ok ? totalsRes : { total: 0, byProvider: {}, requests: 0 };
    const budgets = (budgetsRes?.ok && budgetsRes.budgets) ? budgetsRes.budgets : {};
    if (monthEl) monthEl.textContent = totals.month || '';
    totalEl.textContent = totals.total > 0 ? `≈$${totals.total.toFixed(2)}` : '$0 · kullanım yok';
    /* A2-2 karşılaştırma kartı */
    if (rowsEl) {
      const alt = COST_COMPARE.cursorPro + COST_COMPARE.claudeMax;
      rowsEl.innerHTML = '';
      for (const [p, v] of Object.entries(totals.byProvider || {})) {
        const ratio = Number(budgets[p]) > 0 ? (v.cost / budgets[p]) : 0;
        const div = h('div', { className: 'cost-provider-row' });
        div.innerHTML = `<span class="cpr-name">${esc(p)}</span><span class="cpr-nums">≈$${v.cost.toFixed(2)} · ${v.requests} istek${Number(budgets[p]) > 0 ? ` · limit $${Number(budgets[p])}` : ''}</span>${ratio > 0 ? `<div class="cpr-bar-track"><div class="cpr-bar-fill${ratio >= 1 ? ' cpr-over' : ratio >= 0.8 ? ' cpr-warn' : ''}" style="width:${Math.min(100, ratio * 100).toFixed(0)}%"></div></div>` : ''}`;
        rowsEl.appendChild(div);
      }
      if (totals.total > 0) {
        const cmp = h('div', { className: 'cost-compare-note' });
        cmp.textContent = `Aynı dönemde aynı sağlayıcılar klasik planlarla (Cursor Pro + Claude Max) ≈$${alt}/ay olurdu.`;
        rowsEl.appendChild(cmp);
      } else if (!rowsEl.querySelector('.cost-provider-row')) {
        const note = h('div', { className: 'empty-note' });
        note.textContent = 'Bu ay için kayıtlanan kullanım yok.';
        rowsEl.appendChild(note);
      }
    }
    /* bütçe inputları */
    if (inputsEl) {
      const providers = ['openai', 'anthropic', 'gemini', 'openrouter', 'xai', 'mistral', 'deepseek', 'groq', 'cerebras', 'fireworks', 'together', 'cohere', 'perplexity', 'replicate', 'azure', 'aws-bedrock'];
      inputsEl.innerHTML = '';
      for (const p of providers) {
        const v = budgets[p] || '';
        const div = h('div', {});
        div.innerHTML = `<label style="font-size:11px;color:var(--v3-text-muted)">${p} $/ay</label><input type="number" min="1" step="1" placeholder="limit yok" data-provider="${p}" value="${v !== '' ? Number(v) : ''}" class="text-input">`;
        inputsEl.appendChild(div);
      }
    }
  } catch {
    if (totalEl) totalEl.textContent = '—';
  }
}

/* V3.14 (A1) + V3.15: güvenlik durumu panelini yeniler */
async function refreshSecurityPanel() {
  const vaultEl = q('#security-vault-value');
  const netEl = q('#security-network-value');
  const chips = qa('#security-mode-chips .theme-chip');
  // v3.18.1: Linux'ta keyring daemon yokken keytar çağrısı asla tamamlanmaz —
  // 2.5 sn zaman aşımı ile 'okunamadı' durumuna düşür (sonsuz 'Yükleniyor…' bug'ının önü).
  const withTimeout = (promise, ms = 2500) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  if (!api) return;
  try {
    const [vaultRes, netRes] = await Promise.all([
      withTimeout(api.invoke('vault-status', {})),
      withTimeout(api.invoke('network-mode-get', {})),
    ]);
    if (vaultEl) {
      const mode = vaultRes?.mode || 'memory';
      const label = mode === 'keychain' ? '✓ OS keychain (kasa aktif)' : mode === 'memory' ? '⚠ Yalnızca bellek (keytar yok)' : '✗ Kapalı';
      vaultEl.textContent = label;
      vaultEl.className = `security-value ${mode === 'keychain' ? 'sec-ok' : 'sec-warn'}`;
    }
    if (netEl) {
      const mode = netRes?.mode || 'normal';
      netEl.textContent = mode === 'local-only' ? '🔒 Air-gapped — yalnız yerel' : 'Normal — bulut açık';
      netEl.className = `security-value ${mode === 'local-only' ? 'sec-ok' : ''}`;
      chips.forEach((c) => c.classList.toggle('active', c.dataset.netmode === mode));
    }
  } catch {
    if (vaultEl) vaultEl.textContent = 'okunamadı';
    if (netEl) netEl.textContent = 'okunamadı';
  }
}

/* V3.1: Ayarlar modalı açıldığında mevcut tema/yoğunluk seçili çipleri işaretler */
function refreshAppearanceSettings() {
  // v3.18.1: 'system' modu OS şemasıyla eşleşir; aktif çipi ona göre işaretle
  let theme = window.Krevyx?.theme?.current?.() || 'dark';
  if (theme === 'system') theme = window.Krevyx?.theme?.effectiveSystemTheme?.() || 'dark';
  qa('#settings-theme-chips .theme-chip').forEach((c) => c.classList.toggle('active', c.dataset.theme === theme));
  const density = window.Krevyx?.layout?.get?.().density || 'comfortable';
  qa('#settings-density-chips .theme-chip').forEach((c) => c.classList.toggle('active', c.dataset.density === density));
}

/* V3.7 davranış profilleri: preset → model parametresi eşleşmesi */
const BEHAVIOR_PROFILES = {
  precise: { temperature: 0.3, top_p: 1, max_tokens: 8192 },
  balanced: { temperature: 0.7, top_p: 1, max_tokens: 8192 },
  creative: { temperature: 1.2, top_p: 0.95, max_tokens: 8192 },
  fast: { temperature: 0.2, top_p: 1, max_tokens: 2048 },
};
/* V3.8: main'den zengin MD profillerini çek (fallback: yerleşik parametre seti) */
let richProfiles = [];
async function loadRichProfiles() {
  if (!api || richProfiles.length) return;
  try {
    const res = await api.invoke('get-behavior-profiles');
    if (res?.ok && Array.isArray(res.profiles)) richProfiles = res.profiles;
  } catch {
    /* offline kal; yerleşik profiller kullan */
  }
}
function getProfileInfo(name) {
  const found = richProfiles.find((p) => p.id === name);
  if (found) return found;
  const built = BEHAVIOR_PROFILES[name];
  return built ? { id: name, label: BUILTIN_LABELS[name] || name, params: built, markdown: '' } : null;
}
const BUILTIN_LABELS = { precise: 'Hassas', balanced: 'Dengeli', creative: 'Yaratıcı', fast: 'Hızlı' };
function applyBehaviorProfile(name) {
  const info = getProfileInfo(name);
  const p = (info && info.params) || BEHAVIOR_PROFILES.precise;
  for (const k of ['temperature', 'top_p', 'max_tokens']) {
    state.settings.modelParams[k] = p[k];
    const el = q('#settings-' + k);
    if (el) el.value = p[k];
  }
  qa('#settings-profile-chips .theme-chip').forEach((c) => c.classList.toggle('active', c.dataset.profile === name));
}
function refreshAdvancedParams() {
  const mp = state.settings.modelParams || {};
  for (const k of ['temperature', 'top_p', 'max_tokens']) {
    const el = q('#settings-' + k);
    if (el && Number.isFinite(mp[k])) el.value = mp[k];
  }
  qa('#settings-profile-chips .theme-chip').forEach((c) => c.classList.toggle('active', c.dataset.profile === (state.settings.behaviorProfile || 'precise')));
  const label = q('#settings-behavior-label');
  if (label) label.textContent = state.settings.behaviorProfile || 'precise';
  syncAdvancedParamLabels();
}
function syncAdvancedParamLabels() {
  const tv = q('#settings-temperature'), pv = q('#settings-top_p'), mv = q('#settings-max_tokens');
  const tl = q('#adv-temp-val'), pl = q('#adv-top-p-val'), ml = q('#adv-max-val');
  if (tv && tl) tl.textContent = tv.value;
  if (pv && pl) pl.textContent = pv.value;
  if (mv && ml) ml.textContent = Number(mv.value).toLocaleString();
}
function setupAdvancedParamsListeners() {
  for (const k of ['temperature', 'top_p', 'max_tokens']) {
    const el = q('#settings-' + k);
    if (!el) continue;
    el.addEventListener('input', () => {
      syncAdvancedParamLabels();
      qa('#settings-profile-chips .theme-chip').forEach((c) => c.classList.remove('active'));
      const label = q('#settings-behavior-label');
      if (label) label.textContent = 'özel';
    });
  }
  qa('#settings-profile-chips .theme-chip').forEach((chip) => {
    chip.addEventListener('click', () => applyBehaviorProfile(chip.dataset.profile));
    chip.addEventListener('dblclick', () => showProfileDetail(chip.dataset.profile));
  });
}
setupAdvancedParamsListeners();

/* V3.8: Profil detay modalı — çift tıklayınca zengin MD profil kartı */
function showProfileDetail(name) {
  const info = getProfileInfo(name);
  if (!info) return;
  const box = q('#profile-detail-md') || createProfileDetailPanel();
  box.innerHTML = info.markdown ? md(info.markdown) : `<p>${info.tagline || ''}</p>`;
  const ttl = q('#profile-detail-title');
  if (ttl) ttl.textContent = `${info.label || name}${info.labelEn ? ` — ${info.labelEn}` : ''}`;
  const mp = info.params || BEHAVIOR_PROFILES[name] || {};
  const lbl = q('#profile-detail-params');
  if (lbl) lbl.textContent = `temperature ${mp.temperature ?? '?'} · top_p ${mp.top_p ?? '?'} · max_tokens ${mp.max_tokens ?? '?'}`;
  q('#profile-detail-panel').classList.remove('hidden');
  if (q('#profile-detail-close')) q('#profile-detail-close').onclick = () => q('#profile-detail-panel').classList.add('hidden');
}
function createProfileDetailPanel() {
  const wrap = document.createElement('div');
  wrap.id = 'profile-detail-panel';
  wrap.className = 'profile-detail hidden';
  wrap.innerHTML = `
    <div class="profile-detail-inner">
      <div class="profile-detail-hdr">
        <h4 id="profile-detail-title">Profil</h4>
        <button id="profile-detail-close" class="modal-x" type="button">✕</button>
      </div>
      <div id="profile-detail-params" class="profile-detail-params"></div>
      <div id="profile-detail-md" class="profile-detail-md markdown-body"></div>
    </div>`;
  q('#settings-modal')?.appendChild(wrap);
  return q('#profile-detail-md');
}

async function saveSettings() {
  ensureOllamaMachines();
  await loadRichProfiles();
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

    // V3.1 görünüm ayarları: tema ve yoğunluk
  if (window.Krevyx?.theme) {
    const themeChip = q('#settings-theme-chips .theme-chip.active');
    if (themeChip?.dataset.theme) window.Krevyx.theme.apply(themeChip.dataset.theme);
  }
  if (window.Krevyx?.layout) {
    const densityChip = q('#settings-density-chips .theme-chip.active');
    if (densityChip?.dataset.density) window.Krevyx.layout.setDensity(densityChip.dataset.density);
  }
  // V3.7 model parametreleri ve davranış profili
  const profChip = q('#settings-profile-chips .theme-chip.active');
  state.settings.behaviorProfile = profChip?.dataset.profile || state.settings.behaviorProfile || 'precise';
  applyBehaviorProfile(state.settings.behaviorProfile);
  for (const k of ['temperature', 'top_p', 'max_tokens']) {
    const el = q('#settings-' + k);
    if (el && Number.isFinite(Number(el.value))) state.settings.modelParams[k] = Number(el.value);
  }
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
  for (const pid of CLOUD_PROVIDERS.filter((x) => x !== 'openai' && x !== 'anthropic' && x !== 'gemini')) {
    const has = pid === 'aws-bedrock'
      ? !!(state.settings.bedrockRegion && state.settings.bedrockAccessKeyId && state.settings.bedrockSecretAccessKey)
      : pid === 'azure' ? !!(state.settings.azureEndpoint && state.settings.azureApiKey)
        : pid === 'lmstudio' ? !!state.settings.lmstudioEndpoint
          : pid === 'custom' ? !!state.settings.customEndpoint
            : !!state.settings[pid];
    set('dot-' + pid, has);
  }
}

/* v3.18.1: Ollama/geri uç durumu — sessiz gönderme hatasını engeller.
 * `state.backendHealthy` son sağlık kontrolünden gelir; bilinmiyorsa bir kez
 * senkron şekilde doğrulanır (zaman aşımına karşı race'li). */
let backendHealthy = null;
function getBackendHealthy() {
  return backendHealthy;
}
async function preflightBackend() {
  if (!api) return true;
  try {
    const h = await Promise.race([
      api.invoke('app-health', { ollamaHost: defaultOllamaHost() }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health-timeout')), 3000)),
    ]);
    backendHealthy = Boolean(h?.ollamaReachable) && Number(h?.modelCount || 0) > 0;
    return backendHealthy;
  } catch {
    backendHealthy = false;
    return false;
  }
}

