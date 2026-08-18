'use strict';

/**
 * v326-commands.js — Krevyx v3.26 CLI Komutları
 *
 * Kapsam:
 *   - Yeni modülleri terminalden erişilebilir kılan 10 komut:
 *     runtime-run   — runtime.js üzerinden bir ajan görevini yürütür
 *     tools         — araç kayıt defterini listeler/denetler
 *     sandbox-state — sandbox durumu raporu
 *     llm-chat      — llm-router üzerinden tek tur sohbet
 *     session-list  — oturum kayıt defterini listeler
 *     eval          — eval.js ile sonuç değerlendirme
 *     pipeline-run  — pipelines.js üzerinden DAG çalıştırma
 *     swarm-match   — swarm.js görev eşleştirme
 *     budget-quota  — budget-engine kalan bütçe raporu
 *     skills-plan   — skills.js yetenek planı üretimi
 *   - Guard komutları: diff-gate (fark analizi), ci-status, quarantine-list, allowlist, policy-set.
 *
 * Davranış:
 *   - run(argv, opts) → Promise<number> (exit code); opts.exit(fn) varsayılan process.exit.
 *   - Komut yoksa veya --help ile yardım listesi basılır, exit 0.
 *
 * Test:
 *   - testOnlyStub(opts) opts.exit'i yakalar.
 *
 * @version 3.26.0
 */

const runtime = require('../agents-core/runtime');
const toolsMod = require('../agents-core/tools');
const sandboxMod = require('../agents-core/sandbox');
const llmRouter = require('../agents-core/llm-router');
const sessionMod = require('../agents-core/session');
const evalMod = require('../agents-core/eval');
const pipelines = require('../orch/pipelines');
const swarm = require('../orch/swarm');
const budgetEngine = require('../orch/budget-engine');
const skills = require('../orch/skills');
const observability = require('../orch/observability');
const permission = require('../guard/permission');
const allowlist = require('../guard/allowlist');
const policy = require('../guard/policy');
const diffGate = require('../guard/diff-gate');
const quarantine = require('../guard/quarantine');
const fs = require('fs');
const pathMod = require('path');

function print(text) {
  console.log(text);
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
  });
}

const COMMANDS = {
  'runtime-run': async (args) => {
    const prompt = args.join(' ');
    if (!prompt) return { ok: false, error: 'Kullanım: krevyx runtime-run <görev metni>', code: 1 };
    runtime.seedDefaultRunners();
    const sandboxModCli = require('../agents-core/sandbox');
    const sandboxRes = sandboxModCli.createSandbox({ id: 'cli-sandbox' });
    const rtRes = runtime.createRuntime({ id: 'cli-runtime', cwd: process.cwd(), sandbox: sandboxRes.sandbox || null });
    if (!rtRes.ok) return { ok: false, error: rtRes.error || 'Runtime oluşturulamadı', code: 1 };
    const plan = {
      steps: [
        { type: 'list_dir', target: process.cwd() },
        { type: 'grep', target: process.cwd(), pattern: prompt.slice(0, 80) },
        { type: 'write', target: require('path').join(process.cwd(), 'krevyx-runtime-result.txt'), content: `Görev notu: ${prompt}` },
      ],
    };
    const res = await runtime.run(rtRes.runtime, plan);
    if (!res.ok) return { ok: false, error: res.error || 'Çalıştırma başarısız', code: 1 };
    return { ok: true, output: res, code: 0 };
  },
  tools: async (args) => {
    const list = toolsMod.listTools ? toolsMod.listTools() : { ok: true, tools: [] };
    if (args.includes('--scan')) {
      const scan = toolsMod.scan ? toolsMod.scan() : { ok: true };
      printJson({ registry: list, scan });
    } else {
      printJson(list);
    }
    return { ok: true, code: 0 };
  },
  'sandbox-state': async () => {
    const sb = sandboxMod.getSandbox('cli-sandbox') || sandboxMod.createSandbox({ id: 'cli-sandbox' });
    const state = sb ? sandboxMod.state(sb) : { ok: true, sandbox: null };
    printJson(state);
    return { ok: true, code: 0 };
  },
  'llm-chat': async (args) => {
    const prompt = args.join(' ');
    if (!prompt) return { ok: false, error: 'Kullanım: krevyx llm-chat <ileti>', code: 1 };
    const router = llmRouter.getRouter('cli-llm') || llmRouter.createRouter({ id: 'cli-llm' }).router;
    if (!router) return { ok: false, error: 'Yönlendirici oluşturulamadı', code: 1 };
    const res = await llmRouter.chat(router, [{ role: 'user', content: prompt }], { provider: 'auto' });
    if (!res.ok) return { ok: false, error: res.error || 'Sohbet başarısız', code: 1 };
    printJson(res);
    return { ok: true, code: 0 };
  },
  'session-list': async (args) => {
    const list = sessionMod.listSessions ? sessionMod.listSessions() : { ok: true, sessions: [] };
    const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1] || '20', 10) : 20;
    const sessions = Array.isArray(list.sessions) ? list.sessions.slice(0, limit) : [];
    printJson({ ok: true, sessions, total: sessions.length });
    return { ok: true, code: 0 };
  },
  eval: async (args) => {
    const input = args.join(' ');
    const text = input || await readStdin();
    if (!text) return { ok: false, error: 'Kullanım: krevyx eval <sonuç> | echo <sonuç> | krevyx eval', code: 1 };
    const res = evalMod.evaluate ? evalMod.evaluate('değerlendirme-görevi', text) : { ok: true, score: 0 };
    printJson(res);
    return { ok: true, code: 0 };
  },
  'pipeline-run': async (args) => {
    const specFile = args.find((a) => !a.startsWith('-')) || 'pipeline.json';
    let spec;
    try { spec = JSON.parse(fs.readFileSync(pathMod.resolve(specFile), 'utf8')); }
    catch (e) { return { ok: false, error: `Pipeline dosyası okunamadı: ${specFile}`, code: 1 }; }
    const pipelineId = args.find((a) => a.startsWith('--id=')) ? args.find((a) => a.startsWith('--id=')).slice(5) : `cli-${Date.now()}`;
    const stages = Array.isArray(spec.stages) ? spec.stages : Array.isArray(spec.nodes) ? spec.nodes : [spec];
    const built = pipelines.createPipeline(pipelineId, stages);
    if (!built.ok) return { ok: false, error: built.error || 'Pipeline oluşturulamadı', code: 1 };
    const res = await pipelines.run(built.pipeline, async (stage) => ({ ok: true, artifact: `tamamlandı: ${stage.id}` }));
    if (!res.ok) return { ok: false, error: res.error || 'Pipeline başarısız', code: 1 };
    printJson(res);
    return { ok: true, code: 0 };
  },
  'swarm-match': async (args) => {
    const taskText = args.join(' ');
    if (!taskText) return { ok: false, error: 'Kullanım: krevyx swarm-match <görev metni>', code: 1 };
    let s = swarm.getSwarm('cli-swarm');
    if (!s) {
      const created = swarm.createSwarm('cli-swarm');
      if (!created.ok) return { ok: false, error: created.error || 'Sürü oluşturulamadı', code: 1 };
      s = swarm.getSwarm('cli-swarm');
      swarm.addAgent(s, { id: 'cli-agent', role: 'general', capabilities: ['write', 'read', 'execute'] });
    }
    const res = s ? swarm.match(s, taskText) : { ok: false, error: 'Sürü alınamadı' };
    printJson(res);
    return { ok: res && res.ok, code: res && res.ok ? 0 : 1 };
  },
  'budget-quota': async () => {
    let bud = budgetEngine.getBudget('cli-budget');
    if (!bud) {
      const created = budgetEngine.createBudget({ id: 'cli-budget', limit: 0.1, type: 'global' });
      if (!created.ok) return { ok: false, error: created.error || 'Bütçe oluşturulamadı', code: 1 };
      bud = budgetEngine.getBudget('cli-budget');
    }
    const q = bud ? budgetEngine.quota(bud) : { ok: false, error: 'Bütçe alınamadı' };
    printJson(q);
    return { ok: q.ok, code: q.ok ? 0 : 1 };
  },
  'skills-plan': async (args) => {
    const taskText = args.join(' ');
    if (!taskText) return { ok: false, error: 'Kullanım: krevyx skills-plan <görev metni>', code: 1 };
    const matched = skills.matchSkills(taskText);
    if (!matched.ok || !matched.skills.length) { printJson(matched); return { ok: matched.ok, code: matched.ok ? 0 : 1 }; }
    const plan = skills.planSkill(matched.skills[0].skill);
    printJson({ match: matched, plan });
    return { ok: true, code: 0 };
  },
  'diff-gate': async (args) => {
    const diffText = args.join(' ') || await readStdin();
    if (!diffText) return { ok: false, error: 'Kullanım: krevyx diff-gate <diff> | git diff | krevyx diff-gate', code: 1 };
    const res = diffGate.analyze(diffText);
    printJson(res);
    return { ok: res.ok, code: res.decision === 'approved' ? 0 : 1 };
  },
  'ci-status': async (args) => {
    const runId = args.find((a) => !a.startsWith('-'));
    const ci = require('../guard/ci-check');
    printJson(ci.evaluate(runId || ''));
    return { ok: true, code: 0 };
  },
  'quarantine-list': async () => {
    printJson(quarantine.list());
    return { ok: true, code: 0 };
  },
  allowlist: async (args) => {
    if (args.includes('--enable')) { allowlist.enableMode(true); print('Allowlist modu açık'); }
    else if (args.includes('--disable')) { allowlist.enableMode(false); print('Allowlist modu kapalı'); }
    else if (args[0] && !args[0].startsWith('-')) { const r = allowlist.add(args[0]); printJson(r); }
    else printJson(allowlist.list());
    return { ok: true, code: 0 };
  },
  'policy-set': async (args) => {
    const key = args[0];
    const value = args[1];
    if (!key || value === undefined) return { ok: false, error: 'Kullanım: krevyx policy-set <anahtar> <değer> (örn. maxSteps 300)', code: 1 };
    const patch = {};
    if (key === 'maxSteps' || key === 'maxMemoryMb' || key === 'maxConcurrent') patch[key] = parseFloat(value);
    else if (key === 'quietHoursEnabled') patch.quietHours = { enabled: value === 'true' };
    else return { ok: false, error: `Bilinmeyen anahtar: ${key}`, code: 1 };
    printJson(policy.set(patch));
    return { ok: true, code: 0 };
  },
};

function helpText() {
  return [
    'Krevyx v3.26 CLI komutları:',
    '  runtime-run <görev>        Görevi ajan döngüsünden yürüt',
    '  tools [--scan]             Araç kayıt defterini listele/denetle',
    '  sandbox-state              Sandbox durum raporu',
    '  llm-chat <ileti>           Sağlayıcı-agnostik sohbet turu',
    '  session-list [--limit N]   Oturum kayıt defteri',
    '  eval <sonuç>               Sonuç değerlendirme (pipe destekli)',
    '  pipeline-run [dosya]       DAG pipeline çalıştır',
    '  swarm-match <görev>        Sürü ajan eşleştirme',
    '  budget-quota               Bütçe kalanı raporu',
    '  skills-plan <görev>        Yetenek planı üretimi',
    '  diff-gate <diff>           Fark kapısı risk analizi (pipe destekli)',
    '  ci-status [runId]          CI kapı durumu',
    '  quarantine-list            Karantina listesi',
    '  allowlist [--enable|--disable|<arac>] Araç izin listesi',
    '  policy-set <anahtar> <değer> Politika güncelle',
  ].join('\n');
}

async function run(argv, opts = {}) {
  const args = (argv || process.argv).slice(2);
  const exit = opts.exit || ((code) => process.exit(code));
  const cmd = args[0];
  if (!cmd || cmd === '--help' || cmd === '-h') { print(helpText()); exit(0); return 0; }
  const handler = COMMANDS[cmd];
  if (!handler) { print(`Bilinmeyen komut: ${cmd}\n${helpText()}`); exit(1); return 1; }
  try {
    const res = await handler(args.slice(1));
    if (res && !res.ok && res.error) print(`Hata: ${res.error}`);
    if (res && res.code === 0 && res.output && res !== undefined) {
      if (typeof res.output === 'string') print(res.output);
      else if (typeof res.output === 'object') printJson(res.output);
    }
    exit(res && typeof res.code === 'number' ? res.code : 0);
    return res && typeof res.code === 'number' ? res.code : 0;
  } catch (e) {
    print(`Kritik hata: ${e && e.message ? e.message : e}`);
    exit(1);
    return 1;
  }
}

module.exports = { run, COMMANDS, helpText };
