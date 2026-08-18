'use strict';
/**
 * plans/project-memory.js — Krevyx v3.25 Proje Belleği (P-6)
 *
 * KREYX.md dosyası + kalıcı not deposu. Ajan her görev öncesinde projeye
 * özgü bağlamı bellekten enjekte eder; her görev sonrası önemli gözlemler
 * nota dönüşür.
 *
 * Not şeması: { id, project, category, body, createdAt, hits, decay }
 * Kategoriler: setup, style, testing, security, ops, general
 *
 * Özellikler:
 *   - Duplicate tespiti: benzer gövde (normalized) eklenmez, hit sayacı artar
 *   - Decay: düşük hit'li eski notlar sorgu sonuçlarında geriler (silinmez)
 *   - Bağlam enjeksiyonu: bütçe (karakter) sınırıyla en relevant notlar
 *
 * API:
 *   getMemoryStore(project, opts)  → { add, remove, list, query, inject, prune, info }
 *   ensureKreyxMd(projectDir, opts) → KREYX.md yoksa iskelet oluştur
 *   parseKreyxMd(text) / renderKreyxMd(entries)
 *   testOnlyClear()
 */
const path = require('path');
const fs = require('fs');

const CATEGORIES = Object.freeze(['setup', 'style', 'testing', 'security', 'ops', 'general']);
const DEFAULT_BUDGET = 8000;
const DEFAULT_MAX_NOTES = 200;
const DECAY_HALF_LIFE_HOURS = 168; /* 1 hafta */

const stores = new Map();

function nowMs(opts) {
  return typeof opts?.now === 'function' ? opts.now() : Date.now();
}

function normalize(body) {
  return String(body || '')
    .toLowerCase()
    .replace(/[^a-z0-9ğüşıöç]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createProjectStore(projectKey, opts = {}) {
  if (stores.has(projectKey)) return stores.get(projectKey);
  const maxNotes = Math.max(10, Math.min(5000, opts.maxNotes || DEFAULT_MAX_NOTES));
  const notes = [];
  const byId = new Map();

  const api = {
    project: projectKey,
    add(entry) {
      if (!entry || typeof entry.body !== 'string' || !entry.body.trim()) {
        return { ok: false, error: 'Gövde gerekli' };
      }
      const category = CATEGORIES.includes(entry.category) ? entry.category : 'general';
      const key = normalize(entry.body).slice(0, 200);
      const existing = notes.find((n) => normalize(n.body).slice(0, 200) === key);
      if (existing) {
        existing.hits += 1;
        existing.updatedAt = nowMs(opts);
        return { ok: true, note: existing, duplicated: true };
      }
      if (notes.length >= maxNotes) {
        /* En eski ve en az isabetli notu çıkar */
        const victim = notes.reduce((a, b) => ((a.hits + a.decay) < (b.hits + b.decay) ? a : b));
        this.remove(victim.id);
      }
      const note = {
        id: `mem-${nowMs(opts).toString(36)}-${notes.length}`,
        project: projectKey,
        category,
        body: entry.body.slice(0, 2000),
        createdAt: nowMs(opts),
        updatedAt: nowMs(opts),
        hits: 0,
        decay: 0,
      };
      notes.push(note);
      byId.set(note.id, note);
      return { ok: true, note };
    },
    remove(id) {
      const note = byId.get(id);
      if (!note) return { ok: false, error: 'Not bulunamadı' };
      notes.splice(notes.indexOf(note), 1);
      byId.delete(id);
      return { ok: true };
    },
    update(id, patch) {
      const note = byId.get(id);
      if (!note) return { ok: false, error: 'Not bulunamadı' };
      if (typeof patch.body === 'string' && patch.body.trim()) note.body = patch.body.slice(0, 2000);
      if (CATEGORIES.includes(patch.category)) note.category = patch.category;
      note.updatedAt = nowMs(opts);
      return { ok: true, note };
    },
    list(filter = {}) {
      let out = notes.slice();
      if (filter.category && CATEGORIES.includes(filter.category)) {
        out = out.filter((n) => n.category === filter.category);
      }
      if (filter.minHits) out = out.filter((n) => n.hits >= filter.minHits);
      return { ok: true, notes: out, total: notes.length };
    },
    query(text, limit) {
      const words = normalize(text).split(' ').filter(Boolean);
      const scored = notes.map((n) => {
        const norm = normalize(n.body);
        let score = 0;
        words.forEach((w) => { if (norm.includes(w)) score += 1; });
        /* Decay: erişilmemiş notların ağırlığı zamanla azalır */
        const ageHours = (nowMs(opts) - n.updatedAt) / 3600000;
        const decayFactor = Math.pow(0.5, ageHours / DECAY_HALF_LIFE_HOURS);
        const relevance = (n.hits * 2 + score) * (0.2 + decayFactor * 0.8);
        return { note: n, relevance };
      });
      scored.sort((a, b) => b.relevance - a.relevance);
      const n = Math.max(1, Math.min(50, Number(limit) || 10));
      return { ok: true, results: scored.slice(0, n) };
    },
    inject(budget) {
      const max = Math.max(100, Math.min(50000, Number(budget) || DEFAULT_BUDGET));
      const picked = [];
      let used = 0;
      for (const { note } of this.query('', notes.length * 2).results || []) {
        if (used + note.body.length > max) break;
        picked.push(note);
        used += note.body.length;
        note.hits += 1;
      }
      return { ok: true, entries: picked, usedChars: used, budget: max };
    },
    prune() {
      const before = notes.length;
      /* 90 günden eski ve hiç isabet almamış notlar silinir */
      const cutoff = nowMs(opts) - 90 * 24 * 3600000;
      const removed = notes.filter((n) => n.hits === 0 && n.updatedAt < cutoff);
      removed.forEach((n) => { notes.splice(notes.indexOf(n), 1); byId.delete(n.id); });
      return { ok: true, removed: removed.length, remaining: notes.length, before };
    },
    info() {
      return {
        ok: true,
        project: projectKey,
        total: notes.length,
        byCategory: CATEGORIES.reduce((acc, c) => { acc[c] = notes.filter((n) => n.category === c).length; return acc; }, {}),
      };
    },
    testOnlyClear() { notes.length = 0; byId.clear(); },
  };
  stores.set(projectKey, api);
  return api;
}

/**
 * KREYX.md yoksa iskelet dosyası oluşturur. opts.fs inject edilebilir.
 */
function ensureKreyxMd(projectDir, opts = {}) {
  const fsMod = opts.fs || fs;
  const p = path.join(projectDir, 'KREYX.md');
  try {
    if (fsMod.existsSync(p)) return { ok: true, created: false, path: p };
    fsMod.mkdirSync(projectDir, { recursive: true });
    const skeleton = [
      '# KREYX.md',
      '',
      '> Bu dosya Krevyx ajanının proje belleğidir. Ajan görev öncesinde burayı okur,',
      '> görev sonunda gözlemleri buraya yazar. İnsan düzenlemesi güvenlidir.',
      '',
      '## Kurulum ve Ortam',
      '',
      '_(proje kurulum adımları, ortam değişkenleri)_',
      '',
      '## Stil ve Kurallar',
      '',
      '_(kod stili, isimlendirme, mimari tercihler)_',
      '',
      '## Test Stratejisi',
      '',
      '_(nasıl test edilir, kritik senaryolar)_',
      '',
      '## Operasyonel Notlar',
      '',
      '_(deploy, CI/CD, bakım)_',
      '',
    ].join('\n');
    fsMod.writeFileSync(p, skeleton, 'utf8');
    return { ok: true, created: true, path: p };
  } catch (err) {
    return { ok: false, error: `KREYX.md oluşturulamadı: ${err.message}` };
  }
}

function parseKreyxMd(text) {
  if (typeof text !== 'string') return { ok: false, error: 'Metin gerekli' };
  const entries = [];
  let current = null;
  text.split('\n').forEach((line) => {
    const m = /^## (.+)$/.exec(line);
    if (m) {
      if (current) entries.push(current);
      current = { section: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  });
  if (current) entries.push(current);
  return { ok: true, entries };
}

function renderKreyxMd(entries) {
  if (!Array.isArray(entries)) return { ok: false, error: 'Girdi gerekli' };
  const parts = entries.map((e) => `## ${String(e.section || '').trim()}\n\n${Array.isArray(e.lines) ? e.lines.join('\n') : ''}`);
  return { ok: true, text: `# KREYX.md\n\n${parts.join('\n\n')}\n` };
}

function getMemoryStore(projectKey, opts) {
  if (!projectKey || typeof projectKey !== 'string') {
    return { ok: false, error: 'Proje anahtarı gerekli' };
  }
  return { ok: true, store: createProjectStore(projectKey.trim(), opts) };
}

function testOnlyClear() {
  stores.clear();
}

module.exports = {
  CATEGORIES,
  DEFAULT_BUDGET,
  DECAY_HALF_LIFE_HOURS,
  getMemoryStore,
  ensureKreyxMd,
  parseKreyxMd,
  renderKreyxMd,
  testOnlyClear,
};
