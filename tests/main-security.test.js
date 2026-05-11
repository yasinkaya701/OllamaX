const {
  normalizeOllamaHost,
  splitOllamaHttpTarget,
  isAllowedGitCloneUrl,
  safeCloneRepoName,
  resolveReadablePath,
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
    expect(resolveReadablePath(path.join(home, 'OllamaX-Projects'))).toBe(path.resolve(path.join(home, 'OllamaX-Projects')));
    expect(resolveReadablePath('/etc/passwd')).toBeNull();
  });
});
