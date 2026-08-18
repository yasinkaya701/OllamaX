'use strict';

/**
 * ipc-v326-handlers.js — Krevyx v3.26 IPC Köprüsü
 *
 * Kapsam:
 *   - Electron ana süreç tarafında yeni modüller için IPC handle kaydı.
 *   - Renderer tarafı kanal adları: kx326:<modül>:<işlem>.
 *
 * Kanallar:
 *   - kx326:runtime:run        → runtime.execute(prompt, opts)
 *   - kx326:tools:list         → toolsMod.listTools()
 *   - kx326:sandbox:state      → sandboxMod.getState()
 *   - kx326:llm:chat           → llmRouter.chat({prompt, provider})
 *   - kx326:session:list       → sessionMod.listSessions()
 *   - kx326:eval:evaluate      → evalMod.evaluate(text)
 *   - kx326:pipeline:run       → pipelines.runPipeline(spec)
 *   - kx326:pipeline:status    → pipelines.pipelineStatus(id)
 *   - kx326:swarm:create       → swarm.createSwarm(id)
 *   - kx326:swarm:add          → swarm.addAgent(swarm, spec)
 *   - kx326:swarm:match        → swarm.match(swarm, taskText)
 *   - kx326:budget:create      → budgetEngine.createBudget(spec)
 *   - kx326:budget:spend       → budgetEngine.addSpend(budget, amount, opts)
 *   - kx326:budget:quota       → budgetEngine.quota(budget)
 *   - kx326:skills:list        → skills.listSkills(opts)
 *   - kx326:skills:match       → skills.matchSkills(taskText)
 *   - kx326:skills:plan        → skills.planSkill(skillId, vars)
 *   - kx326:guard:permission   → permission.check(role, capability)
 *   - kx326:guard:allowlist    → allowlist.list() / check(toolId)
 *   - kx326:guard:policy       → policy.get() / evaluate(request)
 *   - kx326:guard:diff-gate    → diffGate.analyze(diffText, opts)
 *   - kx326:guard:quarantine   → quarantine.list()
 *   - kx326:obs:snapshot       → observability.snapshot(types)
 *   - kx326:obs:health         → observability.health()
 *
 * Davranış:
 *   - registerIpcV326(app, ipcMain) → kayıtları yapar; her handler try/catch
 *     sarmalında { ok:false, error } döner (renderer'a hata fırlamaz).
 *   - ipcMain verilmezse app.ipcMain kullanılır (test uyumu).
 *
 * Test:
 *   - mockIpcMain ile handler map'ine kayıt doğrulanır.
 *
 * @version 3.26.0
 */

let _registered = false;

function registerIpcV326(app, ipcMain) {
  const ipc = (ipcMain && ipcMain.handle) ? ipcMain : (app && app.ipcMain);
  if (!ipc || !ipc.handle) return { ok: false, error: 'IPC ana nesnesi gerekli' };
  const runtime = require('./agents-core/runtime');
  const toolsMod = require('./agents-core/tools');
  const sandboxMod = require('./agents-core/sandbox');
  const llmRouter = require('./agents-core/llm-router');
  const sessionMod = require('./agents-core/session');
  const evalMod = require('./agents-core/eval');
  const pipelines = require('./orch/pipelines');
  const swarm = require('./orch/swarm');
  const budgetEngine = require('./orch/budget-engine');
  const skills = require('./orch/skills');
  const permission = require('./guard/permission');
  const allowlist = require('./guard/allowlist');
  const policy = require('./guard/policy');
  const diffGate = require('./guard/diff-gate');
  const quarantine = require('./guard/quarantine');
  const observability = require('./orch/observability');

  const handlers = {
    'kx326:runtime:run': async (_e, prompt, opts) => { try { return await runtime.execute(prompt, opts || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:tools:list': async () => { try { return toolsMod.listTools ? toolsMod.listTools() : { ok: true, tools: [] }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:sandbox:state': async () => { try { return sandboxMod.getState ? sandboxMod.getState() : { ok: true }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:llm:chat': async (_e, payload) => { try { return await llmRouter.chat(payload || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:session:list': async () => { try { return sessionMod.listSessions ? sessionMod.listSessions() : { ok: true, sessions: [] }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:eval:evaluate': async (_e, text) => { try { return evalMod.evaluate ? evalMod.evaluate(text) : { ok: true, score: 0 }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:pipeline:run': async (_e, spec) => { try { return await pipelines.runPipeline(spec); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:pipeline:status': async (_e, id) => { try { return pipelines.pipelineStatus ? pipelines.pipelineStatus(id) : { ok: false, error: 'Durum mevcut değil' }; } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:swarm:create': async (_e, id) => { try { return swarm.createSwarm(id); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:swarm:add': async (_e, swarmId, spec) => { try { const s = swarm.getSwarm(swarmId); if (!s) return { ok: false, error: 'Sürü bulunamadı' }; return swarm.addAgent(s, spec || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:swarm:match': async (_e, swarmId, taskText) => { try { const s = swarm.getSwarm(swarmId); if (!s) return { ok: false, error: 'Sürü bulunamadı' }; return swarm.match(s, taskText); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:budget:create': async (_e, spec) => { try { return budgetEngine.createBudget(spec || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:budget:spend': async (_e, budgetId, amount, opts) => { try { const b = budgetEngine.getBudget(budgetId); if (!b) return { ok: false, error: 'Bütçe bulunamadı' }; return budgetEngine.addSpend(b, amount, opts || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:budget:quota': async (_e, budgetId) => { try { const b = budgetEngine.getBudget(budgetId); if (!b) return { ok: false, error: 'Bütçe bulunamadı' }; return budgetEngine.quota(b); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:skills:list': async (_e, opts) => { try { return skills.listSkills(opts || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:skills:match': async (_e, taskText) => { try { return skills.matchSkills(taskText); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:skills:plan': async (_e, skillId, vars) => { try { return skills.planSkill(skillId, vars || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:guard:permission': async (_e, role, capability) => { try { return permission.check(role, capability); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:guard:allowlist': async (_e, op, payload) => { try { if (op === 'list') return allowlist.list(); if (op === 'check') return allowlist.check(payload); return allowlist.list(); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:guard:policy': async (_e, op, payload) => { try { if (op === 'get') return policy.get(); if (op === 'evaluate') return policy.evaluate(payload || {}); return policy.get(); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:guard:diff-gate': async (_e, diffText, opts) => { try { return diffGate.analyze(diffText, opts || {}); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:guard:quarantine': async () => { try { return quarantine.list(); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:obs:snapshot': async (_e, types) => { try { return observability.snapshot(types || []); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
    'kx326:obs:health': async () => { try { return observability.health(); } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; } },
  };

  const registered = [];
  for (const [channel, fn] of Object.entries(handlers)) {
    try { ipc.handle(channel, fn); registered.push(channel); }
    catch (e) { /* duplicate registration ignored */ }
  }
  _registered = true;
  return { ok: true, registered: registered.length, channels: registered };
}

function isRegistered() {
  return { ok: true, registered: _registered };
}

module.exports = { registerIpcV326, isRegistered };
