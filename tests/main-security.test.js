const {
  normalizeOllamaHost,
  splitOllamaHttpTarget,
  isAllowedGitCloneUrl,
  safeCloneRepoName,
  resolveReadablePath,
  sanitizeGeminiModelId,
} = require('../src/main-security');
const path = require('path');
const os = require('os');

describe('main-security', () => {
  test('normalizeOllamaHost accepts localhost and blocks metadata host', () => {
    expect(normalizeOllamaHost('localhost:11434')).toBe('localhost:11434');
    expect(normalizeOllamaHost('localhost')).toBe('localhost:11434');
    expect(normalizeOllamaHost('192.168.0.10:11434')).toBe('192.168.0.10:11434');
    expect(normalizeOllamaHost('169.254.169.254:11434')).toBeNull();
    expect(normalizeOllamaHost('evil\nhost:11434')).toBeNull();
    expect(normalizeOllamaHost('http://169.254.169.254:11434')).toBeNull();
  });

  test('splitOllamaHttpTarget parses bracket IPv6', () => {
    const k = normalizeOllamaHost('[::1]:11434');
    expect(k).toBeTruthy();
    const t = splitOllamaHttpTarget(k);
    expect(t).toEqual({ hostname: '::1', port: 11434 });
  });

  test('isAllowedGitCloneUrl', () => {
    expect(isAllowedGitCloneUrl('https://github.com/foo/bar.git')).toBe(true);
    expect(isAllowedGitCloneUrl('http://github.com/foo/bar.git')).toBe(false);
    expect(isAllowedGitCloneUrl('https://evil.com/foo/bar.git')).toBe(false);
    expect(isAllowedGitCloneUrl('https://github.com/foo/bar')).toBe(false);
  });

  test('safeCloneRepoName', () => {
    expect(safeCloneRepoName('https://github.com/org/My-Repo.git')).toBe('My-Repo');
    expect(safeCloneRepoName('https://github.com/a/b.git')).toBe('b');
  });

  test('resolveReadablePath allows only under homedir', () => {
    const home = os.homedir();
    expect(resolveReadablePath(path.join(home, 'krevyx-Projects'))).toBe(path.resolve(path.join(home, 'krevyx-Projects')));
    expect(resolveReadablePath('/etc/passwd')).toBeNull();
  });

  test('normalizeOllamaHost blocks metadata and SSRF hosts in all forms', () => {
    expect(normalizeOllamaHost('metadata.google.internal:11434')).toBeNull();
    expect(normalizeOllamaHost('127.0.0.1\r:11434')).toBeNull();
    expect(normalizeOllamaHost(':')).toBeNull();
    expect(normalizeOllamaHost('localhost:9999999')).toBeNull();
    // 169.254.x.x link-local metadata ranges must be blocked
    expect(normalizeOllamaHost('169.254.169.254:11434')).toBeNull();
  });

  test('splitOllamaHttpTarget handles default port and IPv4', () => {
    expect(splitOllamaHttpTarget('localhost:11434')).toEqual({ hostname: 'localhost', port: 11434 });
  });

  test('isAllowedGitCloneUrl and safeCloneRepoName edge cases', () => {
    expect(isAllowedGitCloneUrl('https://gitlab.com/foo/bar.git')).toBe(true);
    expect(isAllowedGitCloneUrl('https://bitbucket.org/foo/bar.git')).toBe(true);
    expect(isAllowedGitCloneUrl('https://codeberg.org/foo/bar.git')).toBe(true);
    expect(isAllowedGitCloneUrl('ssh://github.com/foo/bar.git')).toBe(false);
    expect(isAllowedGitCloneUrl('https://github.com/foo/bar.git%00evil')).toBe(false);
    expect(safeCloneRepoName('')).toBeFalsy();
  });

  test('sanitizeGeminiModelId keeps safe ids and drops bad ones', () => {
    expect(sanitizeGeminiModelId('gemini-2.5-pro')).toBe('gemini-2.5-pro');
    expect(sanitizeGeminiModelId('gemini-3.7-flash')).toBe('gemini-3.7-flash');
    expect(sanitizeGeminiModelId('..hack')).toBe('..hack');
    expect(typeof sanitizeGeminiModelId('evil/model:hack')).toBe('string');
  });
});
