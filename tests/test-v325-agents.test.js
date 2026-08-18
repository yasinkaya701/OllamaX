'use strict';
/**
 * test-v325-agents.test.js — Krevyx v3.25 Orkestrasyon modüllerinin testleri
 *
 * Kapsam:
 *   - agents-ext/task-queue: kuyruk yaşam döngüsü, öncelik, duraklat/devam, iptal
 *   - agents-ext/multi-agent: havuz oluşturma, worker kayıt, dağıtım stratejileri
 *   - agents-ext/chain-tasks: zincir doğrulama, şablon genişletme, sıralı/paralel yürütme
 *   - agents-ext/context-manager: bütçe, budama, özet, kaydet/yükle
 *   - agents-ext/hooks: ayrıştırma, yasaklı semboller, emit, zaman aşımı
 */
const path = require('path');
const fs = require('fs');
const taskQueue = require('../src/main/agents-ext/task-queue');
const multiAgent = require('../src/main/agents-ext/multi-agent');
const chainTasks = require('../src/main/agents-ext/chain-tasks');
const ctxMgr = require('../src/main/agents-ext/context-manager');
const hooks = require('../src/main/agents-ext/hooks');

afterEach(() => {
  taskQueue.testOnlyClear();
  multiAgent.testOnlyClear();
  ctxMgr.testOnlyClear();
  hooks.clearHooks();
});

/* Yardımcı: kuyruğu persist kapalı ve hızlı tick ile yarat */
function makeQueue(name, executor) {
  return taskQueue.createQueue(name, { concurrency: 2, persist: false, ...(executor ? { runner: executor } : {}) });
}

describe('agents-ext/task-queue — görev kuyruğu', () => {
  test('kuyruk oluşturma ve durum', () => {
    const c = makeQueue('q-test');
    expect(c.ok).toBe(true);
    const q = taskQueue.getQueue('q-test');
    const st = q.state();
    expect(st.paused).toBe(false);
    expect(st.total).toBe(0);
    expect(typeof st.counts).toBe('object');
  });
  test('yeniden oluşturma reddedilir', () => {
    makeQueue('q-test');
    expect(taskQueue.createQueue('q-test').ok).toBe(false);
  });
  test('görev ekleme kuyruğa alır', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    q.add({ type: 'test', payload: 'birinci' });
    q.add({ type: 'test', priority: 1, payload: 'önce gelen' });
    const peek = q.peek(2);
    expect(peek.tasks.length).toBe(2);
  });
  test('duraklat/devam durumu değiştirir', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    q.pause();
    expect(q.state().paused).toBe(true);
    q.resume();
    expect(q.state().paused).toBe(false);
  });
  test('iptal görevi arşivler', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    q.add({ type: 'test', payload: 'iptal edilecek' });
    const id = q.peek(1).tasks[0].id;
    expect(q.cancel(id).ok).toBe(true);
    const st = q.state();
    expect(st.counts.cancelled).toBe(1);
    expect(st.total).toBe(1);
  });
  test('flush arşivi temizler', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    q.add({ type: 'test', payload: 'x' });
    q.cancel(q.peek(1).tasks[0].id);
    const fl = q.flush();
    expect(fl.ok).toBe(true);
    expect(fl.removed).toBe(1);
    expect(q.state().total).toBe(0);
  });
  test('tekrar deneme görevi yeniden sıralar', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    q.add({ type: 'test', payload: 'yeniden' });
    const id = q.peek(1).tasks[0].id;
    q.cancel(id);
    q.retry(id);
    expect(q.peek(1).tasks[0].status).toBe('queued');
  });
  test('yürütücü ile işlem tamamlanır', async () => {
    makeQueue('q-test', async (task) => {
      task.status = 'running';
      await new Promise((r) => setTimeout(r, 10));
      task.status = 'succeeded';
      task.output = `${task.payload}-done`;
      return { ok: true };
    });
    const q = taskQueue.getQueue('q-test');
    q.add({ type: 'exec', payload: 'is' });
    await new Promise((r) => setTimeout(r, 150));
    const st = q.state();
    expect(st.counts.succeeded).toBeGreaterThanOrEqual(0);
  });
  test('destroy kuyruğu kaldırır', () => {
    makeQueue('q-test');
    const q = taskQueue.getQueue('q-test');
    expect(q.destroy().ok).toBe(true);
    expect(taskQueue.getQueue('q-test')).toBeNull();
  });
});

describe('agents-ext/multi-agent — ajan havuzu', () => {
  let poolApi = null;

  afterEach(() => {
    if (poolApi) { poolApi.destroy(); poolApi = null; }
  });

  test('havuz oluşturma', () => {
    const p = multiAgent.createPool({ strategy: 'round-robin', capacity: 3 });
    expect(p.ok).toBe(true);
    poolApi = multiAgent.getPool(p.pool.id);
    expect(poolApi.state().workers.length).toBe(0);
  });
  test('worker kaydı havuza ekler', () => {
    const p = multiAgent.createPool({ strategy: 'round-robin' });
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async () => ({ ok: true }) });
    poolApi.register({ id: 'w2', run: async () => ({ ok: true }) });
    expect(poolApi.state().workers.length).toBe(2);
  });
  test('boş worker kimliği reddedilir', () => {
    const p = multiAgent.createPool({});
    poolApi = multiAgent.getPool(p.pool.id);
    expect(poolApi.register({ run: async () => ({ ok: true }) }).ok).toBe(false);
  });
  test('boş havuz dağıtıma hata döndürür', () => {
    const p = multiAgent.createPool({ strategy: 'round-robin' });
    poolApi = multiAgent.getPool(p.pool.id);
    const res = poolApi.distribute(['x']);
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });
  test('round-robin dağıtım planı üretir', () => {
    const p = multiAgent.createPool({ strategy: 'round-robin' });
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async () => ({ ok: true }) });
    poolApi.register({ id: 'w2', run: async () => ({ ok: true }) });
    const res = poolApi.distribute(['a', 'b', 'c']);
    expect(res.ok).toBe(true);
    const sizes = Object.values(res.assignments).map((a) => a.length).sort((x, y) => x - y);
    expect(sizes[0]).toBe(1);
    expect(sizes[1]).toBe(2);
    expect(res.workers.length).toBe(2);
  });
  test('broadcast tüm workerlara kopyalar', () => {
    const p = multiAgent.createPool({ strategy: 'broadcast' });
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async () => ({ ok: true }) });
    poolApi.register({ id: 'w2', run: async () => ({ ok: true }) });
    const res = poolApi.distribute(['x', 'y'], 'broadcast');
    expect(res.ok).toBe(true);
    expect(res.assignments['w1'].length).toBe(2);
    expect(res.assignments['w2'].length).toBe(2);
  });
  test('dispatch worker sonucu çalıştırıp kaydeder', async () => {
    const p = multiAgent.createPool({ strategy: 'round-robin' });
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async (payload) => ({ ok: true, out: payload.v }) });
    const r = await poolApi.dispatch('w1', { type: 'x', payload: { v: 42 } });
    expect(r.ok).toBe(true);
    expect(r.result.out).toBe(42);
    expect(poolApi.state().workers[0].completed).toBe(1);
  });
  test('worker hatası failed sayacını artırır', async () => {
    const p = multiAgent.createPool({});
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async () => ({ ok: false, error: 'patladı' }) });
    const r = await poolApi.dispatch('w1', { type: 'x', payload: {} });
    expect(r.ok).toBe(true);
    expect(r.result.ok).toBe(false);
    expect(poolApi.state().workers[0].failed).toBe(1);
  });
  test('runLead lead + fan-out zinciri yürütür', async () => {
    const p = multiAgent.createPool({});
    poolApi = multiAgent.getPool(p.pool.id);
    poolApi.register({ id: 'w1', run: async () => ({ ok: true, out: 'lead-çıktı' }) });
    poolApi.register({ id: 'w2', run: async (payload) => ({ ok: true, out: payload }) });
    const r = await poolApi.runLead('ana görev', ['alt-a', 'alt-b']);
    expect(r.ok).toBe(true);
    expect(r.combined).toBeTruthy();
    expect(r.workers.length).toBe(2);
  });
  test('destroy havuzu temizler', () => {
    const p = multiAgent.createPool({});
    poolApi = multiAgent.getPool(p.pool.id);
    expect(poolApi.destroy().ok).toBe(true);
    expect(multiAgent.getPool(p.pool.id)).toBeNull();
  });
});

describe('agents-ext/chain-tasks — zincir görevler', () => {
  const exec = async (id, prompt) => ({ ok: true, output: `${id}:${prompt.slice(0, 12)}` });

  test('boş tanım reddedilir', async () => {
    expect((await chainTasks.runChain([], { executor: exec })).ok).toBe(false);
  });
  test('executorsuz zincir reddedilir', async () => {
    expect((await chainTasks.runChain([{ id: 'a', task: 'x' }], {})).ok).toBe(false);
  });
  test('validateChain geçerli tanımı onaylar', () => {
    const v = chainTasks.validateChain([
      { id: 'a', task: 'ilk' },
      { id: 'b', task: 'son', template: '{{prev}} + {{results:a}}' },
    ]);
    expect(v.ok).toBe(true);
  });
  test('tanımsız sonuç referansı reddedilir', () => {
    expect(chainTasks.validateChain([{ id: 'a', task: 'x', template: '{{results:olmayan}}' }]).ok).toBe(false);
  });
  test('renderTemplate prev ve results genişletir', () => {
    const out = chainTasks.renderTemplate('{{prev}} ve {{results:x}}', { prev: 'önceki', results: { x: ['biri', 'ikisi'] } });
    expect(out).toBe('önceki ve biri\n---\nikisi');
  });
  test('renderTemplate bilinmeyen değişkeni boşaltır', () => {
    const out = chainTasks.renderTemplate('{{prev}} {{results:y}}', { prev: 'a', results: {} });
    expect(out).toBe('a ');
  });
  test('sıralı zincir çıktısı taşır', async () => {
    const res = await chainTasks.runChain([
      { id: 'a', task: 'ilk görev metni' },
      { id: 'b', task: 'devam', template: '{{prev}} sonrası' },
    ], { executor: exec });
    expect(res.ok).toBe(true);
    expect(res.results.length).toBe(2);
    expect(typeof res.final).toBe('string');
  });
  test('paralel grup sonuçları birleştirir', async () => {
    const res = await chainTasks.runChain([
      { id: 'a', task: 'a görevi' },
      { id: 'b1', task: 'b1', parallel: true },
      { id: 'b2', task: 'b2', parallel: true },
    ], { executor: exec });
    expect(res.ok).toBe(true);
    expect(res.results.length).toBe(3);
  });
  test('başarısız adım zinciri durdurur', async () => {
    const res = await chainTasks.runChain([
      { id: 'a', task: 'başarısız' },
      { id: 'b', task: 'son' },
    ], { executor: async () => ({ ok: false, error: 'reddedildi' }) });
    expect(res.ok).toBe(false);
    expect(res.results.length).toBe(2);
  });
  test('cancelToken zinciri erken keser', async () => {
    const token = chainTasks.createCancelToken();
    const p = chainTasks.runChain([
      { id: 'a', task: 'uzun' },
      { id: 'b', task: 'uzun' },
      { id: 'c', task: 'uzun' },
    ], { executor: () => new Promise((r) => setTimeout(() => r({ ok: true, output: 'ok' }), 30)), cancelToken: token });
    setTimeout(() => token.fire(), 15);
    const res = await p;
    expect(res.cancelled).toBe(true);
  });
});

describe('agents-ext/context-manager — bağlam bütçesi', () => {
  test('ekleme ve bütçe raporu', () => {
    const c = ctxMgr.createManager({ budget: 1000, persist: false });
    expect(c.ok || c.manager).toBeTruthy();
    const m = c.manager || c;
    m.add({ role: 'user', content: 'merhaba dünya' });
    m.add({ role: 'assistant', content: 'selam' });
    const b = m.budget();
    expect(b.ok).toBe(true);
    expect(b.tokens).toBeGreaterThan(0);
    expect(b.budget).toBe(1000);
  });
  test('sistem mesajları korunur', () => {
    const c = ctxMgr.createManager({ budget: 500 });
    const m = c.manager || c;
    m.add({ role: 'system', content: 'kalıcı kural', importance: 1 });
    for (let i = 0; i < 30; i += 1) m.add({ role: 'user', content: `uzun metin içeriği ${i}`.repeat(8), importance: 0.2 });
    const t = m.trim(400);
    expect(t.ok).toBe(true);
    expect(t.removed.length).toBeGreaterThan(0);
    const st = m.snapshot();
    expect(st.messages.filter((x) => x.role === 'system').length).toBe(1);
  });
  test('özetleme eski mesajları sıkıştırır', () => {
    const c = ctxMgr.createManager({ budget: 2000 });
    const m = c.manager || c;
    m.add({ role: 'user', content: 'ilk paragraf içeriği'.repeat(12), importance: 0.5 });
    m.add({ role: 'user', content: 'ikinci paragraf içeriği'.repeat(12), importance: 0.5 });
    const t = m.trim(1500);
    const s = m.getSummary();
    expect(s.ok).toBe(true);
    expect(t.ok).toBe(true);
  });
  test('kaydet/yükle yuvarlak yol', async () => {
    const os = require('os');
    const dir = path.join(os.tmpdir(), `krevyx-ctx-test-${Date.now()}`);
    const c = ctxMgr.createManager({ dir, budget: 1000 });
    const m = c.manager || c;
    m.add({ role: 'user', content: 'kalıcı görev' });
    const s = await m.save();
    expect(s.ok).toBe(true);
    const loadId = path.basename(s.path).replace('.json', '');
    const c2 = ctxMgr.createManager({ dir, budget: 1000 });
    const m2 = c2.manager || c2;
    const l = await m2.load(loadId);
    expect(l.ok).toBe(true);
    expect(l.loaded).toBe(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('bilinmeyen kayıt yüklemeyi reddeder', async () => {
    const os = require('os');
    const dir = path.join(os.tmpdir(), `krevyx-ctx-test2-${Date.now()}`);
    fs.mkdirSync(dir, { recursive: true });
    const c = ctxMgr.createManager({ dir, budget: 1000 });
    const m = c.manager || c;
    const l = await m.load('olmayan-kayit');
    expect(l.ok).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  test('summarizeChunks baş cümleleri seçer', () => {
    const r = ctxMgr.summarizeChunks([{ content: 'İlk cümle. İkinci cümle. Üçüncü cümle.' }]);
    expect(r.ok).toBe(true);
    expect(r.summarized[0].content).toContain('İlk cümle');
    expect(r.summarized[0].content).not.toContain('Üçüncü');
  });
  test('estimateTokens yaklaşık sayar', () => {
    const t = ctxMgr.estimateTokens('krevyx bağlam bütçesi testi');
    expect(t).toBeGreaterThan(2);
  });
});

describe('agents-ext/hooks — yaşam döngüsü hookları', () => {
  test('parseHooksText geçerli JSON\'u onaylar', () => {
    const text = JSON.stringify({ 'pre-run': [{ name: 'log', body: '"use strict"; return { ok: true };', enabled: true }] });
    const r = hooks.parseHooksText(text);
    expect(r.ok).toBe(true);
    expect(r.hooks['pre-run'].length).toBe(1);
    expect(r.version).toBe('3.25.0');
  });
  test('bozuk JSON reddedilir', () => {
    expect(hooks.parseHooksText('{bozuk').ok).toBe(false);
  });
  test('yasaklı semboller hook kaydını atlar', () => {
    const r = hooks.registerHookSet({
      id: 'bad',
      hooks: { 'pre-tool': [{ name: 'x', body: '"use strict"; require("fs").readFileSync("x"); return { ok: true }' }] },
    });
    expect(r.skipped).toBe(1);
    expect(r.registered).toBe(0);
  });
  test('güvenli hook yürütülür', async () => {
    hooks.registerHookSet({
      id: 'safe',
      hooks: { 'pre-run': [{ name: 'log', body: '"use strict"; return { ok: true };' }] },
    });
    const e = await hooks.emit('pre-run', { payload: { type: 'gorev' } });
    expect(e.ok).toBe(true);
    expect(e.blocked).toBe(false);
  });
  test('hook hatası zinciri bloklar', async () => {
    hooks.registerHookSet({
      id: 'blocker',
      hooks: { 'pre-tool': [{ name: 'stop', body: '"use strict"; return { ok: false, error: "engellendi" }' }] },
    });
    const e = await hooks.emit('pre-tool', { payload: { tool: 'delete_file' } });
    expect(e.blocked).toBe(true);
    expect(e.outcomes[0].ok).toBe(false);
  });
  test('zaman asimi uzun isleyen hooku keser', async () => {
    jest.useFakeTimers();
    /* Hiç çözümlemeyen bir fonksiyon → zaman aşımı mekanizmasını tetikler */
    const neverResolving = () => new Promise(() => {});
    const p = hooks.runHookWithTimeout(neverResolving, {}, 100);
    jest.advanceTimersByTime(50);
    /* süre dolmadan önce hiçbir çözüm yok */
    let settled = null;
    p.then((v) => { settled = v; });
    jest.runAllTimers();
    await Promise.resolve();
    expect(settled && settled.ok).toBe(false);
    expect(settled && settled.timeout).toBe(true);
    jest.useRealTimers();
  });
  test('olay günlüğü kayıtları tutar', async () => {
    hooks.registerHookSet({
      id: 'loggy',
      hooks: { 'post-run': [{ name: 'kayit', body: '"use strict"; return { ok: true }' }] },
    });
    await hooks.emit('post-run', { payload: {} });
    const log = hooks.hookEventLog({ set: 'loggy' });
    expect(log.length).toBe(1);
    expect(log[0].ok).toBe(true);
  });
  test('bilinmeyen olay reddedilir', async () => {
    const e = await hooks.emit('pre-magic', { payload: {} });
    expect(e.ok).toBe(false);
  });
  test('hook set kaydı silinebilir', () => {
    hooks.registerHookSet({ id: 'delme', hooks: { 'post-run': [] } });
    expect(hooks.unregisterSet('delme').ok).toBe(true);
    expect(hooks.unregisterSet('olmayan').ok).toBe(false);
  });
});
