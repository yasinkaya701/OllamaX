'use strict';
/**
 * featured-discover.js — Otomatik GitHub repo keşif motoru (v3.11)
 *
 * Statik katalog (featured-repos.json) yerine GitHub API'den canlı çekilen,
 * otomatik kategorilenen keşif sistemi.
 *
 * Davranış:
 *  1. Açılışta ve periyodik olarak (varsayılan 4 saat) kategori sorgularını
 *     parallel olarak çekip birleştirir (toplam ~6-8 API çağrısı, 10 dk
 *     search rate limit'e karşı dağıtılmış).
 *  2. Sonuçlar diske `userData/featured-cache.json` olarak kilitlenir;
 *     çevrimdışı/rate-limit durumunda cache servis edilir.
 *  3. Repo, tanımlı anahtar kelime kurallarıyla otomatik kategoriye atanır.
 *  4. `get-featured-repos` IPC'si her zaman bu motorun çıktısını verir
 *     (statik katalog yalnızca ilk kurulum/yedek olarak kalır).
 *
 * Kural tabanlı kategori eşlemesi: her kategori için query + keyword seti
 * vardır; bir repo, query'sinin sonucu değil keyword eşleşmesiyle kategori
 * rozeti alır (aynı sorgu birden fazla kategoriye düşebilir).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const CACHE_TTL_MS = 4 * 3600 * 1000; /* 4 saat */
const MAX_REPO_PER_CAT = 6;

/* Kategori sorguları: GitHub search qualifiers ile tanımlanır */
const CATEGORY_QUERIES = [
  { id: 'learning-path', label: 'Learning Path', icon: 'sparkle',
    query: 'topic:machine-learning topic:education stars:>3000',
    keywords: ['zero to', 'zero-to-hero', 'nn-', 'course', 'lecture', 'tutorial', 'from scratch', 'book', 'handbook'] },
  { id: 'ai-foundations', label: 'AI Foundations', icon: 'chip',
    query: 'topic:llm OR topic:gpt stars:>5000 pushed:>2025-01-01',
    keywords: ['nanoGPT', 'llama2', 'llama3', 'gpt', 'transformer', 'karpathy', 'tiny', 'minigpt', 'minillama'] },
  { id: 'agents-orchestration', label: 'Agents & Orchestration', icon: 'workflow',
    query: 'topic:ai-agents OR topic:llm-agent stars:>1000 pushed:>2025-06-01',
    keywords: ['agent', 'orchestrat', 'crew', 'autogen', 'langgraph', 'agentic', 'multi-agent'] },
  { id: 'local-inference', label: 'Local Inference', icon: 'terminal',
    query: 'topic:llm-inference OR topic:local-llm stars:>10000 pushed:>2025-01-01',
    keywords: ['llama.cpp', 'ollama', 'gguf', 'lmstudio', 'vllm', 'mlx', 'llamafile', 'exllamav2'] },
  { id: 'rag-data', label: 'RAG & Data', icon: 'database',
    query: 'topic:rag OR topic:embeddings stars:>2000 pushed:>2025-01-01',
    keywords: ['rag', 'retrieval', 'embedding', 'vector', 'chroma', 'weaviate', 'qdrant', 'llamaindex'] },
];

let cache = null; /* { updated, categories: [{ id, label, icon, repos: [] }] } */
let inFlight = null;

function userDataDir() {
  try {
    const { app } = require('electron');
    return app.getPath('userData');
  } catch {
    return path.join(process.env.HOME || '/tmp', '.ollamax');
  }
}

function cachePath() {
  return path.join(userDataDir(), 'featured-cache.json');
}

function loadDiskCache() {
  try {
    const raw = fs.readFileSync(cachePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.categories)) return parsed;
  } catch { /* ilk kurulumda yok */ }
  return null;
}

function saveDiskCache(data) {
  try {
    const dir = path.dirname(cachePath());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(data), 'utf8');
  } catch { /* yazma hatası kritik değil */ }
}

/* Statik yedek katalog (src/shared/featured-repos.json) */
function loadStaticFallback() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'featured-repos.json'), 'utf8'));
  } catch {
    return { categories: [] };
  }
}

function httpsGetJson(opts, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(opts, { timeout: timeoutMs }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`http ${res.statusCode}`));
      }
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { reject(new Error('parse')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function bestCategoryFor(repo) {
  const text = (`${repo.full_name} ${repo.description || ''} ${repo.topics ? repo.topics.join(' ') : ''}`).toLowerCase();
  let best = null;
  for (const cat of CATEGORY_QUERIES) {
    for (const kw of cat.keywords) {
      if (text.includes(kw.toLowerCase())) {
        best = cat;
        break;
      }
    }
    if (best) break;
  }
  return best ? best.id : 'ai-foundations';
}

function repoToItem(item) {
  return {
    name: item.full_name,
    query: item.full_name,
    desc: (item.description || 'Açıklama yok.').slice(0, 120),
    stars: item.stargazers_count || 0,
    lang: item.language || '',
    url: item.html_url || '',
  };
}

async function fetchCategory(cat) {
  const opts = {
    hostname: 'api.github.com',
    path: `/search/repositories?q=${encodeURIComponent(cat.query)}&sort=stars&per_page=${MAX_REPO_PER_CAT + 4}`,
    headers: { 'User-Agent': 'OllamaX-Ultra/3.11', Accept: 'application/vnd.github.v3+json' },
    timeout: 15000,
  };
  const data = await httpsGetJson(opts);
  const items = (data.items || []).map(repoToItem);
  const repos = [];
  for (const item of items) {
    if (repos.length >= MAX_REPO_PER_CAT) break;
    const cid = bestCategoryFor(item);
    if (cid === cat.id || repos.length === 0) repos.push({ ...item, catId: cid });
    else {
      /* kategori dışı kaldıysa hedef kategorisinin deposu olarak sayılmaz */
    }
  }
  return repos;
}

function freshEnough() {
  return cache && cache.updated && (Date.now() - cache.updated < CACHE_TTL_MS);
}

async function refreshAll() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const results = await Promise.allSettled(CATEGORY_QUERIES.map(fetchCategory));
    const categories = CATEGORY_QUERIES.map((cat, i) => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon,
      repos: results[i].status === 'fulfilled' ? results[i].value : [],
    }));
    const total = categories.reduce((n, c) => n + c.repos.length, 0);
    const newData = { updated: Date.now(), source: 'live', categories };
    if (total >= 5) {
      cache = newData;
      saveDiskCache(newData);
    } else if (!freshEnough()) {
      /* canlı veri yetersiz → eski cache/disk cache korunur */
    }
    return newData;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

function getFeaturedRepos() {
  if (freshEnough()) return cache;
  const disk = loadDiskCache();
  if (disk && disk.updated && Date.now() - disk.updated < CACHE_TTL_MS * 3) return disk;
  return loadStaticFallback();
}

async function loadFeaturedReposAuto() {
  if (freshEnough()) return cache;
  /* Çevrimdışı/rate-limit'te bloklamadan cache döndür; arka planda yenile */
  const snapshot = getFeaturedRepos();
  refreshAll().catch(() => { /* sessiz */ });
  return snapshot;
}

module.exports = {
  loadFeaturedReposAuto,
  refreshAll,
  getFeaturedRepos,
  CATEGORY_QUERIES,
  CACHE_TTL_MS,
  /* test amaçlı */
  _bestCategoryFor: bestCategoryFor,
  _repoToItem: repoToItem,
};
