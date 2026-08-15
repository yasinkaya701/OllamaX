/**
 * keymap.js — OllamaX v3.1 klavye kısayol katmanı (UI/Feature Upgrade Planı Bölüm 1.5)
 *
 * Merkezi kısayol kaydı; `mod` = Cmd (macOS) / Ctrl (diğer). Çakışma tespiti,
 * kullanıcı overrides (config.keymap.overrides) ve komut çalıştırma bus'ı içerir.
 * Kısayollar komut adlarına bağlanır; komutlar Keymap.execute ile kaydedilir.
 */
'use strict';
(function initKeymap() {
  if (typeof window === 'undefined') return;

  const DEFAULT_KEYMAP = {
    'mod+k': 'palette.open',
    'mod+shift+s': 'sidebar.sessions.toggle',
    'mod+l': 'sidebar.tools.toggle',
    'mod+,': 'settings.open',
    'mod+/': 'composer.focus',
    'mod+shift+m': 'memory.search',
    'mod+shift+a': 'agent.goal.new',
    'mod+shift+d': 'theme.toggle',
    'mod+shift+v': 'speech.mode',
    'mod+enter': 'composer.send',
    'ctrl+tab': 'session.next',
    'ctrl+shift+tab': 'session.prev',
  };

  const STORAGE_KEY = 'ollamax_keymap_overrides_v1';
  const handlers = new Map();

  function parseKey(keyStr) {
    const parts = keyStr.toLowerCase().split('+').map((p) => p.trim());
    const meta = parts.includes('mod');
    const shift = parts.includes('shift');
    const ctrl = parts.includes('ctrl');
    const key = parts.filter((p) => !['mod', 'shift', 'ctrl', 'alt', 'meta'].includes(p))[0] || null;
    return { meta, shift, ctrl, key };
  }

  function eventMatches(parsed, e) {
    const modMatch = parsed.meta ? e.metaKey || e.ctrlKey : !(e.metaKey || e.ctrlKey);
    const shiftMatch = parsed.shift ? e.shiftKey : !e.shiftKey;
    const ctrlMatch = parsed.ctrl ? e.ctrlKey : !e.ctrlKey;
    const keyMatch = parsed.key === null ? true : e.key.toLowerCase() === parsed.key;
    return modMatch && shiftMatch && ctrlMatch && keyMatch;
  }

  const Keymap = {
    /** Kısayol → komut adını bağla. opts.once: ilk eşleşmede dur. */
    on(command, handler, opts = {}) {
      const list = handlers.get(command) || [];
      list.push({ fn: handler, once: !!opts.once });
      handlers.set(command, list);
    },

    off(command, handler) {
      const list = handlers.get(command) || [];
      handlers.set(command, list.filter((h) => h.fn !== handler));
    },

    /** Komutu çalıştır; zincirdeki tüm handler'ları çağırır */
    async execute(command, payload) {
      const list = handlers.get(command) || [];
      for (const h of [...list]) {
        try {
          await h.fn(payload);
        } catch {
          /* handler hatası diğerlerini durdurmaz */
        }
        if (h.once) {
          const cur = handlers.get(command) || [];
          handlers.set(command, cur.filter((x) => x !== h));
        }
      }
    },

    /** Kullanıcı override'larını uygula (storage'dan) */
    loadOverrides() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    },

    /** Override kaydet: { 'mod+k': 'palette.open' } */
    saveOverrides(overrides) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides || {}));
    },

    /** Efektif keymap: overrides > varsayılanlar; çakışma raporu döner */
    effective() {
      const overrides = this.loadOverrides();
      const map = { ...DEFAULT_KEYMAP, ...overrides };
      const conflicts = [];
      const byCommand = {};
      for (const [combo, cmd] of Object.entries(map)) {
        (byCommand[cmd] = byCommand[cmd] || []).push(combo);
      }
      for (const [cmd, combos] of Object.entries(byCommand)) {
        if (combos.length > 1) conflicts.push({ command: cmd, combos });
      }
      return { map, conflicts };
    },

    /** Aktif keymap listesini (etiketlerle) döndürür — Ayarlar sayfası için */
    list() {
      const { map } = this.effective();
      const LABELS = {
        'palette.open': 'Komut paletini aç',
        'sidebar.sessions.toggle': 'Oturum kenar çubuğunu aç/kapat',
        'sidebar.tools.toggle': 'Araçlar panelini aç/kapat',
        'settings.open': 'Ayarları aç',
        'composer.focus': 'Mesaj kutusuna odaklan',
        'memory.search': 'Bellek araması',
        'agent.goal.new': 'Yeni ajan hedefi',
        'theme.toggle': 'Tema değiştir',
        'speech.mode': 'Sesli mod',
        'composer.send': 'Gönder',
        'session.next': 'Sonraki oturum',
        'session.prev': 'Önceki oturum',
      };
      return Object.entries(map).map(([combo, cmd]) => ({ combo, command: cmd, label: LABELS[cmd] || cmd }));
    },
  };

  document.addEventListener('keydown', (e) => {
    const { map } = Keymap.effective();
    for (const [combo, command] of Object.entries(map)) {
      const parsed = parseKey(combo);
      if (eventMatches(parsed, e)) {
        // Ctrl+Tab özel: sistem sekmelerini ezmez; yalnızca uygulama odaklıyken
        if (combo === 'ctrl+tab' && e.target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        e.stopPropagation();
        void Keymap.execute(command, { event: e });
        return;
      }
    }
  }, true);

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.keymap = Keymap;
  window.OllamaX.KEYMAP_DEFAULTS = DEFAULT_KEYMAP;
})();
