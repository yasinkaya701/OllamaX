/**
 * cli/run.js — `krevyx run` penceresiz CLI modu (v3.18 C-4)
 *
 * Electron'u başlatmadan, aynı ajan kayıt defteri ve zincir motorunu
 * kullanarak stüdyo ajanlarını terminalden/CI'dan çalıştırır:
 *
 *   krevyx run "prompt" [--agent id] [--agents a,b,c] [--dir path]
 *            [--output json|text] [--timeout ms] [--chain] [--quiet]
 *
 * Çıktı varsayılan olarak stdout'a akar; --output json ile her ajan adımı
 * {step, agent, status, output} satırları olarak yazılır (CI ayrıştırması
 * için satır satır JSONL). Exit kod: 0 başarılı, 1 hata, 2 kullanım.
 */
'use strict';
const path = require('path');
const registry = require('../agents/orchestrator');

function parseArgs(argv) {
  const opts = {
    prompt: null,
    agent: 'ollama',
    agents: null,
    dir: process.cwd(),
    output: 'text',
    timeout: 300000,
    chain: false,
    quiet: false,
    help: false,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--agent') opts.agent = args[(i += 1)];
    else if (a === '--agents') opts.agents = args[(i += 1)].split(',').map((s) => s.trim());
    else if (a === '--dir') opts.dir = path.resolve(args[(i += 1)]);
    else if (a === '--output') opts.output = args[(i += 1)];
    else if (a === '--timeout') opts.timeout = Number(args[(i += 1)]) || opts.timeout;
    else if (a === '--chain') opts.chain = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (!a.startsWith('-') && opts.prompt === null) opts.prompt = a;
  }
  return opts;
}

const HELP = `krevyx run <prompt> [seçenekler]

Seçenekler:
  --agent <id>        Tek ajan kimliği (varsayılan: ollama)
  --agents <a,b,c>    Ajan zinciri: sırayla çalışır, çıktı bir sonraki ajana aktarılır
  --dir <yol>         Çalışma dizini (varsayılan: geçerli dizin)
  --output <fmt>      json | text (varsayılan: text)
  --timeout <ms>      Ajan başına zaman aşımı (varsayılan: 300000)
  --chain             Zincir modu açık (agent listesi verildiyse otomatik)
  --quiet             Yalnızca sonuç, ara çıktı yok
  -h, --help          Bu yardım metni

Örnekler:
  krevyx run "bu repodaki bugları listele"
  krevyx run "testleri çalıştır" --agent codex
  krevyx run "review yap" --agents claude-code,codex --output json
`;

async function emit(opts, obj) {
  if (opts.output === 'json') {
    process.stdout.write(`${JSON.stringify(obj)}\n`);
  } else if (!opts.quiet) {
    process.stdout.write(`${obj.status === 'done' ? '' : `[${obj.agent}] `}${obj.output || ''}\n`);
  }
}

function isKnownAgent(agentId) {
  return registry.REGISTRY && Object.prototype.hasOwnProperty.call(registry.REGISTRY, agentId);
}

async function runSingle(opts, agentId, prompt) {
  if (!isKnownAgent(agentId)) throw new Error(`Bilinmeyen ajan: ${agentId}`);
  const res = await registry.runAgent(agentId, prompt, { timeout: opts.timeout, workdir: opts.dir });
  const ok = res && res.ok;
  return {
    agent: agentId,
    status: ok ? 'done' : 'error',
    output: ok
      ? registry.normalizeOutput(res)
      : (res && (res.error || res.output)) || 'ajan yanıt vermedi',
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.prompt) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  try {
    const agentIds = opts.agents || [opts.agent];
    let finalResult;
    if (agentIds.length === 1) {
      finalResult = Object.assign({ step: 1 }, await runSingle(opts, agentIds[0], opts.prompt));
    } else {
      const chainRes = await registry.runChain(agentIds, opts.prompt, { timeout: opts.timeout, workdir: opts.dir });
      const steps = (chainRes && Array.isArray(chainRes.steps) ? chainRes.steps : []);
      for (let i = 0; i < steps.length; i += 1) {
        const s = steps[i];
        await emit(opts, {
          step: i + 1,
          agent: s.agent || agentIds[i],
          status: s.ok ? 'done' : 'error',
          output: s.ok ? registry.normalizeOutput(s) : (s.error || s.output || ''),
        });
      }
      if (!steps.length) throw new Error('zincir sonuç üretmedi');
      finalResult = Object.assign({ step: steps.length }, {
        agent: agentIds[agentIds.length - 1],
        status: steps[steps.length - 1].ok ? 'done' : 'error',
        output: registry.normalizeFullOutput ? registry.normalizeFullOutput(chainRes) : registry.normalizeOutput(steps[steps.length - 1]),
      });
    }
    await emit(opts, Object.assign({ step: 'final' }, finalResult));
    if (finalResult.status === 'error') process.exitCode = 1;
  } catch (err) {
    await emit(opts, { status: 'error', output: err.message || String(err) });
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs, runSingle, HELP };
