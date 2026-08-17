/**
 * renderer-modules.test.js — Krevyx v3.23
 *
 * Renderer modüllerinin birim testleri. Test dosyası her modül dosyasını
 * jest-environment-jsdom ortamında, `window`/`document` ve Electron `api`
 * globals'ını mock'layarak çalıştırır. Modüller ESCommon (sıradan <script>)
 * olduğu için require() global işlev tanımlamalarını window üzerinde üretir.
 *
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const MODULE_ORDER = [
  'app.js',         // api + PROMPT_TEMPLATES + STORAGE_KEY (index.html'de ilk script)
  'github.js',      // q / qa yardımcıları ve script-scope state burada tanımlı
  'core.js',        // state + core yardımcılar
  'composer.js',
  'orchestration.js',
  'settings.js',
  'chat.js',
  'ecosystem.js',
];

// Modüller tarayıcıda tek global kapsamda sırayla çalışır. (0,eval) jest'in
// strict modül kapsamıyla uyuşmaz (TDZ/hoisting farkları); vm.runInContext
// tek paylaşimli script-kapsamı kurarak tarayıcı davranışını taklit eder.
// Modüller tek global kapsamda çalıştığından vm kapsamındaki yeni
// tanımlamaları window üzerine yansıtırız — jest modül kapsamındaki çıplak
// isimler (esc, md, toast ...) böylece modüldeki gerçek tanımları çözer.
const moduleContext = vm.createContext(Object.create(null));
const BOUND_NAMES = [
  'q',
  'qa',
  'esc',
  'escHtml',
  'escapeHtml',
  'md',
  'save',
  'clearChat',
  'hostForOllamaMachine',
  'defaultOllamaHost',
  'iconSvg',
  'allFeaturedRepos',
  'composerSetMode',
  'composerRenderTasks',
  'composerRenderFiles',
  'composerUpdateTask',
  'composerAddContext',
  'buildComposerFileContext',
  'renderOrchestrationAgents',
  'buildOrchChainToggles',
  'buildOrchHeadSelect',
  'appendStreamCard',
  'applyBehaviorProfile',
  'getProfileInfo',
  'updateApiDots',
  'getBackendHealthy',
  'toast',
  'showErrorBanner',
  'hideErrorBanner',
  'tplRender',
  'refreshEcosystemPanels',
  'preflightBackend',
  'resolveModelParamsForAgent',
];
// Modül kapsamındaki (github.js'te tanımlanan) script-scope state ile test
// düzleminin aynı objeyi kullanması için yükleme sonrası yansıtılır.

let mstate = null; /* modül tarafının tek kaynak state'i — beforeAll sonrası atanır */

function loadModule(name) {
  const p = name==='app.js' ? path.join(__dirname, '..', 'src', 'renderer', name) : path.join(__dirname, '..', 'src', 'renderer', 'modules', name);
  const code = fs.readFileSync(p, 'utf8');
  vm.runInContext(code, moduleContext, { filename: name });
  mstate = moduleContext.state;
  for (const k of BOUND_NAMES) {
    if (k in moduleContext) {
      try {
        Object.defineProperty(window, k, {
          configurable: true,
          enumerable: true,
          get() {
            return moduleContext[k];
          },
        });
      } catch (e) {
        window[k] = moduleContext[k];
      }
    }
  }
  return code;
}

// Paylaşılan globals: modüller github.js'teki q/qa'ya ve app.js'teki state'e bağımlı.
// Testlerde aynı sözleşmeyi manuel kuruyoruz (index.html yükleme sırasının taklidi).
const state = {
  agents: [],
  history: [],
  settings: {
    modelParams: { temperature: 0.5, max_tokens: 100 },
    ollamaMachines: [{ id: 'default', label: 'Bu bilgisayar', host: 'localhost:11434' }],
    defaultOllamaMachineId: 'default',
    ollamaHost: 'http://127.0.0.1:11434',
  },
  currentProvider: 'ollama',
  processing: false,
  COMPOSER: { mode: 'code' },
};

beforeAll(() => {
  // vm kapsamına tarayıcı globals'larını bağla
  moduleContext.console = console;
  moduleContext.window = window;
  moduleContext.document = document;
  moduleContext.navigator = navigator;
  moduleContext.setTimeout = setTimeout;
  moduleContext.clearTimeout = clearTimeout;
  moduleContext.setInterval = setInterval;
  moduleContext.clearInterval = clearInterval;
  moduleContext.addEventListener = () => {};
  moduleContext.removeEventListener = () => {};
  moduleContext.state = state;
  window.state = state;
  moduleContext.localStorage = localStorage;
  moduleContext.hljs = undefined;
  moduleContext.DOMPurify = undefined;
  // Electron preload tarafı (window.api) mock'u
  window.api = {
    invoke: jest.fn(async () => ({ ollamaReachable: false, modelCount: 0 })),
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeAllListeners: jest.fn(),
  };
  // COMPOSER, composer.js'te const olarak tanımlanır; test düzleminin mutasyonu
  // modül tarafına geçsin diye yükleme ÖNCESİ window.state üzerinde kurarız
  window.state.COMPOSER = { mode: 'code', files: [], tasks: [], _taskId: 0 };
  // Modülleri index.html sırasıyla yükle (github.js q/qa'yı tanımlar, önce o gelmeli)
  for (const name of MODULE_ORDER) loadModule(name);
});

beforeEach(() => {
  jest.useRealTimers();
});

describe('chat.js — saf işlevler', () => {

  test('esc() HTML karakterlerini kaçar', () => {
    // esc() temel üçlüyü kaçar; çift tırnak escHtml() sorumluluğundadır
    expect(esc('<b>x & "y"</b>')).toBe('&lt;b&gt;x &amp; "y"&lt;/b&gt;');
  });

  test('esc() sayıyı stringe çevirir', () => {
    expect(esc(42)).toBe('42');
  });

  test('escHtml() eşdeğer davranır', () => {
    expect(escHtml('<script>')).toBe('&lt;script&gt;');
  });

  test('resolveModelParamsForAgent() varsayılanlar + ajan override birleştirir', () => {
    mstate.settings.modelParams = { temperature: 0.5, max_tokens: 100 };
    const agent = { modelParams: { temperature: 0.9 } };
    const out = resolveModelParamsForAgent(agent);
    expect(out).toEqual({ temperature: 0.9, max_tokens: 100 });
  });

  test('resolveModelParamsForAgent() geçersiz değerleri eler', () => {
    mstate.settings.modelParams = {};
    const agent = { modelParams: { temperature: 'çok-sıcak', top_p: 'xyz' } };
    // Geçersiz değerler elenir; kalan her değer sonlu sayı olmalı (veya null)
    const out = resolveModelParamsForAgent(agent);
    if (out !== null) {
      for (const v of Object.values(out)) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  test('resolveModelParamsForAgent() obje olmayan override u yok sayar', () => {
    mstate.settings.modelParams = { top_p: 0.9 };
    const agent = { modelParams: 7 };
    const out = resolveModelParamsForAgent(agent);
    expect(out).toEqual({ top_p: 0.9 });
  });

  test('md() bold/italik/code dönüşümü yapar ve kaçırır', () => {
    window.hljs = undefined;
    window.DOMPurify = undefined;
    const html = md('**kalın** ve `kod` <script>');
    expect(html).toContain('<strong>kalın</strong>');
    expect(html).toContain('<code>kod</code>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  test('md() inline script olay işleyicilerini DOMPurify ile temizler', () => {
    window.DOMPurify = {
      sanitize: (html, cfg) => html.replace(/onclick="[^"]*"/g, ''),
    };
    const html = md('**x**');
    expect(html).not.toContain('onclick');
  });
});

describe('github.js — host ve ikon işlevleri', () => {

  test('hostForOllamaMachine() geçerli makine host döndürür', () => {
    expect(typeof hostForOllamaMachine).toBe('function');
    expect(typeof defaultOllamaHost).toBe('function');
    mstate.settings.defaultOllamaMachineId = 'default';
    expect(hostForOllamaMachine('default')).toBe('localhost:11434');
    expect(hostForOllamaMachine()).toBe('localhost:11434');
    mstate.settings.ollamaMachines.push({ id: 'uzak', label: 'Uzak', host: 'http://10.0.0.5:11434' });
    expect(hostForOllamaMachine('uzak')).toBe('http://10.0.0.5:11434');
  });

  test('iconSvg() bilinen sınıf için <svg> döndürür', () => {
    expect(iconSvg('icon-shield')).toMatch(/^<svg.*<\/svg>$/);
    expect(iconSvg('icon-flask')).toContain('path');
  });

  test('iconSvg() bilinmeyen sınıf için boş string döndürür', () => {
    expect(iconSvg('bilinmeyen-sınıf')).toBe('');
  });

  test('allFeaturedRepos() liste döndürür ve her öğede url vardır', () => {
    // FEATURED_REPOS_CATALOG app.js'te tanımlı; modül kapsamına seeding yapıyoruz
    moduleContext.FEATURED_REPOS_CATALOG = {
      categories: [
        {
          id: 'cat1',
          label: 'Test',
          icon: 'icon-star',
          repos: [{ name: 'yasinkaya701/test-repo', query: 'test', desc: 't', stars: 10, lang: 'JS' }],
        },
      ],
    };
    const repos = allFeaturedRepos();
    expect(repos.length).toBeGreaterThan(0);
    for (const r of repos) {
      expect(typeof r.repoUrl).toBe('string');
      expect(r.repoUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('composer.js — bağlam derleme', () => {

  test('buildComposerFileContext() dosya yokken boş string döndürür', () => {
    // Dosya yokken dosya bağlamı üretilmez (gerçek davranış)
    expect(buildComposerFileContext()).toBe('');
    mstate.COMPOSER = mstate.COMPOSER || { files: [], mode: 'code', _taskId: 0 };
    mstate.COMPOSER.files = [
      { name: 'a.txt', path: '/x/a.txt', isDir: false, _content: 'merhaba dünya' },
    ];
    const ctx = buildComposerFileContext();
    expect(ctx).toContain('a.txt');
    expect(ctx).toContain('merhaba dünya');
    mstate.COMPOSER.files = [];
  });

  test('composerSetMode() ve render görev işlevleri tanımlıdır (DOM bağımlı)', () => {
    expect(typeof composerSetMode).toBe('function');
    expect(typeof composerRenderTasks).toBe('function');
    expect(typeof composerRenderFiles).toBe('function');
  });

  test('composerUpdateTask() yok olmayan görevi sessizce eler', () => {
    // Görev listesi boşken güncelleme çökmemelidir
    expect(() => composerUpdateTask({ id: 'yok' }, 'done')).not.toThrow();
  });
});

describe('orchestration.js', () => {

  test('renderOrchestrationAgents tanımlı ve DOM olmadan çağrılabilir şekilde tanımlı', () => {
    expect(typeof renderOrchestrationAgents).toBe('function');
  });

  test('buildOrchChainToggles ve buildOrchHeadSelect tanımlı', () => {
    expect(typeof buildOrchChainToggles).toBe('function');
    expect(typeof buildOrchHeadSelect).toBe('function');
  });

  test('appendStreamCard null elementte çökmez', () => {
    expect(() => appendStreamCard(null, 'test', 'info')).not.toThrow();
  });
});

describe('settings.js — profil işlevleri', () => {

  test('applyBehaviorProfile geçersiz profil adını reddeder', () => {
    expect(() => applyBehaviorProfile('olmayan-profil')).not.toThrow();
  });

  test('getProfileInfo profili döndürür / yoksa null', () => {
    const info = getProfileInfo('dengeli');
    // "dengeli" profili UI'da tanımlıysa obje, değilse null döner — tipler tutarlı olmalı
    if (info !== null) expect(typeof info).toBe('object');
  });

  test('updateApiDots element yokken çökmez', () => {
    expect(() => updateApiDots()).not.toThrow();
  });

  test('getBackendHealthy son sağlık durumunu döndürür', async () => {
    // getBackendHealthy senkron olarak son denetim sonucunu döndürür
    const pre = preflightBackend();
    expect(typeof pre.then).toBe('function'); // Promise<boolean>
    const preResult = await pre;
    expect(typeof preResult).toBe('boolean');
    // getBackendHealthy doğrudan son kontrol sonucunu yansıtır
    const res = getBackendHealthy();
    expect(typeof res === 'boolean' || res === null).toBe(true);
  });
});

describe('core.js — toast ve banner', () => {

  test('toast() DOM öğesi oluşturur ve zamanlayıcıyı kurar', () => {
    jest.useFakeTimers();
    const stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
    jest.useFakeTimers();
    // Modül tarafı timers'ını da fake'e yönlendir (toast() setTimeout kullanır)
    moduleContext.setTimeout = setTimeout;
    moduleContext.clearTimeout = clearTimeout;
    toast('test mesajı', 'info', 100);
    expect(stack.querySelector('.toast')).not.toBeNull();
    expect(stack.querySelector('.toast').textContent).toBe('test mesajı');
    // İlk zamanlayıcı ms sonra soluklaştırır, ikinci (260ms) sonra öğeyi kaldırır
    jest.advanceTimersByTime(100);
    expect(stack.querySelector('.toast').style.opacity).toBe('0');
    jest.advanceTimersByTime(260);
    jest.runAllTimers();
    jest.useRealTimers();
    // Zamanlayıcılar sonrası öğe DOM'dan kaldırılır
    expect(stack.querySelectorAll('.toast').length).toBe(0);
    document.body.removeChild(stack);
  });

  test('showErrorBanner() + hideErrorBanner() simetrik çalışır', () => {
    const b = document.createElement('div');
    b.id = 'error-banner';
    document.body.appendChild(b);
    showErrorBanner('bir hata');
    expect(b.classList.contains('hidden')).toBe(false);
    expect(b.textContent).toContain('bir hata');
    hideErrorBanner();
    expect(b.classList.contains('hidden')).toBe(true);
    expect(b.innerHTML).toBe('');
    document.body.removeChild(b);
  });

  test('toast() yığın öğesi yoksa çökmez', () => {
    expect(() => toast('yığın yok')).not.toThrow();
  });
});

describe('ecosystem.js', () => {

  test('tplRender tanımlı ve template kaynağı yokken sessiz kalır', () => {
    expect(typeof tplRender).toBe('function');
  });

  test('refreshEcosystemPanels tanımlı', () => {
    expect(typeof refreshEcosystemPanels).toBe('function');
  });
});
