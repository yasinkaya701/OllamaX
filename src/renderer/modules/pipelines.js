/*
 * pipelines.js — Krevyx v3.26 DAG Pipeline paneli (orch/pipelines)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono.
 * Global kapsam: api, q, toast, esc.
 */
async function initPipelinesPanel() {
  buildPipelinesSection();
  q('#pp-btn-run')?.addEventListener('click', () => void runPipeline());
  q('#pp-btn-sample')?.addEventListener('click', () => void loadSample());
}

function buildPipelinesSection() {
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  if (q('#pp-section')) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'pp-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">DAG Pipeline</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="pp-zone">
      <label class="pp-label">Pipeline tanımı (JSON)</label>
      <textarea id="pp-spec" class="text-input ta-sm ta-mono" rows="6" placeholder='{"nodes":[{"id":"a"},{"id":"b","deps":["a"]}]}'></textarea>
      <div class="pp-actions">
        <button type="button" id="pp-btn-run" class="small-btn pp-primary-btn">▶ Çalıştır</button>
        <button type="button" id="pp-btn-sample" class="small-btn">⌘ Örnek</button>
      </div>
      <div id="pp-status" class="pp-status hidden"></div>
      <div id="pp-report" class="pp-report hidden"></div>
    </div>`;
  const existing = q('#rt-section') || q('#pl-section');
  if (existing && existing.parentNode) {
    existing.parentNode.insertBefore(details, existing.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

function setPpStatus(html, type) {
  const s = q('#pp-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `pp-status pp-${type || 'info'}`;
  s.textContent = html || '';
}

function loadSample() {
  const spec = q('#pp-spec');
  if (!spec) return;
  spec.value = JSON.stringify({
    name: 'ornek-cekirdek',
    nodes: [
      { id: 'setup', prompt: 'Ortamı hazırla', steps: 1 },
      { id: 'lint', prompt: 'Lint çalıştır', deps: ['setup'], steps: 2 },
      { id: 'build', prompt: 'Derle', deps: ['setup'], steps: 3 },
      { id: 'test', prompt: 'Testleri çalıştır', deps: ['lint', 'build'], steps: 4 },
      { id: 'report', prompt: 'Rapor topla', deps: ['test'], steps: 5 },
    ],
  }, null, 2);
  setPpStatus('Örnek DAG yüklendi', 'info');
}

async function runPipeline() {
  const raw = q('#pp-spec')?.value || '';
  let spec;
  try { spec = JSON.parse(raw); }
  catch (e) { setPpStatus('Geçersiz JSON: ' + esc(String(e)), 'error'); return; }
  setPpStatus('Pipeline başlatılıyor…', 'info');
  const report = q('#pp-report');
  if (report) { report.classList.add('hidden'); report.textContent = ''; }
  try {
    const currentApi = getApi();
    const res = await currentApi.invoke('kx326:pipeline:run', { spec });
    if (report) { report.classList.remove('hidden'); report.textContent = JSON.stringify(res, null, 2); }
    setPpStatus(res && res.ok ? 'Pipeline tamamlandı' : 'Pipeline başarısız', res && res.ok ? 'ok' : 'error');
  } catch (e) {
    setPpStatus('Pipeline hatası: ' + esc(String(e)), 'error');
  }
}

window.addEventListener('DOMContentLoaded', () => void initPipelinesPanel());
