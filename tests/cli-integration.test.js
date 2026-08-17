'use strict';
/**
 * cli-integration.test.js — gerçek CLI'larla entegrasyon doğrulaması
 *
 * Kapsam:
 *  - Claude Code CLI: kurulum doğrulaması (--version), bridge keşfi,
 *    gerçek stream-json çıktısı ayrıştırma testi (üretim örneği akışla),
 *    bridge profilinin ürettiği komut doğrulaması.
 *  - Gemini CLI (Antigravity): kurulum doğrulaması (--version), keşif
 *    fallback davranışı, bridge profilinin ürettiği komut doğrulaması.
 *  - Codex CLI: kurulum doğrulaması (--version), keşif, exec-modu komut doğrulaması.
 *
 * API anahtarları bu testlerde GEREKMEZ — CLI davranışı ve bridge köprüsü
 * doğrulanır. Gerçek görev çalıştırmaları (ağ istekleri) E2E donanımında.
 */
const { spawnSync } = require('child_process');
const bridge = require('../src/main/agents/code-agent-bridge');

/* electron mock */
jest.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}), { virtual: true });

function cliVersion(bin) {
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 30000 });
  return { code: r.status, out: (r.stdout || '').trim().split('\n')[0] || (r.stderr || '').trim() };
}

describe('CLI entegrasyon — kurulum ve köprü keşfi', () => {
  const describeWhenInstalled = (bin) => {
    const probe = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 15000 });
    return probe.status === 0 ? describe : describe.skip;
  };

  describeWhenInstalled('claude')('Claude Code CLI (yalnızca kuruluysa)', () => {
    test('versiyon alınıyor', () => {
      const v = cliVersion('claude');
      expect(v.code).toBe(0);
      expect(/\d+\.\d+\.\d+/.test(v.out)).toBe(true);
    });
  });
  describeWhenInstalled('gemini')('Gemini CLI (yalnızca kuruluysa)', () => {
    test('versiyon alınıyor', () => {
      const v = cliVersion('gemini');
      expect(v.code).toBe(0);
      expect(/\d+\.\d+/.test(v.out)).toBe(true);
    });
  });
  describeWhenInstalled('codex')('Codex CLI (yalnızca kuruluysa)', () => {
    test('versiyon alınıyor', () => {
      const v = cliVersion('codex');
      expect(v.code).toBe(0);
      expect(/\d+\.\d+\.\d+/.test(v.out)).toBe(true);
    });
  });
});

describe('CLI entegrasyon — bridge keşif profili', () => {
  test('üç profil de doğru tespit adlarıyla kayıtlı', () => {
    expect(bridge.AGENT_PROFILES['claude-code'].detect).toEqual(['claude']);
    expect(bridge.AGENT_PROFILES['codex'].detect).toEqual(['codex']);
    expect(bridge.AGENT_PROFILES['antigravity'].detect).toEqual(['antigravity', 'gemini']);
  });
  test('Claude Code komutu stream-json formatıyla üretilir', () => {
    const cmd = bridge.AGENT_PROFILES['claude-code'].buildCmd('merhaba dünya', {});
    expect(cmd[0]).toBe('-p');
    expect(cmd).toContain('--output-format');
    expect(cmd).toContain('stream-json');
  });
  test('Codex komutu exec modu (non-interaktif) ile üretilir', () => {
    const cmd = bridge.AGENT_PROFILES['codex'].buildCmd('merhaba dünya', {});
    expect(cmd[0]).toBe('exec');
    expect(cmd).toContain('--skip-git-repo-check');
    // görev args'ta DEĞİL — pipe edilen stdin'den verilir (non-interaktif exec modu)
    expect(cmd.join(' ')).not.toContain('merhaba dünya');
    expect(bridge.AGENT_PROFILES['codex'].stdin).toBe(true);
  });
  test('Antigravity komutu gemini fallback ise -p kullanır', () => {
    const cmd = bridge.AGENT_PROFILES['antigravity'].buildCmd('merhaba dünya', { executable: 'gemini' });
    expect(cmd).toEqual(['-p', 'merhaba dünya']);
  });
  test('Claude Code --resume bayrağını ekler', () => {
    const cmd = bridge.AGENT_PROFILES['claude-code'].buildCmd('devam', { resume: true });
    expect(cmd).toContain('--resume');
  });
});

describe('CLI entegrasyon — Claude Code stream-json ayrıştırma (üretim biçimi)', () => {
  const parse = bridge.parseStreamJsonLine;
  test('gerçek biçimli assistant plan satırı', () => {
    const r = parse(JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Kullanıcının isteğini analiz ediyorum.\nBir plan oluşturacağım.' }] },
    }));
    expect(r.kind).toBe('plan');
    expect(r.text).toContain('analiz');
    expect(r.text).toContain('plan');
  });
  test('tool_use satırı Write aracı olarak etiketlenir', () => {
    const r = parse(JSON.stringify({
      type: 'tool_use',
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/x', content: 'hello' },
    }));
    expect(r.kind).toBe('araç');
    expect(r.text).toContain('Write');
  });
  test('tool_use komut biçimi de etiketlenir', () => {
    const r = parse(JSON.stringify({ type: 'tool_use', tool_input: { command: 'git status' } }));
    expect(r.kind).toBe('araç');
    expect(r.text).toContain('git status');
  });
  test('result satırı sonucu kırpar', () => {
    const r = parse(JSON.stringify({ type: 'result', result: { type: 'text', content: 'OK'.repeat(500) } }));
    expect(r.kind).toBe('sonuç');
    expect(r.text.length).toBeLessThanOrEqual(400);
  });
  test('system init satırı plan olarak akar', () => {
    const r = parse(JSON.stringify({ type: 'system', subtype: 'init', text: 'Claude Code başlatılıyor...' }));
    expect(r.kind).toBe('plan');
  });
  test('bozuk akış parçaları sessizce atlanır (tampon güvenliği)', () => {
    expect(parse(null)).toBe(null);
    expect(parse(undefined)).toBe(null);
    expect(parse('{')).toBe(null);
    expect(parse('')).toBe(null);
    expect(parse(JSON.stringify({ type: 'assistant', message: {} }))).toBe(null);
  });
});

describe('CLI entegrasyon — sanallaştırılmış akış sırası (pipeline bütünlüğü)', () => {
  test('Claude Code üretim akış dizisi doğru sırayla ayrışır', () => {
    const lines = [
      JSON.stringify({ type: 'system', subtype: 'init', text: 'Claude Code v2.1.233' }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Plan: hello.txt oluştur' }] } }),
      JSON.stringify({ type: 'tool_use', tool_name: 'Write' }),
      JSON.stringify({ type: 'result', result: { type: 'text', content: 'Dosya yazıldı' } }),
    ];
    const out = lines.map((l) => bridge.parseStreamJsonLine(l)).filter(Boolean);
    expect(out.map((o) => o.kind)).toEqual(['plan', 'plan', 'araç', 'sonuç']);
  });
  test('araya karışan çöp satırlar sırayı bozmaz', () => {
    const lines = ['GARBAGE LINE', JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'adım' }] } }), '}{}{', ''];
    const out = lines.map((l) => bridge.parseStreamJsonLine(l)).filter(Boolean);
    expect(out.length).toBe(1);
    expect(out[0].text).toBe('adım');
  });
});
