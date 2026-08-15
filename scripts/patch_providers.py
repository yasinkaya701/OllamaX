import re

p = 'src/renderer/index.html'
s = open(p, encoding='utf8').read()

# 1) CSP connect-src
csp_new = ("connect-src 'self' https://api.github.com http://localhost:* http://127.0.0.1:* "
           "https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com "
           "https://openrouter.ai https://api.x.ai https://api.mistral.ai https://api.deepseek.com "
           "https://api.cohere.com https://api.perplexity.ai https://api.together.xyz https://api.groq.com "
           "https://api.cerebras.ai https://api.fireworks.ai https://api.replicate.com https://api.replicate.com "
           "https://*.amazonaws.com")
s = re.sub(r"connect-src [^;]+;", csp_new + ';', s)

# 2) provider tabs: make scrollable and add new providers
tabs_old = """          <button type="button" class="prov-btn" data-provider="gemini" title="Google Gemini">Gemini</button>
        </div>"""
tabs_new = """          <button type="button" class="prov-btn" data-provider="gemini" title="Google Gemini">Gemini</button>
          <button type="button" class="prov-btn" data-provider="openrouter" title="OpenRouter - 200+ model">OpenRouter</button>
          <button type="button" class="prov-btn" data-provider="xai" title="xAI Grok">xAI</button>
          <button type="button" class="prov-btn" data-provider="mistral" title="Mistral">Mistral</button>
          <button type="button" class="prov-btn" data-provider="deepseek" title="DeepSeek">DeepSeek</button>
          <button type="button" class="prov-btn" data-provider="groq" title="Groq - ultra hızlı">Groq</button>
          <button type="button" class="prov-btn" data-provider="cohere" title="Cohere">Cohere</button>
          <button type="button" class="prov-btn" data-provider="perplexity" title="Perplexity">Perplexity</button>
          <button type="button" class="prov-btn" data-provider="together" title="Together AI">Together</button>
          <button type="button" class="prov-btn" data-provider="cerebras" title="Cerebras">Cerebras</button>
          <button type="button" class="prov-btn" data-provider="fireworks" title="Fireworks">Fireworks</button>
          <button type="button" class="prov-btn" data-provider="replicate" title="Replicate">Replicate</button>
          <button type="button" class="prov-btn" data-provider="azure" title="Azure OpenAI">Azure</button>
          <button type="button" class="prov-btn" data-provider="aws-bedrock" title="Amazon Bedrock">Bedrock</button>
          <button type="button" class="prov-btn" data-provider="lmstudio" title="LM Studio (yerel)">LM Studio</button>
          <button type="button" class="prov-btn" data-provider="custom" title="Özel OpenAI-uyumlu uç nokta">Özel</button>
        </div>"""
assert tabs_old in s
s = s.replace(tabs_old, tabs_new)

# 3) agent-provider select options
sel_old = """        <option value="gemini">Google Gemini</option>
      </select>"""
sel_new = """        <option value="gemini">Google Gemini</option>
        <option value="openrouter">OpenRouter</option>
        <option value="xai">xAI Grok</option>
        <option value="mistral">Mistral</option>
        <option value="deepseek">DeepSeek</option>
        <option value="groq">Groq</option>
        <option value="cohere">Cohere</option>
        <option value="perplexity">Perplexity</option>
        <option value="together">Together AI</option>
        <option value="cerebras">Cerebras</option>
        <option value="fireworks">Fireworks</option>
        <option value="replicate">Replicate</option>
        <option value="azure">Azure OpenAI</option>
        <option value="aws-bedrock">Amazon Bedrock</option>
        <option value="lmstudio">LM Studio (yerel)</option>
        <option value="custom">Özel uç nokta</option>
      </select>"""
assert sel_old in s
s = s.replace(sel_old, sel_new)

# 4) settings API cards: insert before save-keys-row
def key_card(pid, name, badge, ph, hint):
    return f"""    <div class="api-provider-card" id="api-{pid}">
      <div class="api-prov-header">
        <div class="api-prov-name"><span class="api-prov-dot" id="dot-{pid}"></span>{name}</div>
        <span class="api-prov-badge {pid.replace('aws-bedrock','bedrock')}">{badge}</span>
      </div>
      <input id="{pid}-key" type="password" class="api-key-input" placeholder="{ph}">
      <div class="api-models-list" id="{pid}-model-rows"></div>
      <p class="api-prov-hint">{hint}</p>
    </div>
"""
cards = (
    key_card('openrouter','OpenRouter','200+ model','sk-or-…','200+ açık kaynak ve ticari modeli tek anahtarla. <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">openrouter.ai/keys</a>')
    + key_card('xai','xAI Grok','Grok','xAI-…','Grok 4 ve Grok Code modelleri. <a href="https://console.x.ai" target="_blank" rel="noopener">console.x.ai</a>')
    + key_card('mistral','Mistral','Mistral','Mis-…','Mistral Large, Codestral. <a href="https://console.mistral.ai" target="_blank" rel="noopener">console.mistral.ai</a>')
    + key_card('deepseek','DeepSeek','DeepSeek','sk-…','DeepSeek-V3 ve Reasoner. <a href="https://platform.deepseek.com" target="_blank" rel="noopener">platform.deepseek.com</a>')
    + key_card('groq','Groq','Groq','gsk_…','Ultra hızlı LPU inference (Llama, Qwen). <a href="https://console.groq.com" target="_blank" rel="noopener">console.groq.com</a>')
    + key_card('cohere','Cohere','Cohere','…','Command R ve Aya modelleri. <a href="https://dashboard.cohere.com" target="_blank" rel="noopener">dashboard.cohere.com</a>')
    + key_card('perplexity','Perplexity','Sonar','pplx-…','Sonar arama + muhakeme modelleri.')
    + key_card('together','Together','Together','…','Llama ve açık modeller, yüksek bağlam. <a href="https://api.together.xyz" target="_blank" rel="noopener">together.ai</a>')
    + key_card('cerebras','Cerebras','Cerebras','…','Cerebras wafer-scale hızla Llama/Qwen.')
    + key_card('fireworks','Fireworks','Fireworks','…','Fireworks AI hızlı inference.')
    + key_card('replicate','Replicate','Replicate','r8_…','Replicate bulut modelleri.')
)
special = """    <div class="api-provider-card" id="api-azure">
      <div class="api-prov-header">
        <div class="api-prov-name"><span class="api-prov-dot" id="dot-azure"></span>Azure OpenAI</div>
        <span class="api-prov-badge azure">Azure</span>
      </div>
      <input id="azure-endpoint" type="text" class="api-key-input" placeholder="https://&lt;resource&gt;.openai.azure.com">
      <input id="azure-key" type="password" class="api-key-input" placeholder="Azure API anahtarı">
      <div class="api-models-list" id="azure-model-rows"></div>
      <p class="api-prov-hint">Azure OpenAI hizmeti uç noktası + anahtar ( deployment/model adı ile). <a href="https://portal.azure.com" target="_blank" rel="noopener">portal.azure.com</a></p>
    </div>
    <div class="api-provider-card" id="api-aws-bedrock">
      <div class="api-prov-header">
        <div class="api-prov-name"><span class="api-prov-dot" id="dot-aws-bedrock"></span>Amazon Bedrock</div>
        <span class="api-prov-badge bedrock">AWS</span>
      </div>
      <input id="bedrock-region" type="text" class="api-key-input" placeholder="Bölge: us-east-1">
      <input id="bedrock-access-key" type="password" class="api-key-input" placeholder="AWS Access Key ID">
      <input id="bedrock-secret-key" type="password" class="api-key-input" placeholder="AWS Secret Access Key">
      <div class="api-models-list" id="aws-bedrock-model-rows"></div>
      <p class="api-prov-hint">AWS SigV4 imzalama ile Bedrock'ta Claude ve diğer modeller. Anahtarlar yalnızca yerelde saklanır.</p>
    </div>
    <div class="api-provider-card" id="api-lmstudio">
      <div class="api-prov-header">
        <div class="api-prov-name"><span class="api-prov-dot" id="dot-lmstudio"></span>LM Studio</div>
        <span class="api-prov-badge lmstudio">Yerel</span>
      </div>
      <input id="lmstudio-endpoint" type="text" class="api-key-input" placeholder="http://localhost:1234">
      <div class="api-models-list" id="lmstudio-model-rows"></div>
      <p class="api-prov-hint">Bilgisayarınızdaki LM Studio sunucusu — anahtarsız, tamamen yerel.</p>
    </div>
    <div class="api-provider-card" id="api-custom">
      <div class="api-prov-header">
        <div class="api-prov-name"><span class="api-prov-dot" id="dot-custom"></span>Özel Uç Nokta</div>
        <span class="api-prov-badge custom">OpenAI-uyumlu</span>
      </div>
      <input id="custom-endpoint" type="text" class="api-key-input" placeholder="https://sunucu-adresi/v1">
      <input id="custom-key" type="password" class="api-key-input" placeholder="API anahtarı (opsiyonel)">
      <div class="api-models-list" id="custom-model-rows"></div>
      <p class="api-prov-hint">OpenAI-uyumlu herhangi bir sunucu (vLLM, Ollama OpenAI portu, TGI …).</p>
    </div>
"""
anchor = '    <div class="save-keys-row">'
assert anchor in s
s = s.replace(anchor, cards + special + anchor)

open(p, 'w', encoding='utf8').write(s)
print('index.html patched')
