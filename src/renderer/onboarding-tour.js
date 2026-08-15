/**
 * onboarding-tour.js — OllamaX v3.1 ilk kullanım turu (Plan Bölüm 1.6)
 *
 * İlk açılışta 4 ekranlık yönlendirme: hoş geldin, bağlantı, araçlar,
 * ajan özellikleri. localStorage bayrağı (ollamax_onboarding_v1) ile
 * bir kez gösterilir; Ayarlar'dan yeniden oynatılabilir.
 */
'use strict';
(function initOnboardingTour() {
  if (typeof window === 'undefined') return;

  const FLAG = 'ollamax_onboarding_v1';

  const STEPS = [
    {
      label: 'Hoş geldin',
      title: 'OllamaX Ultra\'ya hoş geldin',
      body: 'Yerel Ollama modelleri ve bulut sağlayıcıları (OpenAI, Anthropic, Gemini) tek bir ajan stüdyosunda. API anahtarlarını sağdaki <strong>Araçlar</strong> panelinden girmen yeterli — yerel Ollama anahtar gerektirmez.',
    },
    {
      label: 'Bağlantı ve modeller',
      title: 'Bağlantılar ve modeller',
      body: 'Üst çubuktan sağlayıcıyı ve modeli seçebilirsin. Bağlantı çubuğu Ollama ve backend durumunu canlı gösterir. <kbd>⌘</kbd><kbd>L</kbd> ile araçlar panelini açıp kapatabilirsin.',
    },
    {
      label: 'Araçlar',
      title: 'Araçlar ve integrasyonlar',
      body: 'Sağ panelde API anahtarları, GitHub, dosya sistemi, modeller ve terminal bulunur. Ajanlar dosya okuma/yazma ve komut çalıştırma yetkileri ister; her kritik işlem için onay modalı çıkar.',
    },
    {
      label: 'Ajan özellikleri',
      title: 'Ajan, bellek ve denetim',
      body: 'Komut paletine <kbd>⌘</kbd><kbd>K</kbd> ile ulaş, /goal ile otonom hedef ver, sağ paneldeki Bellek ve Denetim sekmelerinden ajanın öğrendiklerini ve yaptıklarını izle. Klavye kısayolları Ayarlar → Klavye sayfasında özelleştirilebilir.',
    },
  ];

  let current = 0;
  let overlay = null;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    if (!overlay) return;
    const card = overlay.querySelector('.onboard-card');
    if (!card) return;
    const step = STEPS[current];
    card.innerHTML = `
      <div class="onboard-step-label">Adım ${current + 1} / ${STEPS.length}</div>
      <h2 class="onboard-title">${esc(step.title)}</h2>
      <div class="onboard-body">${step.body}</div>
      <div class="onboard-actions">
        <button class="ob-skip" id="ob-skip" type="button">Atla</button>
        <div>
          ${current < STEPS.length - 1 ? '<button class="v3-btn-ghost" id="ob-next" type="button">Sonraki</button>' : '<button class="v3-btn-primary" id="ob-next" type="button">Başla</button>'}
        </div>
      </div>`;
    $('#ob-skip').addEventListener('click', close);
    $('#ob-next').addEventListener('click', () => {
      current += 1;
      if (current >= STEPS.length) close(true);
      else render();
    });
  }

  function $(sel, root = document) {
    return root.querySelector(sel);
  }

  function open() {
    if (overlay) return;
    current = 0;
    overlay = document.createElement('div');
    overlay.className = 'onboard-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Hoş geldin turu');
    overlay.innerHTML = '<div class="onboard-card"></div>';
    document.body.appendChild(overlay);
    render();
    // Focus trap basit: overlay'a tıklanınca kapansın
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(true); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(true); });
  }

  function close(finished) {
    if (finished) localStorage.setItem(FLAG, '1');
    overlay?.remove();
    overlay = null;
  }

  const Tour = {
    show: open,
    replay: () => {
      localStorage.removeItem(FLAG);
      open();
    },
    wasShown: () => localStorage.getItem(FLAG) === '1',
  };

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.onboarding = Tour;

  document.addEventListener('DOMContentLoaded', () => {
    if (Tour.wasShown()) return;
    // İlk açılışta 600ms gecikmeyle göster (startup akışını bozmamak için)
    setTimeout(() => {
      if (!Tour.wasShown()) open();
    }, 600);
  });
})();
