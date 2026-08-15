/**
 * theme-registry.js — OllamaX v3.1 tema altyapısı (UI/Feature Upgrade Planı Bölüm 1.3)
 *
 * Tema, `data-theme` özniteliği + CSS değişkenleriyle yönetilir; JavaScript yalnızca
 * özniteliği ve accent değişkenini değiştirir. Runtime'da sayfa yeniden yükleme yoktur.
 *
 * Tema adları: 'dark' (varsayılan), 'light', 'high-contrast', 'custom:<isim>'
 */
'use strict';
(function initThemeRegistry() {
  if (typeof window === 'undefined') return;

  const BUILTIN_THEMES = ['dark', 'light', 'high-contrast'];
  const ACCENT_STORAGE_KEY = 'ollamax_theme_accent_v1';
  const THEME_STORAGE_KEY = 'ollamax_theme_v1';

  const customThemes = new Map();

  const ThemeRegistry = {
    /** Mevcut tema adını döndürür (varsayılan OS tercihi fallback) */
    current() {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && (BUILTIN_THEMES.includes(stored) || stored.startsWith('custom:'))) return stored;
      if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
      }
      return 'dark';
    },

    /** Temayı uygula. Özel tema adları 'custom:' önekiyle verilir. */
    apply(name) {
      let effective = name || this.current();
      if (!BUILTIN_THEMES.includes(effective) && !effective.startsWith('custom:')) effective = 'dark';
      document.documentElement.setAttribute('data-theme', effective);
      localStorage.setItem(THEME_STORAGE_KEY, effective);
      // Özel tema değişkenleri :root satır içi stiline yazılır (test/bağımsız doğrulama için)
      const customVars = effective.startsWith('custom:') ? customThemes.get(effective) : null;
      if (customVars) {
        const st = document.querySelector(`style[data-ollamax-theme="${effective}"]`);
        if (st) st.remove();
        if (Object.keys(customVars).length) {
          const el = document.createElement('style');
          el.setAttribute('data-ollamax-theme', effective);
          el.textContent = `:root{${Object.entries(customVars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
          document.head.appendChild(el);
          for (const [k, v] of Object.entries(customVars)) {
            document.documentElement.style.setProperty(k, v);
          }
        }
      }
      this.applyAccent(this.savedAccent());
      ThemeRegistry._notify('theme-applied', { theme: effective });
    },

    /** Accent rengini uygula (tek setProperty çağrısı) */
    applyAccent(hex) {
      const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#2f81f7';
      document.documentElement.style.setProperty('--accent', safe);
      document.documentElement.style.setProperty('--accent-hover', this.lighten(safe, 8));
      document.documentElement.style.setProperty('--accent-soft', `${safe}1F`);
      localStorage.setItem(ACCENT_STORAGE_KEY, safe);
    },

    savedAccent() {
      const v = localStorage.getItem(ACCENT_STORAGE_KEY);
      return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#2f81f7';
    },

    /** Özel temayı kaydet: { name, vars: { '--bg-primary': ..., ... } } */
    register({ name, vars } = {}) {
      if (!name || typeof vars !== 'object') return { ok: false, error: 'bad_schema' };
      const safeVars = {};
      for (const [k, v] of Object.entries(vars)) {
        if (/^--[\w-]+$/.test(k) && typeof v === 'string') safeVars[k] = v;
      }
      customThemes.set(`custom:${name}`, safeVars);
      localStorage.setItem(`ollamax_theme_custom_${name}`, JSON.stringify(safeVars));
      this.apply(`custom:${name}`);
      return { ok: true, theme: `custom:${name}` };
    },

    /** Özel tema sil */
    remove(name) {
      const key = `custom:${name}`;
      customThemes.delete(key);
      localStorage.removeItem(`ollamax_theme_custom_${name}`);
      if (this.current() === key) this.apply('dark');
      return { ok: true };
    },

    /** Kayıtlı özel temaları listele */
    listCustom() {
      const out = [];
      for (const [k, vars] of customThemes.entries()) {
        out.push({ name: k.slice(7), vars });
      }
      return out;
    },

    /** JSON tema dışa/aktarım */
    exportJSON() {
      return JSON.stringify({ theme: this.current(), accent: this.savedAccent(), custom: this.listCustom() });
    },

    /** Kayıtlı bir temayı sistem ayarına yazar (config overlay kullanımı için) */
    getThemeConfig() {
      return { theme: this.current(), accent: this.savedAccent() };
    },

    /** Tema değiştir: dark ↔ light (high-contrast korunur) */
    toggle() {
      const c = this.current();
      this.apply(c === 'dark' ? 'light' : 'dark');
    },

    /** Tema değişimlerini dinle (diğer modüller için) */
    onChange(fn) {
      window.addEventListener('ollamax-theme', (e) => fn(e.detail));
    },

    _notify(type, detail) {
      window.dispatchEvent(new CustomEvent('ollamax-theme', { detail: { type, ...detail } }));
    },

    lighten(hex, amt) {
      // Basit lighten: RGB'yi amt kadar yukarı taşı
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const clamp = (v) => Math.min(255, Math.max(0, v + amt));
      return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
    },
  };

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.theme = ThemeRegistry;

  window.addEventListener('DOMContentLoaded', () => {
    ThemeRegistry.apply();
  });
})();
