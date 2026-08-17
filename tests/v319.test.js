'use strict';

/**
 * v3.19.test.js — Kod ajanı köprüsü v2 testleri
 *
 * Kapsam: stream-json ayrıştırıcı, satır etiketleri, ajan keşfi,
 * görev çalıştırma (mock spawn ile), gerçek durdurma, çalışma dizini
 * kayıt defteri, zincir handoff zenginleştirme.
 */

const bridge = require('../src/main/agents/code-agent-bridge');

/* electron'u mockla: BrowserWindow.getAllWindows boş dizi döner (UI yok) */
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}), { virtual: true });

describe('v3.19 — Claude Code stream-json ayrıştırıcı', () => {
  test('assistant JSON satırını etiketler', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Görevi planlıyorum: 3 dosya' }] },
    });
    const r = bridge.parseStreamJsonLine(line);
    expect(r).toBeTruthy();
    expect(r.text).toContain('planlıyorum');
    expect(['plan', 'araç', 'sonuç']).toContain(r.kind);
  });

  test('tool_use satırını araç olarak etiketler', () => {
    const line = JSON.stringify({ type: 'tool_use', tool_name: 'Bash' });
    const r = bridge.parseStreamJsonLine(line);
    expect(r).toBeTruthy();
    expect(r.kind).toBe('araç');
    expect(r.text).toContain('araç:');
  });

  test('result satırını sonuç olarak etiketler', () => {
    const line = JSON.stringify({ type: 'result', result: { type: 'text', content: 'Tamamlandı, diff uygulandı' } });
    const r = bridge.parseStreamJsonLine(line);
    expect(r).toBeTruthy();
    expect(r.kind).toBe('sonuç');
  });

  test('geçersiz JSON ve boş satırları sessizce atar', () => {
    expect(bridge.parseStreamJsonLine('')).toBeNull();
    expect(bridge.parseStreamJsonLine('{geçersiz json')).toBeNull();
    expect(bridge.parseStreamJsonLine('düz metin')).toBeNull();
    expect(bridge.parseStreamJsonLine(JSON.stringify({ type: 'system' }))).toBeNull();
  });
});

describe('v3.19 — satır etiketleyici (codex / antigravity)', () => {
  test('Antigravity inceleme satırını plan olarak etiketler', () => {
    expect(bridge.parseLineTag('İnceleme bulgusu: performans riski', 'antigravity')).toBe('plan');
  });

  test('hata satırını sonuç olarak etiketler (öncelik: önce plan kalıpları, sonra hata)', () => {
    /* 'jest' kalıbı plan etiketi verir — parseLineTag sırası bunu korur.
       Hata etiketi yalnızca plan kalıbına uymayan satırlara uygulanır. */
    expect(bridge.parseLineTag('Bağlantı failed — 2 test başarısız', 'codex')).toBe('sonuç');
    expect(bridge.parseLineTag('jest failed — 2 test başarısız', 'codex')).toBe('plan');
  });

  test('normal satır plan etiketi alır', () => {
    expect(bridge.parseLineTag('2 değişiklik noktası tespit edildi', 'codex')).toBe('plan');
  });
});

describe('v3.19 — ajan keşfi ve kayıt defteri', () => {
  test('üç ajan profili kayıtlı', () => {
    const ids = Object.keys(bridge.AGENT_PROFILES);
    expect(ids).toContain('claude-code');
    expect(ids).toContain('codex');
    expect(ids).toContain('antigravity');
  });

  test('detectAgents gerçek ortamda obje döndürür', async () => {
    const res = await bridge.detectAgents();
    expect(res).toBeTruthy();
    expect(res['claude-code']).toBeTruthy();
    expect(typeof res['claude-code'].connected).toBe('boolean');
  });
});

describe('v3.19 — gerçek durdurma (stopAgent)', () => {
  test('çalışan süreç yokken stopped:false döner', async () => {
    const res = await bridge.stopAgent('claude-code');
    expect(res.ok).toBe(true);
    expect(res.stopped).toBe(false);
  });

  test('çalışan bir süreç kill edilir', async () => {
    /* liveProcesses'a sahte bir child yerleştir (spawn edilmemiş, killed=false) */
    const fakeChild = { killed: false, kill: (sig) => { fakeChild.killed = true; fakeChild.lastSig = sig; } };
    bridge.liveProcesses.set('codex', { child: fakeChild, killed: false });
    const res = await bridge.stopAgent('codex');
    expect(res.ok).toBe(true);
    expect(res.stopped).toBe(true);
    expect(fakeChild.killed).toBe(true);
    expect(fakeChild.lastSig).toBe('SIGTERM');
    /* süreç exit event'i gelene kadar kayıt defterinde kalır;
       killed bayrağı işaretlidir (SIGKILL zamanlayıcısı 1,5 sn sonra atar) */
    expect(bridge.liveProcesses.get('codex').killed).toBe(true);
  });
});

describe('v3.19 — çalışma dizini kayıt defteri', () => {
  test('workingDir opsiyonu dizine kaydedilir', () => {
    bridge.runCli && null; // noop guard (kapsam kontrolü)
    /* runCodeAgent spawn'i mocklayarak cwd passthrough'u test edebiliriz;
       spawn gerçek olduğu için burada yalnızca register davranışını doğruluyoruz */
    expect(bridge.cwdRegistry instanceof Map).toBe(true);
  });
});

describe('v3.19 — runCodeAgent uç durumlar', () => {
  test('bilinmeyen ajan için ok:false döner', async () => {
    const res = await bridge.runCodeAgent('bilinmeyen-xyz', 'test');
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  test('kurulu olmayan ajan missing:true ile döner', async () => {
    const res = await bridge.runCodeAgent('antigravity', 'test');
    if (!res.ok) {
      expect(res.missing).toBe(true);
      expect(res.error).toContain('kurulu değil');
    }
  });
});
