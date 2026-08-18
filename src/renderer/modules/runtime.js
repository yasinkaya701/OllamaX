/*
 * runtime.js — Krevyx v3.26 Ajan Çalıştırma paneli (runtime)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initRuntimePanel() {
  buildRuntimeSection();
  q('#rt-btn-run')?.addEventListener('click', () => void runTask());
  q('#rt-btn-stop')?.addEventListener('click', () => void stopTask());
}

function buildRuntimeSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#rt-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'rt-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Ajan Çalıştırıcı</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="rt-zone">
      <label class="rt-label">Görev (otonom döngü)</label>
      <textarea id="rt-prompt" class="text-input ta-sm" rows="4" placeholder="Örn: README.md'i güncelle, testleri çalıştır, sonucu değerlendir"></textarea>
      <div class="rt-actions">
        <button type="button" id="rt-btn-run" class="small-btn rt-primary-btn">▶ Çalıştır</button>
        <button type="button" id="rt-btn-stop" class="small-btn">■ Durdur</button>
      </div>
      <div id="rt-status" class="rt-status hidden"></div>
      <div id="rt-output" class="rt-output hidden"></div>
    </div>`;
  const existing = q('#pl-section') || q('#acc-orchestration');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setRtStatus(html, type) {
  const s = q('#rt-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `rt-status rt-${type || 'info'}`;
  s.textContent = html || '';
}

async function runTask() {
  const prompt = q('#rt-prompt')?.value || '';
  if (!prompt.trim()) { setRtStatus('Görev metni gerekli', 'error'); return; }
  setRtStatus('Görev başlatılıyor…', 'info');
  const out = q('#rt-output');
  if (out) { out.classList.add('hidden'); out.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:runtime:run', { prompt, opts: {} });
    if (out) { out.classList.remove('hidden'); out.textContent = res && (res.output || JSON.stringify(res)) ? JSON.stringify(res) : 'Yanıt yok'; }
    setRtStatus(res && res.ok ? 'Tamamlandı' : 'Başarısız', res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setRtStatus('Çalıştırma hatası: ' + esc(String(e)), 'error');
  }
}

async function stopTask() {
  setRtStatus('Durdurma sinyali gönderildi', 'info');
}

window.addEventListener('DOMContentLoaded', () => void initRuntimePanel());
