'use strict';
/**
 * agents-ext/context-manager.js — Krevyx v3.25 Uzun Süreli Bağlam Yönetimi (Q-4)
 *
 * Uzun diyalog/görev akışlarında bağlamı bütçe içinde tutar:
 *   - Özetleme katmanı: eski mesajlar özet metne sıkıştırılır
 *   - Önem skorlu budama: düşük önemli içerik önce atılır
 *   - Kaydet/yükle: oturum bağlamı diske taşınır (oturum askıya alma)
 *
 * Mesaj şekli: { id, role, content, importance?, ts? }
 *
 * API:
 *   createManager(opts)            → { add, summary, trim, budget, save, load, state }
 *   summarizeChunks(chunks, opts)  → kaba özetleme (sözcük bazlı sıkıştırma)
 *   testOnlyClear()
 *
 * LLM'siz özetleme: cümle seçici (lead-sentence) stratejisi; opsiyonel
 * llmSummarizer inject edilebilir.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const DEFAULT_BUDGET = 16000;
const SYSTEM_PRESERVE = 2; /* rol=system mesajları her zaman korunur */

const managers = new Map();

function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}

function extractLeadSentences(text, maxSentences) {
  const parts = String(text || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, Math.max(1, maxSentences)).join(' ');
}

function summarizeChunks(chunks, opts = {}) {
  if (!Array.isArray(chunks) || !chunks.length) return { ok: false, error: 'Parça listesi gerekli' };
  const { llmSummarizer = null, maxSentencesPerChunk = 2 } = opts;
  const summarized = [];
  chunks.forEach((chunk, idx) => {
    const content = typeof chunk === 'string' ? chunk : chunk.content || '';
    const meta = typeof chunk === 'object' ? chunk.meta || '' : '';
    let text;
    if (llmSummarizer) {
      try {
        text = llmSummarizer(content, meta);
      } catch {
        text = null;
      }
    }
    if (!text) text = `[Özet ${idx + 1}] ${extractLeadSentences(content, maxSentencesPerChunk)}${meta ? ` (${meta})` : ''}`;
    summarized.push({ index: idx, content: text });
  });
  return { ok: true, summarized };
}

function createManager(opts = {}) {
  const id = `ctx-${Date.now().toString(36)}-${managers.size}`;
  const budget = Math.max(500, Math.min(200000, Number(opts.budget) || DEFAULT_BUDGET));
  const importanceFloor = typeof opts.importanceFloor === 'number' ? opts.importanceFloor : 0.3;
  const messages = [];
  let summary = '';
  let summaryTokens = 0;
  const fsMod = opts.fs || fs;
  const dir = opts.dir || path.join(os.homedir(), '.krevyx', 'context');
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now();

  const api = {
    id,
    add(msg) {
      if (!msg || typeof msg.content !== 'string') return { ok: false, error: 'Mesaj gerekli' };
      const entry = {
        id: msg.id || `m-${clock().toString(36)}-${messages.length}`,
        role: msg.role || 'user',
        content: msg.content.slice(0, 50000),
        importance: typeof msg.importance === 'number' ? Math.max(0, Math.min(1, msg.importance)) : 0.5,
        ts: msg.ts || clock(),
      };
      messages.push(entry);
      return { ok: true, id: entry.id };
    },
    setSummary(text) {
      summary = typeof text === 'string' ? text.slice(0, 100000) : '';
      summaryTokens = estimateTokens(summary);
      return { ok: true, summaryTokens };
    },
    getSummary() {
      return { ok: true, summary, tokens: summaryTokens };
    },
    trim(targetBudget) {
      const limit = Math.max(500, Math.min(budget, Number(targetBudget) || budget));
      /* Sistem mesajlarını koru */
      const protectedRoles = new Set(['system']);
      const candidates = messages.filter((m) => !protectedRoles.has(m.role));
      const protectedCount = messages.filter((m) => protectedRoles.has(m.role)).length;

      /* 1. Aşama: düşük önemlileri budama */
      const removed = [];
      let current = estimateTokens(summary) + messages.reduce((a, m) => a + estimateTokens(m.content), 0);
      if (current > limit) {
        candidates.sort((a, b) => a.importance - b.importance || a.ts - b.ts);
        for (const m of candidates) {
          if (m.importance < importanceFloor) {
            const idx = messages.indexOf(m);
            if (idx !== -1) {
              messages.splice(idx, 1);
              removed.push(m.id);
              current -= estimateTokens(m.content);
            }
          }
          if (current <= limit) break;
        }
      }
      /* 2. Aşama: en eskileri özetleyip kısaltma */
      if (current > limit && candidates.length > SYSTEM_PRESERVE + 2) {
        const excess = messages.filter((m) => !protectedRoles.has(m.role));
        const toSummarize = excess.slice(0, Math.max(1, Math.floor(excess.length / 2)));
        const res = summarizeChunks(toSummarize.map((m) => ({ content: m.content, meta: m.role })));
        if (res.ok) {
          const newSummary = [summary, ...res.summarized.map((s) => s.content)].join(' ').slice(0, 100000);
          summary = newSummary;
          summaryTokens = estimateTokens(newSummary);
          toSummarize.forEach((m) => {
            const idx = messages.indexOf(m);
            if (idx !== -1) messages.splice(idx, 1);
          });
          removed.push(...toSummarize.map((m) => m.id));
        }
      }
      return { ok: true, removed, remaining: messages.length, summaryTokens, tokens: current };
    },
    budget() {
      const tokens = estimateTokens(summary) + messages.reduce((a, m) => a + estimateTokens(m.content), 0);
      return { ok: true, budget, tokens, usageRatio: budget ? Math.round((tokens / budget) * 1000) / 1000 : 0 };
    },
    snapshot() {
      return {
        id: api.id,
        summary,
        messages: messages.slice(),
        savedAt: clock(),
      };
    },
    async save() {
      try {
        fsMod.mkdirSync(dir, { recursive: true });
        fsMod.writeFileSync(path.join(dir, `${api.id}.json`), JSON.stringify(api.snapshot()), 'utf8');
        return { ok: true, path: path.join(dir, `${api.id}.json`) };
      } catch (err) {
        return { ok: false, error: `Kaydetme hatası: ${err.message}` };
      }
    },
    async load(saveId) {
      try {
        const fp = path.join(dir, `${saveId || api.id}.json`);
        if (!fsMod.existsSync(fp)) return { ok: false, error: 'Kayıt bulunamadı' };
        const data = JSON.parse(fsMod.readFileSync(fp, 'utf8'));
        if (!Array.isArray(data.messages)) return { ok: false, error: 'Bozuk kayıt' };
        messages.length = 0;
        data.messages.forEach((m) => messages.push(m));
        summary = typeof data.summary === 'string' ? data.summary : '';
        summaryTokens = estimateTokens(summary);
        return { ok: true, loaded: messages.length };
      } catch (err) {
        return { ok: false, error: `Yükleme hatası: ${err.message}` };
      }
    },
    state() {
      const byRole = {};
      messages.forEach((m) => { byRole[m.role] = (byRole[m.role] || 0) + 1; });
      return { ok: true, id: api.id, messages: messages.length, byRole, summaryTokens, budget };
    },
    destroy() {
      messages.length = 0;
      summary = '';
      managers.delete(id);
      return { ok: true };
    },
  };
  managers.set(id, api);
  return { ok: true, manager: api };
}

function getManager(id) {
  return managers.get(id) || null;
}

function testOnlyClear() {
  managers.clear();
}

module.exports = {
  DEFAULT_BUDGET,
  createManager,
  getManager,
  summarizeChunks,
  estimateTokens,
  testOnlyClear,
};
