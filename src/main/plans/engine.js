'use strict';
/**
 * plans/engine.js — Krevyx v3.25 Plan Modu çekirdeği (P-1)
 *
 * Prompt'tan deterministik bir adım planı üretir. Her plan, türleri önceden
 * tanımlı adımlardan oluşan sıralı bir dizidir; her adımın risk skoru,
 * tahmini etkisi ve serileştirilmiş diff temsili vardır.
 *
 * Adım türleri:
 *   read_file  — dosya okuma (risk 0, asla onay gerektirmez)
 *   list_dir   — dizin listeleme (risk 0)
 *   edit_file  — hunk tabanlı düzenleme (risk orta-yüksek)
 *   create_file— yeni dosya oluşturma (risk orta)
 *   append_file— dosyaya ekleme (risk düşük-orta)
 *   delete_file— dosya silme (risk yüksek)
 *   run_shell  — kabuk komutu (risk komuta göre değişir)
 *   review     — insan incelemesi için bekleme noktası (diff review tetikler)
 *
 * API:
 *   buildPlan(prompt, opts)            → { ok, plan }
 *   stepRiskScore(step)                → 0..10
 *   planRiskScore(plan)                → 0..100
 *   serializePlan(plan) / parsePlan(json)
 *   planDiff(plan, other)              → { added, removed, changed }
 *   estimateSteps(prompt)              → tahmini adım sayısı (plan üretmeden)
 *
 * Deterministik: LLM'siz, kural + şablon tabanlı ayrıştırma. Böylece planda
 * asla dış bağımlılık/hallüsinasyon olmaz; UI her zaman aynı prompt için
 * aynı planı görür.
 */

const STEP_TYPES = Object.freeze({
  READ: 'read_file',
  LIST: 'list_dir',
  EDIT: 'edit_file',
  CREATE: 'create_file',
  APPEND: 'append_file',
  DELETE: 'delete_file',
  SHELL: 'run_shell',
  REVIEW: 'review',
});

/* Risk ağırlıkları — shell komutlarının bir kısmı blacklist ile kesilir */
const TYPE_RISK = {
  [STEP_TYPES.READ]: 0,
  [STEP_TYPES.LIST]: 0,
  [STEP_TYPES.APPEND]: 3,
  [STEP_TYPES.CREATE]: 4,
  [STEP_TYPES.EDIT]: 6,
  [STEP_TYPES.REVIEW]: 0,
  [STEP_TYPES.DELETE]: 8,
  [STEP_TYPES.SHELL]: 7,
};

const SHELL_BLACKLIST = [
  'rm -rf /', 'rm -rf /*', 'sudo rm -rf', 'mkfs', 'dd if=', '> /dev/sd',
  'shutdown', 'reboot', 'poweroff', 'format c:', 'rd /s /q c:\\',
  'del c:\\windows', 'chmod -R 777 /', 'chown -R', 'iptables -F',
];

/* Basit kalıp ayrıştırıcılar: prompt cümlelerinden adım çıkarır */
const READ_PATTERNS = [
  /(?:oku|göster|bak|incele|read|look at|show|inspect)\s+(?:dosyayı|dosyayı\s+)?["'`]?([^\s"'`]+(?:\.\w+)?)/i,
  /["'`]([^\s"'`]+\.\w+)["'`]\s+(?:dosyasını\s+)?(?:oku|incele)/i,
];
const EDIT_PATTERNS = [
  /(?:değiştir|düzenle|güncelle|replace|edit|change|update)\s+(?:dosyadaki|dosyayı|dosyasındaki)?\s*["'`]?([^\s"'`]+(?:\.\w+)?)/i,
  /(["'`][^\s"'`]+\.\w+["'`])\s+(?:dosyasında|dosyasındaki)\s+(?:değiştir|düzenle)/i,
  /(?:yazısını|metnini|satırını)\s+(?:değiştir|güncelle)\s+["'`]?([^\s"'`]+)/i,
];
const CREATE_PATTERNS = [
  /(?:oluştur|yarat|yaz|create|make|write|add)\s+(?:yeni\s+)?(?:bir\s+)?(?:dosya|file)?\s*["'`]?([^\s"'`]+(?:\.\w+)?)/i,
  /(["'`][^\s"'`]+\.\w+["'`])\s+(?:adlı|adında|named|called)?\s+(?:dosyasını|dosyayı)?\s+(?:oluştur|yaz)/i,
];
const DELETE_PATTERNS = [
  /(?:sil|kaldır|delete|remove)\s+(?:dosyayı|dosyayı\s+)?["'`]?([^\s"'`]+)/i,
  /(["'`][^\s"'`]+["'`])\s+(?:dosyasını|dosyayı)?\s+(?:sil|kaldır|delete)/i,
];
const SHELL_PATTERNS = [
  /(?:çalıştır|koş|execute|run)\s+(?:komutu|command)?\s*[:：]?\s*["'`]?((?:npm|pnpm|yarn|git|node|npx|curl|wget|make|docker)[^\n"'`]*)/i,
  /["'`]((?:npm|pnpm|yarn|git|node|npx)\s+[^\n"'`]+)["'`]/i,
];
const LIST_PATTERNS = [
  /(?:listele|göster|list)\s+(?:dizini|klasörü|klasörün|directory|folder)\s+["'`]?([^\s"'`]+)?/i,
  /(?:içindekileri|contents)\s+(?:dizinin|klasörün|of)\s+["'`]?([^\s"'`]+)?/i,
];

let _nextId = 0;
function freshId(prefix) {
  _nextId += 1;
  return `${prefix}-${Date.now().toString(36)}-${_nextId.toString(36)}`;
}

function isBlacklistedShell(cmd) {
  const needle = String(cmd || '').toLowerCase().trim();
  return SHELL_BLACKLIST.some((b) => needle.includes(b));
}

function firstMatch(patterns, text) {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

/**
 * Tek bir adım nesnesi üretir. options.inject (testler için) kullanılır.
 */
function makeStep(type, target, opts = {}) {
  const { inject = {} } = opts;
  const baseRisk = TYPE_RISK[type] ?? 0;
  let risk = baseRisk;
  let blocked = false;
  let reason = opts.reason || '';

  if (type === STEP_TYPES.SHELL) {
    if (isBlacklistedShell(target)) {
      blocked = true;
      risk = 10;
      reason = reason || 'Komut karaliste içeriyor';
    } else if (/sudo\s+/.test(String(target || ''))) {
      risk = Math.min(10, baseRisk + 2);
      reason = reason || 'sudo yetki yükseltmesi içeriyor';
    } else if (/(rm|del|RMDIR)\s+/.test(String(target || ''))) {
      risk = Math.min(10, baseRisk + 1);
    }
  }
  if (type === STEP_TYPES.EDIT && !target) {
    blocked = true;
    reason = reason || 'Düzenleme hedefi belirsiz';
  }

  const step = {
    id: inject.stepId ? inject.stepId() : freshId('step'),
    type,
    target: target || '',
    risk,
    blocked,
    reason,
    status: 'pending', // pending | approved | rejected | done | failed | skipped
    note: opts.note || '',
  };
  return step;
}

/**
 * Prompt'tan adım planı üretir. Deterministik, LLM'siz.
 * opts: { cwd, blockedShellOverride, inject }
 */
function buildPlan(prompt, opts = {}) {
  if (typeof prompt !== 'string') {
    return { ok: false, error: 'Prompt string olmalı' };
  }
  const text = prompt.trim();
  if (!text) return { ok: false, error: 'Boş prompt' };
  if (text.length > 50000) return { ok: false, error: 'Prompt 50.000 karakteri aşıyor' };

  const { cwd, inject = {} } = opts;
  const steps = [];
  const seen = new Set();

  function add(step) {
    if (!step.target || seen.has(`${step.type}:${step.target}`)) return;
    if (step.type !== STEP_TYPES.READ && step.type !== STEP_TYPES.LIST && step.blocked) {
      // Bloklanmış adım yine plana girer — UI kullanıcıya gösterir, çalıştırılmaz.
    }
    seen.add(`${step.type}:${step.target}`);
    steps.push(step);
  }

  add(makeStep(STEP_TYPES.LIST, cwd || '.', { reason: 'Çalışma dizini keşfi', ...opts }));
  add(makeStep(STEP_TYPES.READ, firstMatch(READ_PATTERNS, text) || firstMatch(LIST_PATTERNS, text) || '', { ...opts }));

  const createT = firstMatch(CREATE_PATTERNS, text);
  if (createT) add(makeStep(STEP_TYPES.CREATE, createT, { reason: 'Yeni dosya talebi', ...opts }));

  const editT = firstMatch(EDIT_PATTERNS, text);
  if (editT && editT !== createT) add(makeStep(STEP_TYPES.EDIT, editT, { reason: 'Düzenleme talebi', ...opts }));

  const appendT = firstMatch([/(?:ekle|append|sonuna\s+ekle)\s+["'`]?([^\s"'`]+)/i], text);
  if (appendT && appendT !== createT && appendT !== editT) {
    add(makeStep(STEP_TYPES.APPEND, appendT, { reason: 'Ekleme talebi', ...opts }));
  }

  const delT = firstMatch(DELETE_PATTERNS, text);
  if (delT) add(makeStep(STEP_TYPES.DELETE, delT, { reason: 'Silme talebi — dikkat', ...opts }));

  const shellT = firstMatch(SHELL_PATTERNS, text);
  if (shellT) add(makeStep(STEP_TYPES.SHELL, shellT, { ...opts }));

  if (!steps.some((s) => s.type === STEP_TYPES.CREATE || s.type === STEP_TYPES.EDIT || s.type === STEP_TYPES.SHELL || s.type === STEP_TYPES.DELETE || s.type === STEP_TYPES.APPEND)) {
    // Salt okuma bir istek: inceleme noktası ekle
    add(makeStep(STEP_TYPES.REVIEW, '', { reason: 'Salt okuma plan — inceleme noktası', ...opts }));
  }

  if (steps.length === 0) {
    return { ok: false, error: 'Prompttan adım çıkarılamadı' };
  }

  const plan = {
    id: inject.planId ? inject.planId() : freshId('plan'),
    version: 1,
    createdAt: opts.now ? opts.now() : new Date().toISOString(),
    prompt,
    cwd: cwd || process.cwd(),
    steps,
    status: 'draft', // draft | awaiting_approval | approved | applied | cancelled
    editLog: [], // plan-edit geçmişi
  };
  return { ok: true, plan };
}

function stepRiskScore(step) {
  if (!step || typeof step.risk !== 'number') return 0;
  return Math.max(0, Math.min(10, Math.round(step.risk)));
}

function planRiskScore(plan) {
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) return 0;
  const max = Math.max(...plan.steps.map((s) => s.risk || 0));
  const avg = plan.steps.reduce((a, s) => a + (s.risk || 0), 0) / plan.steps.length;
  /* Maksimum risk baskın olur; ortalama bağlam verir. 0..100 skala. */
  const score = Math.round(max * 7 + avg * 3);
  return Math.max(0, Math.min(100, score));
}

function serializePlan(plan) {
  if (!plan) return { ok: false, error: 'Plan yok' };
  try {
    return { ok: true, json: JSON.stringify(plan) };
  } catch (err) {
    return { ok: false, error: `Serileştirme hatası: ${err.message}` };
  }
}

function parsePlan(json, opts = {}) {
  const { maxSteps = 1000 } = opts;
  if (typeof json !== 'string') return { ok: false, error: 'JSON string olmalı' };
  let data;
  try {
    data = JSON.parse(json);
  } catch (err) {
    return { ok: false, error: `Ayrıştırma hatası: ${err.message}` };
  }
  if (!data || !Array.isArray(data.steps) || !data.steps.length) {
    return { ok: false, error: 'Plan adım dizisi geçersiz' };
  }
  if (data.steps.length > maxSteps) {
    return { ok: false, error: `Adım sayısı limitin üstünde (${maxSteps})` };
  }
  const validTypes = new Set(Object.values(STEP_TYPES));
  const steps = [];
  for (let i = 0; i < data.steps.length; i += 1) {
    const s = data.steps[i];
    if (!s || typeof s !== 'object' || !validTypes.has(s.type)) {
      return { ok: false, error: `Geçersiz adım (index ${i})` };
    }
    steps.push({
      id: typeof s.id === 'string' ? s.id : `step-${i}`,
      type: s.type,
      target: typeof s.target === 'string' ? s.target : '',
      risk: typeof s.risk === 'number' ? s.risk : (TYPE_RISK[s.type] ?? 0),
      blocked: Boolean(s.blocked),
      reason: typeof s.reason === 'string' ? s.reason : '',
      status: typeof s.status === 'string' ? s.status : 'pending',
      note: typeof s.note === 'string' ? s.note : '',
    });
  }
  return {
    ok: true,
    plan: {
      id: typeof data.id === 'string' ? data.id : freshId('plan'),
      version: Number(data.version) || 1,
      createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
      prompt: typeof data.prompt === 'string' ? data.prompt : '',
      cwd: typeof data.cwd === 'string' ? data.cwd : '',
      steps,
      status: typeof data.status === 'string' ? data.status : 'draft',
      editLog: Array.isArray(data.editLog) ? data.editLog : [],
    },
  };
}

/**
 * İki plan arasında diff: eklenen, çıkarılan ve değişen adımlar.
 * Kimlik adım id'sine göredir; id yoksa type+target eşleşir.
 */
function planDiff(a, b) {
  const added = [];
  const removed = [];
  const changed = [];
  const byId = (plan) => {
    const m = new Map();
    if (!plan) return m;
    plan.steps.forEach((s) => m.set(s.id || `${s.type}:${s.target}`, s));
    return m;
  };
  const ma = byId(a);
  const mb = byId(b);
  mb.forEach((s, id) => {
    if (!ma.has(id)) added.push(s);
    else {
      const other = ma.get(id);
      if (other.type !== s.type || other.target !== s.target || other.risk !== s.risk) {
        changed.push({ from: other, to: s });
      }
    }
  });
  ma.forEach((s, id) => {
    if (!mb.has(id)) removed.push(s);
  });
  return { added, removed, changed };
}

/**
 * Plan üretmeden tahmini adım sayısı (UI göstergesi için hafif yol).
 */
function estimateSteps(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) return 0;
  const markers = [
    ...READ_PATTERNS, ...EDIT_PATTERNS, ...CREATE_PATTERNS,
    ...DELETE_PATTERNS, ...SHELL_PATTERNS, ...LIST_PATTERNS,
  ].map((p) => Boolean(p.exec(prompt)));
  return Math.max(1, markers.filter(Boolean).length + 1);
}

module.exports = {
  STEP_TYPES,
  TYPE_RISK,
  SHELL_BLACKLIST,
  buildPlan,
  makeStep,
  stepRiskScore,
  planRiskScore,
  serializePlan,
  parsePlan,
  planDiff,
  estimateSteps,
  isBlacklistedShell,
  _freshId: () => freshId('t'),
};
