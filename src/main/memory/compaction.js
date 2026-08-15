/**
 * memory/compaction.js — Bağlam sıkıştırma (F3.4)
 *
 * Uzun sohbetlerde bağlam penceresi dolduğunda geçmişin ilk kısmı bir
 * özet modeliyle sıkıştırılır; ayrıntılar bellek deposuna kaydedilir.
 *
 * Varsayılan davranış: mesaj sayısının 2x katından fazlası birikince
 * ilk %60 özetlenir. Özet için yerel küçük model tercih edilir
 * (örn. Ollama'dan 7B sınıfı); fallback OpenAI.
 */

'use strict';

const http = require('http');
const https = require('https');

const configStore = require('../config/config-store');
const { getMemoryStore } = require('./store');

const COMPACT_RATIO = 0.6; // özetlenecek oran
const MIN_MESSAGES_TO_COMPACT = 40; // en az bu kadar mesaj olmalı
const KEEP_RECENT = 10; // son N mesaj her zaman korunur

function estimateTokens(text) {
  return Math.ceil((text || '').length / 3.5);
}

/**
 * Yerel (Ollama) modelle özet üretir
 */
async function summarizeViaOllama(host, model, history) {
  const url = new URL(`http://${host}/api/generate`);
  const prompt = `Aşağıdaki sohbet geçmişi özetlenecek. Önemli kararları, projeleri, teknik detayları ve kullanıcı tercihlerini koruyarak 150-250 kelimelik akıcı bir özet yaz. Türkçe yanıt ver.

${history.map((m) => `${m.role}: ${m.content}`).join('\n')}`;
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST', timeout: 60000 },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const lines = buf.trim().split('\n');
            const last = JSON.parse(lines[lines.length - 1]);
            resolve(last?.response || '');
          } catch {
            resolve('');
          }
        });
        res.on('error', () => resolve(''));
      },
    );
    req.on('error', () => resolve(''));
    req.on('timeout', () => {
      req.destroy();
      resolve('');
    });
    req.write(JSON.stringify({ model, prompt, stream: false }));
    req.end();
  });
}

/**
 * OpenAI fallback özet
 */
async function summarizeViaOpenAI(apiKey, history) {
  const prompt = `Aşağıdaki sohbet geçmişi özetlenecek. Önemli kararları, projeleri, teknik detayları ve kullanıcı tercihlerini koruyarak 150-250 kelimelik akıcı bir özet yaz. Türkçe yanıt ver.

${history.map((m) => `${m.role}: ${m.content}`).join('\n')}`;
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        timeout: 60000,
      },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            const j = JSON.parse(buf);
            resolve(j.choices?.[0]?.message?.content || '');
          } catch {
            resolve('');
          }
        });
        res.on('error', () => resolve(''));
      },
    );
    req.on('error', () => resolve(''));
    req.write(
      JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
      }),
    );
    req.end();
  });
}

/**
 * Ana sıkıştırma fonksiyonu. messages dizisini değiştirerek
 * {kept, summary, archivedCount} döndürür.
 */
async function compactContext(messages, opts = {}) {
  if (!Array.isArray(messages)) return { kept: messages, summary: '', archivedCount: 0 };
  if (messages.length < MIN_MESSAGES_TO_COMPACT) {
    return { kept: messages, summary: '', archivedCount: 0 };
  }

  const toCompact = messages.slice(0, Math.floor(messages.length * COMPACT_RATIO));
  const keep = messages.slice(Math.floor(messages.length * COMPACT_RATIO));

  const config = configStore.readConfig();
  const hosts = config?.providers?.ollama?.hosts || ['localhost:11434'];
  const summaryModel = opts.summaryModel || 'llama3.2:1b';
  let summary = '';

  for (const host of hosts) {
    summary = await summarizeViaOllama(host, summaryModel, toCompact);
    if (summary && summary.trim().length > 20) break;
  }

  if (!summary || summary.trim().length <= 20) {
    const apiKey = configStore.resolveApiKey(config?.providers?.openai?.apiKey);
    if (apiKey) summary = await summarizeViaOpenAI(apiKey, toCompact);
  }

  if (!summary || summary.trim().length <= 20) {
    return { kept: messages, summary: '', archivedCount: 0, note: 'summary_unavailable' };
  }

  // Ayrıntıları bellek deposuna kaydet (opsiyonel)
  if (opts.archiveToMemory !== false) {
    try {
      const store = getMemoryStore();
      store.enqueue({
        id: `compact_${Date.now()}`,
        content: `SOHBET ÖZETİ ARŞİVİ:\n${toCompact.map((m) => `${m.role}: ${m.content}`).join('\n')}`,
        category: 'archive',
        source: 'compaction',
        createdAt: new Date().toISOString(),
      });
    } catch {
      /* ignore */
    }
  }

  const kept = [{ role: 'user', content: `[ÖZET — önceki sohbetin sıkıştırılmış özeti]: ${summary}` }, ...keep];
  return { kept, summary, archivedCount: toCompact.length };
}

module.exports = {
  compactContext,
  estimateTokens,
  summarizeViaOllama,
  summarizeViaOpenAI,
  COMPACT_RATIO,
  MIN_MESSAGES_TO_COMPACT,
  KEEP_RECENT,
};
