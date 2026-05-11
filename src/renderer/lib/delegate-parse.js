/**
 * Parse //CALL:AgentName task... and //CALL_PARALLEL:AgentName task... from lead output.
 * @param {string} text
 * @returns {{ name: string, task: string, parallel: boolean }[]}
 */
function parseDelegateCalls(text) {
  if (!text || typeof text !== 'string') return [];
  const results = [];
  const re = /(\/\/CALL_PARALLEL:|\/\/CALL:)\s*([^\s\n]+)\s*([\s\S]*?)(?=\/\/CALL(?:_PARALLEL)?:|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const kind = (m[1] || '').toUpperCase();
    const name = (m[2] || '').trim();
    const task = (m[3] || '').trim();
    const parallel = kind.includes('PARALLEL');
    if (name) results.push({ name, task, parallel });
  }
  return results;
}

if (typeof window !== 'undefined') window.parseDelegateCalls = parseDelegateCalls;
if (typeof module !== 'undefined' && module.exports) module.exports = { parseDelegateCalls };
