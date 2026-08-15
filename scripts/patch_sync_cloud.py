p = 'src/renderer/app.js'
s = open(p, encoding='utf8').read()

old = """  let key = '';
  if (p === 'openai') key = state.settings.openai;
  if (p === 'gemini') key = state.settings.gemini;
  if (p === 'anthropic') key = state.settings.anthropic || '';
  if ((p === 'openai' || p === 'gemini') && !key.trim()) {
    toast('Önce Araçlar → API anahtarını kaydedin', 'warn');
    return;
  }
  toast(`${p} modelleri çekiliyor…`, 'info', 2000);
  const res = await api.invoke('fetch-provider-models', { provider: p, apiKey: key });"""

new = """  let key = '';
  let opts = {};
  if (p === 'openai') key = state.settings.openai;
  if (p === 'gemini') key = state.settings.gemini;
  if (p === 'anthropic') key = state.settings.anthropic || '';
  if (['openrouter','xai','mistral','deepseek','cohere','perplexity','together','groq','cerebras','fireworks','replicate'].includes(p)) {
    key = state.settings[p] || '';
  }
  if (p === 'azure') { opts.endpoint = state.settings.azureEndpoint || ''; key = state.settings.azureApiKey || ''; }
  if (p === 'aws-bedrock') {
    opts = {
      region: state.settings.bedrockRegion || '',
      awsAccessKeyId: state.settings.bedrockAccessKeyId || '',
      awsSecretAccessKey: state.settings.bedrockSecretAccessKey || '',
    };
    key = state.settings.bedrockAccessKeyId || '';
  }
  if (p === 'lmstudio') { opts.endpoint = state.settings.lmstudioEndpoint || 'http://localhost:1234'; }
  if (p === 'custom') { opts.endpoint = state.settings.customEndpoint || ''; key = state.settings.customApiKey || ''; }
  if ((p === 'openai' || p === 'gemini' || p === 'custom' || p === 'azure') && !key.trim()) {
    toast('Önce Araçlar → API anahtarını kaydedin', 'warn');
    return;
  }
  toast(`${p} modelleri çekiliyor…`, 'info', 2000);
  const res = api
    ? await api.invoke(CLOUD_PROVIDERS.includes(p) ? 'multi-models' : 'fetch-provider-models', { provider: p, apiKey: key, options: opts })
    : null;"""

assert old in s
s = s.replace(old, new)

open(p, 'w', encoding='utf8').write(s)
print('syncCloudModels patched')
