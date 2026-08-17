# Manus API Integration Notes (v2)

Base URL: `https://api.manus.ai`
Auth: `x-manus-api-key: <key>` header. Envelope: `ok: true` on success; failures: `{ok:false, error:{code, message}, request_id}`.

## Layer 1 — Manus as a cloud provider (chat)
- No streaming chat endpoint in public v2 API (task API is async).
- Provider integration approach: register Manus in PROVIDERS with authType "apiKey" (x-manus-api-key header), but chat must go through the task API asynchronously — OR expose Manus as a "task provider" in the agent console.
- Endpoint: POST /v2/task.create, message: {content}. Optional: project_id, agent_profile, structured_output_schema, message.connectors, enable_skills, force_skills.
- Task is async: poll GET /v2/task.listMessages?task_id=&order=desc&limit=10; statuses: running/stopped/waiting/error.
- assistant_message events hold results. stopped reason: finish / ask.

## Layer 2 — Manus task automation for agents
- flow: task.create → poll listMessages (every ~5s) → on waiting: messageAskUser → task.sendMessage / others → task.confirmAction {task_id, event_id, input}
- stop: POST /v2/task.stop {task_id}
- Structured Output: pass structured_output_schema (JSON Schema, root object, additionalProperties:false, required lists all props, max depth 5) → result in structured_output_result event {success, value, error}.
- Shortcut: task_id "agent-default-main_task" talks to IM default agent.

## Layer 3 — Manus as head agent / chain
- Manus creates tasks whose prompts include downstream outputs (Claude Code/Codex/Antigravity CLI handoffs) — orchestration via Manus delegating to local CLIs.
- In orchestrator.js: add "manus" to headAgent options + a remote "manus-task" runner that creates task, relays local CLI output as messages.

## App-side insertion points (OllamaX repo)
- src/main/agents/provider-chat.js: PROVIDERS registry (line ~44), runMultiChat dispatch (334), stream adapters.
- src/main/config/config-store.js: defaultConfig providers seed (257), resolvedProviders (311).
- src/main/agents/orchestrator.js: REGISTRY (24), runAgent (187), runChain (248), headAgent support.
- src/main/ipc-v3-handlers.js: orchestration handlers 492-553.
- src/renderer/app.js: state.settings (624), orchestration UI 2351-3040, runAgent dispatch.
- src/renderer/index.html: provider cards 245-410.

## User token
- User provides Manus API key via settings → stored in vault (keytar) like other providers.

## DONE STATE (as of this point)
- [DONE] provider-chat.js: manus provider entry + buildAuthHeaders 'manus' case + runMultiChat dispatch to startManusTaskStream (async task.create → poll listMessages → render assistant_message/status_update/error_message → chat-done). Chat flow treats Manus as provider 'manus'.
- [DONE] config-store.js: manus: { apiKey: '' } in defaultConfig + resolvedProviders.
- [DONE] ipc-v3-handlers.js: manus-task-create/wait/stop/answer/message/list handlers after code-agent-stop; resolveManusApiKey reads config + VAULT: refs.
- [DONE] src/main/agents/manus-agent.js: full task lifecycle module (createManusTask, waitForManusTask, stopManusTask, answerManusTask, sendManusMessage, listManusTasks, runManusAgent) + structured_output_result + connectors/attachments support.
- [DONE] orchestrator.js: manus entry in REGISTRY (kind:'cloud', manus-task transport), discoverAgent cloud branch (reachable=hasApiKey), runManusTask dispatcher branch, head-agent chains support manus (runChain accepts any registry id).
- [DONE] renderer app.js: FIXED pid-clobber bug in load (lines 977-987) and save (saveApiKeys 2555-2565) blocks for 11 cloud providers; replaced state.settings[pid] with explicit keys.
- [DONE] tests/manus-agent.test.js (7 tests, EventEmitter https mock), provider-chat.test.js updated (16 providers, manus format). All 210 tests pass across 15 suites.
- [DONE] Renderer UI wiring complete: manus added to CLOUD_PROVIDERS + MODEL_FALLBACK (manus:['manus']) + loadState keys; hydration q('#manus-key') + saveApiKeys state.settings['manus']; API card added in index.html (api-manus, dot-manus, manus-key, manus-model-rows); provider-tabs button manus; agent-provider option manus; CSP connect-src https://api.manus.im added; manus-chat ipc send branch in app.js (line ~3020); ipcMain.on('manus-chat') added in provider-chat.js; updateApiDots loop covers manus via pid filter. All 210 tests pass, 15 suites. All syntax checks pass.
- [DONE] Agent console: manus added to AGENTS list + chain order; app.js ORCH_CHAIN_ORDER includes manus (chain toggles + head-agent select). orchestra-run/chain handlers resolve via orchestrator REGISTRY so manus works. All 210 tests pass.
- [PENDING] Site (ollamax-site): /docs/manus page + homepage feature block + i18n TR/EN + roadmap v3.20 entry.
- Site domain: ollamaxai-ejl2x4gm.manus.space (auto-publish enabled).

## Discovered bug found during integration work
- app.js lines 977-987 (load) and 2555-2565 (save) use a shared var `pid` for all cloud provider keys — they all read/write state.settings[pid], clobbering each other at runtime depending on pid's last loop value. Must fix while adding Manus: replace with explicit keys per provider. Fix: lines 977-987 → state.settings[pid] should be state.settings['providerName'] for each row; same in saveApiKeys 2555-2565. Note: pid loop variable defined at line ~857 context.
