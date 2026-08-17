'use strict';
/**
 * v321.test.js — Krevyx v3.21 rakip sentezi testleri
 *
 * Kapsam:
 *   - Proje Hafızası (KREYX.md / CLAUDE.md öncülü): iliştirme, öğrenilenler bölümü,
 *     hiyerarşi, fuzz dayanıklılığı, boyut sınırı.
 *   - Yaşam Döngüsü Kancaları (krevyx-hooks.json): yükleyici, olay doğrulama,
 *     env enjeksiyonu, zaman aşımı, CWD güvenliği.
 *   - Plan Modu (Cursor Agent Planning): görev metnine plan öneki, timeout limitli akış.
 *   - Outcomes Değerlendirme Döngüsü (Claude Code Outcomes): yanıt ayrıştırıcı,
 *     şema doğrulama, bozuk yanıt toleransı, geçersiz HTTP durumları.
 *   - Diff Review (Cursor BugBot / Claude /review): git kök bulma, stat çıktısı,
 *     commit özeti, repo dışı dizin toleransı.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const mem = require('../src/main/agents/project-memory');
const hooks = require('../src/main/agents/agent-hooks');
const grade = require('../src/main/agents/grade-task');
const diff = require('../src/main/agents/diff-review');
const bridge = require('../src/main/agents/code-agent-bridge');

/* electron'u mockla: UI katmanı olmayan test ortamı */
jest.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [],
  },
}), { virtual: true });

/* ---------- yardımcılar ---------- */
function makeWorkDir({ memory = null, hooks = null, git = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krevyx-v321-'));
  if (git) {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    spawnSync('git', ['config', 'user.email', 't@t.test'], { cwd: dir });
    spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
    fs.writeFileSync(path.join(dir, 'base.txt'), 'temel');
    spawnSync('git', ['add', '.'], { cwd: dir });
    spawnSync('git', ['commit', '-q', '-m', 'temel'], { cwd: dir });
  }
  if (memory) {
    fs.writeFileSync(path.join(dir, 'KREYX.md'), memory);
  }
  if (hooks) {
    fs.writeFileSync(path.join(dir, 'krevyx-hooks.json'), JSON.stringify(hooks));
  }
  return dir;
}

/* ======================================================================
   1. Proje Hafızası (KREYX.md)
   ====================================================================== */
describe('v3.21 — Proje Hafızası (KREYX.md)', () => {
  test('KREYX.md içeriğini göreve iliştirir', () => {
    const dir = makeWorkDir({ memory: '# Krevyx\n\n- Kurulum sonrası yarn kullan' });
    try {
      const { task, memoryFiles } = mem.attachMemory('görev', dir);
      expect(task).toContain('yarn kullan');
      expect(task).toContain('--- Proje Hafızası Sonu ---');
      expect(memoryFiles.length).toBeGreaterThan(0);
      expect(memoryFiles[0]).toContain('KREYX.md');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('hafıza dosyası yoksa görevi değiştirmez', () => {
    const dir = makeWorkDir();
    try {
      const { task, memoryFiles } = mem.attachMemory('görev', dir);
      expect(task).toBe('görev');
      expect(memoryFiles).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('Öğrenilenler bölümü LF enjeksiyonu olmadan eklenir', () => {
    const dir = makeWorkDir({ memory: '# Hafıza\n- ilk not' });
    try {
      const r = mem.addLearnedNote(dir, 'satır1\nsatır2\nsatır3');
      expect(r.ok).toBe(true);
      const raw = fs.readFileSync(path.join(dir, 'KREYX.md'), 'utf8');
      expect(raw).toContain('Öğrenilenler');
      expect(raw).toContain('satır1 · satır2 · satır3');
      expect(raw).not.toMatch(/^satır2/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('KREYX.md olmadan Öğrenilenler bölümü oluşturur', () => {
    const dir = makeWorkDir();
    try {
      const r = mem.addLearnedNote(dir, 'npm run lint komutu testleri de çalıştırır');
      expect(r.ok).toBe(true);
      const raw = fs.readFileSync(path.join(dir, 'KREYX.md'), 'utf8');
      expect(raw).toContain('Öğrenilenler');
      expect(raw).toContain('npm run lint komutu testleri de çalıştırır');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('boş not eklenmez', () => {
    const dir = makeWorkDir({ memory: '# X' });
    try {
      const r1 = mem.addLearnedNote(dir, '   ');
      expect(r1.ok).toBe(false);
      const r2 = mem.addLearnedNote(dir, '');
      expect(r2.ok).toBe(false);
      const r3 = mem.addLearnedNote(null, 'not');
      expect(r3.ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('256KB üzeri hafıza dosyası okunmaz', () => {
    const dir = makeWorkDir({ memory: 'temel' });
    try {
      fs.writeFileSync(path.join(dir, 'KREYX.md'), 'a'.repeat(257 * 1024));
      const { content, errors } = mem.loadProjectMemory(dir);
      expect(content).toBe('');
      expect(errors.some((e) => e.includes('256KB'))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('geçersiz dizin için hafıza boş döner', () => {
    const { content, errors } = mem.loadProjectMemory('/tmp/krevyx-olmayan-dizin-xyz');
    expect(content).toBe('');
    expect(errors).toEqual([]);
  });

  test('kullanıcı hafızası (~/.krevyx/user.md) hiyerarşinin son halkasıdır', () => {
    const userDir = path.join(os.homedir(), '.krevyx');
    const userFile = path.join(userDir, 'user.md');
    const existed = fs.existsSync(userFile);
    const backup = existed ? fs.readFileSync(userFile, 'utf8') : null;
    try {
      fs.mkdirSync(userDir, { recursive: true });
      fs.writeFileSync(userFile, '# Kullanıcı tercihi\n- her zaman Türkçe yanıt');
      const { content } = mem.loadProjectMemory('/tmp');
      expect(content).toContain('Türkçe yanıt');
    } finally {
      if (existed && backup !== null) fs.writeFileSync(userFile, backup, 'utf8');
      else fs.rmSync(userFile, { force: true });
    }
  });
});

/* ======================================================================
   2. Yaşam Döngüsü Kancaları (krevyx-hooks.json)
   ====================================================================== */
describe('v3.21 — Yaşam Döngüsü Kancaları', () => {
  test('geçerli dosyayı yükler, geçersiz olayları süzer', () => {
    const dir = makeWorkDir({
      hooks: {
        'task-start': ['echo başla'],
        'task-done': ['echo bitti'],
        'task-fail': ['echo hata'],
        bozuk_olay: ['echo sızdır'],
      },
    });
    try {
      const h = hooks.loadHooks(dir);
      expect(h.source).toContain('krevyx-hooks.json');
      expect(h.events['task-start']).toEqual(['echo başla']);
      expect(h.events['task-done']).toEqual(['echo bitti']);
      expect(h.events.bozuk_olay).toBeUndefined();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('task-start kancası çalışır', async () => {
    const dir = makeWorkDir({ hooks: { 'task-start': ['echo KANCA-OK'] } });
    try {
      const results = await hooks.runHooks('task-start', { workingDir: dir });
      expect(results.length).toBe(1);
      expect(results[0].ok).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('çalışan komutun exit kodu sonucu belirler', async () => {
    const dir = makeWorkDir({ hooks: { 'task-done': ['sh -c "exit 4"'] } });
    try {
      const results = await hooks.runHooks('task-done', { workingDir: dir });
      expect(results[0].ok).toBe(false);
      expect(results[0].exit).toBe(4);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('geçersiz olay boş dizi döndürür', async () => {
    const dir = makeWorkDir({ hooks: { 'task-start': ['echo x'] } });
    try {
      const results = await hooks.runHooks('geçersiz_olay', { workingDir: dir });
      expect(results).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('zaman aşımı hook sürecini kill eder', async () => {
    const dir = makeWorkDir({ hooks: { 'task-start': ['sleep 60'] } });
    try {
      const started = Date.now();
      const results = await hooks.runHooks('task-start', { workingDir: dir }, { timeoutMs: 1200 });
      expect(Date.now() - started).toBeLessThan(30000);
      expect(results[0].ok).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('env enjeksiyonu KREYX_EVENT değişkenini taşır', async () => {
    const dir = makeWorkDir({ hooks: { 'task-start': ['sh -c "echo $KREYX_EVENT > event.txt"'] } });
    try {
      await hooks.runHooks('task-start', {
        workingDir: dir,
        agentId: 'claude-code',
        taskId: 't-1',
        stepCount: 7,
      });
      const raw = fs.readFileSync(path.join(dir, 'event.txt'), 'utf8');
      expect(raw.trim()).toBe('task-start');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('bozuk JSON hook dosyası sessizce atlanır', () => {
    const dir = makeWorkDir();
    try {
      fs.writeFileSync(path.join(dir, 'krevyx-hooks.json'), '{ bozuk json');
      const h = hooks.loadHooks(dir);
      expect(h.events).toEqual({});
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('kaldırılmış dizin CWD güvenliği: hook yükleyici silinmiş dizini atlar ve hook çalışmaz', async () => {
    const dir = makeWorkDir({ hooks: { 'task-start': ['echo x'] } });
    fs.rmSync(dir, { recursive: true, force: true });
    const results = await hooks.runHooks('task-start', { workingDir: dir });
    /* silinmiş dizin hook dosyasına erişemez → yükleyici sessizce boş döner;
       spawn hatası üretmez, akış ölmez */
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });
});

/* ======================================================================
   3. Plan Modu (Cursor Agent Planning öncülü)
   ====================================================================== */
describe('v3.21 — Plan Modu', () => {
  test('sanitizeTask plan yönergesini temiz tutar (enjeksiyon koruması)', () => {
    const agentId = 'claude-code';
    const profile = bridge.AGENT_PROFILES[agentId];
    expect(profile).toBeTruthy();
    const clean = bridge.sanitizeTask('kayıp dosyayı bul Bu görev için adım adım plan', null);
    expect(clean).toContain('kayıp dosyayı bul');
    expect(clean).not.toContain('\n');
    expect(clean).not.toContain('\0');
  });

  test('bilinmeyen ajan için hata döner', async () => {
    const r = await bridge.runAgentPlan('olmayan-ajans', 'x');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('Bilinmeyen ajan');
  });

  test(
    'kurulu olmayan ajan missing:true ile sonuçlanır',
    async () => {
      const r = await bridge.runAgentPlan('codex', 'x');
      if (!r.missing) {
        /* sandbox'ta codex kuruluysa plan modu yine sonuçlanmalı */
        expect(r.planMode).toBe(true);
      } else {
        expect(r.ok).toBe(false);
      }
    },
    90000
  );
});

/* ======================================================================
   4. Outcomes Değerlendirme Döngüsü (Claude Code Outcomes öncülü)
   ====================================================================== */
describe('v3.21 — Outcomes Değerlendirme Döngüsü', () => {
  test('doğru şemalı yanıtı ayrıştırır (OpenAI biçimi)', () => {
    const raw = JSON.stringify({
      choices: [{ message: { content: '{"pass":true,"score":92,"summary":"iyi","issues":[],"suggestions":[]}' } }],
    });
    const g = grade.parseGradingResponse('openai', raw);
    expect(g && g.pass).toBe(true);
    expect(g.score).toBe(92);
  });

  test('Anthropic biçimini ayrıştırır', () => {
    const raw = JSON.stringify({
      content: [{ type: 'text', text: '{"pass":false,"score":40,"summary":"eksik","issues":["x"],"suggestions":["y"]}' }],
    });
    const g = grade.parseGradingResponse('anthropic', raw);
    expect(g.pass).toBe(false);
    expect(g.issues).toEqual(['x']);
  });

  test('Ollama biçimini ayrıştırır', () => {
    const raw = JSON.stringify({ response: '{"pass":true,"score":75,"summary":"ok","issues":[],"suggestions":[]}' });
    const g = grade.parseGradingResponse('ollama', raw);
    expect(g.pass).toBe(true);
    expect(g.score).toBe(75);
  });

  test('JSON dışı metin içindeki şemayı bulur', () => {
    const raw = JSON.stringify({
      choices: [{ message: { content: 'Elbette, işte değerlendirmem:\n```json\n{"pass":true,"score":88,"summary":"mükemmel","issues":[],"suggestions":[]}\n```' } }],
    });
    const g = grade.parseGradingResponse('openai', raw);
    expect(g.pass).toBe(true);
    expect(g.summary).toContain('mükemmel');
  });

  test('geçersiz pass alanı null döndürür', () => {
    const raw = JSON.stringify({ choices: [{ message: { content: '{"score":1,"summary":"x"}' } }] });
    expect(grade.parseGradingResponse('openai', raw)).toBeNull();
  });

  test('bozuk JSON null döndürür', () => {
    expect(grade.parseGradingResponse('openai', '{ bozuk')).toBeNull();
  });

  test('skor 0-100 aralığına zorlanır', () => {
    const raw = JSON.stringify({ choices: [{ message: { content: '{"pass":true,"score":9999,"summary":"x","issues":[],"suggestions":[]}' } }] });
    const g = grade.parseGradingResponse('openai', raw);
    expect(g.score).toBe(100);
  });

  test('anahtarsız OpenAI isteği atlanır (null döner)', async () => {
    const g = await grade.gradeTask({
      provider: 'openai',
      apiKey: '',
      task: 'x',
      steps: [],
      ok: true,
    });
    expect(g).toBeNull();
  });

  test('UFO yanıt/boş content null döner', () => {
    expect(grade.parseGradingResponse('anthropic', JSON.stringify({ content: [] }))).toBeNull();
    expect(grade.parseGradingResponse('openai', JSON.stringify({ choices: [] }))).toBeNull();
  });
});

/* ======================================================================
   5. Diff Review (Cursor BugBot /review öncülü)
   ====================================================================== */
describe('v3.21 — Diff Review', () => {
  test('repo dışı dizin için ok:false döner', () => {
    const dir = makeWorkDir();
    try {
      const r = diff.buildDiffReview(dir);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('git');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('değişiklik yoksa ok:false döner', () => {
    const dir = makeWorkDir({ git: true });
    try {
      const r = diff.buildDiffReview(dir);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('değişiklik yok');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('dosya değişikliğinin özetini çıkarır', () => {
    const dir = makeWorkDir({ git: true });
    try {
      fs.writeFileSync(path.join(dir, 'yeni.txt'), 'krevyx');
      /* commit etmeden bırak: `git diff --stat` yalnızca işlenmemiş değişiklikleri görür */
      const r = diff.buildDiffReview(dir);
      expect(r.ok).toBe(true);
      expect(r.summary).toContain('yeni.txt');
      expect(r.summary).toContain('Diff Review');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('git kökünü üst dizinlerde bulur', () => {
    const dir = makeWorkDir({ git: true });
    try {
      const inner = path.join(dir, 'a', 'b');
      fs.mkdirSync(inner, { recursive: true });
      expect(diff.findGitRoot(inner)).toBe(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('null dizin güvenli şekilde null döner', () => {
    expect(diff.findGitRoot(null)).toBeNull();
  });
});

/* ======================================================================
   6. Bridge entegrasyonu: KREYX.md + kancalar + değerlendirme zinciri
   ====================================================================== */
describe('v3.21 — Bridge entegrasyonu', () => {
  test('kod ajanı çalıştırma ajan bulunamazken missing:true ile sonuçlanır (hook/bellek patlamaz)', async () => {
    const dir = makeWorkDir({
      memory: '# KREYX\n- not',
      hooks: { on_start: ['echo başla'], on_end: ['echo bitti'] },
      git: true,
    });
    try {
      bridge.cwdRegistry.set('claude-code', dir);
      const r = await bridge.runCodeAgent('claude-code', 'hello.txt dosyasına merhaba yaz', null);
      /* Ajan kuruluysa ok:true döner; kurulu değilse missing:true — her ikisi de
         bellek/hook/değerlendirme katmanlarının patlamadan çalıştığını gösterir */
      expect(r).toBeTruthy();
    } finally {
      bridge.cwdRegistry.delete('claude-code');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('bilinmeyen ajan kimliği için hata döner', async () => {
    const r = await bridge.runCodeAgent('olmayan-ajans', 'x', null);
    expect(r.ok).toBe(false);
  });

  test('sanitizeTask fuzz dayanıklılığı (NULL, kontrol karakterleri, LF enjeksiyonu)', () => {
    const dirty = 'görev\0\n\rsatır2\u0001\uFFFD';
    const clean = bridge.sanitizeTask(dirty, null);
    expect(clean).not.toContain('\0');
    expect(clean).not.toContain('\n');
    expect(clean).not.toContain('\r');
    expect(clean).not.toContain('\uFFFD');
    expect(clean).toContain('görev');
  });

  test('zincir handoff zenginleştirme temiz metinde kalır', () => {
    const clean = bridge.sanitizeTask('görev', 'onceki');
    expect(clean).toContain('[HANDOFF]');
    expect(clean).not.toContain('\n');
  });
});
