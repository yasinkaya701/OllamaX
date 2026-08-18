'use strict';
/**
 * test-v326-orch.test.js — Krevyx v3.26 Orkestrasyon modüllerinin testleri
 *
 * Kapsam:
 *   - orch/pipelines: DAG doğrulama, seviye oluşturma, paralel/fserial yürütme
 *   - orch/events: olay otobüsü, abonelik, tek seferlik dinleyici
 *   - orch/state-store: kalıcı durum saklama/geri yükleme
 *   - orch/vault-tasks: kasalı görev kuyruğu
 *   - orch/handoffs: ajanlar arası görev devri
 *   - orch/swarm: sürü oluşturma, ajan ekleme, görev eşleştirme
 *   - orch/budget-engine: harcama, kalan, uyarı eşikleri, sert durdurma
 *   - orch/skills: yetenek kayıt defteri, eşleştirme, plan üretimi
 *   - orch/workspace: kök sınırlama, kural denetimi
 *   - orch/observability: metrik kayıt, pencere aggregasyonu, sağlık
 *
 * @version 3.26.0
 */
const pipelines = require('../src/main/orch/pipelines');
const events = require('../src/main/orch/events');
const stateStore = require('../src/main/orch/state-store');
const vaultTasks = require('../src/main/orch/vault-tasks');
const handoffs = require('../src/main/orch/handoffs');
const swarm = require('../src/main/orch/swarm');
const budgetEngine = require('../src/main/orch/budget-engine');
const skills = require('../src/main/orch/skills');
const workspace = require('../src/main/orch/workspace');
const observability = require('../src/main/orch/observability');

afterEach(() => {
  pipelines.testOnlyClear();
  stateStore.testOnlyClear();
  vaultTasks.testOnlyClear();
  handoffs.testOnlyClear();
  swarm.testOnlyClear();
  skills.testOnlyClear();
  workspace.testOnlyClear();
});

describe('orch/pipelines — DAG motoru', () => {
  test('geçerli DAG doğrulanır', () => {
    const built = pipelines.createPipeline('p1', [{ id: 'a', instruction: '1' }, { id: 'b', instruction: '2', dependsOn: ['a'] }]);
    expect(built.ok).toBe(true);
    const v = pipelines.validate(built.pipeline);
    expect(v.ok).toBe(true);
    expect(v.order).toEqual(['a', 'b']);
  });
  test('döngüsel bağımlılık tespitte yakalanır', () => {
    const built = pipelines.createPipeline('p2', [
      { id: 'a', instruction: '1', dependsOn: ['b'] },
      { id: 'b', instruction: '2', dependsOn: ['a'] },
    ]);
    expect(built.ok).toBe(true);
    const v = pipelines.validate(built.pipeline);
    expect(v.ok).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });
  test('seviyeler paralellik katmanlarını verir', () => {
    const built = pipelines.createPipeline('p3', [
      { id: 'a', instruction: '1' },
      { id: 'b', instruction: '2' },
      { id: 'c', instruction: '3', dependsOn: ['a', 'b'] },
    ]);
    const levels = pipelines.buildLevels(built.pipeline);
    expect(levels.ok).toBe(true);
    expect(levels.levels[0].length).toBe(2);
    expect(levels.levels[1]).toEqual(['c']);
  });
  test('yürütme tüm aşamaları sonuçlandırır', async () => {
    const built = pipelines.createPipeline('p4', [
      { id: 'a', instruction: '1' },
      { id: 'b', instruction: '2', dependsOn: ['a'] },
    ]);
    const res = await pipelines.run(built.pipeline, async (stage) => ({ ok: true, artifact: stage.id }));
    expect(res.ok).toBe(true);
    expect(res.results.length).toBe(2);
    expect(res.summary.failed).toBe(0);
  });
});

describe('orch/events — olay otobüsü', () => {
  test('abonelik ve yayın çalışır', () => {
    const busRes = events.createBus();
    expect(busRes.ok).toBe(true);
    let received = null;
    const onRes = events.on(busRes.bus, 'task', (ev) => { received = ev.payload; });
    expect(onRes.ok).toBe(true);
    const emitRes = events.emit(busRes.bus, 'task', { n: 1 });
    expect(emitRes.delivered).toBe(1);
    expect(received).toEqual({ n: 1 });
  });
  test('dinleyici çıkarma kanalı boşaltır', () => {
    const busRes = events.createBus();
    let count = 0;
    const fn = () => { count += 1; };
    events.on(busRes.bus, 'agent', fn);
    const e1 = events.emit(busRes.bus, 'agent', {});
    events.off(busRes.bus, 'agent', fn);
    const e2 = events.emit(busRes.bus, 'agent', {});
    expect(e1.delivered).toBe(1);
    expect(e2.delivered).toBe(0);
  });
});

describe('orch/state-store — durum kalıcılığı', () => {
  test('key-value yaz/oku/sil yuvarlak yolu', () => {
    const res = stateStore.createStore();
    expect(res.ok).toBe(true);
    stateStore.set(res.store, 'shared', 'k1', { v: 1 });
    const g = stateStore.get(res.store, 'shared', 'k1');
    expect(g.value).toEqual({ v: 1 });
    stateStore.del(res.store, 'shared', 'k1');
    const g2 = stateStore.get(res.store, 'shared', 'k1');
    expect(g2.ok).toBe(false);
  });
  test('list anahtar setini döner', () => {
    const res = stateStore.createStore();
    stateStore.set(res.store, 'shared', 'a', 1);
    stateStore.set(res.store, 'shared', 'b', 2);
    const list = stateStore.list(res.store, 'shared');
    const keys = list.entries.map((e) => e.key);
    expect(keys).toContain('a');
    expect(keys).toContain('b');
  });
});

describe('orch/vault-tasks — kasalı gizli görevler', () => {
  test('gizli içeren görev oluşturulur', () => {
    const res = vaultTasks.createVaultTask({ prompt: 'kasa sorgusu', secrets: ['api_key', 'db_pass'] });
    expect(res.ok).toBe(true);
    expect(res.task.secrets).toEqual(['api_key', 'db_pass']);
    expect(vaultTasks.getVaultTask(res.task.id)).toBeTruthy();
  });
  test('prompt boşsa görev reddedilir', () => {
    const res = vaultTasks.createVaultTask({});
    expect(res.ok).toBe(false);
  });
  test('çıktı maskeleme gizli değerleri gizler', () => {
    const out = vaultTasks.maskOutput('token: SECRET-VALUE-1234 burada', ['SECRET-VALUE-1234']);
    expect(out.masked).toBe(1);
    expect(out.text).not.toContain('SECRET-VALUE-1234');
    expect(out.text).toContain('***');
  });
  test('kasalama eksik gizliyi bildirir', () => {
    const res = vaultTasks.createVaultTask({ prompt: 't', secrets: ['missing'] });
    const r = vaultTasks.arm(res.task, { get: (name) => ({ ok: false, error: 'yok' }) });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain('missing');
  });
});

describe('orch/handoffs — görev devri', () => {
  test('devir kaydı worker dağılımıyla oluşturulur', () => {
    const handoff = handoffs.createHandoff('Lead görevi', [{ id: 'w1' }, { id: 'w2' }]);
    expect(handoff.ok).toBe(true);
    expect(handoff.handoff.workers.length).toBe(2);
    expect(handoff.handoff.status).toBe('created');
  });
  test('görev atanır ve toplanır', () => {
    const handoff = handoffs.createHandoff('Lead görevi', [{ id: 'w1' }]);
    const as = handoffs.assign(handoff.handoff, ['yaz alt görevi']);
    expect(as.ok).toBe(true);
    expect(as.assigned).toBe(1);
    const agg = handoffs.aggregate(handoff.handoff);
    expect(agg.ok).toBe(true);
    expect(agg.text).toMatch(/Lead görev/);
    expect(agg.succeeded).toBe(0);
  });
  test('yok id reddedilir', () => {
    expect(handoffs.getHandoff('yok-id')).toBeNull();
  });
});

describe('orch/swarm — sürü orkestrasyonu', () => {
  test('sürü ve ajan kayıt edilir', () => {
    const s = swarm.createSwarm('s1');
    expect(s.ok).toBe(true);
    const added = swarm.addAgent(s.swarm, { id: 'ag1', role: 'writer', expertise: ['write', 'dosya'] });
    expect(added.ok).toBe(true);
  });
  test('görev eşleştirme uygun ajanı bulur', () => {
    const s = swarm.createSwarm('s2');
    swarm.addAgent(s.swarm, { id: 'ag2', role: 'writer', expertise: ['yaz', 'dosya'] });
    swarm.addAgent(s.swarm, { id: 'ag3', role: 'reviewer', expertise: ['incele', 'kod'] });
    const m = swarm.match(s.swarm, 'dosyayı yaz');
    expect(m.ok).toBe(true);
    expect(m.agents[0].agentId).toBe('ag2');
  });
  test('boş görev eşleştirmesi reddedilir', () => {
    const s = swarm.createSwarm('s3');
    expect(swarm.match(s.swarm, '').ok).toBe(false);
  });
});

describe('orch/budget-engine — bütçe kontrolü', () => {
  test('harcama kalanı düşürür', () => {
    const b = budgetEngine.createBudget({ limit: 1 });
    const spent = budgetEngine.addSpend(b.budget, 0.4);
    expect(spent.ok).toBe(true);
    expect(spent.remaining).toBe(0.6);
  });
  test('limit aşımında bütçe durur', () => {
    const b = budgetEngine.createBudget({ limit: 0.1 });
    budgetEngine.addSpend(b.budget, 0.08);
    const over = budgetEngine.addSpend(b.budget, 0.05);
    expect(budgetEngine.quota(b.budget).stopped).toBe(true);
    expect(over.stopped).toBe(true);
  });
  test('quota kaldırmayı bildirir', () => {
    const b = budgetEngine.createBudget({ limit: 5 });
    const q = budgetEngine.quota(b.budget);
    expect(q.ok).toBe(true);
    expect(q.remaining).toBe(5);
  });
});

describe('orch/skills — yetenek kayıt defteri', () => {
  test('yerleşik yetenekler kayıtlı', () => {
    skills.testOnlyClear();
    const list = skills.listSkills();
    expect(list.skills.length).toBeGreaterThan(5);
  });
  test('görev metninden yetenek eşleşir', () => {
    skills.testOnlyClear();
    const m = skills.matchSkills('commit et ve testleri çalıştır');
    expect(m.ok).toBe(true);
    expect(m.skills.length).toBeGreaterThan(0);
  });
  test('plan üretimi adım listesi döner', () => {
    skills.testOnlyClear();
    const m = skills.matchSkills('commit et');
    expect(m.skills.length).toBeGreaterThan(0);
    const plan = skills.planSkill(m.skills[0].skill, { message: 'test' });
    expect(plan.ok).toBe(true);
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps[0].tool).toBeTruthy();
  });
  test('eksik değişkenle plan reddedilir', () => {
    skills.testOnlyClear();
    const m = skills.matchSkills('commit et');
    const plan = skills.planSkill(m.skills[0].skill);
    expect(plan.ok).toBe(false);
    expect(plan.missing.length).toBeGreaterThan(0);
  });
});

describe('orch/workspace — çalışma alanı sınırlaması', () => {
  test('kök içi yol onaylanır', () => {
    const ws = workspace.createWorkspace({ root: '/tmp/krevyx-ws-test' });
    expect(ws.ok).toBe(true);
    const check = workspace.checkPath(ws.workspace, '/tmp/krevyx-ws-test/dosya.txt', 'write');
    expect(check.ok).toBe(true);
  });
  test('kök dışı yazma reddedilir', () => {
    const ws = workspace.createWorkspace({ root: '/tmp/krevyx-ws-test2' });
    const check = workspace.checkPath(ws.workspace, '/etc/shadow', 'write');
    expect(check.ok).toBe(true);
    expect(check.allowed).toBe(false);
  });
  test('işlem kısıtları uygulanır', () => {
    const ws = workspace.createWorkspace({ root: '/tmp/krevyx-ws-test3', rules: { write: false } });
    expect(workspace.checkOperation(ws.workspace, 'read').allowed).toBe(true);
    expect(workspace.checkOperation(ws.workspace, 'write').allowed).toBe(false);
  });
});

describe('orch/observability — metrik ve sağlık', () => {
  test('metrik kayıt edilir ve snapshot alınır', () => {
    observability.init();
    observability.record('timing', 120);
    observability.record('timing', 80);
    const snap = observability.snapshot(['timing']);
    expect(snap.ok).toBe(true);
    const m = snap.metrics['timing'];
    expect(m).toBeTruthy();
    expect(m.count).toBe(2);
  });
  test('bilinmeyen metrik tipi reddedilir', () => {
    observability.init();
    expect(observability.record('bilinmeyen.tip', 5).ok).toBe(false);
  });
  test('sağlık raporu hata oranını verir', () => {
    observability.init();
    observability.record('request', 1);
    observability.record('failure', 1);
    const h = observability.health();
    expect(h.ok).toBe(true);
    expect(typeof h.errorRate).toBe('number');
    expect(h.requests).toBe(1);
    expect(h.failures).toBe(1);
  });
});
