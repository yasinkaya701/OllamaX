const STORAGE_KEY = 'ollamax_v4_permanent';
let ipc = null;
try { ipc = require('electron').ipcRenderer; } catch(e) {}

const PROMPT_TEMPLATES = [
    { id: 'research', icon: '🔬', label: 'Research Assistant', prompt: 'You are an expert research assistant. Analyze topics thoroughly, cite reasoning, identify key insights, and present findings in a structured way. Be precise and comprehensive.' },
    { id: 'coding',   icon: '💻', label: 'Coding Expert',      prompt: 'You are a senior software engineer. Write clean, well-commented, production-ready code. Explain architectural decisions, suggest best practices, and debug systematically.' },
    { id: 'writing',  icon: '✍️', label: 'Writing Assistant',  prompt: 'You are a professional writer and editor. Help craft clear, engaging, and well-structured content. Adapt tone and style to the context.' },
    { id: 'data',     icon: '📊', label: 'Data Analyst',       prompt: 'You are a data analyst. Help interpret data, suggest visualizations, write analysis code (Python/SQL), and draw actionable insights from datasets.' },
    { id: 'devops',   icon: '🚀', label: 'DevOps Engineer',    prompt: 'You are a DevOps expert. Help with CI/CD pipelines, Docker, Kubernetes, cloud infrastructure, shell scripting, and system administration.' },
    { id: 'tutor',    icon: '🎓', label: 'Learning Tutor',     prompt: 'You are a patient and knowledgeable tutor. Explain concepts step-by-step, use analogies, check understanding, and adapt to the learner\'s level.' },
    { id: 'creative', icon: '🎨', label: 'Creative Thinker',   prompt: 'You are a creative thinker and brainstormer. Generate innovative ideas, explore unconventional approaches, and help break through creative blocks.' },
    { id: 'review',   icon: '🔍', label: 'Code Reviewer',      prompt: 'You are a thorough code reviewer. Check for bugs, security vulnerabilities, performance issues, and adherence to best practices. Provide constructive feedback.' },
    { id: 'lead',     icon: '⭐', label: 'Orchestrator',      prompt: 'You are the Lead Agent (Orchestrator). Your job is to analyze the user request and delegate sub-tasks to specialized agents using the format "//CALL:AgentName task description". You can call multiple agents. Always summarize their work at the end.' },
];

const FEATURED_REPOS = [
    { q: 'karpathy/nanoGPT',        label: 'nanoGPT',        icon: '🧠', desc: 'Minimal GPT training from scratch' },
    { q: 'ollama/ollama',           label: 'Ollama',         icon: '🦙', desc: 'Run LLMs locally' },
    { q: 'ggerganov/llama.cpp',     label: 'llama.cpp',      icon: '⚡', desc: 'LLM inference in C/C++' },
    { q: 'langchain-ai/langchain',  label: 'LangChain',      icon: '🔗', desc: 'LLM application framework' },
    { q: 'openai/whisper',          label: 'Whisper',        icon: '🎤', desc: 'Speech recognition by OpenAI' },
    { q: 'huggingface/transformers',label: 'Transformers',   icon: '🤗', desc: 'State-of-the-art ML models' },
    { q: 'AUTOMATIC1111 stable-diffusion', label: 'Stable Diffusion', icon: '🎨', desc: 'Image generation AI' },
    { q: 'microsoft autogen',       label: 'AutoGen',        icon: '🤖', desc: 'Multi-agent conversation framework' },
    { q: 'openai/openai-cookbook',  label: 'OpenAI Cookbook',icon: '📖', desc: 'OpenAI API examples & guides' },
    { q: 'comfyanonymous ComfyUI',  label: 'ComfyUI',        icon: '🎛️', desc: 'Node-based Stable Diffusion UI' },
    { q: 'continuedev/continue',    label: 'Continue',       icon: '🔧', desc: 'Open-source AI code assistant' },
    { q: 'lobehub/lobe-chat',       label: 'LobeChat',       icon: '💬', desc: 'Modern ChatGPT/Claude UI' },
];

const MODEL_LISTS = {
    ollama:    [],
    openai:    ['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo','o1-mini','o1-preview','o3-mini'],
    anthropic: ['claude-3-5-sonnet-20241022','claude-3-5-haiku-20241022','claude-3-opus-20240229','claude-3-haiku-20240307'],
    gemini:    ['gemini-2.0-flash-exp','gemini-1.5-pro','gemini-1.5-flash','gemini-1.5-flash-8b','gemini-pro'],
};

const state = {
    agents: [],
    history: [],
    settings: { openai: '', anthropic: '', gemini: '', ollamaHost: 'localhost:11434' },
    currentProvider: 'ollama',
    currentModel: '',
    currentDir: '',
    processing: false,
    logCount: 0,
};

const q  = s => document.querySelector(s);
const qa = s => [...document.querySelectorAll(s)];
const on = (id, ev, fn) => { const el = q('#'+id); if(el) el.addEventListener(ev, fn); };

window.addEventListener('DOMContentLoaded', () => {
    loadState();
    renderAgentList();
    renderTemplates();
    renderFeaturedRepos();
    bindAll();
    populateModelSelect('ollama');
    updateApiDots();
    if (ipc) { bindIPC(); ipc.send('get-models', state.settings.ollamaHost); ipc.send('get-stats'); setInterval(()=>ipc.send('get-stats'), 6000); }
    log('OllamaX Ultra v4 ready', 'success');
});

function loadState() {
    try {
        const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (s?.agents?.length) state.agents = s.agents;
        if (s?.settings) Object.assign(state.settings, s.settings);
    } catch(e) {}
    if (!state.agents.length)
        state.agents = [{ id:'master', name:'Master AI', model:'llama3.2:1b', provider:'ollama', prompt:'You are a helpful AI assistant.', role:'lead', active:true }];
    q('#openai-key').value    = state.settings.openai    || '';
    q('#anthropic-key').value = state.settings.anthropic || '';
    q('#gemini-key').value    = state.settings.gemini    || '';
    q('#ollama-host').value   = state.settings.ollamaHost|| 'localhost:11434';
}
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({agents:state.agents,settings:state.settings})); } catch(e){} }

// ── RENDER SIDEBAR ───────────────────────────────────────────────
function renderAgentList() {
    const list = q('#agent-list'); list.innerHTML = '';
    state.agents.forEach(a => {
        const d = document.createElement('div');
        d.className = 'agent-card' + (a.active ? ' active' : '');
        d.innerHTML = `<div class="a-dot"></div><div class="a-info"><div class="a-name">${esc(a.name)}${a.role==='lead'?'<span class="lead-tag">LEAD</span>':''}</div><div class="a-model">${esc(a.model)}</div></div><button class="del-x" data-id="${a.id}">✕</button>`;
        d.querySelector('.del-x').addEventListener('click', e => { e.stopPropagation(); if(state.agents.length>1){state.agents=state.agents.filter(x=>x.id!==e.target.dataset.id);save();renderAgentList();} });
        d.addEventListener('click', () => { a.active=!a.active; save(); renderAgentList(); });
        list.appendChild(d);
    });
}

function renderTemplates() {
    const list = q('#template-list'); list.innerHTML = '';
    PROMPT_TEMPLATES.forEach(t => {
        const d = document.createElement('div'); d.className = 'tmpl-item';
        d.innerHTML = `<span class="tmpl-icon">${t.icon}</span><span class="tmpl-label">${t.label}</span>`;
        d.addEventListener('click', () => { q('#agent-prompt').value = t.prompt; openModal('agent-modal'); });
        list.appendChild(d);
    });
    // Also populate pills in modal
    const pills = q('#prompt-pills'); pills.innerHTML = '';
    PROMPT_TEMPLATES.forEach(t => {
        const b = document.createElement('button'); b.className = 'tmpl-pill';
        b.textContent = t.icon + ' ' + t.label;
        b.addEventListener('click', () => { q('#agent-prompt').value = t.prompt; });
        pills.appendChild(b);
    });
}

function renderFeaturedRepos() {
    const el = q('#repo-chips'); el.innerHTML = '';
    FEATURED_REPOS.forEach(r => {
        const b = document.createElement('button'); b.className = 'repo-chip';
        b.innerHTML = `<span class="chip-icon">${r.icon}</span><div><div class="chip-name">${r.label}</div><div class="chip-desc">${r.desc}</div></div>`;
        b.addEventListener('click', () => {
            q('#github-search-input').value = r.q;
            showToolsTab('github');
            if(!q('#tools-panel').classList.contains('hidden')) runGithubSearch();
            else { q('#tools-panel').classList.remove('hidden'); runGithubSearch(); }
        });
        el.appendChild(b);
    });
}

// ── PROVIDER / MODEL SELECT ──────────────────────────────────────
function populateModelSelect(provider) {
    state.currentProvider = provider;
    const sel = q('#model-select'); sel.innerHTML = '';
    const models = MODEL_LISTS[provider] || [];
    if (!models.length) { sel.innerHTML = '<option>No models loaded</option>'; }
    models.forEach(m => { const o = new Option(m, m); sel.appendChild(o); });
    if (models.length) { sel.selectedIndex = 0; state.currentModel = models[0]; }
    updateModelLabel();
    // Update active provider button
    qa('.prov-btn').forEach(b => b.classList.toggle('active', b.dataset.provider === provider));
}

function updateModelLabel() {
    const m = q('#model-select').value;
    const lbl = q('#current-model-label');
    if(lbl) lbl.textContent = m ? `${state.currentProvider}/${m}` : '—';
}

// ── BIND ALL EVENTS ──────────────────────────────────────────────
function bindAll() {
    // Sidebar
    on('btn-hide-sidebar','click',()=>{ q('#sidebar').classList.add('collapsed'); q('#btn-show-sidebar').classList.remove('hidden'); });
    on('btn-show-sidebar','click',()=>{ q('#sidebar').classList.remove('collapsed'); q('#btn-show-sidebar').classList.add('hidden'); });

    // Provider tabs
    qa('.prov-btn').forEach(b => b.addEventListener('click', () => {
        populateModelSelect(b.dataset.provider);
        if(b.dataset.provider==='ollama' && ipc) ipc.send('get-models', state.settings.ollamaHost);
    }));
    on('model-select','change',()=>{ state.currentModel=q('#model-select').value; updateModelLabel(); });

    // Tools panel
    on('btn-toggle-tools','click',()=>q('#tools-panel').classList.toggle('hidden'));
    qa('.ttab').forEach(b=>b.addEventListener('click',()=>showToolsTab(b.dataset.ttab)));

    // Chat
    on('btn-send','click',sendMessage);
    on('btn-clear-chat','click',clearChat);
    q('#msg-input').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}});
    q('#msg-input').addEventListener('input',e=>{
        e.target.style.height='auto'; e.target.style.height=Math.min(e.target.scrollHeight,200)+'px';
        q('#char-count').textContent=e.target.value.length;
    });

    // Agents
    on('btn-add-agent','click',()=>{ populateAgentModelSelect('ollama'); openModal('agent-modal'); });
    on('btn-save-agent','click',saveAgent);
    on('agent-provider','change',(e)=>populateAgentModelSelect(e.target.value));

    // Settings
    on('btn-settings','click',()=>openModal('settings-modal'));
    on('btn-save-settings','click',saveSettings);
    on('btn-save-keys','click',saveApiKeys);

    // Modals close
    qa('.modal-bg,.modal-x,.modal-x-btn').forEach(el=>el.addEventListener('click',()=>{ el.closest('.modal')?.classList.add('hidden'); }));

    // GitHub
    on('btn-github-search','click',runGithubSearch);
    q('#github-search-input').addEventListener('keydown',e=>{if(e.key==='Enter')runGithubSearch();});

    // Files
    on('btn-open-folder','click',()=>ipc&&ipc.send('open-folder-dialog'));
    on('btn-go-parent','click',()=>{ if(state.currentDir&&ipc){const p=state.currentDir.split('/').slice(0,-1).join('/')||'/';ipc.send('list-dir',p);} });
    on('btn-close-preview','click',()=>q('#file-preview').classList.add('hidden'));

    // Models pull
    on('btn-pull-model','click',()=>{
        const m=q('#pull-model-input').value.trim();
        if(m&&ipc){ipc.send('pull-model',{host:state.settings.ollamaHost,model:m});q('#pull-progress').classList.remove('hidden');log(`Pulling ${m}…`,'info');}
    });

    // API model rows
    qa('.api-model-row').forEach(el=>el.addEventListener('click',()=>{
        const prov=el.dataset.provider, model=el.dataset.model;
        populateModelSelect(prov);
        setTimeout(()=>{q('#model-select').value=model;state.currentModel=model;updateModelLabel();},50);
        qa('.api-model-row').forEach(r=>r.classList.remove('selected'));
        el.classList.add('selected');
        log(`Model selected: ${prov}/${model}`,'info');
    }));

    // Console toggle
    on('console-toggle','click',()=>q('#system-console').classList.toggle('collapsed'));
}

// ── IPC LISTENERS ────────────────────────────────────────────────
function bindIPC() {
    ipc.on('models-list',(_, models)=>{
        MODEL_LISTS.ollama = models.map(m=>m.name);
        const list=q('#local-models-list'); list.innerHTML='';
        if(!models.length){list.innerHTML='<div class="empty-note">No models. Run: <code>ollama pull llama3.2:1b</code></div>';return;}
        models.forEach(m=>{
            const d=document.createElement('div'); d.className='model-item';
            const sz=m.size?(m.size/1e9).toFixed(1)+' GB':'';
            d.innerHTML=`<span class="mi-name">${esc(m.name)}</span><span class="mi-size">${sz}</span>`;
            d.addEventListener('click',()=>{
                if(state.currentProvider==='ollama'){populateModelSelect('ollama');setTimeout(()=>{q('#model-select').value=m.name;state.currentModel=m.name;updateModelLabel();},50);}
                log(`Model: ${m.name}`,'info');
            });
            list.appendChild(d);
        });
        if(state.currentProvider==='ollama') populateModelSelect('ollama');
        log(`${models.length} local models loaded`,'success');
    });
    ipc.on('stats',(_,d)=>{
        q('#ram-text').textContent=`${d.used}/${d.total} GB`;
        const bar=q('#ram-bar');
        bar.style.width=d.percent+'%';
        bar.style.background=d.percent>85?'var(--red)':d.percent>65?'var(--orange)':'var(--green)';
        if(d.cpu) q('#cpu-text').textContent=d.cpu.length>35?d.cpu.slice(0,33)+'…':d.cpu;
    });
    ipc.on('github-results',(_,data)=>{
        const list=q('#github-results-list'); list.innerHTML='';
        if(!data.items?.length){list.innerHTML='<div class="empty-note">No results.</div>';return;}
        data.items.forEach(repo=>{
            const d=document.createElement('div'); d.className='repo-card';
            d.innerHTML=`<div class="rc-name">${esc(repo.full_name)}</div><div class="rc-meta">⭐ ${(repo.stargazers_count||0).toLocaleString()} · ${repo.language||'?'}</div><div class="rc-desc">${esc((repo.description||'').slice(0,90))}</div><button class="clone-btn" data-url="${repo.clone_url}">⬇ Clone</button>`;
            d.querySelector('.clone-btn').addEventListener('click',e=>{
                const url=e.currentTarget.dataset.url;
                ipc.send('git-clone',{url});
                e.currentTarget.textContent='⏳ Cloning…'; e.currentTarget.disabled=true;
                log(`git clone ${url}`,'info');
            });
            list.appendChild(d);
        });
        log(`${data.items.length} repos found`,'success');
    });
    ipc.on('exec-output',(_,d)=>log(d.data.trimEnd(),d.type==='stderr'?'warn':'info'));
    ipc.on('git-done',(_,d)=>{log(d.success?`✅ Cloned to: ${d.dir}`:'❌ Clone failed',d.success?'success':'error');});
    ipc.on('dir-contents',(_,{path:p,items})=>{
        state.currentDir=p; q('#file-breadcrumb').textContent=p;
        const tree=q('#file-tree'); tree.innerHTML='';
        if(!items.length){tree.innerHTML='<div class="empty-note">Empty folder</div>';return;}
        items.forEach(it=>{
            const d=document.createElement('div'); d.className='file-item'+(it.isDir?' is-dir':'');
            d.innerHTML=`<span>${it.isDir?'📁':'📄'}</span><span class="fi-name">${esc(it.name)}</span>`;
            d.addEventListener('click',()=>{ const fp=p.replace(/\/$/,'')+'/'+it.name; it.isDir?ipc.send('list-dir',fp):ipc.send('read-file',fp); });
            tree.appendChild(d);
        });
    });
    ipc.on('folder-selected',(_,folder)=>{ ipc.send('list-dir',folder); showToolsTab('files'); q('#tools-panel').classList.remove('hidden'); });
    ipc.on('file-content',(_,{path:p,content})=>{ q('#preview-filename').textContent=p.split('/').pop(); q('#preview-content').textContent=content; q('#file-preview').classList.remove('hidden'); });
    ipc.on('pull-progress',(_,d)=>{
        const bar=q('#pull-bar'); const status=q('#pull-status');
        if(d.total&&d.completed){bar.style.width=Math.round((d.completed/d.total)*100)+'%';}
        if(d.status){status.textContent=d.status;}
    });
    ipc.on('pull-done',(_,d)=>{ q('#pull-progress').classList.add('hidden'); ipc.send('get-models',state.settings.ollamaHost); log(`Pull done: ${d.model}`,'success'); });
}

// ── GITHUB SEARCH ────────────────────────────────────────────────
function runGithubSearch() {
    const v=q('#github-search-input').value.trim();
    if(!v||!ipc)return;
    q('#github-results-list').innerHTML='<div class="empty-note">Searching…</div>';
    ipc.send('github-search',{query:v});
}

// ── AGENT CRUD ───────────────────────────────────────────────────
function populateAgentModelSelect(provider) {
    const sel = q('#agent-model-select'); sel.innerHTML = '';
    const models = MODEL_LISTS[provider] || [];
    if (!models.length) { 
        if(provider === 'ollama') {
            MODEL_LISTS.ollama.forEach(m => sel.add(new Option(m, m)));
        } else {
            sel.add(new Option('No models available', ''));
        }
    } else {
        models.forEach(m => sel.add(new Option(m, m)));
    }
}

function saveAgent() {
    const name = q('#agent-name').value.trim();
    const provider = q('#agent-provider').value;
    const model = q('#agent-model-select').value;
    if(!name || !model){alert('Name and Model are required'); return;}
    
    state.agents.push({
        id: Date.now().toString(),
        name, 
        model, 
        provider,
        prompt: q('#agent-prompt').value.trim(),
        role: q('#agent-role').value,
        active: true
    });
    save(); renderAgentList(); closeModal('agent-modal');
    q('#agent-name').value=''; q('#agent-prompt').value='ollama'; // reset provider to default
    populateAgentModelSelect('ollama'); 
    q('#agent-prompt').value='';
    log(`Agent added: ${name} (${provider}/${model})`,'success');
}

// ── SETTINGS ─────────────────────────────────────────────────────
function saveApiKeys() {
    state.settings.openai=q('#openai-key').value.trim();
    state.settings.anthropic=q('#anthropic-key').value.trim();
    state.settings.gemini=q('#gemini-key').value.trim();
    save(); updateApiDots(); log('API keys saved ✓','success');
}
function saveSettings() {
    state.settings.ollamaHost=q('#ollama-host').value.trim()||'localhost:11434';
    save(); closeModal('settings-modal');
    if(ipc) ipc.send('get-models',state.settings.ollamaHost);
    log('Settings saved','success');
}
function updateApiDots() {
    const set=(id,has)=>{ const el=q('#'+id); if(el){el.style.background=has?'var(--green)':'var(--text-3)';el.title=has?'Key set':'No key';} };
    set('dot-openai',!!state.settings.openai);
    set('dot-anthropic',!!state.settings.anthropic);
    set('dot-gemini',!!state.settings.gemini);
}

// ── CHAT ─────────────────────────────────────────────────────────
async function sendMessage() {
    const inp=q('#msg-input'), text=inp.value.trim();
    if(!text||state.processing)return;
    const active=state.agents.filter(a=>a.active);
    if(!active.length){alert('Select at least one agent');return;}
    inp.value=''; inp.style.height='auto'; q('#char-count').textContent='0';
    q('#chat-area .welcome-screen')?.remove();
    addUserBubble(text);
    state.history.push({role:'user',content:text});
    state.processing=true; setStatus('processing');
    await Promise.all(active.map(a=>runAgent(a)));
    state.processing=false; setStatus('ready');
}

function runAgent(agent) {
    return new Promise(resolve=>{
        if(!ipc){addAIBubble('⚠️ Electron required.',agent.name);resolve();return;}
        const bubble=addAIBubble('',agent.name);
        let full='', done=false;
        
        // Agent's own settings take priority
        const prov = agent.provider || state.currentProvider;
        const model = agent.model || q('#model-select').value;
        
        // Inject orchestration context for Lead agents
        let sysPrompt = agent.prompt || '';
        if (agent.role === 'lead') {
            const others = state.agents.filter(a => a.id !== agent.id).map(a => a.name).join(', ');
            sysPrompt += `\n\n[ORCHESTRATION CONTEXT]: You can delegate tasks to these available agents: ${others}. Use "//CALL:AgentName task" to invoke them.`;
        }

        const msgs = [...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []), ...state.history];
        log(`${agent.name} [${prov}] → ${model}`, 'info');
        
        if (prov === 'ollama') ipc.send('chat', { agentId: agent.id, host: state.settings.ollamaHost, model, messages: msgs });
        else if (prov === 'openai')    ipc.send('openai-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.openai });
        else if (prov === 'anthropic') ipc.send('anthropic-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.anthropic });
        else if (prov === 'gemini')    ipc.send('gemini-chat', { agentId: agent.id, model, messages: msgs, apiKey: state.settings.gemini });
        
        const onChunk=(_,d)=>{ if(d.agentId!==agent.id)return; full+=d.content; bubble.innerHTML=md(full); scrollChat(); };
        const onDone=(_,d)=>{ if(d.agentId!==agent.id)return; cleanup(); if(full)state.history.push({role:'assistant',content:full}); if(agent.role==='lead')tryDelegate(agent,full); log(`${agent.name} done (${full.length} chars)`,'success'); done=true; resolve(); };
        function cleanup(){ipc.removeListener('chat-chunk',onChunk);ipc.removeListener('chat-done',onDone);}
        ipc.on('chat-chunk',onChunk); ipc.on('chat-done',onDone);
        setTimeout(()=>{if(!done){cleanup();resolve();}},180000);
    });
}

function tryDelegate(lead, content) {
    const re=/\/\/CALL:(\S+)\s+([\s\S]+?)(?=\/\/CALL:|$)/g; let m;
    while((m=re.exec(content))!==null){
        const target=state.agents.find(a=>a.name.toLowerCase()===m[1].toLowerCase());
        if(target){log(`⭐ ${lead.name} → ${target.name}`,'info');state.history.push({role:'user',content:m[2].trim()});runAgent(target);}
    }
}

// ── CHAT BUBBLES ─────────────────────────────────────────────────
function addUserBubble(text) {
    const area=q('#chat-area'), w=el('div','msg-wrap msg-user'), b=el('div','bubble user-bub');
    b.textContent=text; w.appendChild(b); area.appendChild(w); scrollChat();
}
function addAIBubble(text, name) {
    const area=q('#chat-area'), w=el('div','msg-wrap msg-ai');
    if(name){const l=el('div','agent-lbl');l.textContent=name;w.appendChild(l);}
    const b=el('div','bubble ai-bub');
    b.innerHTML=text?md(text):'<span class="dots">●●●</span>';
    w.appendChild(b); area.appendChild(w); scrollChat(); return b;
}
function clearChat(){q('#chat-area').innerHTML='<div class="welcome-screen"><div class="welcome-hex">⬡</div><h1>OllamaX Ultra</h1><p>Professional AI Agent Studio</p></div>';state.history=[];}

// ── MARKDOWN ─────────────────────────────────────────────────────
function md(raw) {
    const blocks=[]; let s=raw.replace(/```(\w*)\n?([\s\S]*?)```/g,(_,lang,code)=>{blocks.push(`<pre><code class="l-${esc(lang)}">${esc(code)}</code></pre>`);return`\x00${blocks.length-1}\x00`;});
    s=esc(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/^###\s(.+)$/gm,'<h3>$1</h3>').replace(/^##\s(.+)$/gm,'<h2>$1</h2>').replace(/^#\s(.+)$/gm,'<h1>$1</h1>').replace(/^[-*]\s(.+)$/gm,'<li>$1</li>').replace(/\n/g,'<br>');
    return s.replace(/\x00(\d+)\x00/g,(_,i)=>blocks[+i]);
}

// ── UTILS ─────────────────────────────────────────────────────────
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function el(tag,cls){const e=document.createElement(tag);if(cls)e.className=cls;return e;}
function scrollChat(){const a=q('#chat-area');if(a)a.scrollTop=a.scrollHeight;}
function setStatus(t){const p=q('#status-pill');p.className='status-pill '+t;p.textContent=t==='processing'?'● Processing…':'● Ready';}
function log(msg,type='info'){
    const out=q('#console-output');if(!out)return;
    const d=el('div','log-l log-'+type);d.textContent=`[${new Date().toLocaleTimeString()}] ${msg}`;
    out.appendChild(d);out.scrollTop=out.scrollHeight;
    state.logCount++;const b=q('#log-count');if(b)b.textContent=state.logCount;
    if(type==='error')q('#system-console')?.classList.remove('collapsed');
}
function openModal(id){q('#'+id)?.classList.remove('hidden');}
function closeModal(id){q('#'+id)?.classList.add('hidden');}
function showToolsTab(id){
    qa('.ttab').forEach(b=>b.classList.toggle('active',b.dataset.ttab===id));
    qa('.ttab-pane').forEach(p=>p.classList.toggle('active',p.id==='ttab-'+id));
}
