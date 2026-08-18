'use strict';
/**
 * trust/audit-chain-v2.js — Krevyx v3.25 Denetim Zinciri v2: Merkle Köklü (T-2)
 *
 * Orijinal audit-log.js'in zincir doğrulamasını genişletir:
 *   - Her giriş SHA-256 zincirli (prev_hash) — v1 ile uyumlu
 *   - Blok başına merkle kök: N girişte bir kök hesaplanır ve zincirlenir
 *   - Sorgulanabilir index: actor / action / zaman aralığı / kategori
 *   - Export: jsonl, csv, sarif
 *
 * API:
 *   createChain(path, opts)        → zincir
 *   chain.append(actor, action, detail) → giriş ekle
 *   chain.verify()                 → zincir + merkle kökleri doğrula
 *   chain.query(opts)              → filtreli sorgu
 *   chain.export(format)           → 'jsonl' | 'csv' | 'sarif'
 *   computeMerkleRoot(hashes)      → saf hash ağacı
 *   verifyFile(filePath, opts)     → statik dosya doğrulaması (CLI)
 *   testOnlyClear()
 *
 * Blok boyutu: opts.blockSize (varsayılan 64). Her blok sonunda kök,
 * bir sonraki bloğun ilk girişinin prev_hash'ine işlenir.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_BLOCK_SIZE = 64;

function hashString(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

function computeMerkleRoot(hashes) {
  if (!Array.isArray(hashes) || !hashes.length) return '';
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] || a;
      next.push(hashString(a + b));
    }
    level = next;
  }
  return level[0];
}

function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function canonicalOf(entry, prev) {
  return hashString(
    JSON.stringify({
      ts: entry.ts, actor: entry.actor, action: entry.action,
      detail: entry.detail, duration_ms: entry.duration_ms,
      prev_hash: entry.prev_hash,
    }) + (prev || ''),
  );
}

function createChain(filePath, opts = {}) {
  const blockSize = Math.max(4, Math.min(1024, Number(opts.blockSize) || DEFAULT_BLOCK_SIZE));
  const fsMod = opts.fs || fs;
  const clock = opts.clock || (() => new Date().toISOString());
  let entries = [];
  let lastHash = '';
  let blockStartHash = '';
  let blockChainPrev = '';
  let roots = [];
  let loaded = false; let flushedLen = 0;

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      if (!fsMod.existsSync(filePath)) return;
      const body = fsMod.readFileSync(filePath, 'utf8');
      entries = body.trim().split('\n').filter(Boolean).map(parseLine).filter(Boolean);
      entries.forEach((e) => { lastHash = e.hash || ''; });
    } catch {
      entries = [];
    }
  }

  function flush() {
    try {
      fsMod.mkdirSync(path.dirname(filePath), { recursive: true });
      fsMod.appendFileSync(filePath, entries.slice(flushedLen).map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    } catch {
      /* append-only log; yazma hataları sessizce bırakılır */
      return;
    }
    flushedLen = entries.length;
  }

  const chain = {
    path: filePath,
    load,
    append(actor, action, detail) {
      load();
      const blockIndex = Math.floor(entries.length / blockSize);
      const posInBlock = entries.length % blockSize;
      let prev = lastHash;
      if (posInBlock === 0 && entries.length > 0) {
        /* Yeni blok: önceki bloğun merkle kökünü zincirle ve taşı */
        const blockHashes = entries.slice(-blockSize).map((e) => e.hash);
        const root = computeMerkleRoot(blockHashes);
        roots.push(root);
        blockChainPrev = hashString((blockChainPrev || '') + root);
        blockStartHash = blockChainPrev;
        prev = blockStartHash;
      }
      const entry = {
        ts: clock(),
        actor: typeof actor === 'string' ? actor : 'unknown',
        action: typeof action === 'string' ? action : 'unknown',
        detail: detail === undefined ? null : detail,
        duration_ms: null,
        prev_hash: prev,
      };
      entry.hash = canonicalOf(entry, prev);
      entry.block_index = blockIndex;
      entries.push(entry);
      lastHash = entry.hash;
      flush();
      return { ok: true, entry, blockIndex, posInBlock };
    },
    verify() {
      load();
      let prev = '';
      let prevRoot = '';
      const byBlock = new Map();
      const computedRoots = [];
      for (let i = 0; i < entries.length; i += 1) {
        const e = entries[i];
        const posInBlock = i % blockSize;
        if (posInBlock === 0 && i > 0 && computedRoots.length) {
          /* Blok sınırı: append tarafındaki zincirleme kök mantığıyla prev yeniden kurulur */
          prevRoot = hashString((prevRoot || '') + computedRoots[computedRoots.length - 1]);
          prev = prevRoot;
        }
        const expected = canonicalOf(e, prev);
        if (!e.hash || e.hash !== expected) {
          return { ok: false, valid: false, badLine: i + 1, total: entries.length, error: 'Zincir kırığı' };
        }
        const bi = typeof e.block_index === 'number' ? e.block_index : Math.floor(i / blockSize);
        const arr = byBlock.get(bi) || [];
        arr.push(e.hash);
        byBlock.set(bi, arr);
        prev = e.hash;
        if (posInBlock === blockSize - 1 || i === entries.length - 1) {
          const blockHashes = byBlock.get(bi);
          if (blockHashes && blockHashes.length) computedRoots.push(computeMerkleRoot(blockHashes));
        }
      }
      /* Merkle kök kontrolü */
      const expectedRoots = [];
      byBlock.forEach((hashes) => { expectedRoots.push(computeMerkleRoot(hashes)); });
      const rootOk = roots.length <= expectedRoots.length && roots.every((r, i) => r === expectedRoots[i]);
      return { ok: true, valid: true, total: entries.length, blocks: byBlock.size, merkleValid: rootOk, roots: expectedRoots };
    },
    query(qopts = {}) {
      load();
      let out = entries.slice();
      if (qopts.actor) out = out.filter((e) => e.actor === qopts.actor);
      if (qopts.action) out = out.filter((e) => e.action === qopts.action);
      if (qopts.since) out = out.filter((e) => e.ts >= qopts.since);
      if (qopts.until) out = out.filter((e) => e.ts <= qopts.until);
      const total = out.length;
      const offset = Math.max(0, Number(qopts.offset) || 0);
      const limit = Math.min(500, Math.max(1, Number(qopts.limit) || 100));
      return { ok: true, entries: out.slice(offset, offset + limit), total };
    },
    export(format) {
      load();
      if (format === 'csv') {
        const header = 'ts,actor,action,detail,duration_ms,hash';
        const rows = entries.map((e) =>
          [e.ts, e.actor, e.action, JSON.stringify(e.detail || ''), e.duration_ms || '', e.hash].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','),
        );
        return { ok: true, text: [header, ...rows].join('\n') };
      }
      if (format === 'sarif') {
        const results = entries.map((e) => ({
          ruleId: e.action || 'audit-entry',
          level: 'note',
          message: { text: `${e.actor}: ${JSON.stringify(e.detail || {}).slice(0, 200)}` },
          properties: { ts: e.ts, actor: e.actor, hash: e.hash },
        }));
        return {
          ok: true,
          sarif: {
            version: '2.1.0',
            runs: [{ tool: { driver: { name: 'Krevyx Audit Chain v2', version: '3.25.0' } }, results }],
          },
        };
      }
      return { ok: true, text: entries.map((e) => JSON.stringify(e)).join('\n') + '\n' };
    },
    stats() {
      load();
      return { ok: true, entries: entries.length, roots: roots.length, lastHash, path: filePath };
    },
    testOnlyClear() {
      entries = [];
      roots = [];
      lastHash = '';
      loaded = true; blockChainPrev = "";
    },
  };
  return chain;
}

/**
 * Statik dosya doğrulaması: CLI (krevyx verify-audit --v2) için.
 */
function verifyFile(filePath, opts = {}) {
  const blockSize = Math.max(4, Math.min(1024, Number(opts.blockSize) || DEFAULT_BLOCK_SIZE));
  const fsMod = opts.fs || fs;
  const chain = createChain(filePath, { fs: fsMod, blockSize });
  return chain.verify();
}

function testOnlyClear() {
  /* global tutulan bir şey yok; dosya temizliği çağrı başına yapılır */
}

module.exports = {
  DEFAULT_BLOCK_SIZE,
  hashString,
  computeMerkleRoot,
  createChain,
  verifyFile,
  testOnlyClear,
};
