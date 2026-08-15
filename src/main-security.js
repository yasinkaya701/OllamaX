const path = require('path');
const os = require('os');

const MAX_USER_ROOTS = 48;
const userSelectedRoots = new Set();

function hasAsciiControl(s) {
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

const GIT_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'gitlab.com',
  'www.gitlab.com',
  'bitbucket.org',
  'codeberg.org',
]);

function registerUserFolder(rootPath) {
  if (!rootPath || typeof rootPath !== 'string') return;
  try {
    const r = path.resolve(rootPath);
    userSelectedRoots.add(r);
    while (userSelectedRoots.size > MAX_USER_ROOTS) {
      const first = userSelectedRoots.values().next().value;
      userSelectedRoots.delete(first);
    }
  } catch {
    /* ignore */
  }
}

function pathIsUnderRoot(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function tryUserDataRoot() {
  try {
    const { app } = require('electron');
    if (typeof app.getPath === 'function') return path.resolve(app.getPath('userData'));
  } catch {
    /* app not ready or unavailable */
  }
  return null;
}

function readableRoots() {
  const home = path.resolve(os.homedir());
  const projects = path.resolve(path.join(home, 'OllamaX-Projects'));
  const roots = [home, projects, ...userSelectedRoots];
  const ud = tryUserDataRoot();
  if (ud) roots.push(ud);
  return roots;
}

function resolveReadablePath(requestedPath, extraRoots) {
  if (requestedPath == null || typeof requestedPath !== 'string') return null;
  let target;
  try {
    target = path.isAbsolute(requestedPath) ? path.resolve(requestedPath) : path.resolve(os.homedir(), requestedPath);
  } catch {
    return null;
  }
  for (const root of [...(Array.isArray(extraRoots) ? extraRoots : []), ...readableRoots()]) {
    try {
      if (pathIsUnderRoot(root, target)) return target;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function normalizeOllamaHost(input) {
  const fallback = 'localhost:11434';
  if (input == null || typeof input !== 'string') return fallback;
  const raw = input.trim();
  if (!raw) return fallback;
  if (hasAsciiControl(raw) || raw.includes('@')) return null;
  let s = raw.replace(/^https?:\/\//i, '');
  s = s.split(/[/ ?#]/)[0];
  if (!s || hasAsciiControl(s) || s.includes('@')) return null;

  let hostname;
  let port;
  if (s.startsWith('[')) {
    const close = s.indexOf(']');
    if (close === -1) return null;
    hostname = s.slice(1, close);
    const rest = s.slice(close + 1);
    if (!rest.startsWith(':')) return null;
    port = parseInt(rest.slice(1), 10);
  } else {
    const lastColon = s.lastIndexOf(':');
    if (lastColon === -1) {
      hostname = s;
      port = 11434;
    } else {
      const possiblePort = s.slice(lastColon + 1);
      if (!/^\d+$/.test(possiblePort)) return null;
      hostname = s.slice(0, lastColon);
      port = parseInt(possiblePort, 10);
    }
  }
  if (!hostname || Number.isNaN(port) || port < 1 || port > 65535) return null;
  if (hostname.includes('..') || hostname.startsWith('.') || hostname.endsWith('.')) return null;
  const hl = hostname.toLowerCase();
  if (hl === '169.254.169.254' || hl === 'metadata.google.internal') return null;
  const dnsLike = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,253}[a-zA-Z0-9])?)*$/.test(hostname);
  const ipv4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(hostname);
  const ipv6 = /^[a-fA-F0-9:]+$/.test(hostname) && hostname.includes(':');
  if (!dnsLike && !ipv4 && !ipv6) return null;
  if (ipv6) return `[${hostname}]:${port}`;
  return `${hostname}:${port}`;
}

/** @param {string} hostKey from {@link normalizeOllamaHost} */
function splitOllamaHttpTarget(hostKey) {
  if (!hostKey || typeof hostKey !== 'string') return null;
  if (hostKey.startsWith('[')) {
    const idx = hostKey.indexOf(']:');
    if (idx === -1) return null;
    return { hostname: hostKey.slice(1, idx), port: parseInt(hostKey.slice(idx + 2), 10) };
  }
  const last = hostKey.lastIndexOf(':');
  if (last <= 0) return null;
  return { hostname: hostKey.slice(0, last), port: parseInt(hostKey.slice(last + 1), 10) };
}

function sanitizeGeminiModelId(id) {
  const s = String(id || '').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(s) || s.length > 128) return 'gemini-2.5-flash';
  return s;
}

function isAllowedGitCloneUrl(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'https:') return false;
    if (!GIT_HOSTS.has(u.hostname.toLowerCase())) return false;
    const p = u.pathname.replace(/\/+$/, '');
    if (!/^\/[\w./-]+\.git$/i.test(p)) return false;
    return true;
  } catch {
    return false;
  }
}

function safeCloneRepoName(url) {
  try {
    const u = new URL(String(url).trim());
    const seg = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const last = seg[seg.length - 1] || 'repo';
    const base = last.replace(/\.git$/i, '');
    if (!/^[a-zA-Z0-9._-]+$/.test(base) || base.length > 96) return null;
    return base;
  } catch {
    return null;
  }
}

module.exports = {
  registerUserFolder,
  resolveReadablePath,
  normalizeOllamaHost,
  splitOllamaHttpTarget,
  sanitizeGeminiModelId,
  isAllowedGitCloneUrl,
  safeCloneRepoName,
};
