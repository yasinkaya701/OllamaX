'use strict';
/* Debug: slash komutu davranışını sayfada incele */
const http = require('http');
const WS = globalThis.WebSocket;

http.get('http://localhost:9222/json', (r) => {
  let d = '';
  r.on('data', (c) => (d += c));
  r.on('end', async () => {
    const t = JSON.parse(d).find((x) => x.type === 'page');
    const ws = new WS(t.webSocketDebuggerUrl);
    let id = 0;
    const pend = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data));
      const p = pend.get(m.id);
      if (p) { pend.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    });
    await new Promise((r2) => ws.addEventListener('open', r2));
    const call = (m, p = {}) => new Promise((rs, rj) => { pend.set(++id, { resolve: rs, reject: rj }); ws.send(JSON.stringify({ id, method: m, params: p })); });
    const r = await call('Runtime.evaluate', {
      expression: `(function(){
        try {
          const pb = window.OllamaX.promptBuilder;
          const st = window.OllamaX.state;
          const outs = {};
          outs.prompt = pb.trySlash('/prompt test');
          outs.improve = pb.trySlash('/improve');
          outs.unknown = pb.trySlash('/xx');
          outs.historyLen = (st.history || []).length;
          outs.userBubbles = document.querySelectorAll('.msg-user').length;
          outs.aiBubbles = document.querySelectorAll('.msg-ai').length;
          outs.apiSend = typeof window.api.send;
          outs.q = typeof window.q;
          outs.userBubbleArg = (st.history[st.history.length-1]||{}).content;
          return JSON.stringify(outs);
        } catch (e) {
          return 'ERR: ' + e.message + ' | stack: ' + (e.stack||'').split('\\n').slice(0,3).join(' ; ');
        }
      })()`,
      returnByValue: true,
    });
    if (r.exceptionDetails) console.log('EXC:', JSON.stringify(r.exceptionDetails.text || r.exceptionDetails.exception?.description));
    console.log(r.result.value);
    process.exit(0);
  });
});
