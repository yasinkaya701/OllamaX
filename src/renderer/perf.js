/**
 * perf.js — Krevyx v3.1 performans katmanı (Plan Bölüm 1.8)
 *
 * 1.8.2 Streaming batching: token olaylarını raf başına tek DOM güncellemesinde
 *     birleştirir (agresif aralıklı akışlarda layout thrash'ı önler).
 * 1.8.4 Ölçüm altyapısı: basit zamanlama/ölçüm günlüğü (console + in-memory),
 *     opt-in telemetriye altlık olur.
 */
'use strict';
(function initPerf() {
  if (typeof window === 'undefined') return;

  const BATCH_INTERVAL_MS = 16; // ~raf hızı
  const measurements = [];
  const MAX_MEASUREMENTS = 2000;

  /* ------------------------------------------------------------------ */
  /* Streaming batching                                                   */
  /* ------------------------------------------------------------------ */
  class StreamBatcher {
    /**
     * Aynı anahtara gelen delta metinlerini batch yapar; interval sonunda
     * flush callback'ini tek parça metinle çağırır.
     * @param {function(key, chunk, stats)} onFlush
     */
    constructor(onFlush) {
      this.onFlush = onFlush;
      this.buffers = new Map(); // key -> { parts: string[], chars: number, start: number }
      this.timer = null;
    }

    push(key, delta) {
      if (!key || !delta) return;
      let buf = this.buffers.get(key);
      if (!buf) {
        buf = { parts: [], chars: 0, start: performance.now() };
        this.buffers.set(key, buf);
      }
      buf.parts.push(delta);
      buf.chars += delta.length;
      if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), BATCH_INTERVAL_MS);
      }
    }

    flush() {
      this.timer = null;
      const snapshot = new Map(this.buffers);
      this.buffers.clear();
      for (const [key, buf] of snapshot) {
        const chunk = buf.parts.join('');
        if (!chunk) continue;
        try {
          this.onFlush(key, chunk, { chars: buf.chars, elapsedMs: performance.now() - buf.start });
        } catch (err) {
          console.error('[perf:batcher] flush failed', err);
        }
      }
    }

    reset() {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      this.buffers.clear();
    }

    dispose() {
      this.reset();
      this.onFlush = null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ölçüm altyapısı                                                      */
  /* ------------------------------------------------------------------ */
  function mark(name) {
    measurements.push({ name, t: performance.now(), ts: Date.now() });
    if (measurements.length > MAX_MEASUREMENTS) measurements.shift();
  }

  function measure(name, fn) {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      measurements.push({ name: name + ':ms', t: performance.now() - t0, ts: Date.now() });
      if (measurements.length > MAX_MEASUREMENTS) measurements.shift();
    }
  }

  function recent(prefix, limit = 50) {
    return measurements
      .filter((m) => !prefix || m.name.startsWith(prefix))
      .slice(-limit);
  }

  function clearMeasurements() {
    measurements.length = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Lazy render yardımcısı: ilk görünene kadar içerik üretmez            */
  /* ------------------------------------------------------------------ */
  /**
   * Element görünür olduğunda renderFn'i tek kez çağırır.
   * @param {HTMLElement} target - gözlemlenen element
   * @param {function(HTMLElement): void} renderFn
   */
  function renderWhenVisible(target, renderFn) {
    if (!('IntersectionObserver' in window) || !target) {
      renderFn(target);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            obs.disconnect();
            renderFn(target);
          }
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(target);
    target._lazyObserver = obs;
  }

  window.Krevyx = window.Krevyx || {};
  window.Krevyx.perf = { StreamBatcher, mark, measure, recent, clear: clearMeasurements, renderWhenVisible };
})();
