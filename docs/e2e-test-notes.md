# E2E Codex Test — Durum Notları (2026-08-17)

## Ortam
- Sandbox: Node 22.13.0, üç CLI da kurulu: `claude` (2.1.233), `gemini` (0.55.1), `codex` (0.147.0) — npm global, PATH'te.
- API anahtarları: yalnızca OPENAI_API_KEY var (25 karakter, sk-mTqYj...bog8) — GEÇERSİZ; codex çalıştırınca 401 Unauthorized (websocket + HTTPS). ANTHROPIC_API_KEY ve GEMINI_API_KEY yok.
- Test dizini: /tmp/codex-e2e (git init yapıldı; codex --skip-git-repo-check bayrağı kullanılıyor).

## Yapılan düzeltmeler (OllamaX repo, henüz commit edilmedi)
1. `src/main/agents/code-agent-bridge.js` — codex profili: `codex prompt` → `codex exec --skip-git-repo-check`. Gerekçe: `codex prompt` interaktif (PTY) moddur, pipe edilen stdin ile "stdin is not a terminal" hatası verir; `codex exec` non-interaktif, stdin'den okur.
2. `src/main/agents/code-agent-bridge.js` — findExecutable: `spawn('command', ['-v', name])` ENOENT veriyordu (command shell built-in'dir). POSIX'te artık `spawn('sh', ['-c', 'command -v <exe>'])`; Windows'ta doğrudan exe.
3. `tests/e2e-codex-bridge.mjs` — yeni E2E harness: electron'u Proxy mock ile yönlendirir, step/done IPC event'lerini yakalar; detect + runCodeAgent('codex') + stopAgent + cwdRegistry test eder.

## Test sonuçları
- TEST 1 (detect): düzeltmeden önce 3 ajan da connected=false; düzeltmeden sonra 3'ü de true (codex/claude/gemini bulundu).
- TEST 2 (runCodeAgent codex): ok=false döndü, 0 adım — spawn error yoluna gitti (`error` event'i). Muhtemelen: bridge spawn args[0] = 'codex' args[1] = 'exec'... — spawn('codex', ['exec','--skip-git-repo-check']) doğru olmalı. Hata mesajı bilinmiyor (bridge error metnini loglamıyor, sadece {ok:false, error} çözer). Bir sonraki adım: harness runCli hata kaydını yazdırsın veya env'i incelemem gerek.
  - Önemli olasılık: e2e harness env'i source etmeden çalıştı (source /home/ubuntu/.user_env shell'de ama node alt süreci de miras alır — sorun olmaz). Alternatif: spawn'ın error'ı `codex` ENOENT değil; env'de OPENAI key geçersiz olduğundan API hatası child exit'inde değil spawn'da değil → ok:true olurdu. Yani spawn error = codex binary bulunamıyor? Ama detect sh -c ile buldu...
  - DİKKAT: runCli içinde `args = profile.buildCmd(task, opts)` → args[0]='exec'? HAYIR — runCli spawn(args[0], args.slice(1)): buildCmd ['exec','--skip-git-repo-check'] döner, yani spawn('exec', ['--skip-git-repo-check'])! exec komutu shell built-in, ENOENT! runCli, executable path'i args[0] olarak kullanmıyor — ajan binary'sini args'a dahil etmiyor. Claude Code profilinde args[0]='-p'... wait, claude profile buildCmd ['-p', task, '--output-format', 'stream-json'] — spawn('-p', ...) da bozuk olurdu!
  - DOĞRU ANALİZ: runCli(args[0]) mantığı broken: AGENT_PROFILES.buildCmd return değerleri binary name olmadan. runCodeAgent içinde exe bulunuyor ama runCli'ye iletilmiyor! runCli'de spawn(args[0]...) kullanılıyor. Yani bu köprü hiç çalışmazdı — v3.19'dan beri. Düzeltme: runCli'ye exe parametresi ekle, spawn(exe, args, ...).
- TEST 3 ve 4: durdurma ve CWD kayıt defteri çalışıyor.

## Kalan adımlar
- runCli'ye exe parametresini geçir ve spawn(exe, args) yap.
- Harness'ı tekrar çalıştır; geçersiz anahtar nedeniyle Codex 401 alacak → akış doğrulaması stderr adımlarından (ERROR: Reconnecting..., 401 Unauthorized satırları push ile yakalanacak) yapılacak.
- Sonra commit+push (v3.19 sonrası değişiklikler: pid-clobber fix app.js'de commitlendi; bridge düzeltmeleri henüz değil).
- Site v3.20 checkpoint zaten canlı (46a1aba7, auto-publish).
- Kullanıcıya rapor: CLI kurulumları OK, OpenAI anahtarı geçersiz (401), bridge'de 3 bug bulundu/düzeltildi.
