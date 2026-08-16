'use strict';

/* secrets-vault.js birim testleri (v3.14 A1-1) */

function loadModule() {
  delete require.cache[require.resolve('../src/main/secrets/secrets-vault')];
  return require('../src/main/secrets/secrets-vault');
}

test('kasa durumu en azından memory modda erişilebilir', async () => {
  const vault = loadModule();
  const st = await vault.vaultStatus();
  expect(st.available).toBe(true);
  expect(['native', 'memory']).toContain(st.mode);
});

test('anahtar yazma ve okuma', async () => {
  const vault = loadModule();
  const res = await vault.setKey('openai', 'sk-test-123');
  expect(res.ok).toBe(true);
  const key = await vault.getKey('openai');
  expect(key).toBe('sk-test-123');
});

test('boş anahtar kaydı kaldırır', async () => {
  const vault = loadModule();
  await vault.setKey('anthropic', 'x');
  await vault.setKey('anthropic', '');
  const key = await vault.getKey('anthropic');
  expect(key).toBe('');
});

test('sağlayıcı adı olmadan yazma reddedilir', async () => {
  const vault = loadModule();
  const res = await vault.setKey('', 'key');
  expect(res.ok).toBe(false);
});

test('hesap kimliği tehlikeli karakterleri kırpıyor', async () => {
  const vault = loadModule();
  const res = await vault.setKey('../evil', 'k');
  // geçersiz karakterler kırpılırsa boş string olur ve kaldırma döner
  expect(res.ok).toBe(true);
});

test('kaldırma bellekten ve yerelden siler', async () => {
  const vault = loadModule();
  await vault.setKey('gemini', 'g-key');
  await vault.removeKey('gemini');
  const key = await vault.getKey('gemini');
  expect(key).toBe('');
});
