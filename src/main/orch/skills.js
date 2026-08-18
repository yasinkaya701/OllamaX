'use strict';

/**
 * skills.js — Krevyx v3.26 Yetenek Kayıt Defteri
 *
 * Kapsam:
 *   - Ajanların tekrar kullanılabilir yetenek (skill) tanımları.
 *   - Yerleşik yetenekler: commit, test-run, lint, build, grep-code, file-audit,
 *     pr-summary, changelog-draft, dependency-scan, deploy-check, log-analyze, memory-sync.
 *   - Eşleştirme: görev metni yetenek tetikleyici kelimeleriyle eşleşir.
 *   - Yetenek akışı: her yetenek { trigger, steps:[{tool,args}], outputSchema }.
 *
 * Davranış:
 *   - listSkills() → kayıtlı yetenekler; findSkill(id) → tekil.
 *   - matchSkills(taskText) → eşleşen yetenekler sıralı.
 *   - planSkill(skill, vars) → adım planı üretir; registerSkill/enableSkill yönetimi.
 *
 * Dönüş:
 *   - planSkill → { ok, steps } | { ok:false, error }
 *
 * Test:
 *   - testOnlyClear() yetenekleri fabrika durumuna döndürür.
 *
 * @version 3.26.0
 */

const crypto = require('crypto');

const _skills = new Map();
const _original = new Map();

const BUILTIN_SKILLS = [
  { id: 'commit', trigger: ['commit', 'kaydet', 'commit et'], steps: [{ tool: 'shell_run', args: { command: 'git add -A' } }, { tool: 'shell_run', args: { command: 'git commit -m "{{message}}"', requiredVars: ['message'] } }] },
  { id: 'test-run', trigger: ['test', 'testler', 'sınav'], steps: [{ tool: 'shell_run', args: { command: '{{runner}}', requiredVars: ['runner'] } }] },
  { id: 'lint', trigger: ['lint', 'kod kalitesi'], steps: [{ tool: 'shell_run', args: { command: '{{runner}}', requiredVars: ['runner'] } }] },
  { id: 'build', trigger: ['build', 'derle', 'paketle'], steps: [{ tool: 'shell_run', args: { command: '{{runner}}', requiredVars: ['runner'] } }] },
  { id: 'grep-code', trigger: ['kodda ara', 'nerede tanımlı', 'find in code'], steps: [{ tool: 'grep_search', args: { pattern: '{{pattern}}', requiredVars: ['pattern'] } }] },
  { id: 'file-audit', trigger: ['dosya denetimi', 'audit'], steps: [{ tool: 'file_read', args: { path: '{{path}}', requiredVars: ['path'] } }, { tool: 'secret_scan', args: {} }] },
  { id: 'pr-summary', trigger: ['pr özeti', 'değişiklik özeti'], steps: [{ tool: 'shell_run', args: { command: 'git diff --stat' } }, { tool: 'summarize', args: {} }] },
  { id: 'changelog-draft', trigger: ['changelog', 'sürüm notu'], steps: [{ tool: 'shell_run', args: { command: 'git log --oneline -20' } }, { tool: 'summarize', args: {} }] },
  { id: 'dependency-scan', trigger: ['bağımlılık', 'dependency', 'güvenlik taraması'], steps: [{ tool: 'file_read', args: { path: 'package.json' } }, { tool: 'secret_scan', args: {} }] },
  { id: 'deploy-check', trigger: ['deploy', 'yayınla', 'kontrol'], steps: [{ tool: 'shell_run', args: { command: '{{runner}}', requiredVars: ['runner'] } }, { tool: 'web_fetch', args: { url: '{{url}}', requiredVars: ['url'] } }] },
  { id: 'log-analyze', trigger: ['log analizi', 'hata günlüğü'], steps: [{ tool: 'file_read', args: { path: '{{path}}', requiredVars: ['path'] } }, { tool: 'summarize', args: {} }] },
  { id: 'memory-sync', trigger: ['bellek senkronu', 'not kaydet'], steps: [{ tool: 'memory_query', args: { query: '{{query}}', requiredVars: ['query'] } }] },
];

function defineSkill(spec) {
  return {
    id: spec.id,
    name: spec.id,
    trigger: Array.isArray(spec.trigger) ? spec.trigger.slice() : [spec.id],
    steps: Array.isArray(spec.steps) ? spec.steps.map((s) => ({ tool: s.tool, args: { ...(s.args || {}) } })) : [],
    enabled: spec.enabled !== false,
    version: '3.26.0',
  };
}

function seedSkills() {
  _skills.clear();
  _original.clear();
  BUILTIN_SKILLS.forEach((s) => {
    const skill = defineSkill(s);
    _skills.set(s.id, skill);
    _original.set(s.id, skill);
  });
}

function listSkills(opts = {}) {
  const all = Array.from(_skills.values());
  return { ok: true, skills: opts.enabledOnly ? all.filter((s) => s.enabled) : all };
}

function findSkill(id) {
  return _skills.get(id) || null;
}

function registerSkill(spec) {
  if (!spec || !spec.id) return { ok: false, error: 'Yetenek kimliği eksik' };
  if (_skills.has(spec.id)) return { ok: false, error: `Yetenek zaten var: ${spec.id}` };
  _skills.set(spec.id, defineSkill(spec));
  return { ok: true, skill: spec.id };
}

function enableSkill(id, enabled) {
  const skill = _skills.get(id);
  if (!skill) return { ok: false, error: 'Yetenek bulunamadı' };
  skill.enabled = enabled === true;
  return { ok: true, skill: id, enabled: skill.enabled };
}

function matchSkills(taskText) {
  if (!taskText || typeof taskText !== 'string') return { ok: false, error: 'Görev metni gerekli' };
  const lower = taskText.toLowerCase();
  const scored = [];
  for (const skill of _skills.values()) {
    if (!skill.enabled) continue;
    let score = 0;
    for (const term of skill.trigger) {
      const t = String(term).toLowerCase();
      let idx = -1;
      while ((idx = lower.indexOf(t, idx + 1)) !== -1) score += 1;
    }
    if (score > 0) scored.push({ skill: skill.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return { ok: true, taskText: taskText.slice(0, 80), skills: scored };
}

function planSkill(skillId, vars = {}) {
  const skill = _skills.get(skillId);
  if (!skill) return { ok: false, error: 'Yetenek bulunamadı' };
  const missing = [];
  const steps = skill.steps.map((s) => {
    const args = {};
    for (const [key, value] of Object.entries(s.args)) {
      if (typeof value === 'string' && value.includes('{{') && value.includes('}}')) {
        const placeholders = value.match(/\{\{[a-zA-Z_][a-zA-Z0-9_]*\}\}/g) || [];
        const names = placeholders.map((ph) => ph.slice(2, -2));
        const unresolved = names.filter((v) => vars[v] === undefined || vars[v] === null);
        missing.push(...unresolved);
        let resolved = value;
        for (const v of names) {
          if (vars[v] !== undefined && vars[v] !== null) resolved = resolved.split(`{{${v}}}`).join(String(vars[v]));
        }
        args[key] = resolved;
      } else {
        args[key] = value;
      }
    }
    return { tool: s.tool, args };
  });
  if (missing.length) return { ok: false, error: `Eksik değişkenler: ${missing.join(', ')}`, missing };
  return { ok: true, skill: skillId, steps };
}

function testOnlyClear() {
  seedSkills();
  return { ok: true };
}

seedSkills();

module.exports = {
  listSkills,
  findSkill,
  registerSkill,
  enableSkill,
  matchSkills,
  planSkill,
  testOnlyClear,
  BUILTIN_SKILLS,
};
