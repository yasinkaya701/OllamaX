'use strict';

/**
 * prompts.js — Krevyx v3.26 Prompt Şablonları
 *
 * Kapsam:
 *   - 22 sürümlü prompt şablonu: sistem rolü, plan üretme, araç çağrısı,
 *     grading, diff inceleme, özet, güvenlik kısıtları, el devri ve diğerleri.
 *   - Her şablon { id, version, template, params, render(vars) } taşır;
 *     render eksik değişkenleri boş metinle doldurur (asla hata atmaz).
 *   - Şablon sürümlendirme: render çıktısı şablon kimliği + versiyonla etiketlenir.
 *
 * Davranış:
 *   - renderTemplate(id, vars) → { ok, text, template, version } | { ok:false, error }
 *   - listTemplates() → kayıtlı şablonların başlıkları.
 *   - registerTemplate(spec) → yeni şablon ekler; id çakışması reddedilir.
 *
 * Dönüş:
 *   - render → { ok, text, template, version }
 *
 * Test:
 *   - testOnlyClear() şablonları fabrika durumuna döndürür.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const TEMPLATES = [
  {
    id: 'system.role',
    version: '3.26.0',
    template: 'Sen Krevyx v{{version}} ajanısın. {{goal}}.\nKurallar: {{rules}}.\nProjede çalışılan dizin: {{cwd}}.\nZaman: {{now}}.',
    params: ['version', 'goal', 'rules', 'cwd', 'now'],
  },
  {
    id: 'plan.build',
    version: '3.26.0',
    template: 'Aşağıdaki isteği adım adım planla. İstek: {{prompt}}\nPlan bütçesi (maksimum adım): {{budget}}\nDizin: {{cwd}}\nYanıt JSON: {"steps":[{"type":"list_dir|read|write|edit|execute|review","target":"...","args":{},"requiresApproval":true}]}',
    params: ['prompt', 'budget', 'cwd'],
  },
  {
    id: 'tool.call',
    version: '3.26.0',
    template: 'Araç çağrısı: {{tool}}\nParametreler: {{params_json}}\nKısıtlar: yalnızca izinli araçları kullan; çıktılar kırpılabilir.',
    params: ['tool', 'params_json'],
  },
  {
    id: 'grading.task',
    version: '3.26.0',
    template: 'Görevi derecelendir (0-10): {{prompt}}\nSonuç: {{result}}\nKriter: {{criteria}}\nYanıt: {"score":N,"ok":boolean,"notes":"..."}',
    params: ['prompt', 'result', 'criteria'],
  },
  {
    id: 'diff.review',
    version: '3.26.0',
    template: 'Diff hunklarını incele: {{diff}}\nPolitika: {{policy}}\nYanıt: {"hunks":[{"index":N,"verdict":"accept|reject","reason":"..."}]}',
    params: ['diff', 'policy'],
  },
  {
    id: 'summarize.text',
    version: '3.26.0',
    template: 'Şu parçaları özetle: {{chunks_json}}\nMaksimum token: {{max_tokens}}\nYanıt: her parça için bir cümle.',
    params: ['chunks_json', 'max_tokens'],
  },
  {
    id: 'context.trim',
    version: '3.26.0',
    template: 'Bağlamı {{budget}} token bütçesine indir: {{messages_json}}\nSistem mesajlarını koru; eski/low-importance mesajları kırp.',
    params: ['budget', 'messages_json'],
  },
  {
    id: 'security.constraints',
    version: '3.26.0',
    template: 'Güvenlik kısıtları: izinli komutlar {{allowlist_json}}; dizin kısıtı {{path_prefix}}; tehlike sinyalleri {{danger_signals}}. Bu sınırların dışına çıkma.',
    params: ['allowlist_json', 'path_prefix', 'danger_signals'],
  },
  {
    id: 'handoff.lead',
    version: '3.26.0',
    template: 'Lead ajan: "{{task}}"\nAlt görevler: {{subtasks_json}}\nSonuçları şu biçimde birleştir: her alt görev için özet + ana çıktı.',
    params: ['task', 'subtasks_json'],
  },
  {
    id: 'handoff.worker',
    version: '3.26.0',
    template: 'Alt görev: {{task}}\nBağlam: {{context}}\nYanıt: {"ok":boolean,"output":"..."}',
    params: ['task', 'context'],
  },
  {
    id: 'pipeline.stage',
    version: '3.26.0',
    template: 'Pipeline stage "{{stage}}": {{instruction}}\nGirdi artefaktları: {{inputs_json}}\nÖnceki stage çıktısı: {{prev_output}}',
    params: ['stage', 'instruction', 'inputs_json', 'prev_output'],
  },
  {
    id: 'budget.warn',
    version: '3.26.0',
    template: 'Bütçe uyarısı: kalan {{remaining_usd}} USD / {{budget_usd}} USD; kalan token {{remaining_tokens}}.\nKullanımı azalt; yalnızca kritik adımları çalıştır.',
    params: ['remaining_usd', 'budget_usd', 'remaining_tokens'],
  },
  {
    id: 'memory.query',
    version: '3.26.0',
    template: 'Proje belleğinde ara: {{query}}\nDizin: {{cwd}}\nEn fazla {{limit}} not döndür.',
    params: ['query', 'cwd', 'limit'],
  },
  {
    id: 'skills.use',
    version: '3.26.0',
    template: 'Görev: {{task}}\nEşleşen yetenekler: {{skills_json}}\nUygun olanı seç ve adımlarını uygula.',
    params: ['task', 'skills_json'],
  },
  {
    id: 'diff.gate',
    version: '3.26.0',
    template: 'Diff kapısı: {{diff}}\nTehlike skoru eşiği: {{threshold}}\nYanıt: {"verdict":"accept|reject|review","score":N,"signals":[...]}',
    params: ['diff', 'threshold'],
  },
  {
    id: 'secret.scan.prompt',
    version: '3.26.0',
    template: 'Gizli tarama: {{text}}\nKurallar: API anahtarları, PAT, PEM, URL kimlik bilgileri.\nYanıt: {"findings":[{"rule":"...","match":"...","start":N,"end":N}]}',
    params: ['text'],
  },
  {
    id: 'audit.explain',
    version: '3.26.0',
    template: 'Denetim zinciri olayı: {{event_json}}\nBu olayın anlamını tek cümleyle açıkla.',
    params: ['event_json'],
  },
  {
    id: 'eval.regression',
    version: '3.26.0',
    template: 'Regresyon değerlendirmesi: {{task}}\nÖnceki sonuç: {{previous_json}}\nYeni sonuç: {{current_json}}\nYanıt: {"regressed":boolean,"delta":N,"notes":"..."}',
    params: ['task', 'previous_json', 'current_json'],
  },
  {
    id: 'session.recovery',
    version: '3.26.0',
    template: 'Oturum kurtarma: {{session_id}} kesintiye uğradı. Kalan adımlar: {{remaining_json}}\n{{steps_so_far_json}} adım tamamlandı.\nKaldığın yerden devam et.',
    params: ['session_id', 'remaining_json', 'steps_so_far_json'],
  },
  {
    id: 'workspace.rules',
    version: '3.26.0',
    template: 'Çalışma alanı kuralları ({{workspace}}): {{rules}}\nBu kurallar tüm adımlarda geçerlidir.',
    params: ['workspace', 'rules'],
  },
  {
    id: 'observability.report',
    version: '3.26.0',
    template: 'Metrik raporu: istek {{requests}}, hata {{failures}}, harcama {{spent_usd}} USD, süre {{duration_ms}} ms.\nÖzet: {{summary}}',
    params: ['requests', 'failures', 'spent_usd', 'duration_ms', 'summary'],
  },
  {
    id: 'policy.explain',
    version: '3.26.0',
    template: 'Güvenlik politikası ihlali: {{violation_json}}\nKullanıcıya kısa ve net bir uyarı üret.',
    params: ['violation_json'],
  },
];

const _registry = new Map();
const _original = new Map();

function defineTemplate(spec) {
  return {
    id: spec.id,
    version: spec.version,
    template: spec.template,
    params: Array.isArray(spec.params) ? spec.params.slice() : [],
    render(vars = {}) {
      let text = this.template;
      const missing = [];
      for (const p of this.params) {
        const value = vars[p];
        if (value === undefined || value === null) { missing.push(p); text = text.split(`{{${p}}}`).join(''); }
        else if (typeof value === 'object') { text = text.split(`{{${p}}}`).join(JSON.stringify(value)); }
        else { text = text.split(`{{${p}}}`).join(String(value)); }
      }
      return { ok: true, text, template: this.id, version: this.version, missingParams: missing };
    },
  };
}

function seedTemplates() {
  _registry.clear();
  _original.clear();
  TEMPLATES.forEach((t) => {
    const tpl = defineTemplate(t);
    _registry.set(t.id, tpl);
    _original.set(t.id, tpl);
  });
}

function listTemplates() {
  return { ok: true, templates: Array.from(_registry.values()).map((t) => ({ id: t.id, version: t.version, params: t.params })) };
}

function getTemplate(id) {
  return _registry.get(id) || null;
}

function registerTemplate(spec) {
  if (!spec || !spec.id) return { ok: false, error: 'Şablon kimliği eksik' };
  if (_registry.has(spec.id)) return { ok: false, error: `Şablon zaten var: ${spec.id}` };
  _registry.set(spec.id, defineTemplate(spec));
  return { ok: true, template: spec.id };
}

function renderTemplate(id, vars) {
  const tpl = _registry.get(id);
  if (!tpl) return { ok: false, error: `Bilinmeyen şablon: ${id}` };
  try {
    return tpl.render(vars || {});
  } catch (err) {
    return { ok: false, error: `Şablon hatası: ${err.message}` };
  }
}

function renderSystemRole(vars = {}) {
  const tpl = _registry.get('system.role');
  if (!tpl) return { ok: false, error: 'Sistem rolü şablonu yok' };
  return tpl.render({
    version: vars.version || '3.26.0',
    goal: vars.goal || 'görevi güvenli ve denetlenebilir şekilde yürütmek',
    rules: vars.rules || 'yalnızca izinli araçları kullan; her adımda onay al; tehlikeli işlemlerden kaçın',
    cwd: vars.cwd || process.cwd(),
    now: vars.now || new Date().toISOString(),
  });
}

function seedRandomTemplateId() {
  return `tpl-${crypto.randomBytes(6).toString('hex')}`;
}

function testOnlyClear() {
  seedTemplates();
  return { ok: true };
}

seedTemplates();

module.exports = {
  listTemplates,
  getTemplate,
  registerTemplate,
  renderTemplate,
  renderSystemRole,
  seedRandomTemplateId,
  testOnlyClear,
  TEMPLATES,
};
