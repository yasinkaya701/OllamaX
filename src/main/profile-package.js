/**
 * profile-package.js — .krevyxprofile paket formatı (v3.18 C-1)
 *
 * Krevyx yapılandırmasının (ajan profilleri, prompt şablonları, provider
 * config'leri, MCP sunucu tanımları) tek bir paylaşılabilir JSON dosyaya
 * toplanması ve geri yüklenmesi. Şablon paylaşımının (v3.17) taşıyıcı
 * formatı; ekipler ve topluluk için "tek dosyada studio" deneyimi.
 *
 * Şema v1:
 *   { schemaVersion: 1, format: "krevyxprofile",
 *     name, description, createdAt,
 *     agents: [...], templates: [...],
 *     providers: [{id, ...}], mcpServers: [...] }
 *
 * Gizlilik: API anahtarları ASLA paketlenmez; provider config'lerinde
 * yalnızca uç nokta/model/tier bilgisi taşınır (stripSecrets).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const configStore = require('./config/config-store');
const templates = require('./agents/templates');

const CURRENT_PROFILE_SCHEMA = 1;
const PROFILE_FORMAT = 'krevyxprofile';
const SECRET_KEYS = ['apikey', 'api_key', 'secret', 'token', 'password', 'privatekey'];

function stripSecrets(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripSecrets);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) continue;
    out[k] = stripSecrets(v);
  }
  return out;
}

function collectProviders(config) {
  const dict = (config && typeof config.providers === 'object' && config.providers) || {};
  return Object.entries(dict).map(([id, cfg]) => ({ id, ...stripSecrets(cfg) }));
}

/** İçe aktarımda gelen provider bloğundaki gizli alanları da düşürür. */
function stripProviderSecrets(p) {
  if (!p || typeof p !== 'object') return p;
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'id') { out.id = p.id; continue; }
    if (SECRET_KEYS.some((s) => k.toLowerCase().includes(s))) continue;
    out[k] = stripSecrets(v);
  }
  return out;
}

function collectMcpServers(config) {
  const mcp = (config && config.mcp && config.mcp.servers) || null;
  if (!Array.isArray(mcp)) return [];
  return mcp.map(stripSecrets);
}

/**
 * Geçerli stüdyo yapılandırmasından bir .krevyxprofile paketi üretir.
 * onlyIds: template/profil kimlikleri verildiyse yalnızca onlar paketlenir.
 */
function exportProfile({ name, description, templates: tplIds, providers: includeProviders = true } = {}) {
  const config = configStore.readConfig();
  const pkg = {
    schemaVersion: CURRENT_PROFILE_SCHEMA,
    format: PROFILE_FORMAT,
    name: name || 'krevyx-studio',
    description: description || '',
    createdAt: new Date().toISOString(),
    source: `${os.hostname()}`,
    agents: Array.isArray(config.agents) ? config.agents : [],
    templates: [],
    providers: includeProviders ? collectProviders(config) : [],
    mcpServers: collectMcpServers(config),
  };
  const all = templates.listTemplates();
  const wanted = Array.isArray(tplIds) && tplIds.length ? tplIds : null;
  for (const t of all) {
    if (wanted && !wanted.includes(t.id)) continue;
    pkg.templates.push({
      id: t.id,
      label: t.label,
      category: t.category || null,
      prompt: t.prompt || '',
    });
  }
  return pkg;
}

function validateProfile(pkg) {
  if (!pkg || typeof pkg !== 'object') return 'paket boş';
  if (pkg.schemaVersion !== CURRENT_PROFILE_SCHEMA) return `desteklenmeyen şema: ${pkg.schemaVersion}`;
  if (pkg.format !== PROFILE_FORMAT) return `bilinmeyen format: ${pkg.format}`;
  if (pkg.templates && !Array.isArray(pkg.templates)) return 'templates dizi olmalı';
  if (pkg.agents && !Array.isArray(pkg.agents)) return 'agents dizi olmalı';
  return null;
}

/**
 * Paketi stüdyoya içe aktarır. Şablonlar kullanıcı dizinine kopyalanır
 * (çakışan gömülü şablonları gölgeleyerek); profiller config'e eklenir;
 * provider/MCP tanımları config'e MERGE edilir (mevcut anahtarlar korunur).
 */
function importProfile(pkg) {
  const err = validateProfile(pkg);
  if (err) return { ok: false, error: err };
  const imported = { templates: 0, agents: 0, providers: 0, mcpServers: 0 };
  for (const t of pkg.templates || []) {
    if (!t || !t.id || !t.prompt) continue;
    const res = templates.saveTemplate({
      id: String(t.id).replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 64),
      label: t.label || t.id,
      category: t.category || 'imported',
      prompt: String(t.prompt),
    });
    if (res && res.ok) imported.templates += 1;
  }
  if (Array.isArray(pkg.agents)) {
    try {
      configStore.updateConfig((c) => {
        const existing = new Set((c.agents || []).map((a) => a && a.id).filter(Boolean));
        c.agents = c.agents || [];
        for (const a of pkg.agents) {
          if (a && a.id && !existing.has(a.id)) {
            c.agents.push(stripSecrets(a));
            existing.add(a.id);
            imported.agents += 1;
          }
        }
        return c;
      });
    } catch {
      /* config write hatası devam ettirir */
    }
  }
  if (Array.isArray(pkg.providers)) {
    try {
      configStore.updateConfig((c) => {
        c.providers = c.providers || {};
        for (const p of pkg.providers) {
          if (!p || !p.id) continue;
          const cleaned = stripProviderSecrets(p);
          const merged = Object.assign({}, stripSecrets(c.providers[cleaned.id] || {}), cleaned);
          c.providers[cleaned.id] = merged;
          imported.providers += 1;
        }
        return c;
      });
    } catch {
      /* devam */
    }
  }
  if (Array.isArray(pkg.mcpServers)) {
    try {
      configStore.updateConfig((c) => {
        c.mcp = c.mcp || {};
        const byName = new Map(((c.mcp.servers || []).map((s) => [s && s.name, s]).filter(([k]) => k)));
        const existed = new Set(byName.keys());
        for (const s of pkg.mcpServers) {
          if (!s || !s.name) continue;
          byName.set(s.name, Object.assign({}, byName.get(s.name) || {}, stripSecrets(s)));
          if (!existed.has(s.name)) imported.mcpServers += 1;
        }
        c.mcp.servers = Array.from(byName.values());
        return c;
      });
    } catch {
      /* devam */
    }
  }
  return { ok: true, imported };
}

function profileExtension() {
  return '.krevyxprofile';
}

module.exports = {
  exportProfile,
  importProfile,
  validateProfile,
  profileExtension,
  CURRENT_PROFILE_SCHEMA,
  stripSecrets,
};
