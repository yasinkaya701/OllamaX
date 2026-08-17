/* tests/manus-agent.test.js — V3.20 Manus Task Agent birim testleri */

const EventEmitter = require('events');

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn(), on: jest.fn(), emit: jest.fn() },
  app: { getPath: () => '/tmp/krevyx-test' },
}));

jest.mock('https', () => ({ request: jest.fn() }));

/* Her istek için gerçek http.ClientRequest davranışını taklit eden EventEmitter tabanlı sahte */
let _lastReq = null;

function makeFakeRequest(responses) {
  let idx = 0;
  _lastReq = new EventEmitter();
  _lastReq.write = jest.fn();
  _lastReq.end = jest.fn();
  _lastReq.destroy = jest.fn();
  _lastReq.setTimeout = jest.fn();
  const res = new EventEmitter();
  res.statusCode = 200;
  require('https').request.mockImplementation((_opts, onResponse) => {
    const payload = JSON.stringify(responses[idx++] || { ok: true, task_id: 't-mock' });
    if (typeof onResponse === 'function') onResponse(res);
    process.nextTick(() => {
      res.emit('data', payload);
      res.emit('end');
    });
    return _lastReq;
  });
}

describe('manus-agent module', () => {
  test('modül yüklenir ve beklenen arayüzü dışa aktarır', () => {
    const m = require('../src/main/agents/manus-agent');
    expect(typeof m.createManusTask).toBe('function');
    expect(typeof m.waitForManusTask).toBe('function');
    expect(typeof m.stopManusTask).toBe('function');
    expect(typeof m.answerManusTask).toBe('function');
    expect(typeof m.sendManusMessage).toBe('function');
    expect(typeof m.listManusTasks).toBe('function');
    expect(typeof m.runManusAgent).toBe('function');
  });

  test('anahtarsız görev oluşturma hata döndürür', async () => {
    const m = require('../src/main/agents/manus-agent');
    await expect(m.createManusTask({})).rejects.toThrow('API anahtarı');
  });

  test('boş görev metni hata döndürür', async () => {
    const m = require('../src/main/agents/manus-agent');
    await expect(m.createManusTask({ apiKey: 'k', task: '' })).rejects.toThrow('Görev metni');
  });

  test('structured output şeması gövdeye eklenir', async () => {
    const m = require('../src/main/agents/manus-agent');
    const schema = { type: 'object', properties: { a: { type: 'string' } }, required: ['a'], additionalProperties: false };
    makeFakeRequest([{ ok: true, task_id: 't2' }]);
    const created = await m.createManusTask({ apiKey: 'mk', task: 'özetle', structuredOutputSchema: schema });
    expect(created.ok).toBe(true);
    expect(created.taskId).toBe('t2');
    const body = JSON.parse(_lastReq.write.mock.calls[0][0]);
    expect(body.structured_output_schema).toEqual(schema);
    expect(body.message.content).toContain('özetle');
    expect(body.message.connectors).toBeUndefined();
  });

  test('connectors ve dosya ekleri gövdeye eklenir', async () => {
    const m = require('../src/main/agents/manus-agent');
    makeFakeRequest([{ ok: true, task_id: 't4' }]);
    await m.createManusTask({ apiKey: 'mk', task: 'rapor', connectors: ['web'], fileIds: ['f1'] });
    const body = JSON.parse(_lastReq.write.mock.calls[0][0]);
    expect(body.message.connectors).toEqual(['web']);
    expect(body.message.attachments).toEqual([{ type: 'file_id', file_id: 'f1' }]);
  });

  test('görev listesi oluşturulan session durumunu yansıtır', async () => {
    const m = require('../src/main/agents/manus-agent');
    makeFakeRequest([{ ok: true, task_id: 't3' }]);
    const created = await m.createManusTask({ apiKey: 'mk2', task: 'ara' });
    expect(created.ok).toBe(true);
    const list = m.listManusTasks();
    expect(list.some((t) => t.taskId === 't3')).toBe(true);
  });
});

describe('manus-agent IPC handler wiring', () => {
  test('ipc:3:manus-task-* uç noktaları registerIpcV3Handlers çağrısında kayıtlı', () => {
    const { ipcMain } = require('electron');
    const mod = require('../src/main/ipc-v3-handlers');
    mod.registerIpcV3Handlers({ id: 1, webContents: { id: 1, on: jest.fn() } });
    const names = ipcMain.handle.mock.calls.map((c) => c[0]);
    for (const n of ['manus-task-create', 'manus-task-wait', 'manus-task-stop', 'manus-task-answer', 'manus-task-message', 'manus-task-list']) {
      expect(names).toContain(`ipc:3:${n}`);
    }
  });
});
