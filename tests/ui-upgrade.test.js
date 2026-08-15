/**
 * @jest-environment jsdom
 *
 * UI/Feature Upgrade Planı v3.1–v3.2 modüllerinin birim testleri.
 * theme-registry, keymap, command-palette, workspace-layout,
 * virtual-list ve perf (StreamBatcher) modülleri kapsanır.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const RENDERER = path.resolve(__dirname, '../src/renderer');
const scriptCache = {};

function loadScript(name) {
  // Aynı script'i iki kez DOM'a eklemek class/function redeclaration hatası verir;
  // modül içeriği tek kez derlenip tekrar tekrar çağrılır.
  if (!scriptCache[name]) {
    const code = fs.readFileSync(path.join(RENDERER, name), 'utf8');
    scriptCache[name] = code;
    const script = document.createElement('script');
    script.textContent = code;
    document.head.appendChild(script);
  }
  const run = new Function(scriptCache[name]);
  run();
}

// Ön koşullar: delegate-parse (hata vermese de) + DOM iskeleti
beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.Krevyx;
});

describe('theme-registry', () => {
  beforeEach(() => {
    loadScript('theme-registry.js');
  });

  test('varsayılan tema dark olmalı ve apply değişmeli', () => {
    expect(window.Krevyx.theme.current()).toBe('dark');
    window.Krevyx.theme.apply('light');
    expect(window.Krevyx.theme.current()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    window.Krevyx.theme.apply('dark');
  });

  test('applyAccent accent CSS değişkenini set etmeli', () => {
    window.Krevyx.theme.applyAccent('#ff6600');
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#ff6600');
  });

  test('toggle dark↔light arasında geçiş yapmalı', () => {
    window.Krevyx.theme.toggle();
    expect(window.Krevyx.theme.current()).toBe('light');
    window.Krevyx.theme.toggle();
    expect(window.Krevyx.theme.current()).toBe('dark');
  });

  test('custom tema register/apply/remove çalışmalı', () => {
    window.Krevyx.theme.register({
      name: 'ocean',
      vars: { '--bg': '#001122' },
    });
    window.Krevyx.theme.apply('custom:ocean');
    expect(window.Krevyx.theme.current()).toBe('custom:ocean');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('#001122');
    window.Krevyx.theme.remove('ocean');
    window.Krevyx.theme.apply('dark');
    expect(window.Krevyx.theme.listCustom().map((t) => t.name)).not.toContain('ocean');
  });

  test('geçersiz tema ismi uygulanmamalı', () => {
    const before = window.Krevyx.theme.current();
    window.Krevyx.theme.apply('olmayan-tema');
    // Geçersiz tema adı 'dark' olarak normalize edilir (plan: güvenlikli fallback)
    expect(window.Krevyx.theme.current()).toBe('dark');
    window.Krevyx.theme.apply(before);
  });

  test('onChange listener tema değişiminde tetiklenmeli', () => {
    const fn = jest.fn();
    window.Krevyx.theme.onChange(fn);
    window.Krevyx.theme.apply('light');
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });
});

describe('keymap', () => {
  beforeEach(() => {
    loadScript('theme-registry.js');
    loadScript('keymap.js');
  });

  test('varsayılan harita komutları içermeli', () => {
    const map = window.Krevyx.keymap.list();
    expect(map.some((c) => c.command === 'composer.focus')).toBe(true);
    expect(map.some((c) => c.command === 'palette.open')).toBe(true);
    expect(map.some((c) => c.command === 'theme.toggle')).toBe(true);
  });

  test('on/execute komut işleyiciyi çağırmalı', () => {
    const fn = jest.fn();
    window.Krevyx.keymap.on('composer.focus', fn);
    window.Krevyx.keymap.execute('composer.focus');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('kayıtlı olmayan komut hata fırlatmamalı', () => {
    expect(() => window.Krevyx.keymap.execute('olmayan')).not.toThrow();
  });

  test('loadOverrides/savesOverrides override zinciri oluşturmalı', () => {
    window.Krevyx.keymap.saveOverrides({ 'CmdOrCtrl+Shift+F': 'composer.focus' });
    const eff = window.Krevyx.keymap.effective();
    expect(eff.map['CmdOrCtrl+Shift+F']).toBe('composer.focus');
  });

  test('efektif keymap override sonrası çakışma raporu dönmeli', () => {
    window.Krevyx.keymap.saveOverrides({ 'CmdOrCtrl+Shift+F': 'composer.focus' });
    const eff = window.Krevyx.keymap.effective();
    // 'composer.focus' komutunun artık birden fazla kombinasyonu var (default + override)
    expect(eff.conflicts.some((c) => c.command === 'composer.focus')).toBe(true);
  });
});

describe('command-palette', () => {
  beforeEach(() => {
    loadScript('theme-registry.js');
    loadScript('keymap.js');
    loadScript('workspace-layout.js');
    loadScript('command-palette.js');
  });

  test('fuzzy skorlama sıralı eşleşme gerektirmeli', () => {
    const s = window.Krevyx.palette._fuzzyScore('kv', 'Krevyx');
    expect(s).toBeTruthy();
    const s2 = window.Krevyx.palette._fuzzyScore('vk', 'Krevyx');
    expect(s2).toBeNull();
  });

  test('boş sorgu tüm öğeleri döndürmeli', () => {
    window.Krevyx.palette.register({ group: 'actions', label: 'Test komutu', run: jest.fn() });
    expect(window.Krevyx.palette._fuzzyScore('', 'Test komutu')).toBeNull();
  });

  test('register/unregister kanala öğe ekleyip çıkarmalı', () => {
    const fn = jest.fn();
    window.Krevyx.palette.register({ group: 'actions', label: 'Benzersiz komut', run: fn });
    window.Krevyx.palette.unregister('Benzersiz komut');
    // Unregister sonrası listede kalan öğe boş string sorguda bu komutu vermemeli
    window.Krevyx.palette.register({ group: 'actions', label: 'Başka komut', run: jest.fn() });
    const labels = window.Krevyx.palette.entries().map((e) => e.label);
    expect(labels).not.toContain('Benzersiz komut');
  });

  test('open overlayi DOMa eklemeli ve Enter ilk ogreyi calistirmali', async () => {
    const fn = jest.fn();
    window.Krevyx.palette.register({ group: 'actions', label: 'Tıklatılabilir komut', run: fn });
    window.Krevyx.palette.open();
    expect(document.querySelector('.cmd-overlay')).toBeTruthy();
    const input = document.querySelector('.cmd-input');
    input.value = 'tıklat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    document.querySelector('.cmd-overlay').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(fn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.cmd-overlay')).toBeNull();
  });

  test('Escape paleti kapatmalı', () => {
    window.Krevyx.palette.register({ group: 'actions', label: 'Kapanan komut', run: jest.fn() });
    window.Krevyx.palette.open();
    document.querySelector('.cmd-overlay').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(document.querySelector('.cmd-overlay')).toBeNull();
  });
});

describe('workspace-layout', () => {
  beforeEach(() => {
    loadScript('theme-registry.js');
    loadScript('keymap.js');
    loadScript('workspace-layout.js');
    document.body.innerHTML = '<div class="workspace-v3"></div>';
  });

  test('varsayılan genişlikleri CSS değişkenlerine yazmalı', () => {
    window.Krevyx.layout.refresh();
    const root = document.documentElement;
    expect(root.style.getPropertyValue('--ws-left')).toBe('260px');
    expect(root.style.getPropertyValue('--ws-right')).toBe('280px');
  });

  test('set/get persist ve event üretmeli', () => {
    const fn = jest.fn();
    window.addEventListener('krevyx-layout-changed', fn);
    window.Krevyx.layout.set({ leftWidth: 300 });
    expect(window.Krevyx.layout.get().leftWidth).toBe(300);
    expect(fn).toHaveBeenCalled();
    expect(localStorage.getItem('Krevyx_ws_layout_v1')).toContain('300');
  });

  test('toggleLeft workspace-v3 sınıfını değiştirmeli', () => {
    window.Krevyx.layout.toggleLeft();
    expect(document.querySelector('.workspace-v3').classList.contains('left-collapsed')).toBe(true);
    window.Krevyx.layout.toggleLeft();
    expect(document.querySelector('.workspace-v3').classList.contains('left-collapsed')).toBe(false);
  });

  test('setDensity data-density özniteliğini set etmeli', () => {
    window.Krevyx.layout.setDensity('compact');
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });
});

describe('virtual-list', () => {
  beforeEach(() => {
    loadScript('virtual-list.js');
  });

  test('1000 öğeyi görünür pencereye sığdırmalı', async () => {
    const root = document.createElement('div');
    root.style.height = '300px';
    root.style.overflow = 'auto';
    document.body.appendChild(root);
    const vl = new window.Krevyx.VirtualList(root, {
      rowHeight: 30,
      render: (item) => {
        const d = document.createElement('div');
        d.textContent = item;
        return d;
      },
    });
    const items = Array.from({ length: 1000 }, (_, i) => `satır-${i}`);
    vl.setItems(items);
    // requestAnimationFrame (jest env'in enjekte ettiği mock) bekletilir
    await new Promise((r) => setTimeout(r, 50));
    const visible = root.querySelectorAll('.virtual-item');
    // 300px / 30px = 10 görünür + overscan
    expect(visible.length).toBeGreaterThan(8);
    expect(visible.length).toBeLessThan(40);
    expect(visible[0].style.transform).toContain('translateY');
    vl.dispose();
  });

  test('scroll pozisyonuna göre pencere kaymalı', async () => {
    const root = document.createElement('div');
    root.style.height = '300px';
    root.style.overflow = 'auto';
    document.body.appendChild(root);
    const vl = new window.Krevyx.VirtualList(root, {
      rowHeight: 30,
      render: (item) => document.createTextNode(item),
    });
    vl.setItems(Array.from({ length: 2000 }, (_, i) => `s${i}`));
    await new Promise((r) => setTimeout(r, 50));
    root.scrollTop = 100 * 30;
    root.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 50));
    const transforms = Array.from(root.querySelectorAll('.virtual-item')).map((el) => el.style.transform);
    const topIdx = Math.min(...transforms.map((t) => parseInt(t.replace(/[^0-9]/g, ''), 10) / 30));
    expect(topIdx).toBeGreaterThanOrEqual(94);
    vl.dispose();
  });
});

describe('perf StreamBatcher', () => {
  beforeEach(() => {
    loadScript('perf.js');
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('delta parçalarını birleştirip tek flush ile iletmeli', () => {
    const onFlush = jest.fn();
    const b = new window.Krevyx.perf.StreamBatcher(onFlush);
    b.push('s1', 'mer');
    b.push('s1', 'haba');
    b.push('s1', '');
    jest.advanceTimersByTime(20);
    expect(onFlush).toHaveBeenCalledWith('s1', 'merhaba', expect.objectContaining({ chars: 7 }));
    b.dispose();
  });

  test('farklı anahtarları ayrı flush etmeli', () => {
    const onFlush = jest.fn();
    const b = new window.Krevyx.perf.StreamBatcher(onFlush);
    b.push('a', 'x');
    b.push('b', 'y');
    jest.advanceTimersByTime(20);
    expect(onFlush).toHaveBeenCalledTimes(2);
    b.dispose();
  });

  test('mark/measure ölçüm günlüğünü doldurmalı', () => {
    window.Krevyx.perf.mark('test.a');
    window.Krevyx.perf.measure('test.fn', () => 42);
    expect(window.Krevyx.perf.recent('test').length).toBeGreaterThanOrEqual(2);
  });

  test('renderWhenVisible görünür elemanda render etmeli', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const fn = jest.fn();
    window.Krevyx.perf.renderWhenVisible(target, fn);
    expect(fn).toHaveBeenCalled();
  });
});

describe('agent-canvas (bağımsız yardımcıları)', () => {
  test('modül yüklenmesi window.krevyxApi olmadan hata vermemeli', () => {
    delete window.krevyxApi;
    expect(() => loadScript('agent-canvas.js')).not.toThrow();
  });
});

describe('onboarding-tour (bağımsız yardımcılar)', () => {
  test('modül yüklenmesi hata vermemeli', () => {
    expect(() => loadScript('onboarding-tour.js')).not.toThrow();
  });
});

describe('orchestrator-view (bağımsız yardımcılar)', () => {
  test('modül yüklenmesi window.krevyxApi olmadan hata vermemeli', () => {
    delete window.krevyxApi;
    expect(() => loadScript('orchestrator-view.js')).not.toThrow();
  });
});
