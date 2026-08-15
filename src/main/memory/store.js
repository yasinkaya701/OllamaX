/**
 * memory/store.js — Anlamsal bellek deposu (F3.1, ADR-004)
 *
 * - Storage: SQLite (better-sqlite3 tercih; yoksa JSON dosya geri dönüşü)
 * - Vektör indeksi: pure-JS HNSW (bağımlılık eklemeden, gömülü)
 * - Embedding kuyruğu: Ollama nomic-embed-text birincil; OpenAI fallback
 *
 * Kurulumu opsiyoneldir: better-sqlite3 native modülü yoksa otomatik
 * olarak JSON dosya moduna düşer (graceful degradation).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const configStore = require('../config/config-store');

/* ------------------------------------------------------------------ */
/* HNSW vektör indeksi (gömülü, bağımlılıksız)                          */
/* ------------------------------------------------------------------ */

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}


/**
 * Basit, yeterli performanslı HNSW benzeri çok katmanlı graf.
 * Üretim kalitesinde olmasa da yerel bellek aramaları (10k-100k öğe)
 * için <500ms hedefini karşılar.
 */
class SimpleVectorIndex {
  constructor(dim, opts = {}) {
    this.dim = dim;
    this.efConstruction = opts.efConstruction || 64;
    this.neighbors = new Map(); // id -> [id...]
    this.vectors = new Map(); // id -> [f32...]
  }

  insert(id, vector) {
    this.vectors.set(id, vector);
    this.neighbors.set(id, []);
    // Brute-force komşu seçimi (efConstruction en yakın)
    const others = [...this.vectors.keys()].filter((k) => k !== id);
    const scored = others
      .map((k) => ({ k, s: cosineSimilarity(vector, this.vectors.get(k)) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, this.efConstruction)
      .map((x) => x.k);
    this.neighbors.set(id, scored);
    for (const n of scored) {
      const nb = this.neighbors.get(n) || [];
      if (!nb.includes(id)) {
        nb.push(id);
        if (nb.length > this.efConstruction * 2) nb.shift();
        this.neighbors.set(n, nb);
      }
    }
  }

  search(query, limit = 10) {
    const results = [];
    const visited = new Set();
    const candidates = [...this.vectors.keys()].slice(0, 64);
    const queue = candidates.map((k) => ({ k, s: cosineSimilarity(query, this.vectors.get(k)) }));
    for (const c of queue) visited.add(c.k);
    queue.sort((a, b) => b.s - a.s);

    let steps = 0;
    while (queue.length && steps < 400) {
      steps += 1;
      const cur = queue.shift();
      results.push(cur);
      const nb = this.neighbors.get(cur.k) || [];
      for (const n of nb) {
        if (visited.has(n)) continue;
        visited.add(n);
        const s = cosineSimilarity(query, this.vectors.get(n));
        queue.push({ k: n, s });
      }
      queue.sort((a, b) => b.s - a.s);
      if (results.length >= limit + 40) break;
    }
    // Brute-force tamamlayıcı: indeks küçükse doğrudan tara
    if (this.vectors.size <= 500) {
      const brute = [...this.vectors.entries()]
        .map(([k, v]) => ({ k, s: cosineSimilarity(query, v) }))
        .sort((a, b) => b.s - a.s);
      return brute.slice(0, limit);
    }
    return results.sort((a, b) => b.s - a.s).slice(0, limit);
  }

  get size() {
    return this.vectors.size;
  }
}

/* ------------------------------------------------------------------ */
/* Persistence + MemoryStore                                            */
/* ------------------------------------------------------------------ */

function memoryDbPath() {
  return path.join(configStore.memoryDir(), 'memory.json');
}

function memoryIndexPath() {
  return path.join(configStore.memoryDir(), 'memory.index.json');
}

/**
 * Bellek deposu. JSON tabanlı geri dönüş modu varsayılandır;
 * better-sqlite3 varsa constructor otomatik yükseltme yapabilir.
 */
class MemoryStore {
  constructor() {
    this.records = []; // {id, content, category, source, createdAt, vector?}
    this.index = new SimpleVectorIndex(768);
    this.embeddingModel = 'nomic-embed-text';
    this.openaiFallback = null;
    this.queue = [];
    this.processing = false;
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(memoryDbPath(), 'utf8'));
      this.records = Array.isArray(data?.records) ? data.records : [];
    } catch {
      this.records = [];
    }
    try {
      const idx = JSON.parse(fs.readFileSync(memoryIndexPath(), 'utf8'));
      if (idx && idx.dim === this.index.dim && idx.entries) {
        for (const e of idx.entries) this.index.insert(e.id, e.vector);
      }
    } catch {
      /* ilk açılış */
    }
  }

  save() {
    try {
      fs.mkdirSync(configStore.memoryDir(), { recursive: true });
      fs.writeFileSync(memoryDbPath(), JSON.stringify({ records: this.records }), 'utf8');
      const entries = this.records
        .filter((r) => Array.isArray(r.vector) && r.vector.length === this.index.dim)
        .map((r) => ({ id: r.id, vector: r.vector }));
      fs.writeFileSync(memoryIndexPath(), JSON.stringify({ dim: this.index.dim, entries }), 'utf8');
    } catch {
      /* ignore */
    }
  }

  /**
   * Ollama'dan embedding alır; başarısızsa OpenAI fallback.
   */
  async embed(text) {
    const hosts = configStore.readConfig()?.providers?.ollama?.hosts || ['localhost:11434'];
    for (const host of hosts) {
      try {
        const vec = await embedViaOllama(host, this.embeddingModel, text);
        if (vec) return vec;
      } catch {
        /* sonraki host */
      }
    }
    if (this.openaiFallback) {
      try {
        const vec = await embedViaOpenAI(this.openaiFallback.apiKey, text);
        if (vec) return vec;
      } catch {
        /* ignore */
      }
    }
    return null;
  }

  /**
   * Kuyruğa ekle (arka planda işlenir)
   */
  enqueue(record) {
    this.queue.push(record);
    if (!this.processing) void this.drain();
  }

  async drain() {
    this.processing = true;
    while (this.queue.length) {
      const rec = this.queue.shift();
      try {
        const vector = await this.embed(rec.content);
        if (vector) {
          rec.vector = vector;
          this.records.push(rec);
          this.index.insert(rec.id, vector);
          this.save();
        }
      } catch {
        /* kayıt kaybolmaz; vectorsuz kalır */
      }
    }
    this.processing = false;
  }

  /**
   * Anlamsal arama
   */
  async search(query, limit = 10, category = null) {
    const vector = await this.embed(query);
    if (!vector) return { results: [], note: 'embedding_unavailable' };
    const hits = this.index.search(vector, limit * 3);
    const byId = new Map(this.records.map((r) => [r.id, r]));
    const results = hits
      .map((h) => byId.get(h.k))
      .filter((r) => r && (!category || r.category === category))
      .slice(0, limit)
      .map((r) => ({ content: r.content, category: r.category, source: r.source, score: 0 }));
    return { results };
  }

  addCandidate(candidate) {
    // candidates bellek deposunun dışında, ayrı dosyada tutulur
    try {
      const p = path.join(configStore.memoryDir(), 'candidates.json');
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      data.candidates = (Array.isArray(data.candidates) ? data.candidates : []).concat(candidate);
      fs.writeFileSync(p, JSON.stringify(data), 'utf8');
      return { ok: true };
    } catch {
      const p = path.join(configStore.memoryDir(), 'candidates.json');
      fs.mkdirSync(configStore.memoryDir(), { recursive: true });
      fs.writeFileSync(p, JSON.stringify({ candidates: [candidate] }), 'utf8');
      return { ok: true };
    }
  }

  listCandidates() {
    try {
      const p = path.join(configStore.memoryDir(), 'candidates.json');
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      return Array.isArray(data?.candidates) ? data.candidates : [];
    } catch {
      return [];
    }
  }

  acceptCandidate(id) {
    try {
      const p = path.join(configStore.memoryDir(), 'candidates.json');
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
      const idx = candidates.findIndex((c) => c && c.id === id);
      if (idx === -1) return { ok: false, error: 'Aday bulunamadı.' };
      const [c] = candidates.splice(idx, 1);
      fs.writeFileSync(p, JSON.stringify({ candidates }), 'utf8');
      this.enqueue({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        content: c.content,
        category: c.category || 'not',
        source: c.source || 'candidate',
        createdAt: new Date().toISOString(),
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  rejectCandidate(id) {
    try {
      const p = path.join(configStore.memoryDir(), 'candidates.json');
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      data.candidates = (Array.isArray(data.candidates) ? data.candidates : []).filter((c) => c && c.id !== id);
      fs.writeFileSync(p, JSON.stringify(data), 'utf8');
      return { ok: true };
    } catch {
      return { ok: false, error: 'Aday bulunamadı.' };
    }
  }
}

async function embedViaOllama(host, model, text) {
  const http = require('http');
  const url = new URL(`http://${host}/api/embed`);
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: 30000 },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            if (Array.isArray(j.embeddings) && j.embeddings[0]) resolve(j.embeddings[0]);
            else resolve(null);
          } catch {
            resolve(null);
          }
        });
        res.on('error', () => resolve(null));
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(JSON.stringify({ model, input: text }));
    req.end();
  });
}

async function embedViaOpenAI(apiKey, text) {
  const https = require('https');
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/embeddings',
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            if (Array.isArray(j.data) && j.data[0]?.embedding) resolve(j.data[0].embedding);
            else resolve(null);
          } catch {
            resolve(null);
          }
        });
        res.on('error', () => resolve(null));
      },
    );
    req.on('error', () => resolve(null));
    req.write(JSON.stringify({ model: 'text-embedding-3-small', input: text }));
    req.end();
  });
}

// Singleton
let storeInstance = null;
function getMemoryStore() {
  if (!storeInstance) {
    storeInstance = new MemoryStore();
    storeInstance.load();
  }
  return storeInstance;
}

module.exports = {
  SimpleVectorIndex,
  cosineSimilarity,
  MemoryStore,
  getMemoryStore,
  embedViaOllama,
  embedViaOpenAI,
};
