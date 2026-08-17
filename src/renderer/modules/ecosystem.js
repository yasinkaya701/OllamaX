/*
 * ecosystem.js — Krevyx renderer modülü (v3.22 modülerleştirme)
 * Stil: Emerald Ledger — siyah zemin, zümrüt aksan, JetBrains Mono. app.js ile aynı global kapsamı paylaşır.
 */

async function tplRefresh() {
  if (!api) return;
  try {
    const res = await api.invoke('ipc:3:templates-list', {});
    __tplState.templates = res?.ok && Array.isArray(res.templates) ? res.templates : [];
  } catch {
    __tplState.templates = [];
  }
  tplRender();
}

function tplRender() {
  const list = q('#settings-template-list');
  const bar = q('#settings-template-cat-bar');
  if (!list) return;
  list.innerHTML = '';
  const ts = __tplState.templates;
  if (!ts.length) {
    list.innerHTML = '<div class="empty-note">Henüz şablon yok. Yeni şablon ekleyin veya bir şablon paketini içe aktarın.</div>';
    if (bar) bar.innerHTML = '';
    return;
  }
  const cats = ['Tümü', ...Array.from(new Set(ts.map((t) => t.category).filter(Boolean)))];
  if (bar) {
    bar.innerHTML = '';
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-chip' + (c === __tplState.filter ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => {
        __tplState.filter = c;
        tplRender();
      });
      bar.appendChild(b);
    });
  }
  const visible = ts.filter((t) => __tplState.filter === 'Tümü' || t.category === __tplState.filter);
  visible.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'security-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const name = document.createElement('span');
    name.style.cssText = 'flex:1;min-width:120px';
    name.innerHTML = `<strong>${escHtml(t.label || t.id)}</strong>${t.category ? ` <span style="color:var(--v3-text-muted);font-size:11px">${escHtml(t.category)}</span>` : ''}<br><span style="color:var(--v3-text-muted);font-size:11px">${escHtml((t.source || '').replace('bundled:', 'gömülü: ').replace('user', 'kullanıcı').replace('imported', 'içe aktarılan'))}</span>`;
    row.appendChild(name);
    const mkBtn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      return b;
    };
    const canEdit = t.source === 'user' || t.source === 'imported';
    row.appendChild(mkBtn('Uygula', 'small-btn', () => {
      const inp = q('#agent-prompt');
      if (inp) inp.value = t.prompt || '';
      toast('Şablon prompt alanına uygulandı', 'success');
    }));
    row.appendChild(mkBtn(canEdit ? 'Düzenle' : 'Kopyala', 'ghost-btn', () => tplEditDialog(t)));
    if (canEdit) {
      row.appendChild(mkBtn('Dışa', 'ghost-btn', () => tplExport(t)));
      row.appendChild(mkBtn('Sil', 'ghost-btn', () => tplDelete(t)));
    } else {
      row.appendChild(mkBtn('Dışa', 'ghost-btn', () => tplExport(t)));
    }
    list.appendChild(row);
  });
}

function tplEditDialog(t) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  box.innerHTML = `
    <div style="background:var(--v3-bg,#1a1a1a);border:1px solid var(--v3-border,#333);border-radius:12px;padding:18px;width:min(520px,92vw);max-height:85vh;overflow-y:auto;color:var(--v3-text,#eee)">
      <h4 style="margin:0 0 10px">${t ? 'Şablonu Düzenle' : 'Yeni Şablon'}</h4>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label style="font-size:12px">Kimlik<br><input id="tpl-dlg-id" class="text-input" value="${escHtml(t?.id || '')}" placeholder="kod-inceleme"></label>
        <label style="font-size:12px">Ad<br><input id="tpl-dlg-label" class="text-input" value="${escHtml(t?.label || '')}" placeholder="Code Review"></label>
      </div>
      <label style="font-size:12px;display:block;margin-top:8px">Kategori<br><input id="tpl-dlg-cat" class="text-input" value="${escHtml(t?.category || '')}" placeholder="kod"></label>
      <label style="font-size:12px;display:block;margin-top:8px">Prompt<br><textarea id="tpl-dlg-prompt" class="text-input" style="min-height:180px;resize:vertical">${escHtml(t?.prompt || '')}</textarea></label>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="tpl-dlg-save" class="primary-btn">Kaydet</button>
        <button id="tpl-dlg-cancel" class="ghost-btn">İptal</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector('#tpl-dlg-cancel').addEventListener('click', close);
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  box.querySelector('#tpl-dlg-save').addEventListener('click', async () => {
    const id = (box.querySelector('#tpl-dlg-id').value || '').trim();
    if (!id) {
      toast('Kimlik gerekli', 'error');
      return;
    }
    const payload = {
      template: {
        id,
        label: box.querySelector('#tpl-dlg-label').value.trim() || id,
        category: box.querySelector('#tpl-dlg-cat').value.trim(),
        prompt: box.querySelector('#tpl-dlg-prompt').value,
      },
    };
    try {
      const res = await api.invoke('ipc:3:templates-save', payload);
      if (res?.ok) {
        toast('Şablon kaydedildi', 'success');
        close();
        await tplRefresh();
      } else {
        toast(res?.error || 'Kaydedilemedi', 'error');
      }
    } catch {
      toast('Kayıt başarısız', 'error');
    }
  });
}

async function tplDelete(t) {
  try {
    const res = await api.invoke('ipc:3:templates-delete', { id: t.id });
    if (res?.ok) {
      toast('Şablon silindi', 'success');
      await tplRefresh();
    } else {
      toast(res?.error || 'Silinemedi', 'error');
    }
  } catch {
    toast('Silme başarısız', 'error');
  }
}

async function tplExport(t) {
  const payload = { id: t.id, label: t.label, category: t.category || '', prompt: t.prompt };
  const ok = await safeCopy(JSON.stringify(payload, null, 2));
  toast(ok ? 'Şablon JSON\'u panoya kopyalandı — paylaşıma hazır' : 'Kopyalanamadı; konsolu kontrol edin', ok ? 'success' : 'error');
  if (!ok) console.log('Krevyx template share:', JSON.stringify(payload));
}

function tplImportDialog() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  box.innerHTML = `
    <div style="background:var(--v3-bg,#1a1a1a);border:1px solid var(--v3-border,#333);border-radius:12px;padding:18px;width:min(480px,92vw);max-height:85vh;overflow-y:auto;color:var(--v3-text,#eee)">
      <h4 style="margin:0 0 10px">Şablonu İçe Aktar</h4>
      <p style="font-size:12px;color:var(--v3-text-muted);margin:0 0 10px">Bir şablon JSON'u yapıştırın veya dosya seçin ({ id, label, category, prompt }).</p>
      <textarea id="tpl-import-paste" class="text-input" style="min-height:140px;resize:vertical" placeholder='{ "id": "...", "label": "...", "category": "...", "prompt": "..." }'></textarea>
      <input id="tpl-import-file" type="file" accept=".json,application/json" style="margin-top:8px;font-size:12px">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="tpl-import-go" class="primary-btn">İçe aktar</button>
        <button id="tpl-import-cancel" class="ghost-btn">İptal</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector('#tpl-import-cancel').addEventListener('click', close);
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  box.querySelector('#tpl-import-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      box.querySelector('#tpl-import-paste').value = String(r.result || '');
    };
    r.readAsText(f);
  });
  box.querySelector('#tpl-import-go').addEventListener('click', async () => {
    const raw = (box.querySelector('#tpl-import-paste').value || '').trim();
    if (!raw) {
      toast('JSON yapıştırın veya dosya seçin', 'error');
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      toast('Geçersiz JSON', 'error');
      return;
    }
    try {
      const res = await api.invoke('ipc:3:templates-import', { payload });
      if (res?.ok) {
        toast('Şablon içe aktarıldı', 'success');
        close();
        await tplRefresh();
      } else {
        toast(res?.error || 'İçe aktarılamadı', 'error');
      }
    } catch {
      toast('İçe aktarma başarısız', 'error');
    }
  });
}

/* ------------------------------ PLUGINS ------------------------------ */

async function pluginRefresh() {
  if (!api) return;
  const list = q('#settings-plugin-list');
  if (!list) return;
  list.innerHTML = '';
  try {
    const res = await api.invoke('ipc:3:plugins-list', {});
    const ps = res?.ok && Array.isArray(res.plugins) ? res.plugins : [];
    if (!ps.length) {
      list.innerHTML = '<div class="empty-note">Kurulu eklenti yok. Eklenti JSON paketiyle kurulum yapabilirsiniz.</div>';
      return;
    }
    ps.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'security-row';
      row.style.cssText = 'display:block';
      const head = document.createElement('div');
      head.style.cssText = 'display:flex;align-items:center;gap:8px';
      const badge = p.active ? 'Etkin' : 'Devre dışı';
      head.innerHTML = `<strong style="flex:1">${escHtml(p.name)} <span style="color:var(--v3-text-muted);font-weight:400;font-size:11px">v${escHtml(p.version)}</span></strong>
        <span style="font-size:11px;color:${p.active ? 'var(--accent,#10b981)' : 'var(--v3-text-muted)'}">${badge}</span>`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ghost-btn';
      rm.textContent = 'Kaldır';
      rm.addEventListener('click', async () => {
        try {
          const r = await api.invoke('ipc:3:plugins-uninstall', { id: p.id });
          if (r?.ok) {
            toast('Eklenti kaldırıldı', 'success');
            await pluginRefresh();
          } else toast(r?.error || 'Kaldırılamadı', 'error');
        } catch {
          toast('Kaldırma başarısız', 'error');
        }
      });
      head.appendChild(rm);
      row.appendChild(head);
      // Eklentinin eklediği ayar panelleri (DOMPurify ile temizlenmiş)
      if (p.settingsPanels?.length) {
        p.settingsPanels.forEach((sp) => {
          const pane = document.createElement('div');
          pane.style.cssText = 'margin-top:6px;padding:8px;border:1px dashed var(--v3-border,#333);border-radius:8px;font-size:12px';
          pane.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(String(sp.html || '')) : escHtml(sp.html || '');
          const t = document.createElement('div');
          t.style.cssText = 'font-weight:700;margin-bottom:4px';
          t.textContent = sp.title || '';
          pane.insertBefore(t, pane.firstChild);
          row.appendChild(pane);
        });
      }
      list.appendChild(row);
    });
  } catch {
    list.innerHTML = '<div class="empty-note">Eklentiler yüklenemedi.</div>';
  }
}

function pluginInstallDialog() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)';
  box.innerHTML = `
    <div style="background:var(--v3-bg,#1a1a1a);border:1px solid var(--v3-border,#333);border-radius:12px;padding:18px;width:min(560px,92vw);max-height:85vh;overflow-y:auto;color:var(--v3-text,#eee)">
      <h4 style="margin:0 0 10px">Eklenti Kur (JSON paket)</h4>
      <p style="font-size:12px;color:var(--v3-text-muted);margin:0 0 10px">{ "manifest": {...}, "code": "js kaynak" } biçiminde paket yapıştırın veya dosya seçin.</p>
      <textarea id="plugin-install-paste" class="text-input" style="min-height:200px;resize:vertical" placeholder='{ "manifest": { "id": "ornek-eklenti", "name": "Örnek", "version": "1.0.0", "main": "index.js", "permissions": [] }, "code": "..." }'></textarea>
      <input id="plugin-install-file" type="file" accept=".json,application/json" style="margin-top:8px;font-size:12px">
      <div style="display:flex;gap:8px;margin-top:12px">
        <button id="plugin-install-go" class="primary-btn">Kur</button>
        <button id="plugin-install-cancel" class="ghost-btn">İptal</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.querySelector('#plugin-install-cancel').addEventListener('click', close);
  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });
  box.querySelector('#plugin-install-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      box.querySelector('#plugin-install-paste').value = String(r.result || '');
    };
    r.readAsText(f);
  });
  box.querySelector('#plugin-install-go').addEventListener('click', async () => {
    const raw = (box.querySelector('#plugin-install-paste').value || '').trim();
    if (!raw) {
      toast('JSON paket yapıştırın veya dosya seçin', 'error');
      return;
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      toast('Geçersiz JSON', 'error');
      return;
    }
    if (!payload.manifest || typeof payload.code !== 'string') {
      toast('Paket manifest + code içermeli', 'error');
      return;
    }
    try {
      const res = await api.invoke('ipc:3:plugins-install', { payload });
      if (res?.ok) {
        toast('Eklenti kuruldu: ' + res.id, 'success');
        close();
        await pluginRefresh();
      } else {
        toast(res?.error || 'Kurulum başarısız', 'error');
      }
    } catch {
      toast('Kurulum başarısız', 'error');
    }
  });
}

/* ------------------------------ INIT ------------------------------ */

function refreshEcosystemPanels() {
  void tplRefresh();
  void pluginRefresh();
}

/* app.js'in settings butonu akışına ekle */
on('btn-tpl-new', 'click', () => tplEditDialog(null));
on('btn-tpl-import', 'click', () => tplImportDialog());
on('btn-tpl-share', 'click', () => {
  const sel = __tplState.templates[0];
  if (!sel) {
    toast('Paylaşılacak şablon yok', 'info');
    return;
  }
  // en yeni kullanıcı şablonunu paylaş (yoksa ilkini)
  const user = __tplState.templates.find((t) => t.source === 'user' || t.source === 'imported') || sel;
  tplExport(user);
});
on('btn-plugin-install', 'click', () => pluginInstallDialog());

/* app.js init'inden sonra çalışacak şekilde hook */
(function hookSettingsOpen() {
  const origBtn = q('#btn-settings');
  if (origBtn) {
    origBtn.addEventListener('click', () => {
      setTimeout(refreshEcosystemPanels, 50);
    });
  }
})();
