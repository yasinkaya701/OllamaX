/**
 * virtual-list.js — Krevyx v3.1 sanal liste (Plan Bölüm 1.8.1)
 *
 * Bağımlılıksız, çerçevesiz, yalnızca görünür satırları DOM'a işleyen
 * pencereleme katmanı. Binlerce öğeli denetim günlüğü / bellek / görev
 * zaman çizelgesi listelerinde kullanılır.
 *
 * Örnek:
 *   const vl = new VirtualList(document.querySelector('.vl'), {
 *     rowHeight: 28,
 *     render: (item, idx) => makeRow(item, idx),
 *   });
 *   vl.setItems(hugeArray);
 *   // sonra: vl.setItems(newArray) veya vl.dispose()
 */
'use strict';

class VirtualList {
  /**
   * @param {HTMLElement} root - .virtual-list sınıfı uygulanmış taşıyıcı
   * @param {object} opts
   * @param {number} opts.rowHeight - sabit satır yüksekliği (px)
   * @param {function(any, number): HTMLElement} opts.render - (öğe, sıra) → DOM
   * @param {number} [opts.overscan=6] - görünür pencere üstü/altı tampon satır sayısı
   */
  constructor(root, opts) {
    if (!root || typeof opts.render !== 'function') {
      throw new TypeError('VirtualList: root ve opts.render gerekli');
    }
    this.root = root;
    this.rowHeight = Number(opts.rowHeight) || 32;
    if (this.rowHeight <= 0) this.rowHeight = 32;
    this.render = opts.render;
    this.overscan = Number(opts.overscan) >= 0 ? opts.overscan : 6;
    this.items = [];
    this.viewTop = 0;
    this.visibleCount = 0;
    this._fallbackHeight = Number(opts.fallbackHeight) || 300;
    this._raf = null;
    this._els = new Map(); // sıra -> element
    this._recycle = []; // yeniden kullanılacak element havuzu

    root.classList.add('virtual-list');
    this.root.addEventListener('scroll', () => this._scheduleRender(), { passive: true });
    window.addEventListener('resize', () => this._scheduleRender());
    this._measure();
    this._scheduleRender();
  }

  setItems(items) {
    this.items = items || [];
    // Eleman havuzuna geri koy
    for (const el of this._els.values()) {
      el.remove();
      this._recycle.push(el);
    }
    this._els.clear();
    this._scheduleRender();
  }

  scrollToIndex(idx) {
    const i = Math.max(0, Math.min(this.items.length - 1, idx));
    this.root.scrollTop = i * this.rowHeight;
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    for (const el of this._els.values()) el.remove();
    this._els.clear();
    this._recycle = [];
  }

  /* ----------------------------- dahili ----------------------------- */

  _measure() {
    let h = this.root.clientHeight || this.root.offsetHeight;
    if (!h) {
      // CSS'siz ortamlar (jsdom, gizli kapsayıcılar) için satır içi yüksekliğe bak:
      // hem style özniteliği (el.style.height) hem de getAttribute('style') denetlenir
      const inlinePx = parseFloat((this.root.style.height || '').replace('px', ''));
      if (inlinePx > 0) h = inlinePx;
      else {
        const m = /height:\s*(\d+(?:\.\d+)?)\s*px/.exec(this.root.getAttribute('style') || '');
        h = m ? parseFloat(m[1]) : this._fallbackHeight;
      }
    }
    this.visibleCount = Math.max(1, Math.ceil(h / this.rowHeight) + 1);
  }

  _scheduleRender() {
    if (this._raf) return;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => cb(); // rAF yoksa (Node/jsdom) senkron çalıştır
    this._raf = schedule(() => {
      this._raf = null;
      this._render();
    });
  }

  _render() {
    const total = this.items.length;
    if (!total) {
      for (const el of this._els.values()) el.remove();
      this._els.clear();
      return;
    }
    this._measure();
    const scrollTop = this.root.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / this.rowHeight) - this.overscan);
    const end = Math.min(total - 1, start + this.visibleCount + this.overscan * 2);

    // Yok olan aralığı temizle
    for (const [idx, el] of this._els) {
      if (idx < start || idx > end) {
        el.remove();
        this._els.delete(idx);
        this._recycle.push(el);
      }
    }

    // Eksik satırları doldur (havuzdan veya yeni)
    for (let idx = start; idx <= end; idx++) {
      if (this._els.has(idx)) continue;
      let el = this._recycle.pop();
      if (el) {
        el.innerHTML = '';
      } else {
        el = document.createElement('div');
        el.className = 'virtual-item';
      }
      const item = this.render(this.items[idx], idx);
      if (item) el.appendChild(item);
      el.style.transform = `translateY(${idx * this.rowHeight}px)`;
      this.root.appendChild(el);
      this._els.set(idx, el);
    }
  }
}

if (typeof window !== 'undefined') {
  window.Krevyx = window.Krevyx || {};
  window.Krevyx.VirtualList = VirtualList;
}
