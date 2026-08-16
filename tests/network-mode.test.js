'use strict';

/* network-mode.js birim testleri (v3.14 A1-2) — keytar olmadan, memory modda */
const configStore = {
  readConfig: () => ({ app: { network: { mode: 'normal' } } }),
};

/* Modülü test için temizleyip yeniden yükle */
function loadModule() {
  delete require.cache[require.resolve('../src/main/network/network-mode')];
  const nm = require('../src/main/network/network-mode');
  nm.setConfigStore(configStore);
  return nm;
}

test('varsayılan mod normal', () => {
  expect(loadModule().getNetworkMode()).toBe('normal');
});

test('normal modda tüm bulut sağlayıcıları izinli', () => {
  const nm = loadModule();
  for (const p of ['openai', 'anthropic', 'gemini', 'openrouter', 'xai', 'mistral', 'deepseek', 'groq']) {
    expect(nm.isCloudProviderAllowed(p)).toBe(true);
  }
  expect(nm.isOutboundAllowed('featured-refresh')).toBe(true);
});

test('local-only modda bulut sağlayıcıları kapalı, yerel açık', () => {
  configStore.readConfig = () => ({ app: { network: { mode: 'local-only' } } });
  const nm = loadModule();
  expect(nm.isCloudProviderAllowed('openai')).toBe(false);
  expect(nm.isCloudProviderAllowed('anthropic')).toBe(false);
  expect(nm.isCloudProviderAllowed('groq')).toBe(false);
  expect(nm.isCloudProviderAllowed('ollama')).toBe(true);
  expect(nm.isCloudProviderAllowed('lmstudio')).toBe(true);
  expect(nm.isOutboundAllowed('featured-refresh')).toBe(false);
});

test('localhost ve özel ağ aralıkları yerel kabul edilir', () => {
  const nm = loadModule();
  for (const h of ['localhost', '127.0.0.1', '127.0.0.1:11434', 'http://localhost:11434', '::1', '[::1]:11434', '10.0.0.5', '172.16.0.1', '192.168.1.100', '169.254.0.1']) {
    expect(nm.isHostLocal(h)).toBe(true);
  }
  for (const h of ['api.openai.com', '1.2.3.4', '172.32.0.1', '192.169.0.1', '8.8.8.8:443']) {
    expect(nm.isHostLocal(h)).toBe(false);
  }
});

test('geçersiz mod config normala düşürür', () => {
  configStore.readConfig = () => ({ app: { network: { mode: 'bilateral' } } });
  expect(loadModule().getNetworkMode()).toBe('normal');
});
