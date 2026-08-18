/*
 * diff-review.js — Krevyx v3.25 Diff İnceleme renderer paneli (P-UI)
 * Stil: Emerald Ledger — hunk başına onay/reddet, toplu işlem, SARIF export.
 * Global kapsam: api, q, toast, log, esc.
 */
async function initDiffReview() {
  buildDiffReviewSection();
  q('#df-btn-load')?.addEventListener('click', () => void loadDiff());
  q('#df-btn-apply-approved')?.addEventListener('click', () => void applyApproved());
  q('#df-btn-export-sarif')?.addEventListener('click', () => void exportSarif());
  q('#df-file-input')?.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    if (file) readDiffFile(file);
  });
}

function buildDiffReviewSection() {
  if (q('#df-section')) return;
  const sidebar = q('#app-sidebar') || q('aside') || document.body;
  if (!sidebar) return;
  const details = document.createElement('details');
  details.className = 'sidebar-section acc-sec';
  details.id = 'df-section';
  const summary = document.createElement('summary');
  summary.className = 'sec-header acc-sum';
  summary.innerHTML = '<span class="sec-label">Diff İnceleme</span><span class="acc-chev" aria-hidden="true"></span>';
  details.appendChild(summary);
  details.innerHTML += `
    <div class="df-zone">
      <label class="df-label">Diff dosyası</label>
      <div class="df-file-row">
        <input type="file" id="df-file-input" accept=".diff,.patch,.txt" class="df-file-input hidden" />
        <button type="button" id="df-btn-load" class="small-btn df-load-btn">📂 Diff Seç</button>
        <span id="df-file-name" class="df-file-name">—</span>
      </div>
      <div id="df-status" class="df-status hidden"></div>
      <div id="df-hunks" class="df-hunks"></div>
      <div class="df-actions hidden" id="df-actions">
        <button type="button" id="df-btn-all-approve" class="small-btn">✓ Tümünü Onayla</button>
        <button type="button" id="df-btn-apply-approved" class="small-btn df-apply-btn">▶ Onaylıları Uygula</button>
        <button type="button" id="df-btn-export-sarif" class="small-btn">⟁ SARIF</button>
      </div>
    </div>`;
  const plSection = q('#pl-section');
  if (plSection && plSection.parentNode) {
    plSection.parentNode.insertBefore(details, plSection.nextSibling);
  } else {
    sidebar.appendChild(details);
  }
}

let dfReviewId = null;
let dfHunks = [];

function dfStatus(html, type) {
  const s = q('#df-status');
  if (!s) return;
  s.classList.toggle('hidden', !html);
  s.className = `df-status df-${type || 'info'}`;
  s.textContent = html || '';
}

function renderHunks() {
  const box = q('#df-hunks');
  if (!box) return;
  box.innerHTML = '';
  dfHunks.forEach((h) => {
    const card = document.createElement('div');
    card.className = `df-hunk-card df-${h.decision}`;
    const additions = h.additions.map((l) => `<span class="df-add">+${esc(l)}</span>`).join('\n');
    const removals = h.removals.map((l) => `<span class="df-rem">-${esc(l)}</span>`).join('\n');
    card.innerHTML = `
      <div class="df-hunk-head">
        <span class="df-hunk-idx">Hunk ${h.index + 1}</span>
        <span class="df-hunk-decision">${h.decision === 'approved' ? '✓ onaylı' : h.decision === 'rejected' ? '✕ reddedildi' : '⏳ bekliyor'}</span>
      </div>
      <pre class="df-hunk-body">${removals}${additions || esc(h.context.slice(0, 3).join('\n'))}</pre>
      <div class="df-hunk-btns">
        <button type="button" class="small-btn df-approve-btn${h.decision === 'approved' ? ' active' : ''}" data-idx="${h.index}">✓</button>
        <button type="button" class="small-btn df-reject-btn${h.decision === 'rejected' ? ' active' : ''}" data-idx="${h.index}">✕</button>
      </div>`;
    box.appendChild(card);
  });
  box.querySelectorAll('.df-approve-btn').forEach((b) => b.addEventListener('click', () => void decideHunk(Number(b.dataset.idx), 'approved')));
  box.querySelectorAll('.df-reject-btn').forEach((b) => b.addEventListener('click', () => void decideHunk(Number(b.dataset.idx), 'rejected')));
  const acts = q('#df-actions');
  if (acts) acts.classList.toggle('hidden', !dfHunks.length);
}

async function loadDiff() {
  q('#df-file-input').click();
}

function readDiffFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    if (!api) { toast('Electron API yok', 'error'); return; }
    dfStatus('Diff ayrıştırılıyor…', 'info');
    try {
      const res = await api.invoke('diff-review-create', { diffText: reader.result });
      if (!res?.ok) { dfStatus(`Hata: ${res?.error || 'bilinmeyen'}`, 'error'); return; }
      dfReviewId = res.review.id;
      dfHunks = res.review.hunks;
      q('#df-file-name').textContent = file.name;
      renderHunks();
      dfStatus(`${dfHunks.length} hunk yüklendi`, 'ok');
    } catch {
      dfStatus('Diff yüklenemedi', 'error');
    }
  };
  reader.readAsText(file);
}

async function decideHunk(idx, decision) {
  if (!dfReviewId || !api) return;
  try {
    const res = await api.invoke('diff-review-decide', { reviewId: dfReviewId, hunkIdx: idx, decision });
    if (res?.ok) {
      dfHunks[idx] = res.hunk;
      renderHunks();
    }
  } catch { /* sessiz */ }
}

async function applyApproved() {
  if (!dfReviewId || !api) return;
  const filePath = prompt('Uygulanacak dosya yolu:');
  if (!filePath) return;
  try {
    const filtered = await api.invoke('diff-review-filtered', { reviewId: dfReviewId });
    if (!filtered?.ok) { toast('Filtreleme başarısız', 'error'); return; }
    const res = await api.invoke('diff-apply-file', { filePath, diffText: filtered.diff, strategy: 'fuzzy' });
    if (res?.ok) toast(`${res.report.applied.length} hunk uygulandı`, 'success');
    else toast(`Uygulama hatası: ${res?.error || 'bilinmeyen'}`, 'error');
  } catch {
    toast('Uygulanamadı', 'error');
  }
}

async function exportSarif() {
  if (!dfReviewId || !api) return;
  try {
    const res = await api.invoke('diff-review-export', { reviewId: dfReviewId });
    if (res?.ok) {
      try {
        navigator.clipboard.writeText(JSON.stringify(res.sarif, null, 2));
        toast('SARIF raporu panoya kopyalandı', 'success');
      } catch { toast('Kopyalanamadı', 'error'); }
    }
  } catch { /* sessiz */ }
}

q('#df-btn-all-approve')?.addEventListener?.('click', () => {});
window.addEventListener('DOMContentLoaded', () => {
  q('#df-btn-all-approve')?.addEventListener('click', async () => {
    if (!dfReviewId || !api) return;
    await api.invoke('diff-review-bulk', { reviewId: dfReviewId, opts: { all: true, decision: 'approved' } });
    const st = await api.invoke('diff-review-state', { reviewId: dfReviewId });
    if (st?.ok) {
      st.state.counts;
      dfStatus(`Tümü onaylandı`, 'ok');
      renderHunks();
    }
  });
  void initDiffReview();
});
