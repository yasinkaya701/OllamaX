'use strict';
/* ============================================================
 * V3.9 — Prompt Oluşturucu (Prompt Builder) + Slash özellik komutları
 *
 * /prompt  <fikir>      → Prompt Oluşturucu: ham fikri profesyonel sistem prompt'una çevirir
 * /improve <prompt>     → Mevcut prompt'u iyileştirir
 * /summarize [n]        → Son <n> yanıtı özetler
 * /extract              → Son yanıtın anahtar çıkarımlarını listeler
 * /translate            → Son kullanıcı mesajını model diline göre çevirir (EN/TR)
 * ============================================================ */
(function () {
  const PROMPT_BUILDER_PROMPT = `# PROMPT OLUŞTURUCU (Prompt Builder)

## KİMLİK
Sen uzman bir prompt mühendisisin. Kullanıcının ham, günlük dile yazılmış fikrini, talebini veya taslağını; AI modelleri için profesyonel, yapılandırılmış ve yüksek verimli bir SİSTEM PROMPT'una dönüştürürsün.

## GÖREV
1. Kullanıcının verdiği kısa fikri analiz et (ne yapmak istiyor, hangi rol, hangi çıktı).
2. Aşağıdaki yapıya uygun tam bir Markdown sistem prompt'u üret.

## ÜRETİM ŞABLONU (Markdown)
\`\`\`markdown
# [ROL ADI]

## KİMLİK
[Kim olduğu, hangi alanda uzman olduğu]

## GÖREV
[Nelер yapacağı, maddeler halinde]

## ÇALIŞMA TARZI
1. [Adım 1]
2. [Adım 2]
3. [Adım 3]

## ÇIKTI FORMATI
[Beklenen çıktının yapısı, örnek şablon]

## GÜVENLİK & SINIRLAR
- [Kapsam dışı şeyler]
- [Güvenlik kuralları]
\`\`\`

## ÇALIŞMA KURALLARI
- Çıktı SADECE Markdown prompt bloğu olmalı; açıklama kısa tut (1-2 cümle + nasıl kullanılacağı).
- Prompt'u OllamaX ajan rollerine KOPYALANABİLECEK şekilde yaz (kopyala-yapıştır uyumlu).
- Fikir belirsizse en yaygın yorumla üret ama [köşeli parantez] içinde doldurulması gereken alanlar bırak.
- Türkçe fikir Türkçe prompt üretir; İngilizce fikir İngilizce prompt üretir.

## YASAKLAR
- Kod yazma, uygulama geliştirme veya görevi kendin YAPMA — sadece PROMPT ÜRET.`;

  const IMPROVER_PROMPT = `# PROMPT İYİLEŞTİRİCİ

## KİMLİK
Sen uzman bir prompt mühendisisin. Var olan bir sistem prompt'unu daha net, yapılandırılmış ve etkili hale getirirsin.

## GÖREV
1. Verilen prompt'un zayıf noktalarını tespit et (belirsizlik, eksik çıktı formatı, zayıf güvenlik kuralları).
2. İyileştirilmiş, zengin Markdown versiyonunu üret.

## KURALLAR
- Orijinal amaca sadık kal; kapsamı genişletme.
- Çıktı SADECE Markdown prompt bloğu olsun; başına 1-2 cümle iyileştirme notu ekleyebilirsin.`;

  function extractSlash(cmd, raw) {
    const m = new RegExp('^/' + cmd + '\\s*(.*)$', 'i').exec(raw.trim());
    return m ? m[1].trim() : null;
  }

  function showBubble(content, title) {
    if (typeof window.addAIBubble === 'function') return window.addAIBubble(content, title || 'Prompt Builder', null);
    const area = document.getElementById('chat-area');
    if (area) {
      const b = document.createElement('div');
      b.className = 'bubble ai';
      b.innerHTML = `<strong>${title || 'Prompt Builder'}</strong><pre style="white-space:pre-wrap">${content}</pre>`;
      area.appendChild(b);
      area.scrollTop = area.scrollHeight;
    }
  }

  function lastHistory(role) {
    const st = ((window.OllamaX?.state || window.state) && (window.OllamaX?.state || window.state).history) || [];
    for (let i = st.length - 1; i >= 0; i--) if (st[i].role === role) return st[i];
    return null;
  }

  /* /summarize [n]: son n yanıtı özetle */
  function trySummarize(raw) {
    const arg = extractSlash('summarize', raw);
    if (arg === null) return false;
    const n = Number(/^\d+$/.test(arg) ? arg : '1') || 1;
    const history = ((window.OllamaX?.state || window.state) && (window.OllamaX?.state || window.state).history) || [];
    const answers = history.filter((h) => h.role === 'assistant').slice(-n);
    if (!answers.length) {
      showBubble('Özetlenecek yanıt bulunamadı. Önce bir model yanıtı alın.', 'Prompt Builder');
      return true;
    }
    const merged = answers.map((a, i) => `## Yanıt ${i + 1} (${a.agentName || a.provider || '?'})\n\n${a.content}`).join('\n\n---\n\n');
    void sendToolMessage('summarize', `Aşağıdaki yapay zeka yanıtlarını TÜRKÇE, kısa ve maddeli şekilde özetle:\n\n${merged}`);
    return true;
  }

  /* /extract: son yanıtın anahtar çıkarımları */
  function tryExtract(raw) {
    if (extractSlash('extract', raw) === null) return false;
    const a = lastHistory('assistant');
    if (!a) {
      showBubble('Çıkarım yapılacak yanıt bulunamadı.', 'Prompt Builder');
      return true;
    }
    void sendToolMessage('extract', `Aşağıdaki yanıtın anahtar çıkarımlarını (key takeaways) TÜRKÇE, numaralı ve kısa maddeler halinde listele:\n\n${a.content}`);
    return true;
  }

  /* /translate: son kullanıcı mesajını diğer dile çevir (EN↔TR) */
  function tryTranslate(raw) {
    if (extractSlash('translate', raw) === null) return false;
    const u = lastHistory('user');
    if (!u) {
      showBubble('Çevrilecek mesaj bulunamadı.', 'Prompt Builder');
      return true;
    }
    const target = /[a-zA-Z]/.test(u.content) ? 'Türkçe' : 'English';
    void sendToolMessage('translate', `Aşağıdaki metni ${target} diline çevir. Sadece çeviriyi ver:\n\n${u.content}`);
    return true;
  }

  /* /prompt veya /improve: modelle prompt üret */
  function tryPrompt(raw) {
    const idea = extractSlash('prompt', raw);
    const isImprove = extractSlash('improve', raw) !== null || raw.trim().toLowerCase() === '/improve';
    if (idea === null && !isImprove) return false;
    const payload = isImprove
      ? (lastHistory('assistant')?.content || lastHistory('user')?.content || '')
      : (idea || '');
    if (isImprove && !payload) {
      showBubble('İyileştirilecek prompt bulunamadı. Son mesajdan yararlanmayı denedim.', 'Prompt Builder');
      return true;
    }
    if (!isImprove && !payload) {
      showBubble('Lütfen bir fikir belirtin: /prompt <fikir>  (ör. /prompt web sitesi trafiğini analiz eden bir ajan)', 'Prompt Builder');
      return true;
    }
    const sys = isImprove ? IMPROVER_PROMPT : PROMPT_BUILDER_PROMPT;
    const userText = isImprove
      ? `İyileştirilecek prompt:\n\n${payload}`
      : `Fikir:\n\n${payload}`;
    void sendToolMessage(isImprove ? 'improve' : 'prompt', `${sys}\n\n${userText}`);
    return true;
  }

  function sendToolMessage(tool, userText) {
    return new Promise((resolve) => {
      const api = window.api;
      const state = window.OllamaX?.state || window.state;
      const q = window.q;
      if (!api || !api.send) { resolve(); return; }
      const area = q('#chat-area');
      if (area) area.querySelector('.welcome-screen')?.remove();
      if (typeof window.addUserBubble === 'function') window.addUserBubble(`/${tool} komutu çalıştı…`);
      const agentId = 'slash-' + tool + '-' + Date.now();
      const agentEl = document.createElement('div');
      agentEl.className = 'msg-wrap msg-ai';
      const lbl = document.createElement('div');
      lbl.className = 'agent-lbl';
      lbl.innerHTML = `Prompt Builder <span class="prov-badge">/${tool.toUpperCase()}</span>`;
      agentEl.appendChild(lbl);
      const bubble = document.createElement('div');
      bubble.className = 'bubble ai-bub';
      bubble.innerHTML = '<span class="dots">●●●</span>';
      agentEl.appendChild(bubble);
      area.appendChild(agentEl);
      if (area) area.scrollTop = area.scrollHeight;
      let full = '';
      let done = false;
      state._activeStreams[agentId] = {
        onChunk(d) {
          full += d.content;
          const mdFn = window.OllamaX?.md || window.md;
          if (typeof mdFn === 'function') bubble.innerHTML = mdFn(full);
          else bubble.textContent = full;
          if (area) area.scrollTop = area.scrollHeight;
        },
        onDone() {
          if (done) return;
          done = true;
          delete state._activeStreams[agentId];
          if (full) state.history.push({ role: 'assistant', content: full, agentName: 'Prompt Builder', provider: state.currentProvider || 'ollama' });
          if (typeof state.save === 'function') state.save();
          resolve();
        },
      };
      const prov = (state.settings && state.settings.currentProvider) || state.currentProvider || 'ollama';
      const model = (state.settings && state.settings.currentModel) || state.currentModel || (q('#model-select') && q('#model-select').value) || '';
      api.send('slash-tool', { tool, msgs: [{ role: 'user', content: userText }], prov, model });
      setTimeout(() => { if (!done) state._activeStreams[agentId]?.onDone(); }, 185000);
    });
  }

  const SLASH_HANDLERS = [tryPrompt, trySummarize, tryExtract, tryTranslate];

  window.OllamaX = window.OllamaX || {};
  window.OllamaX.promptBuilder = {
    PROMPT_BUILDER_PROMPT,
    IMPROVER_PROMPT,
    trySlash(raw) {
      for (const h of SLASH_HANDLERS) if (h(raw)) return true;
      return false;
    },
    tryPrompt,
    trySummarize,
    tryExtract,
    tryTranslate,
  };
})();
