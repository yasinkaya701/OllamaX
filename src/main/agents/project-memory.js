/* KREYX.md — Proje Hafızası Katmanı (v3.21)
 * Claude Code CLAUDE.md + Cursor Rules öncül özelliklerinin Krevyx'e yerli uyarlanması.
 * Görev prompt'unun önüne otomatik iliştirilir; öğrenme girişleri kullanıcı onayıyla eklenir.
 * Hafıza hiyerarşisi: proje KREYX.md → .krevyxprofile project.md → ~/.krevyx/user.md
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const MEMORY_FILE = 'KREYX.md';
const PROFILE_MEMORY = path.join('.krevyxprofile', 'project.md');
const USER_MEMORY = path.join('.krevyx', 'user.md');
const LEARNED_SECTION = '## Öğrenilenler';

/**
 * Proje bağlamına göre geçerli hafıza kaynaklarını bulur ve içeriklerini okur.
 * @param {string} [workingDir] - görevin çalışma dizini
 * @returns {{ files: string[], content: string, errors: string[] }}
 */
function loadProjectMemory(workingDir) {
  const files = [];
  const parts = [];
  const errors = [];
  const candidates = [];

  if (workingDir && workingDir.trim()) {
    candidates.push(path.join(workingDir, MEMORY_FILE));
    candidates.push(path.join(workingDir, PROFILE_MEMORY));
  }
  candidates.push(path.join(os.homedir(), USER_MEMORY));

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 256 * 1024) {
        errors.push(`${file}: okunamadı (dosya değil veya 256KB üzeri)`);
        continue;
      }
      const raw = fs.readFileSync(file, 'utf8').trim();
      if (!raw) continue;
      files.push(file);
      const rel = workingDir ? path.relative(workingDir, file) : path.basename(file);
      parts.push(`<!-- ===== ${rel} ===== -->\n${raw}`);
    } catch (e) {
      errors.push(`${file}: ${e && e.message ? e.message : String(e)}`);
    }
  }

  if (parts.length === 0) {
    return { files, content: '', errors };
  }

  const content =
    '# KREYX Proje Hafızası (otomatik)\n' +
    'Aşağıdaki bölümler projenin hafıza dosyalarından otomatik olarak iliştirildi. ' +
    'Ajanın proje bağlamı, kuralları ve öğrenilen bilgileri bunlara dayanır.\n\n' +
    parts.join('\n\n') +
    '\n<!-- ===== /hafıza ===== -->\n';

  return { files, content, errors };
}

/**
 * Görev prompt'unun önüne hafızayı iliştirir; hafıza yoksa görevi olduğu gibi döndürür.
 * @param {string} task
 * @param {string} [workingDir]
 * @returns {{ task: string, memoryFiles: string[] }}
 */
function attachMemory(task, workingDir) {
  if (!task || typeof task !== 'string' || !task.trim()) {
    return { task: task || '', memoryFiles: [] };
  }
  const { content, files } = loadProjectMemory(workingDir);
  if (!content) return { task, memoryFiles: [] };
  return {
    task: `${content}\n\n--- Proje Hafızası Sonu ---\n\n${task}`,
    memoryFiles: files,
  };
}

/**
 * Görevden öğrenilen bilgiyi (örn. "test komutu: npm run check") kullanıcı onayıyla
 * KREYX.md'nin "Öğrenilenler" bölümüne tek satır olarak ekler.
 * @param {string} workingDir
 * @param {string} note
 * @returns {{ ok: boolean, file: string|null, error: string|null }}
 */
function addLearnedNote(workingDir, note) {
  if (!workingDir || typeof note !== 'string' || !note.trim()) {
    return { ok: false, file: null, error: 'geçersiz dizin veya boş not' };
  }
  if (note.length > 500) note = note.slice(0, 500) + '...';
  // LF enjeksiyonu önleme: satırları tek bir not olarak birleştir
  const safe = note.replace(/[\r\n]+/g, ' · ').trim();
  if (!safe) return { ok: false, file: null, error: 'boş not' };

  const file = path.join(workingDir, MEMORY_FILE);
  let existing = '';
  try {
    if (fs.existsSync(file)) existing = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, file, error: e && e.message ? e.message : String(e) };
  }

  const hasSection = existing.includes(LEARNED_SECTION);
  const entry = `- ${safe}`;
  let next;
  if (hasSection) {
    // Son "Öğrenilenler" bölümünün sonuna ekle (varsa birden çok - sonuncusuna)
    const lastIdx = existing.lastIndexOf(LEARNED_SECTION);
    const after = existing.slice(lastIdx).replace(/\n+$/, '');
    next = existing.slice(0, lastIdx) + after + (after.endsWith('\n') ? '' : '\n') + entry + '\n';
  } else {
    next = (existing.replace(/\n+$/, '') || '') + '\n\n' + LEARNED_SECTION + '\n\n' + entry + '\n';
  }

  try {
    fs.writeFileSync(file, next, 'utf8');
    return { ok: true, file, error: null };
  } catch (e) {
    return { ok: false, file, error: e && e.message ? e.message : String(e) };
  }
}

module.exports = { loadProjectMemory, attachMemory, addLearnedNote, MEMORY_FILE, PROFILE_MEMORY, USER_MEMORY };
