/* Outcomes Grading Loop — v3.21
 * Anthropic "Outcomes" öncül özelliğinin Krevyx'e yerli uyarlanması.
 * Kod ajanı görevi bittiğinde seçilen modelden öz değerlendirme istenir;
 * yapısal iyileştirmenin yalnızca bir değerlendirme katmanı eklemesiyle çıktı kalitesini
 * ölçülebilir biçimde artırdığı fikrine dayanır (Claude Code ekibi: +8.4–10.1%).
 * Görev yapan ajanın muhakemesini görmeden yalnızca sonucu değerlendirir.
 */
'use strict';

const https = require('https');
const http = require('http');

const GRADING_MODELS = {
  ollama: { model: 'llama3.1:8b', url: 'http://localhost:11434' },
  openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
  anthropic: { model: 'claude-3-5-haiku', url: 'https://api.anthropic.com/v1' },
};

const GRADING_SYSTEM =
  'Sen bir kod ajanı çıktı değerlendiricisisin. Görev yapan ajanın muhakemesini görmedin; ' +
  'yalnızca görev tanımını, yapılan adımların özetini ve sonuç durumunu değerlendirirsin. ' +
  'Yanıtını HER ZAMAN aşağıdaki JSON şemasıyla ver:\n' +
  '{"pass":true|false,"score":0-100,"summary":"tek cümlelik değerlendirme",' +
  '"issues":["varsa kalan sorunlar"],"suggestions":["devam önerileri"]}\n' +
  'pass=true yalnızca görev tanımındaki amaç adım özetiyle tutarlıysa. Asla JSON dışında metin yazma.';

/**
 * Görev çıktısını seçilen modele puanlatır.
 * @param {Object} opts
 * @param {string} opts.provider - 'ollama'|'openai'|'anthropic'
 * @param {string} opts.apiKey
 * @param {string} opts.task - orijinal görev metni
 * @param {Array<{text:string}>} opts.steps - ajan adımlarının özeti
 * @param {boolean} opts.ok - görevin başarı durumu
 * @param {number} [opts.timeoutMs] - 30000 varsayılan
 * @returns {Promise<Object|null>} - {pass,score,summary,issues,suggestions} veya null
 */
function gradeTask({ provider, apiKey, task, steps, ok, timeoutMs = 30000 }) {
  const spec = GRADING_MODELS[provider] || GRADING_MODELS.ollama;
  if (!apiKey && provider !== 'ollama') {
    return Promise.resolve(null);
  }

  const stepSummary = Array.isArray(steps) ? steps.slice(-30).map((s) => s && s.text).filter(Boolean).join(' | ') : '';
  const userPrompt =
    `GÖREV: ${task}\n\nAJAN DURUMU: ${ok ? 'başarılı tamamlandı' : 'başarısız/hata'}\n\n` +
    `ADIMLARIN ÖZETİ (${(steps && steps.length) || 0}): ${stepSummary}\n\n` +
    'JSON yanıtını ver:';

  return new Promise((resolve) => {
    let resolved = false;
    const done = (v) => { if (!resolved) { resolved = true; resolve(v); } };

    let body;
    let url;
    let headers = { 'Content-Type': 'application/json' };

    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({
        model: spec.model, max_tokens: 500,
        system: GRADING_SYSTEM,
        messages: [{ role: 'user', content: userPrompt }],
      });
      url = 'https://api.anthropic.com/v1/messages';
    } else if (provider === 'openai') {
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = JSON.stringify({
        model: spec.model, max_tokens: 500,
        messages: [
          { role: 'system', content: GRADING_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
      });
      url = 'https://api.openai.com/v1/chat/completions';
    } else {
      body = JSON.stringify({
        model: spec.model,
        system: GRADING_SYSTEM,
        prompt: userPrompt,
        stream: false,
        options: { num_predict: 300, temperature: 0.2 },
      });
      url = 'http://localhost:11434/api/generate';
    }

    const req = (url.startsWith('https') ? https : http).request(
      url,
      { method: 'POST', headers, timeout: timeoutMs },
      (res) => {
        let buf = '';
        res.on('data', (d) => { buf += d; if (buf.length > 32 * 1024) { res.destroy(); } });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return done(null);
          }
          const parsed = parseGradingResponse(provider, buf);
          done(parsed);
        });
      }
    );
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
    req.write(body);
    req.end();
  });
}

function parseGradingResponse(provider, raw) {
  try {
    const data = JSON.parse(raw);
    let text = '';
    if (provider === 'anthropic' && data.content && data.content[0]) {
      text = data.content[0].text || '';
    } else if (provider === 'openai' && data.choices && data.choices[0]) {
      text = data.choices[0].message && data.choices[0].message.content;
    } else if (provider === 'ollama') {
      text = data.response || '';
    }
    if (!text) return null;
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const j = JSON.parse(m[0]);
    if (typeof j.pass !== 'boolean') return null;
    return {
      pass: !!j.pass,
      score: Math.min(100, Math.max(0, Number(j.score) || 0)),
      summary: String(j.summary || '').slice(0, 300),
      issues: Array.isArray(j.issues) ? j.issues.slice(0, 5) : [],
      suggestions: Array.isArray(j.suggestions) ? j.suggestions.slice(0, 5) : [],
    };
  } catch (_) {
    return null;
  }
}

module.exports = { gradeTask, GRADING_MODELS, parseGradingResponse };
