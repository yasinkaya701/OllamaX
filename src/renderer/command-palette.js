/**
 * command-palette.js — OllamaX v3.1 komut paleti (Plan Bölüm 1.4)
 *
 * Ctrl/Cmd+K ile açılır. Dört kanal: komutlar, oturumlar, bellek, modeller.
 * Kendi fuzzy arama motoru (bağımlılıksız). Modüller window.OllamaX.palette.register(...)
 * ile kendini kaydeder.
 */
'use strict';
(function initCommandPalette() {
  if (typeof window === 'undefined') return;

  const STORAGE_KEY = 'ollamax_palette_recent_v1';

  /**
   * Fuzzy skorlama: eşleşen karakterler sıralı olmalı.
   * Skor: kesintisiz alt dizge bonusu + baştaki eşleşme bonusu + kısaltma bonusu.
   * @returns {{ score: number, indices: number[] } | null}
   */
  function fuzzyScore(query, target) {
    if (!query) return null;
    const q = query.toLowerCase();
    const t = target.toLowerCase();
    if (q === t) return { score: 1000, indices: [...target].map((_, i) => i) };

    // Sıralı karakter eşleşmesi (basit DP değil, greedy sıralı tarama)
    const indices = [];
    let ti = 0;
    let qi = 0;
    while (qi < q.length && ti < t.length) {
      const idx = t.indexOf(q[qi], ti);
      if (idx === -1) return null;
      indices.push(idx);
      ti = idx + 1;
      qi += 1;
    }
    if (qi < q.length) return null;

    // Bonuslar
    let score = 100 - indices[indices.length - 1]; // erken eşleşme daha iyi
    score += indices.length * 8; // kısaltma eşleşmesi (örn. 'oa')
    if (indices[0] === 0) score += 40; // başta eşleşme
    let consecutive = 1;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === indices[i - 1] + 1) { consecutive += 1; }
    }
    score += consecutive * consecutive * 5; // kesintisiz alt dizge bonusu

    return { score, indices };
  }

  function highlightText(text, indices) {
    if (!indices || !indices.length) return escHtml(text);
    let out = '';
    let last = 0;
    for (const idx of indices) {
      out += escHtml(text.slice(last, idx));
      out += `<mark>${escHtml(text[idx])}</mark>`;
      last = idx + 1;
    }
    out += escHtml(text.slice(last));
    return out;
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const channels = [];
  const GROUP_LABELS = { actions: 'Komutlar', sessions: 'Oturumlar', memory: 'Bellek', models: 'Modeller' };
  let recent = [];

  function loadRecent() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const p = raw ? JSON.parse(raw) : [];
      return Array.isArray(p) ? p.slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  const Palette = {
    /** { group, label, keywords:[], run: async fn } */
    register(entry) {
      if (!entry || typeof entry.run !== 'function') return;
      const ch = channels.find((c) => c.group === entry.group) ||
        channels[channels.push({ group: entry.group, items: [] }) - 1];
      ch.items.push(entry);
    },

    unregister(label) {
      for (const ch of channels) {
        ch.items = ch.items.filter((it) => it.label !== label);
      }
    },

    /** Test/otomasyon için: tüm kanallardaki öğeleri düz liste olarak döndürür */
    entries() {
      return channels.flatMap((ch) => ch.items);
    },

    open() {
      if (document.querySelector('.cmd-overlay')) return;
      const overlay = document.createElement('div');
      overlay.className = 'cmd-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Komut paleti');

      const palette = document.createElement('div');
      palette.className = 'cmd-palette';
      palette.innerHTML = `
        <input class="cmd-input" type="text" placeholder="Komut, oturum, bellek veya model ara…" autofocus aria-label="Arama">
        <div class="cmd-list" role="listbox"></div>
        <div class="cmd-hint"><span><kbd>↑↓</kbd> gezin</span><span><kbd>Enter</kbd> seç</span><span><kbd>Esc</kbd> kapat</span></div>`;

      overlay.appendChild(palette);
      document.body.appendChild(overlay);

      const input = palette.querySelector('.cmd-input');
      const list = palette.querySelector('.cmd-list');
      let items = [];
      let selected = 0;

      // Focus trap
      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') e.preventDefault();
      });
      input.focus();

      function close() {
        overlay.remove();
        input.removeEventListener('input', onInput);
        overlay.removeEventListener('keydown', onKey);
      }

      function render() {
        const q = input.value.trim();
        const scored = [];
        for (const ch of channels) {
          for (const it of ch.items) {
            const label = it.label || '';
            const s = fuzzyScore(q, label);
            if (!q || s) scored.push({ ch, it, label, score: s ? s.score : 0, indices: s ? s.indices : null });
          }
        }
        scored.sort((a, b) => b.score - a.score);

        // Son kullanılanlar üstte (yalnızca sorgu boşken)
        let final = scored;
        if (!q && recent.length) {
          const recentItems = recent
            .map((lbl) => scored.find((x) => x.label === lbl))
            .filter(Boolean);
          if (recentItems.length) final = [...recentItems, ...scored.filter((x) => !recentItems.includes(x))];
        }

        items = final.slice(0, 100);
        selected = 0;

        list.innerHTML = items.length
          ? items.map((m, i) => `
            <div class="cmd-item${i === 0 ? ' selected' : ''}" role="option" data-idx="${i}" aria-selected="${i === 0}">
              <span class="cmd-accent">${escHtml(GROUP_LABELS[m.ch.group] || m.ch.group)}</span>
              <span>${highlightText(m.label, m.indices)}</span>
            </div>`).join('')
          : `<div class="cmd-empty">Sonuç yok. Farklı bir arama dene.</div>`;

        list.querySelectorAll('.cmd-item').forEach((el) => {
          el.addEventListener('click', () => void select(Number(el.dataset.idx)));
        });
      }

      async function select(idx) {
        const m = items[idx];
        if (!m) return;
        // Son kullanılanlara ekle
        recent = [m.label, ...recent.filter((l) => l !== m.label)].slice(0, 5);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
        close();
        try {
          await m.it.run();
        } catch (err) {
          console.error('[palette] command failed', err);
        }
      }

      function moveSel(delta) {
        if (!items.length) return;
        selected = (selected + delta + items.length) % items.length;
        list.querySelectorAll('.cmd-item').forEach((el, i) => {
          el.classList.toggle('selected', i === selected);
          el.setAttribute('aria-selected', i === selected ? 'true' : 'false');
          if (i === selected) el.scrollIntoView({ block: 'nearest' });
        });
      }

      function onInput() { render(); }
      async function onKey(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); await select(selected); }
        else if (e.key === 'Escape') { e.preventDefault(); close(); }
      }

      input.addEventListener('input', onInput);
      overlay.addEventListener('keydown', onKey);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

      render();
    },

    // Test için
    _fuzzyScore: fuzzyScore,
    _resetRecent() { recent = loadRecent(); },
  };

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.palette = Palette;
  Palette._resetRecent();

  // Klavye katmanına bağla (keymap.js yüklendiyse)
  const km = window.OllamaX?.keymap;
  if (km) {
    km.on('palette.open', () => Palette.open());
  }
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !document.querySelector('.cmd-overlay')) {
      e.preventDefault();
      Palette.open();
    }
  });
})();
