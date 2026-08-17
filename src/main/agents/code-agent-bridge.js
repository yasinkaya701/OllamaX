'use strict';

/**
 * code-agent-bridge.js v2 — Krevyx v3.19: gerçek süreç düzeyinde kod ajanı köprüsü
 *
 * Kurulu kod ajanı CLI'larını (Claude Code, Codex, Antigravity/gemini-cli)
 * child_process.spawn ile doğrudan çalıştırır; API anahtarı gerektirmez.
 *
 * v3.19 yenilikleri:
 *   - Claude Code `--output-format stream-json` çıktısının TIPE-bazlı ayrıştırılması
 *     (assistant/tool/user/result), adım etiketleri gerçek akışa göre verilir.
 *   - `workingDir` opsiyonu: ajan doğru proje dizininde çalışır (her ajan için
 *     son çalışma dizini kayıt defterinde tutulur).
 *   - Claude Code `--resume` desteği: aynı çalışma ağacı için mevcut oturumu
 *     devam ettirir (otomatik, son görev aynı dizindeyse).
 *   - Canlı akış: her adım `ipc:3:code-agent:step` event'iyle renderer'a anında
 *     düşer (batch bekleme yok); `ipc:3:code-agent:done` ile tamamlanır.
 *   - Gerçek durdurma: `code-agent-stop { agentId }` süreci kill eder.
 *
 * Ajan bulunamazsa { ok: false, error, missing: true } döner;
 * renderer otomatik olarak simülasyon moduna geçer.
 */

const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

const AGENT_PROFILES = {
  'claude-code': {
    label: 'Claude Code',
    detect: ['claude'],
    // stream-json: type alanlı JSON satırları; stdout ayrıştırıcı etiket üretir
    buildCmd: (task, opts) => {
      const args = ['-p', task, '--output-format', 'stream-json', '--verbose'];
      if (opts && opts.resume) args.push('--resume');
      return args;
    },
    parser: 'stream-json',
    cwdFrom: 'workspace',
  },
  codex: {
    label: 'Codex',
    detect: ['codex'],
    // `codex exec` non-interaktif moddur ve pipe edilen stdin'den görevi okur.
    // `codex prompt` interaktif (PTY) moddur — pipe edilen stdin ile "stdin is not
    // interaktif `codex prompt` pipe stdin'de "stdin is not a terminal" hatası verir; bu yüzden bridge her zaman `exec` yolunu kullanır.
    // `--skip-git-repo-check`: güvenilmeyen dizinlerde (sandbox/CI) çalışmayı sağlar.
    buildCmd: () => ['exec', '--skip-git-repo-check'], // görev stdin'den verilir (interaktif olmayan mod)
    parser: 'lines',
    stdin: true,
    cwdFrom: 'workspace',
  },
  antigravity: {
    label: 'Antigravity',
    detect: ['antigravity', 'gemini'],
    // antigravity CLI öncelikli; yoksa gemini-cli (`gemini -p`)
    buildCmd: (task, opts) => {
      if (opts && opts.executable === 'gemini') return ['-p', task];
      return ['--prompt', task];
    },
    parser: 'lines',
    cwdFrom: 'workspace',
  },
};

/* Çalışma dizini kayıt defteri: ajanId -> son kullanılan proje klasörü */
const cwdRegistry = new Map();

/* Canlı süreç kayıt defteri: ajanId -> child (durdurma için) */
const liveProcesses = new Map();

function win() {
  const wins = BrowserWindow.getAllWindows();
  return wins.length > 0 ? wins[0] : null;
}

function emitStep(agentId, kind, text, seq) {
  const w = win();
  if (w && !w.isDestroyed()) {
    try {
      w.webContents.send('ipc:3:code-agent:step', { agentId, kind, text, seq, t: Date.now() });
    } catch {
      /* pencere kapanmış olabilir — sessizce geç */
    }
  }
}

function emitDone(agentId, result) {
  const w = win();
  if (w && !w.isDestroyed()) {
    try {
      w.webContents.send('ipc:3:code-agent:done', { agentId, result });
    } catch {
      /* noop */
    }
  }
}

function findExecutable(profile) {
  // Fallback zincirini (detect listesi) EŞZAMANLI dene; ilk bulunanı döndür.
  const isWin = process.platform === 'win32';
  const probes = profile.detect.map(
    (name) =>
      new Promise((resolve) => {
        try {
          const args = isWin ? [name] : ['-c', `command -v ${name}`];
          const p = spawn(isWin ? name : 'sh', args, { shell: false, stdio: 'ignore' });
          p.on('error', () => resolve(null));
          const t = setTimeout(() => {
            try { p.kill(); } catch { /* noop */ }
            resolve(null);
          }, 2000);
          p.on('exit', (code) => {
            clearTimeout(t);
            resolve(code === 0 ? name : null);
          });
        } catch {
          resolve(null);
        }
      })
  );
  return Promise.all(probes).then((results) => results.find((r) => r != null) || null);
}

/* ------------------------------------------------------------------ */
/* Claude Code stream-json ayrıştırıcı                                */
/* ------------------------------------------------------------------ */
/*
 * Satır formatı (tek satır JSON):
 *   {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
 *   {"type":"tool_use", ...}   {"type":"result"}   {"type":"system", ...}
 */
function parseStreamJsonLine(raw) {
  if (raw == null) return null;
  const l = String(raw).trim();
  if (!l || l[0] !== '{') return null;
  let j;
  try {
    j = JSON.parse(l);
  } catch {
    return null;
  }
  if (!j || !j.type) return null;
  switch (j.type) {
    case 'assistant': {
      const content = (j.message && Array.isArray(j.message.content)) ? j.message.content : [];
      const texts = content.filter((c) => c && c.type === 'text').map((c) => String(c.text || '').trim()).filter(Boolean);
      if (texts.length === 0) return null;
      const t = texts.join(' ');
      if (/^plan|Düşünüyorum|Planning/i.test(t)) return { kind: 'plan', text: t };
      return { kind: 'plan', text: t };
    }
    case 'tool_use': {
      const name = (j.tool_input && j.tool_input.command) || (j.tool_name) || 'araç';
      return { kind: 'araç', text: `araç: ${String(name).slice(0, 120)}` };
    }
    case 'result': {
      const summary = (j.result && typeof j.result === 'object' && j.result.type === 'text' && j.result.content)
        ? String(j.result.content).slice(0, 400)
        : null;
      return { kind: 'sonuç', text: summary || 'sonuç alındı' };
    }
    case 'system': {
      const t = (j.subtype === 'init' && j.text) ? String(j.text).slice(0, 200) : '';
      return t ? { kind: 'plan', text: t } : null;
    }
    default:
      return null;
  }
}

/* Satır bazlı ayrıştırıcı (codex/antigravity): anlamlı köşeli parantez etiketleri */
function parseLineTag(line, profileId) {
  const t = line.trim();
  if (profileId === 'antigravity' && /inceleme|review|öneri/i.test(t)) return 'plan';
  if (profileId === 'claude-code' && /^(\[plan\]|\[keşif\]|\[düzenle\]|\[patch\]|Yapılıyor|Tamamlandı)/i.test(t)) return 'plan';
  if (/^(test|jest|commit|PR)/i.test(t)) return 'plan';
  if (/Hata|error|failed|başarısız/i.test(t)) return 'sonuç';
  return 'plan';
}

/* Görev giriş temizliği — fuzz dayanıklılığı: bozuk unicode, kontrol karakterleri,
   NULL byte, satır enjeksiyonu ve boyut sınırı uygular */
const MAX_TASK_BYTES = 32 * 1024;
function sanitizeTask(task, chain) {
  let t = task == null ? '' : String(task);
  /* UTF-8 bozuk çift byte'ları ve NULL byte'ları temizle */
  t = t.replace(/\0/g, '').replace(/\uFFFD/g, '');
  /* Kontrol karakterlerini sil (CR/TAB hariç — CLI dostu kalır) */
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  /* Satır enjeksiyonunu önle: stdin akışındaki satır ayrımını korumak için LF → boşluk */
  t = t.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  t = t.slice(0, MAX_TASK_BYTES);
  if (!t) t = 'yok';
  if (!chain) return t;
  return `${t} [HANDOFF] zincir görevi: önceki ajan çıktısını işleyip ilerlet.`;
}

/* Çalışma dizini güvenliği: silinmiş/geçersiz CWD'yi process.cwd()'ye düşür */
function resolveCwd(agentId, opts) {
  const fs = require('fs');
  const raw = (opts && opts.workingDir) ? opts.workingDir : cwdRegistry.get(agentId) || process.cwd();
  try {
    const st = fs.statSync(raw);
    if (st.isDirectory()) {
      if (opts && opts.workingDir) cwdRegistry.set(agentId, raw);
      return raw;
    }
  } catch {
    /* dizin yok/erişim yok — düş */
  }
  const safe = process.cwd();
  if (opts && opts.workingDir) cwdRegistry.set(agentId, safe);
  return safe;
}

function runCli(profile, profileId, task, timeoutMs, opts) {
  const args = profile.buildCmd(task, opts);
  const cwd = resolveCwd(profileId, opts);
  const exe = (opts && opts.executable) ? String(opts.executable) : profile.detect[0];
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, {
        shell: false,
        stdio: profile.stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
        cwd,
        env: { ...process.env, ...(opts && opts.env || {}) },
      });
    } catch (err) {
      return resolve({ ok: false, error: String(err.message).slice(0, 200), missing: true });
    }

    /* canlı süreç kayıt defterine al — stop çağrısı buradan kill eder */
    liveProcesses.set(profileId, { child, killed: false });

    /* çift-bitirme koruması: finish yalnızca ilk çağrıda çalışır (timeout/exit/error yarışları) */
    let finished = false;
    const steps = [];
    let buffer = '';
    let seq = 0;
    const push = (text, kind) => {
      try {
        const t = String(text || '').trim();
        if (!t) return;
        seq += 1;
        const entry = { text: t.slice(0, 500), kind: kind || 'plan' };
        steps.push(entry);
        emitStep(profileId, entry.kind, entry.text, seq);
      } catch {
        /* hiçbir ayrıştırıcı/emit hatası ana akışı öldürmez */
      }
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        liveProcesses.delete(profileId);
      } catch {
        /* noop */
      }
      try {
        emitDone(profileId, result);
      } catch {
        /* noop */
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      try {
        if (child && !child.killed) child.kill();
      } catch {
        /* noop */
      }
      finish({ ok: true, steps, truncated: true });
    }, timeoutMs);

    const safeData = (parser) => (chunk) => {
      try {
        buffer += String(chunk);
        if (buffer.length > 2 * 1024 * 1024) buffer = buffer.slice(-1024 * 1024);
        const lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach((raw) => {
          if (parser === 'stream-json') {
            const parsed = parseStreamJsonLine(raw);
            if (parsed) push(parsed.text, parsed.kind);
          } else if (raw.trim()) {
            push(raw, parseLineTag(raw, profileId));
          }
        });
      } catch {
        /* bozuk veri / ayrıştırıcı hatası süreci durdurmaz */
      }
    };

    child.stdout.on('data', safeData(profile.parser));
    child.stderr.on('data', safeData(profile.parser));

    child.on('error', (err) => {
      finish({ ok: false, error: String(err && err.message).slice(0, 200), missing: true });
    });
    child.on('exit', (code) => {
      if (buffer && profile.parser !== 'stream-json') push(buffer, parseLineTag(buffer, profileId));
      finish({ ok: true, steps, exitCode: code });
    });

    if (profile.stdin) {
      try {
        if (child.stdin && !child.stdin.destroyed) {
          child.stdin.write(task + '\n');
          child.stdin.end();
        }
      } catch {
        /* erken ölen süreçte stdin yazısı atlanır */
      }
    }
  });
}

async function stopAgent(agentId) {
  const entry = liveProcesses.get(agentId);
  if (!entry || entry.killed) return { ok: true, stopped: false, reason: 'çalışan süreç yok' };
  entry.killed = true;
  try {
    if (entry.child && !entry.child.killed) entry.child.kill('SIGTERM');
  } catch (err) {
    return { ok: false, error: String(err && err.message).slice(0, 200) };
  }
  setTimeout(() => {
    try {
      if (entry.child && !entry.child.killed) entry.child.kill('SIGKILL');
    } catch {
      /* noop */
    }
  }, 1500);
  return { ok: true, stopped: true };
}

async function detectAgents() {
  const result = {};
  const entries = Object.entries(AGENT_PROFILES);
  const checks = entries.map(async ([id, profile]) => {
    const exe = await findExecutable(profile);
    result[id] = {
      label: profile.label,
      executable: exe,
      connected: Boolean(exe),
      parser: profile.parser,
      workingDir: cwdRegistry.get(id) || null,
    };
  });
  await Promise.all(checks);
  return result;
}

async function runCodeAgent(agentId, task, chain) {
  const profile = AGENT_PROFILES[agentId];
  if (!profile) return { ok: false, error: 'Bilinmeyen ajan: ' + agentId };

  /* hâlihazırda çalışan aynı ajan varsa önce durdur (tek aktif görev disiplini) */
  await stopAgent(agentId);

  const exe = await findExecutable(profile);
  if (!exe) {
    return { ok: false, error: `${profile.label} kurulu değil — PATH'te "${profile.detect[0]}" bulunamadı.`, missing: true };
  }

  const opts = {
    resume: agentId === 'claude-code',
    executable: exe,
  };
  const finalTask = sanitizeTask(String(task || ''), chain);
  return runCli(profile, agentId, finalTask, 300000, opts);
}

module.exports = {
  runCodeAgent,
  detectAgents,
  stopAgent,
  runCli,
  resolveCwd,
  sanitizeTask,
  AGENT_PROFILES,
  parseStreamJsonLine,
  parseLineTag,
  cwdRegistry,
  liveProcesses,
};
