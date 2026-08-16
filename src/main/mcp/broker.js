/**
 * mcp/broker.js — Ajan başına MCP sunucu ataması (v3.18 C-3)
 *
 * Krevyx'teki her ajana ayrı bir MCP sunucu kümesi atanabilir:
 *   { "claude-code": ["filesystem", "github"], "codex": ["filesystem"] }
 *
 * Bu, aynı sunucuların farklı ajanların araç setine farklı şekilde
 * yansımasını sağlar (örn. Claude Code'a tam dosya sistemi, Codex'e
 * salt-okunur). Orkestratör zincirinde her adım yalnızca kendisine
 * atanmış sunucuların araçlarını görür.
 *
 * Saklama: config.mcp.agentSets (configStore), runtime bellek önbelleği.
 */
'use strict';
const configStore = require('../config/config-store');

let runtimeCache = null;

function readConfig() {
  try {
    return configStore.readConfig();
  } catch {
    return null;
  }
}

function getAgentMcpSets() {
  if (runtimeCache) return runtimeCache;
  const config = readConfig();
  const sets = (config && config.mcp && config.mcp.agentSets) || {};
  runtimeCache = sets;
  return sets;
}

function setAgentMcpSets(sets) {
  runtimeCache = null;
  configStore.updateConfig((c) => {
    c.mcp = c.mcp || {};
    c.mcp.agentSets = sets || {};
    return c;
  });
  runtimeCache = sets || {};
}

/**
 * Belirli bir ajan için başlatılması gereken MCP sunucu tanımlarını döndürür.
 * config.mcp.servers ile eşleştirilir; bilinmeyen sunucu adları atlanır.
 */
function serversForAgent(agentId) {
  const sets = getAgentMcpSets();
  const names = Array.isArray(sets[agentId]) ? sets[agentId] : [];
  const config = readConfig();
  const servers = (config && config.mcp && Array.isArray(config.mcp.servers)) ? config.mcp.servers : [];
  const byName = new Map(servers.map((s) => (s && s.name ? [s.name, s] : [])));
  return names.map((n) => byName.get(n)).filter(Boolean);
}

/**
 * Orkestratör zinciri çalışırken çağrılır: verilen ajan kümesinin
 * araçlarının yalnızca atanmış sunuculardan gelmesini garanti eder.
 * mcpTools öğesi {server, name, ...} veya server alanı yoksa ad üzerinden
 * sunucu tanımına geri düşer.
 */
function filterMcpToolsForAgent(agentId, mcpTools) {
  if (!agentId || !Array.isArray(mcpTools)) return mcpTools;
  const sets = getAgentMcpSets();
  const names = Array.isArray(sets[agentId]) ? sets[agentId] : null;
  if (!names) return mcpTools;
  const config = readConfig();
  const servers = (config && config.mcp && Array.isArray(config.mcp.servers)) ? config.mcp.servers : [];
  const toolNamesByServer = new Map();
  for (const s of servers) {
    if (s && Array.isArray(s.tools)) {
      for (const t of s.tools) {
        if (t && t.name) toolNamesByServer.set(t.name, s.name);
      }
    }
  }
  return mcpTools.filter((t) => {
    if (!t) return false;
    if (t.server) return names.includes(t.server);
    if (t.name && toolNamesByServer.has(t.name)) return names.includes(toolNamesByServer.get(t.name));
    return false;
  });
}

module.exports = {
  getAgentMcpSets,
  setAgentMcpSets,
  serversForAgent,
  filterMcpToolsForAgent,
};
