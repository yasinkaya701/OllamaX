/**
 * audit-log.js — Denetim kaydı (F6.2, v4.0 kurumsal katmanın temeli)
 *
 * JSON-lines formatı, hash zinciri bütünlüğü: her satır bir önceki satırın
 * hash'ini içerir. zinciri kırma/yeniden yazma denemeleri query
 * doğrulamasında tespit edilir.
 *
 * Satır şeması: {ts, actor, action, detail, duration_ms, prev_hash, hash}
 */

'use strict';

const fs = require('fs');
const crypto = require('crypto');

const { auditLogPath } = require('./config/config-store');

const MAX_AUDIT_BYTES = 50 * 1024 * 1024; // 50MB tavanı

function hashString(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function getPrevHash(filePath) {
  try {
    if (!fs.existsSync(filePath)) return 'genesis';
    const body = fs.readFileSync(filePath, 'utf8');
    const lines = body.trim().split('\n').filter(Boolean);
    if (!lines.length) return 'genesis';
    const last = JSON.parse(lines[lines.length - 1]);
    return last.hash || 'genesis';
  } catch {
    return 'genesis';
  }
}

/**
 * Bir denetim satırı yazar. actor: 'user' | 'agent' | 'system' | 'plugin'
 */
function logEntry(actor, action, detail = null, durationMs = null, customPath = null) {
  try {
    const filePath = customPath || auditLogPath();
    const prev = getPrevHash(filePath);
    const entry = {
      ts: new Date().toISOString(),
      actor: String(actor || 'system'),
      action: String(action || '').slice(0, 128),
      detail: detail === null ? null : JSON.stringify(detail).slice(0, 4096),
      duration_ms: durationMs === null ? null : durationMs,
      prev_hash: prev,
    };
    entry.hash = hashString(JSON.stringify(entry) + prev);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf8');
    // Tavan aşımında en eski %50'yi budama
    try {
      const st = fs.statSync(filePath);
      if (st.size > MAX_AUDIT_BYTES) {
        const body = fs.readFileSync(filePath, 'utf8');
        const lines = body.split('\n').filter(Boolean);
        const keep = lines.slice(Math.floor(lines.length / 2));
        fs.writeFileSync(filePath, keep.join('\n') + '\n', 'utf8');
      }
    } catch {
      /* ignore */
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Zinciri baştan sona doğrular. Bozuk satır indeksini döndürür (-1 = temiz).
 */
function verifyChain(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { valid: true, badLine: -1, total: 0 };
    const body = fs.readFileSync(filePath, 'utf8');
    const lines = body.trim().split('\n').filter(Boolean);
    let prev = 'genesis';
    for (let i = 0; i < lines.length; i += 1) {
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        return { valid: false, badLine: i + 1, total: lines.length };
      }
      // prev_hash + içeriğin hash'i (hash alanı hariç)
      const canonical = hashString(
        JSON.stringify({ ts: entry.ts, actor: entry.actor, action: entry.action, detail: entry.detail, duration_ms: entry.duration_ms, prev_hash: entry.prev_hash }) + prev,
      );
      if (!entry.prev_hash || entry.prev_hash !== prev || entry.hash !== canonical) {
        return { valid: false, badLine: i + 1, total: lines.length };
      }
      prev = entry.hash;
    }
    return { valid: true, badLine: -1, total: lines.length };
  } catch {
    return { valid: false, badLine: 0, total: 0 };
  }
}

/**
 * Sorgulama: opsyonel filtre {actor, action, limit, offset}
 */
function query(opts = {}, customPath = null) {
  try {
    const filePath = customPath || auditLogPath();
    if (!fs.existsSync(filePath)) return { entries: [], total: 0 };
    const body = fs.readFileSync(filePath, 'utf8');
    let entries = body
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const total = entries.length;
    if (opts.actor) entries = entries.filter((e) => e.actor === opts.actor);
    if (opts.action) entries = entries.filter((e) => e.action === opts.action);
    const offset = Math.max(0, opts.offset || 0);
    const limit = Math.min(500, Math.max(1, opts.limit || 100));
    return { entries: entries.slice(offset, offset + limit), total };
  } catch {
    return { entries: [], total: 0 };
  }
}

module.exports = { logEntry, verifyChain, query, hashString };
