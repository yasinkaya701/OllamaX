# TODO — 50k Upgrade (v3.26)

## Faz 0
- [ ] v3.25.0 CI doğrulaması (3 platform success) — TAG ZATEN GÜNCELLENDİ (1774305)
- [ ] PLAN-326.md yazıldı ✓

## Faz 1 — Çekirdek Motor (7 modül)
- [ ] agents-core/runtime.js (ajan döngüsü + adım yürütücü registry + akış kanalı)
- [ ] agents-core/tools.js (24 araç + izin matrisi + şemalar)
- [ ] agents-core/sandbox.js (komut allowlist + dizin kısıtı + proses limiti)
- [ ] agents-core/llm-router.js (6 adaptör + rota stratejileri + yerel keşif)
- [ ] agents-core/prompts.js (20+ şablon)
- [ ] agents-core/session.js (oturum persist + kurtarma + zincir)
- [ ] agents-core/eval.js (değerlendirme çerçevesi)

## Faz 2 — Orkestrasyon (10 modül)
- [ ] orch/vault-tasks.js
- [ ] orch/pipelines.js (DAG)
- [ ] orch/handoffs.js
- [ ] orch/swarm.js
- [ ] orch/budget-engine.js
- [ ] orch/state-store.js
- [ ] orch/events.js
- [ ] orch/skills.js + builtin skill'ler
- [ ] orch/workspace.js
- [ ] orch/observability.js

## Faz 3 — Güven (8 modül)
- [ ] guard/permission.js
- [ ] guard/allowlist.js
- [ ] guard/policy.js
- [ ] guard/diff-gate.js
- [ ] guard/ci-check.js
- [ ] guard/entropy.js
- [ ] guard/quarantine.js
- [ ] trust/signing.js

## Faz 4 — CLI/IPC/UI
- [ ] cli/v326-commands.js (10 komut)
- [ ] ipc-v326-handlers.js
- [ ] renderer/modules/runtime.js
- [ ] renderer/modules/pipelines.js
- [ ] renderer/modules/skills.js
- [ ] renderer/modules/budget.js
- [ ] renderer/modules/guard.js
- [ ] renderer/modules/observability.js
- [ ] index.html + styles.css entegrasyonu
- [ ] Testler: 14 modül test dosyası (~490 test)

## Faz 5 — Final
- [ ] bin/krevyx.js delegasyon (v326 komutlar)
- [ ] main.js IPC kaydı
- [ ] package.json version 3.26.0 + CHANGELOG
- [ ] Eslint 0 hata
- [ ] Tüm jest suite'leri yeşil
- [ ] CLI smoke test
- [ ] Commit + tag v3.26.0 + push + CI doğrulama
- [ ] Nihai rapor
