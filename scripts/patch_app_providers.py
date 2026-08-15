import re

p = 'src/renderer/app.js'
s = open(p, encoding='utf8').read()

NEW_PROVIDERS = ['openrouter','xai','mistral','deepseek','cohere','perplexity','together','groq','cerebras','fireworks','replicate','azure','aws-bedrock','lmstudio','custom']

# 1) Provider list constant + MODEL_FALLBACK loop
old_list = "const MODEL_LISTS = { ollama: [], openai: [], anthropic: [], gemini: [] };"
new_list = "const MODEL_LISTS = { ollama: [], openai: [], anthropic: [], gemini: " + \
    ", ".join(f"{pid}: []" for pid in NEW_PROVIDERS) + " };\nconst CLOUD_PROVIDERS = ['openai','anthropic','gemini'," + \
    ", ".join(f"'{pid}'" for pid in NEW_PROVIDERS) + "];"
assert old_list in s
s = s.replace(old_list, new_list)

# 2) MODEL_FALLBACK usage (hydrateModelCatalog) — generic loop
for block in [
    ("  if (!api) {\n    MODEL_LISTS.openai = [...MODEL_FALLBACK.openai];\n    MODEL_LISTS.anthropic = [...MODEL_FALLBACK.anthropic];\n    MODEL_LISTS.gemini = [...MODEL_FALLBACK.gemini];\n    return;\n  }",
     "  if (!api) {\n    for (const pid of CLOUD_PROVIDERS) MODEL_LISTS[pid] = [...(MODEL_FALLBACK[pid] || [])];\n    return;\n  }"),
    ("    if (c?.openai?.length) MODEL_LISTS.openai = c.openai;\n    if (c?.anthropic?.length) MODEL_LISTS.anthropic = c.anthropic;\n    if (c?.gemini?.length) MODEL_LISTS.gemini = c.gemini;\n  } catch {\n    MODEL_LISTS.openai = [...MODEL_FALLBACK.openai];\n    MODEL_LISTS.anthropic = [...MODEL_FALLBACK.anthropic];\n    MODEL_LISTS.gemini = [...MODEL_FALLBACK.gemini];\n  }",
     "    for (const pid of CLOUD_PROVIDERS) {\n      if (c?.[pid]?.length) MODEL_LISTS[pid] = c[pid];\n    }\n  } catch {\n    for (const pid of CLOUD_PROVIDERS) MODEL_LISTS[pid] = [...(MODEL_FALLBACK[pid] || [])];\n  }"),
]:
    assert block[0] in s, block[0][:60]
    s = s.replace(block[0], block[1])

# 3) loadState settings keys
old_keys = "for (const k of ['openai', 'anthropic', 'gemini', 'ollamaHost']) {"
new_keys = ("for (const k of ['openai', 'anthropic', 'gemini', 'ollamaHost', " +
            ", ".join(f"'{pid}'" for pid in NEW_PROVIDERS) + "]) {")
assert old_keys in s
s = s.replace(old_keys, new_keys)

# 4) refreshSettings input restores — add new inputs after gemini restores
gem_restore = "  q('#gemini-key').value = state.settings.gemini || '';"
extra_restores = "\n".join(
    f"  q('#{pid}-key').value = state.settings[pid] || '';" for pid in NEW_PROVIDERS
    if pid not in ('azure','aws-bedrock','lmstudio','custom'))
extra_restores += """
  q('#azure-endpoint').value = state.settings.azureEndpoint || '';
  q('#azure-key').value = state.settings.azureApiKey || '';
  q('#bedrock-region').value = state.settings.bedrockRegion || '';
  q('#bedrock-access-key').value = state.settings.bedrockAccessKeyId || '';
  q('#bedrock-secret-key').value = state.settings.bedrockSecretAccessKey || '';
  q('#lmstudio-endpoint').value = state.settings.lmstudioEndpoint || '';
  q('#custom-endpoint').value = state.settings.customEndpoint || '';
  q('#custom-key').value = state.settings.customApiKey || '';"""
assert gem_restore in s
s = s.replace(gem_restore, gem_restore + "\n" + extra_restores, 1)

# 5) saveApiKeys
old_save = """  state.settings.openai = q('#openai-key').value.trim();
  state.settings.anthropic = q('#anthropic-key').value.trim();
  state.settings.gemini = q('#gemini-key').value.trim();
  save();"""
new_save = """  state.settings.openai = q('#openai-key').value.trim();
  state.settings.anthropic = q('#anthropic-key').value.trim();
  state.settings.gemini = q('#gemini-key').value.trim();
""" + "\n".join(f"  state.settings[pid] = (q('#{pid}-key').value || '').trim();" for pid in NEW_PROVIDERS if pid not in ('azure','aws-bedrock','lmstudio','custom')) + """
  state.settings.azureEndpoint = (q('#azure-endpoint').value || '').trim();
  state.settings.azureApiKey = (q('#azure-key').value || '').trim();
  state.settings.bedrockRegion = (q('#bedrock-region').value || '').trim();
  state.settings.bedrockAccessKeyId = (q('#bedrock-access-key').value || '').trim();
  state.settings.bedrockSecretAccessKey = (q('#bedrock-secret-key').value || '').trim();
  state.settings.lmstudioEndpoint = (q('#lmstudio-endpoint').value || '').trim();
  state.settings.customEndpoint = (q('#custom-endpoint').value || '').trim();
  state.settings.customApiKey = (q('#custom-key').value || '').trim();
  save();"""
assert old_save in s
s = s.replace(old_save, new_save)

# 6) updateApiDots — generic loop
old_dots = """  set('dot-openai', !!state.settings.openai);
  set('dot-anthropic', !!state.settings.anthropic);
  set('dot-gemini', !!state.settings.gemini);
}"""
new_dots = """  set('dot-openai', !!state.settings.openai);
  set('dot-anthropic', !!state.settings.anthropic);
  set('dot-gemini', !!state.settings.gemini);
  for (const pid of CLOUD_PROVIDERS.filter((x) => x !== 'openai' && x !== 'anthropic' && x !== 'gemini')) {
    const has = pid === 'aws-bedrock'
      ? !!(state.settings.bedrockRegion && state.settings.bedrockAccessKeyId && state.settings.bedrockSecretAccessKey)
      : pid === 'azure' ? !!(state.settings.azureEndpoint && state.settings.azureApiKey)
        : pid === 'lmstudio' ? !!state.settings.lmstudioEndpoint
          : pid === 'custom' ? !!state.settings.customEndpoint
            : !!state.settings[pid];
    set('dot-' + pid, has);
  }
}"""
assert old_dots in s
s = s.replace(old_dots, new_dots)

# 7) buildApiModelRows — generic loop
old_rows = "  [['openai-model-rows', 'openai'], ['anthropic-model-rows', 'anthropic'], ['gemini-model-rows', 'gemini']].forEach(([id, prov]) => {"
new_rows = "  const rowBindings = [['openai-model-rows','openai'],['anthropic-model-rows','anthropic'],['gemini-model-rows','gemini']].concat(CLOUD_PROVIDERS.filter((x)=>!['openai','anthropic','gemini'].includes(x)).map((pid)=>[pid+'-model-rows', pid]));\n  rowBindings.forEach(([id, prov]) => {"
assert old_rows in s
s = s.replace(old_rows, new_rows, 1)

# buildApiModelRows appears twice (restore + redef). Second occurrence check:
if old_rows in s:
    s = s.replace(old_rows, new_rows, 1)

# 8) bootstrapCloudModels — generic loop
old_boot = """  const order = ['anthropic'];
  if (state.settings.openai?.trim()) order.push('openai');
  if (state.settings.gemini?.trim()) order.push('gemini');
  for (const prov of order) {
    try {
      const key =
        prov === 'openai'
          ? state.settings.openai
          : prov === 'gemini'
            ? state.settings.gemini
            : state.settings.anthropic || '';
      const res = await api.invoke('fetch-provider-models', { provider: prov, apiKey: key });
      if (res.ok && Array.isArray(res.models) && res.models.length) MODEL_LISTS[prov] = res.models;
    } catch {
      /* keep catalog */
    }
  }"""
new_boot = """  const order = ['anthropic'];
  if (state.settings.openai?.trim()) order.push('openai');
  if (state.settings.gemini?.trim()) order.push('gemini');
  for (const pid of CLOUD_PROVIDERS) {
    if (pid === 'azure' || pid === 'aws-bedrock' || pid === 'lmstudio' || pid === 'custom') continue;
    if (state.settings[pid]?.trim()) order.push(pid);
  }
  for (const prov of order) {
    try {
      const key =
        prov === 'openai'
          ? state.settings.openai
          : prov === 'gemini'
            ? state.settings.gemini
            : state.settings[prov] || '';
      const res = await api.invoke('fetch-provider-models', { provider: prov, apiKey: key });
      if (res.ok && Array.isArray(res.models) && res.models.length) MODEL_LISTS[prov] = res.models;
    } catch {
      /* keep catalog */
    }
  }"""
assert old_boot in s
s = s.replace(old_boot, new_boot)

# 9) runAgent provider mapping — extend openai/anthropic/gemini branch to multi-chat
old_map = """    else if (prov === 'openai') api.send('openai-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.openai });
    else if (prov === 'anthropic') api.send('anthropic-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.anthropic });
    else if (prov === 'gemini') api.send('gemini-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.gemini });"""
new_map = """    else if (prov === 'openai') api.send('openai-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.openai });
    else if (prov === 'anthropic') api.send('anthropic-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.anthropic });
    else if (prov === 'gemini') api.send('gemini-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.gemini });
    else if (CLOUD_PROVIDERS.includes(prov)) api.send('multi-chat', {
      provider: prov,
      agentId: agent.id,
      model,
      messages: msgs,
      apiKey: prov === 'azure' ? state.settings.azureApiKey
        : prov === 'aws-bedrock' ? state.settings.bedrockAccessKeyId
          : prov === 'lmstudio' ? ''
            : prov === 'custom' ? state.settings.customApiKey
              : state.settings[prov],
      options: {
        endpoint: prov === 'azure' ? state.settings.azureEndpoint
          : prov === 'lmstudio' ? state.settings.lmstudioEndpoint || 'http://localhost:1234'
            : prov === 'custom' ? state.settings.customEndpoint || ''
              : '',
        region: state.settings.bedrockRegion || '',
        awsAccessKeyId: state.settings.bedrockAccessKeyId || '',
        awsSecretAccessKey: state.settings.bedrockSecretAccessKey || '',
        apiVersion: '2024-02-15-preview',
      },
    });"""
assert old_map in s
s = s.replace(old_map, new_map)

open(p, 'w', encoding='utf8').write(s)
print('app.js patched')
