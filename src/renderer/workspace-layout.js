/**
 * workspace-layout.js — Krevyx v3.1 çok bölgeli çalışma alanı (Plan Bölüm 1.2)
 *
 * 4 bölge: sol (araç çubuğu + panel), ana alan, sağ (bağlam panelleri), alt panel.
 * Boyutlar localStorage'da persist edilir; sürükleyle yeniden boyut,
 * <1100px'te sağ çubuk drawer olur.
 */
'use strict';
(function initWorkspaceLayout() {
  if (typeof window === 'undefined') return;

  const STORAGE_KEY = 'Krevyx_ws_layout_v1';
  const DEFAULTS = { leftWidth: 260, rightWidth: 280, altHeight: 220, density: 'comfortable', leftCollapsed: false, rightCollapsed: false, altVisible: true };
  const MIN_WIDTH = 200;

  let layout = load();
  let current = { left: null, right: null, bottom: null };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      const p = JSON.parse(raw);
      return { ...DEFAULTS, ...(p && typeof p === 'object' ? p : {}) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    window.dispatchEvent(new CustomEvent('krevyx-layout-changed', { detail: layout }));
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  }

  function apply() {
    const root = document.documentElement;
    root.style.setProperty('--ws-left', `${layout.leftWidth}px`);
    root.style.setProperty('--ws-right', `${layout.rightWidth}px`);
    root.style.setProperty('--ws-alt', `${layout.altHeight}px`);
    root.setAttribute('data-density', layout.density || 'comfortable');
    const ws = document.querySelector('.workspace-v3');
    if (!ws) return;
    ws.classList.toggle('left-collapsed', !!layout.leftCollapsed);
    ws.classList.toggle('right-collapsed', !!layout.rightCollapsed);
    ws.classList.toggle('no-bottom', !layout.altVisible);
  }

  function attachResize(splitEl, dir, getFn, setFn) {
    let start = 0;
    let startVal = 0;
    function onMove(e) {
      const delta = dir === 'col' ? e.clientX - start : e.clientY - start;
      const next = clamp(startVal + delta, MIN_WIDTH, dir === 'col' ? 600 : 480);
      setFn(next);
      save();
      apply();
    }
    function onUp() {
      splitEl.classList.remove('active');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    splitEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      start = dir === 'col' ? e.clientX : e.clientY;
      startVal = getFn(); // onMove başlangıç değerini yakalar
      splitEl.classList.add('active');
      document.body.style.cursor = dir === 'col' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  const Layout = {
    get() { return { ...layout }; },
    set(partial) {
      layout = { ...layout, ...partial };
      save();
      apply();
    },
    toggleLeft() { Layout.set({ leftCollapsed: !layout.leftCollapsed }); },
    toggleRight() {
      const small = window.innerWidth < 1100;
      if (small) {
        const right = document.querySelector('.ws-right');
        const open = !right?.classList.contains('drawer-open');
        right?.classList.toggle('drawer-open', open);
        // Drawer dışına tıklayınca kapat
        if (open) {
          const close = (e) => {
            if (e.key === 'Escape' || (right && !right.contains(e.target))) {
              right.classList.remove('drawer-open');
              document.removeEventListener('click', close);
              document.removeEventListener('keydown', close);
            }
          };
          setTimeout(() => {
            document.addEventListener('click', close);
            document.addEventListener('keydown', close);
          }, 0);
        }
      } else {
        Layout.set({ rightCollapsed: !layout.rightCollapsed });
      }
    },
    setBottomVisible(visible) { Layout.set({ altVisible: visible }); },
    setBottomHeight(h) { Layout.set({ altHeight: clamp(h, 120, 480) }); },
    setDensity(d) { Layout.set({ density: ['comfortable', 'compact', 'cozy'].includes(d) ? d : 'comfortable' }); },
    /** Yeni paneli DOM'a bağla: {side:'left'|'right'|'bottom', panel, splitDir:'col'|'row'} */
    attachPanel({ side, panel, splitEl }) {
      current[side === 'right' ? 'right' : side === 'bottom' ? 'bottom' : 'left'] = panel;
      if (splitEl) {
        attachResize(splitEl, side === 'bottom' ? 'row' : 'col',
          () => side === 'bottom' ? layout.altHeight : (side === 'right' ? layout.rightWidth : layout.leftWidth),
          (v) => {
            if (side === 'bottom') layout.altHeight = v;
            else if (side === 'right') layout.rightWidth = v;
            else layout.leftWidth = v;
          });
      }
    },
    refresh: apply,
  };

  window.Krevyx = window.Krevyx || {};
  window.Krevyx.layout = Layout;

  window.addEventListener('DOMContentLoaded', () => {
    apply();
    window.addEventListener('resize', () => {
      if (window.innerWidth < 1100) {
        const right = document.querySelector('.ws-right');
        right?.classList.remove('drawer-open');
      }
    });
  });
})();
