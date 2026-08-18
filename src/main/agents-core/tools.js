'use strict';

/**
 * tools.js — Krevyx v3.26 Araç Kayıt Defteri v2
 *
 * Kapsam:
 *   - 24 araç tanımı: dosya, klasör, shell, grep, diff, arama, url, json/csv,
 *     bellek, inceleme, kuyruk, hook, plan, grading, özet, bağlam, kasa,
 *     zamanlayıcı, patch, sarif, imza, zincir, kasa-rapor, plan-diff.
 *   - Her araç bir şema (ad, açıklama, parametre listesi, örnek) taşır.
 *   - İzin matrisi: adım türü başına hangi araçların kullanılabilir olduğu.
 *   - Sonuç kırpma: araç çıktıları maxChars sınırıyla kırpılır.
 *
 * Davranış:
 *   - listTools() tüm kayıtlı araçları döndürür; findTool(id) tekil aracı verir.
 *   - allowedToolsFor(stepType) izin matrisinden araç listesini döndürür;
 *     matrise eklenmeyen adım türü için boş liste döner.
 *   - execTool(id, params, ctx) aracı yürütür; bilinmeyen araç { ok: false }.
 *   - registerTool(tool) ek araç eklenebilir; ad çakışması reddedilir.
 *
 * Dönüş:
 *   - execTool → { ok, output?, error?, meta? }
 *
 * Test:
 *   - testOnlyClear() kayıt defterini fabrika durumuna getirir (builtin araçlar yeniden tohumlanır).
 *
 * @version 3.26.0
 */

const crypto = require('crypto');
const pathMod = require('path');

const MAX_OUTPUT_CHARS = 65536;

/** Yerleşik araç tanım listesi: [id, açıklama, parametreler, örnek] */
const BUILTIN_TOOLS = [
  ['file_read', 'Dosya içeriğini okur', ['path', 'max_chars'], 'file_read({path: "README.md"})'],
  ['file_write', 'Dosyaya içerik yazar', ['path', 'content'], 'file_write({path: "a.txt", content: "merhaba"})'],
  ['file_edit', 'Unified diff yamasını dosyaya uygular', ['path', 'patch'], 'file_edit({path: "a.js", patch: "@@ ..."})'],
  ['file_append', 'Dosyanın sonuna ekler', ['path', 'content'], 'file_append({path: "a.txt", content: "yeni satır"})'],
  ['dir_list', 'Klasör içeriğini listeler', ['path', 'limit'], 'dir_list({path: "."})'],
  ['dir_create', 'Klasör ağacı oluşturur', ['path'], 'dir_create({path: "src/utils"})'],
  ['shell_run', 'Allowlist üzerinden komut çalıştırır', ['command', 'timeout_ms', 'cwd'], 'shell_run({command: "ls"})'],
  ['grep_search', 'Desen bazlı dosya araması', ['pattern', 'path', 'max_files'], 'grep_search({pattern: "todo"})'],
  ['diff_generate', 'İki metin arası unified diff üretir', ['before', 'after'], 'diff_generate({before, after})'],
  ['diff_apply', 'Unified diff yamasını doğrulayıp uygular', ['text', 'patch', 'fuzzy'], 'diff_apply({text, patch})'],
  ['web_fetch', 'URL içeriğini getirir (boyut sınırlı)', ['url', 'timeout_ms'], 'web_fetch({url: "https://...")'],
  ['json_parse', 'JSON metni ayrıştırır ve yol sorgular', ['text', 'jq_path'], 'json_parse({text, jq_path: "a.b"})'],
  ['csv_parse', 'CSV metnini satır dizisine dönüştürür', ['text', 'delimiter'], 'csv_parse({text, delimiter: ";"})'],
  ['memory_query', 'Proje belleğinde not arar', ['query', 'limit'], 'memory_query({query: "kurulum"})'],
  ['diff_review', 'Diff hunklarını inceler ve skor verir', ['diff_text', 'policy'], 'diff_review({diff_text})'],
  ['queue_push', 'Görev kuyruğuna görev ekler', ['queue', 'task', 'priority'], 'queue_push({queue: "q", task: {...}})'],
  ['hook_fire', 'Kayıtlı hook setini tetikler', ['hook_set_id', 'phase', 'payload'], 'hook_fire({phase: "pre-run"})'],
  ['plan_build', 'Ajan promptundan adım planı üretir', ['prompt', 'budget'], 'plan_build({prompt: "..."})'],
  ['grade_result', 'Görev sonucunu 0-10 ölçeğinde derecelendirir', ['task_prompt', 'result', 'criteria'], 'grade_result({task_prompt, result})'],
  ['summarize', 'Metin parçalarını özetler', ['chunks', 'max_tokens'], 'summarize({chunks: [...]})'],
  ['context_trim', 'Bağlam mesajlarını bütçeye göre kırpar', ['messages', 'budget'], 'context_trim({messages, budget})'],
  ['secret_scan', 'Metinde gizli/kimlik bilgisi arar', ['text', 'files'], 'secret_scan({text: "..."})'],
  ['sign_package', 'Dosya listesi için bütünlük manifesti imzalar', ['files', 'key'], 'sign_package({files: ["a.js"]})'],
  ['verify_signature', 'İmzalı manifesti doğrular', ['manifest', 'files'], 'verify_signature({manifest})'],
];

/** İzin matrisi: adım türü → araç id listesi */
const PERMISSION_MATRIX = {
  list_dir: ['dir_list', 'grep_search', 'web_fetch', 'memory_query', 'summarize', 'json_parse', 'csv_parse'],
  read: ['file_read', 'grep_search', 'web_fetch', 'memory_query', 'json_parse', 'csv_parse', 'secret_scan'],
  write: ['file_write', 'dir_create', 'diff_apply', 'file_edit', 'memory_query', 'sign_package', 'verify_signature'],
  edit: ['file_read', 'file_edit', 'diff_generate', 'diff_apply', 'diff_review', 'grep_search', 'secret_scan', 'sign_package'],
  execute: ['shell_run', 'file_read', 'file_write', 'file_append', 'grep_search', 'dir_list', 'secret_scan', 'sign_package', 'verify_signature', 'hook_fire'],
  review: ['file_read', 'diff_review', 'diff_generate', 'grep_search', 'secret_scan', 'grade_result', 'summarize'],
};

/** Fabrika durumunu korur: testOnlyClear bu kopyayı geri yükler. */
let _tools = new Map();
const _originalTools = new Map();

function defineTool(id, description, params, example) {
  return {
    id,
    name: id,
    description,
    params: Array.isArray(params) ? params.slice() : [],
    example,
    version: '3.26.0',
  };
}

function seedTools() {
  _tools.clear();
  BUILTIN_TOOLS.forEach((t) => _tools.set(t[0], defineTool(t[0], t[1], t[2], t[3])));
  _originalTools.clear();
  BUILTIN_TOOLS.forEach((t) => _originalTools.set(t[0], defineTool(t[0], t[1], t[2], t[3])));
}

function registerTool(tool) {
  if (!tool || !tool.id || typeof tool.id !== 'string') return { ok: false, error: 'Araç kimliği eksik' };
  if (_tools.has(tool.id)) return { ok: false, error: `Araç zaten kayıtlı: ${tool.id}` };
  _tools.set(tool.id, defineTool(tool.id, tool.description || tool.id, tool.params || [], tool.example || ''));
  return { ok: true, tool: tool.id };
}

function listTools() {
  return { ok: true, tools: Array.from(_tools.values()) };
}

function findTool(id) {
  return _tools.get(id) || null;
}

function allowedToolsFor(stepType) {
  const ids = PERMISSION_MATRIX[stepType];
  return { ok: true, stepType, tools: ids ? ids.map((i) => findTool(i)).filter(Boolean) : [] };
}

function toolAllowed(stepType, toolId) {
  const ids = PERMISSION_MATRIX[stepType] || [];
  return { ok: true, stepType, toolId, allowed: ids.includes(toolId) };
}

function execTool(id, params = {}, ctx = {}) {
  const tool = _tools.get(id);
  if (!tool) return { ok: false, error: `Bilinmeyen araç: ${id}` };
  const handlers = TOOL_HANDLERS[id];
  if (!handlers) return { ok: false, error: `Araç yürütücüsü yok: ${id}` };
  try {
    const res = handlers.fn(params, ctx);
    const out = typeof res.output === 'string' ? res.output.slice(0, ctx.maxChars || MAX_OUTPUT_CHARS) : res.output;
    return { ok: true, tool: id, output: out, meta: { ...res, output: undefined } };
  } catch (err) {
    return { ok: false, error: `Araç hatası: ${err.message}` };
  }
}

/** Yerleşik yürütücüler: saf (dosya/proc erişimi ctx üzerinden enjekte edilir). */
const TOOL_HANDLERS = {
  file_read: { fn: (p, ctx) => {
    if (!p.path) return { ok: false, error: 'Yol eksik' };
    const fsMod = ctx.fs || require('fs');
    const content = fsMod.readFileSync(p.path, 'utf8');
    return { ok: true, output: content, chars: content.length };
  } },
  file_write: { fn: (p, ctx) => {
    if (!p.path) return { ok: false, error: 'Yol eksik' };
    const fsMod = ctx.fs || require('fs');
    fsMod.mkdirSync(pathMod.dirname(p.path), { recursive: true });
    fsMod.writeFileSync(p.path, p.content || '', 'utf8');
    return { ok: true, output: `Yazıldı: ${p.path}` };
  } },
  file_edit: { fn: (p, ctx) => {
    if (!p.path || !p.patch) return { ok: false, error: 'Yol veya yama eksik' };
    if (!ctx.diffApply) return { ok: false, error: 'Diff uygulayıcı yok' };
    const fsMod = ctx.fs || require('fs');
    const before = fsMod.readFileSync(p.path, 'utf8');
    const applied = ctx.diffApply.applyUnifiedDiff(before, p.patch, { fuzzy: p.fuzzy !== false });
    if (!applied.ok) return { ok: false, error: applied.error || 'Yama uygulanamadı' };
    fsMod.writeFileSync(p.path, applied.text, 'utf8');
    return { ok: true, output: `Yama uygulandı: ${p.path}`, hunks: applied.hunks || 0 };
  } },
  file_append: { fn: (p, ctx) => {
    if (!p.path) return { ok: false, error: 'Yol eksik' };
    const fsMod = ctx.fs || require('fs');
    fsMod.mkdirSync(pathMod.dirname(p.path), { recursive: true });
    fsMod.appendFileSync(p.path, (p.content || '').replace(/\n$/, '') + '\n', 'utf8');
    return { ok: true, output: `Eklendi: ${p.path}` };
  } },
  dir_list: { fn: (p, ctx) => {
    const fsMod = ctx.fs || require('fs');
    const target = p.path || '.';
    const entries = fsMod.readdirSync(target).slice(0, p.limit || 500);
    return { ok: true, output: entries.join('\n'), items: entries.length };
  } },
  dir_create: { fn: (p, ctx) => {
    if (!p.path) return { ok: false, error: 'Yol eksik' };
    const fsMod = ctx.fs || require('fs');
    fsMod.mkdirSync(p.path, { recursive: true });
    return { ok: true, output: `Oluşturuldu: ${p.path}` };
  } },
  shell_run: { fn: (p, ctx) => {
    if (!p.command) return { ok: false, error: 'Komut eksik' };
    if (!ctx.sandbox) return { ok: false, error: 'Sandbox yok' };
    return ctx.sandbox.run(p.command, { timeoutMs: p.timeout_ms || 30000, cwd: p.cwd || ctx.cwd });
  } },
  grep_search: { fn: (p, ctx) => {
    if (!p.pattern) return { ok: false, error: 'Desen eksik' };
    const fsMod = ctx.fs || require('fs');
    const target = p.path || ctx.cwd || process.cwd();
    let re;
    try { re = new RegExp(p.pattern, 'i'); } catch (e) { return { ok: false, error: `Geçersiz desen: ${p.pattern}` }; }
    const files = fsMod.readdirSync(target).filter((f) => /\.(js|ts|md|json|txt|py|sh|yml)$/.test(f)).slice(0, p.max_files || 200);
    const hits = [];
    for (const f of files) {
      try {
        const lines = fsMod.readFileSync(pathMod.join(target, f), 'utf8').split('\n')
          .map((l, i) => ({ line: i + 1, text: l })).filter((l) => re.test(l.text)).slice(0, 25);
        if (lines.length) hits.push({ file: f, lines });
      } catch (e) { /* atla */ }
    }
    return { ok: true, output: hits.map((h) => `${h.file}: ${h.lines.length}`).join('\n') || '(eşleşme yok)', hits: hits.length };
  } },
  diff_generate: { fn: (p) => {
    if (typeof p.before !== 'string' || typeof p.after !== 'string') return { ok: false, error: 'İki metin gerekli' };
    const beforeLines = p.before.split('\n');
    const afterLines = p.after.split('\n');
    const maxLen = Math.max(beforeLines.length, afterLines.length) || 1;
    const hunks = [`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`];
    const removed = beforeLines.filter((l) => !afterLines.includes(l));
    const added = afterLines.filter((l) => !beforeLines.includes(l));
    removed.forEach((l) => hunks.push(`-${l}`));
    added.forEach((l) => hunks.push(`+${l}`));
    return { ok: true, output: hunks.join('\n'), removed: removed.length, added: added.length, maxLen };
  } },
  diff_apply: { fn: (p, ctx) => {
    if (!ctx.diffApply) return { ok: false, error: 'Diff uygulayıcı yok' };
    if (typeof p.text !== 'string' || !p.patch) return { ok: false, error: 'Metin veya yama eksik' };
    const applied = ctx.diffApply.applyUnifiedDiff(p.text, p.patch, { fuzzy: p.fuzzy !== false });
    if (!applied.ok) return { ok: false, error: applied.error || 'Yama uygulanamadı' };
    return { ok: true, output: applied.text, hunks: applied.hunks || 0 };
  } },
  web_fetch: { fn: (p, ctx) => {
    if (!p.url) return { ok: false, error: 'URL eksik' };
    if (!/^https?:\/\//i.test(p.url)) return { ok: false, error: 'Desteklenmeyen şema' };
    const httpMod = ctx.http || require('http');
    return new Promise((resolve) => {
      try {
        const mod = p.url.startsWith('https') ? (ctx.https || require('https')) : httpMod;
        const req = mod.get(p.url, { timeout: p.timeout_ms || 10000 }, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk.toString('utf8'); if (body.length > 131072) { req.destroy(); body = body.slice(0, 131072); } });
          res.on('end', () => resolve({ ok: true, output: body.slice(0, 65536), status: res.statusCode, bytes: body.length }));
          res.on('error', () => resolve({ ok: false, error: 'İçerik okunamadı' }));
        });
        req.on('error', (err) => resolve({ ok: false, error: `İstek başarısız: ${err.message}` }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Zaman aşımı' }); });
      } catch (err) {
        resolve({ ok: false, error: `İstek başlatılamadı: ${err.message}` });
      }
    });
  } },
  json_parse: { fn: (p) => {
    if (!p.text) return { ok: false, error: 'Metin eksik' };
    try {
      let obj = JSON.parse(p.text);
      if (p.jq_path) {
        p.jq_path.split('.').forEach((k) => { obj = obj && typeof obj === 'object' ? obj[k] : undefined; });
      }
      const out = typeof obj === 'string' ? obj : JSON.stringify(obj);
      return { ok: true, output: out || '', type: typeof obj };
    } catch (err) {
      return { ok: false, error: `JSON ayrıştırılamadı: ${err.message}` };
    }
  } },
  csv_parse: { fn: (p) => {
    if (!p.text) return { ok: false, error: 'Metin eksik' };
    const delim = p.delimiter || ',';
    const lines = p.text.split('\n').filter((l) => l.trim().length);
    const header = lines[0].split(delim).map((h) => h.trim());
    const rows = lines.slice(1).map((l) => {
      const cells = l.split(delim).map((c) => c.trim());
      const row = {};
      header.forEach((h, i) => { row[h] = cells[i] || ''; });
      return row;
    });
    return { ok: true, output: JSON.stringify(rows), rows: rows.length, header };
  } },
  memory_query: { fn: (p, ctx) => {
    if (!p.query) return { ok: false, error: 'Sorgu eksik' };
    if (!ctx.memory) return { ok: false, error: 'Proje belleği yok' };
    return ctx.memory.query(p.query, { limit: p.limit || 10 });
  } },
  diff_review: { fn: (p, ctx) => {
    if (!p.diff_text) return { ok: false, error: 'Diff metni eksik' };
    if (!ctx.diffReview) return { ok: false, error: 'Diff inceleme aracı yok' };
    return ctx.diffReview.reviewState ? ctx.diffReview.reviewState(p.diff_text) : { ok: false, error: 'Desteklenmiyor' };
  } },
  queue_push: { fn: (p, ctx) => {
    if (!p.queue || !p.task) return { ok: false, error: 'Kuyruk adı veya görev eksik' };
    if (!ctx.queue) return { ok: false, error: 'Görev kuyruğu yok' };
    const q = ctx.queue.getQueue(p.queue);
    if (!q) return { ok: false, error: `Kuyruk bulunamadı: ${p.queue}` };
    q.add({ type: p.task.type || 'generic', priority: p.priority || 0, payload: p.task });
    return { ok: true, output: `Kuyruğa alındı: ${p.queue}` };
  } },
  hook_fire: { fn: (p, ctx) => {
    if (!p.phase) return { ok: false, error: 'Faz eksik' };
    if (!ctx.hooks) return { ok: false, error: 'Hook sistemi yok' };
    return ctx.hooks.emit(p.phase, p.payload || {});
  } },
  plan_build: { fn: (p, ctx) => {
    if (!p.prompt) return { ok: false, error: 'Prompt eksik' };
    if (!ctx.planEngine) return { ok: false, error: 'Plan motoru yok' };
    return ctx.planEngine.buildPlan(p.prompt, p.budget ? { budget: p.budget } : {});
  } },
  grade_result: { fn: (p, ctx) => {
    if (!p.task_prompt || !p.result) return { ok: false, error: 'Görev ve sonuç gerekli' };
    if (!ctx.grading) return { ok: false, error: 'Grading modülü yok' };
    return ctx.grading.gradeTaskResult({ prompt: p.task_prompt, result: p.result, criteria: p.criteria || 'doğruluk' });
  } },
  summarize: { fn: (p, ctx) => {
    if (!Array.isArray(p.chunks)) return { ok: false, error: 'Parça listesi gerekli' };
    if (!ctx.ctxMgr) return { ok: false, error: 'Bağlam yöneticisi yok' };
    return ctx.ctxMgr.summarizeChunks(p.chunks);
  } },
  context_trim: { fn: (p, ctx) => {
    if (!Array.isArray(p.messages)) return { ok: false, error: 'Mesaj listesi gerekli' };
    if (!ctx.ctxMgr) return { ok: false, error: 'Bağlam yöneticisi yok' };
    const mgr = ctx.ctxMgr.createManager ? ctx.ctxMgr.createManager({ budget: p.budget || 2000 }) : null;
    if (!mgr) return { ok: false, error: 'Yönetici oluşturulamadı' };
    const m = mgr.manager || mgr;
    p.messages.forEach((msg) => m.add(msg));
    const t = m.trim(p.budget || 2000);
    return { ok: true, output: JSON.stringify(m.getSnapshot ? m.getSnapshot().messages : m.snapshot().messages), removed: t.removed ? t.removed.length : 0 };
  } },
  secret_scan: { fn: (p, ctx) => {
    if (!p.text && (!p.files || p.files.length === 0)) return { ok: false, error: 'Metin veya dosya gerekli' };
    if (!ctx.secretsAudit) return { ok: false, error: 'Gizli tarama modülü yok' };
    const out = [];
    if (p.text) {
      const r = ctx.secretsAudit.scanText ? ctx.secretsAudit.scanText(p.text) : { findings: [] };
      if (r.findings && r.findings.length) out.push(...r.findings);
    }
    return { ok: true, output: JSON.stringify(out), findings: out.length };
  } },
  sign_package: { fn: (p, ctx) => {
    if (!Array.isArray(p.files) || p.files.length === 0) return { ok: false, error: 'Dosya listesi gerekli' };
    if (!ctx.signing) return { ok: false, error: 'İmzalama modülü yok' };
    const r = ctx.signing.signFiles(p.files);
    return { ok: r.ok, output: r.ok ? JSON.stringify(r.manifest || r) : r.error, hash: r.hash };
  } },
  verify_signature: { fn: (p, ctx) => {
    if (!p.manifest || !p.files) return { ok: false, error: 'Manifest ve dosya listesi gerekli' };
    if (!ctx.signing) return { ok: false, error: 'İmzalama modülü yok' };
    const r = ctx.signing.verifyManifest(p.manifest, p.files);
    return { ok: r.ok, output: r.ok ? 'Bütünlük doğrulandı' : r.error };
  } },
};

/** Araç çıktısını boyut sınırına göre kırp */
function clipOutput(text, maxChars) {
  const limit = typeof maxChars === 'number' && maxChars > 0 ? maxChars : MAX_OUTPUT_CHARS;
  if (typeof text !== 'string') return '';
  return text.length > limit ? `${text.slice(0, limit)}\n...(kırpıldı)` : text;
}

function testOnlyClear() {
  seedTools();
  return { ok: true };
}

seedTools();

module.exports = {
  registerTool,
  listTools,
  findTool,
  allowedToolsFor,
  toolAllowed,
  execTool,
  clipOutput,
  testOnlyClear,
  BUILTIN_TOOLS,
  PERMISSION_MATRIX,
  MAX_OUTPUT_CHARS,
};
