/**
 * tools/registry.js — Araç kataloğu ve güvenlik profilleri (F2.1)
 *
 * Her araç: name, display_name, tier (read|write|exec), description,
 * input_schema (JSON Schema benzeri), sandbox kökleri, timeout.
 *
 * Tier kuralları:
 *  - read: onay gerekmez, sandbox uygulanır
 *  - write: kullanıcı onayı GEREKİR (tool-approval-request/response)
 *  - exec: kullanıcı onayı GEREKİR + komut blacklist
 */

'use strict';

const READ_ONLY_TOOLS = ['read_file', 'list_dir', 'scan_project', 'search_memory', 'git_info', 'get_model_catalog', 'list_sessions', 'session_meta'];
const WRITE_TOOLS = ['create_file', 'edit_file', 'append_file', 'delete_file', 'write_session', 'memory_add', 'memory_accept'];
const EXEC_TOOLS = ['terminal_execute', 'git_clone', 'generate_image', 'web_fetch'];

const DANGEROUS_COMMANDS = new Set([
  'sudo', 'su', 'rm', 'chmod', 'chown', 'mkfs', 'dd', 'shutdown', 'reboot',
  'poweroff', 'init', 'ifconfig', 'route', 'iptables', 'netsh', 'reg',
  'format', 'diskpart', 'wpeinit', 'bcdedit',
]);

const manifestById = new Map([
  [
    'read_file',
    {
      name: 'read_file',
      display_name: 'Dosya Oku',
      tier: 'read',
      description: 'Sandbox içindeki bir dosyanın içeriğini okur (max 2MB).',
      sandbox: { roots: ['home', 'workspace', 'user_selected'] },
      timeout_ms: 30000,
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Göreceli veya mutlak yol' } },
        required: ['path'],
      },
    },
  ],
  [
    'list_dir',
    {
      name: 'list_dir',
      display_name: 'Klasör Listele',
      tier: 'read',
      description: 'Sandbox içindeki klasörün içeriğini listeler.',
      sandbox: { roots: ['home', 'workspace', 'user_selected'] },
      timeout_ms: 15000,
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  ],
  [
    'scan_project',
    {
      name: 'scan_project',
      display_name: 'Proje Tara',
      tier: 'read',
      description: 'Workspace kökünü tarar ve yapı/özet çıkarır (mevcut IPC genişletimi).',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 120000,
      input_schema: {
        type: 'object',
        properties: { root_path: { type: 'string' } },
        required: ['root_path'],
      },
    },
  ],
  [
    'create_file',
    {
      name: 'create_file',
      display_name: 'Dosya Oluştur',
      tier: 'write',
      description: 'Workspace kökü altında yeni dosya oluşturur. Kullanıcı onayı gerekir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 60000,
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  ],
  [
    'edit_file',
    {
      name: 'edit_file',
      display_name: 'Dosya Düzenle',
      tier: 'write',
      description: 'Mevcut dosyanın içeriğini değiştirir. Kullanıcı onayı gerekir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 60000,
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  ],
  [
    'append_file',
    {
      name: 'append_file',
      display_name: 'Dosyaya Ekle',
      tier: 'write',
      description: 'Mevcut dosyanın sonuna içerik ekler. Kullanıcı onayı gerekir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 60000,
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  ],
  [
    'delete_file',
    {
      name: 'delete_file',
      display_name: 'Dosya Sil',
      tier: 'write',
      description: 'Workspace içindeki bir dosyayı siler. Kullanıcı onayı gerekir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 30000,
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  ],
  [
    'terminal_execute',
    {
      name: 'terminal_execute',
      display_name: 'Terminal Komutu',
      tier: 'exec',
      description: 'Ayrıcalıklı PTY oturumunda komut çalıştırır. Tehlikeli komutlar engellenir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 300000,
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
        },
        required: ['command'],
      },
    },
  ],
  [
    'git_clone',
    {
      name: 'git_clone',
      display_name: 'Git Clone',
      tier: 'exec',
      description: 'HTTPS GitHub repo klonlar (mevcut whitelist korunur).',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 600000,
      input_schema: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
  ],
  [
    'search_memory',
    {
      name: 'search_memory',
      display_name: 'Bellek Ara',
      tier: 'read',
      description: 'Anlamsal bellekte ilgili pasajları sorgular (salt okuma).',
      sandbox: null,
      timeout_ms: 5000,
      input_schema: {
        type: 'object',
        properties: { query: { type: 'string' }, limit: { type: 'number' } },
        required: ['query'],
      },
    },
  ],
  [
    'memory_add',
    {
      name: 'memory_add',
      display_name: 'Belleğe Kaydet',
      tier: 'write',
      description: 'Kalıcı bilgi adayını bellek deposuna geçirir. Onay gerektirir.',
      sandbox: null,
      timeout_ms: 10000,
      input_schema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['content'],
      },
    },
  ],
  [
    'generate_image',
    {
      name: 'generate_image',
      display_name: 'Görsel Üret',
      tier: 'exec',
      description: 'Sağlayıcıdan görsel üretir. Yüksek maliyetli; onay gerekir.',
      sandbox: { roots: ['workspace'] },
      timeout_ms: 120000,
      input_schema: {
        type: 'object',
        properties: {
          prompt: { type: 'string' },
          provider: { type: 'string' },
          size: { type: 'string' },
        },
        required: ['prompt'],
      },
    },
  ],
]);

function getToolManifest(name) {
  if (typeof name !== 'string') return null;
  return manifestById.get(name) || null;
}

function listTools(category) {
  const all = [...manifestById.values()];
  if (!category) return all;
  if (category === 'read') return all.filter((t) => t.tier === 'read');
  if (category === 'write') return all.filter((t) => t.tier === 'write');
  if (category === 'exec') return all.filter((t) => t.tier === 'exec');
  return all;
}

/**
 * Argüman şema doğrulaması (basit tip kontrolü)
 */
function validateToolArgs(manifest, args) {
  if (!manifest || !args || typeof args !== 'object') return false;
  const schema = manifest.input_schema;
  if (!schema) return true;
  for (const req of schema.required || []) {
    if (args[req] === undefined || args[req] === null) return false;
  }
  const props = schema.properties || {};
  for (const [key, def] of Object.entries(props)) {
    const v = args[key];
    if (v === undefined || v === null) continue;
    if (def.type === 'string' && typeof v !== 'string') return false;
    if (def.type === 'number' && typeof v !== 'number') return false;
    if (def.type === 'array' && !Array.isArray(v)) return false;
  }
  return true;
}

/**
 * Komut blacklist kontrolü (exec tier için)
 */
function isDangerousCommand(command) {
  if (typeof command !== 'string') return true;
  const base = command.trim().split(/[/\\]/).pop().split(/\s/)[0].toLowerCase();
  if (DANGEROUS_COMMANDS.has(base)) return true;
  // && / || ile zincirli tehlikeli komutlar
  const parts = command.split(/&&|\|\||;/).map((c) => c.trim().split(/\s/)[0].toLowerCase());
  return parts.some((p) => DANGEROUS_COMMANDS.has(p));
}

module.exports = {
  manifestById,
  getToolManifest,
  listTools,
  validateToolArgs,
  isDangerousCommand,
  READ_ONLY_TOOLS,
  WRITE_TOOLS,
  EXEC_TOOLS,
};
