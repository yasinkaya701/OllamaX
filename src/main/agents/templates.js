/**
 * agents/templates.js — Ajan şablon yönetimi ve template değişkenleri (F2.5)
 *
 * Şablonlar iki kaynaktan gelir:
 *  - Gömülü: src/shared/agent-templates/ altında JSON paketler (Türkçe + EN)
 *  - Kullanıcı: userData/Krevyx/agents/custom-templates/ altında override
 *
 * Prompt'lar değişken destekler:
 *  {{workspace_root}}, {{os}}, {{date}}, {{workspace_alias}}, {{model}}
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const configStore = require('../config/config-store');

const VAR_RE = /\{\{(workspace_root|workspace_alias|os|date|model)\}\}/g;

function interpolatePrompt(prompt, ctx) {
  if (typeof prompt !== 'string') return prompt || '';
  return prompt.replace(VAR_RE, (match, name) => {
    switch (name) {
      case 'workspace_root':
        return (ctx && ctx.workspaceRoot) || '';
      case 'workspace_alias':
        return (ctx && ctx.workspaceAlias) || '';
      case 'os':
        return `${os.platform()} (${os.arch()})`;
      case 'date':
        return new Date().toISOString().slice(0, 10);
      case 'model':
        return (ctx && ctx.model) || '';
      default:
        return '';
    }
  });
}

function templateDir() {
  return path.join(configStore.krevyxRoot(), 'agents', 'custom-templates');
}

function bundledTemplateDir() {
  return path.join(__dirname, '..', '..', 'shared', 'agent-templates');
}

/**
 * Bir şablon dosyasını okur (kullanıcı veya gömülü).
 */
function readTemplateFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Tüm gömülü + kullanıcı şablonlarını döndürür. Kullanıcı şablonları
 * aynı id ile gömülüleri override eder.
 */
function listTemplates() {
  const out = new Map();

  // Gömülü paketleri tara
  try {
    if (fs.existsSync(bundledTemplateDir())) {
      for (const pkg of fs.readdirSync(bundledTemplateDir())) {
        const pkgDir = path.join(bundledTemplateDir(), pkg);
        if (!fs.statSync(pkgDir).isDirectory()) continue;
        for (const file of fs.readdirSync(pkgDir)) {
          if (!file.endsWith('.json')) continue;
          const t = readTemplateFile(path.join(pkgDir, file));
          if (t && t.id) {
            t.source = `bundled:${pkg}`;
            out.set(t.id, t);
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  // Kullanıcı şablonları override eder
  try {
    const dir = templateDir();
    if (fs.existsSync(dir)) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json')) continue;
        const t = readTemplateFile(path.join(dir, file));
        if (t && t.id) {
          t.source = 'user';
          out.set(t.id, t);
        }
      }
    }
  } catch {
    /* ignore */
  }

  return [...out.values()];
}

function saveTemplate(tpl) {
  if (!tpl || typeof tpl.id !== 'string') return { ok: false, error: 'Geçersiz şablon.' };
  try {
    const dir = templateDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const safe = String(tpl.id).replace(/[^A-Za-z0-9_-]+/g, '').slice(0, 64);
    fs.writeFileSync(path.join(dir, `${safe}.json`), JSON.stringify(tpl, null, 2), 'utf8');
    return { ok: true, id: safe };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  interpolatePrompt,
  listTemplates,
  saveTemplate,
  templateDir,
  bundledTemplateDir,
};
