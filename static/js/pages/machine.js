// /static/js/pages/machine.js
(function () {
  if (!location.pathname.startsWith('/machine')) return;

  const $ = (s, c=document) => c.querySelector(s);

  // shared editors / state
  let cm = null;           // CodeMirror pro Edit
  let cmCreate = null;     // CodeMirror pro Create
  let editingName = null;
  let editingOriginalName = null;

  // ===== Helpers =====
  function humanSize(bytes) {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} kB`;
    return `${(bytes/1024/1024).toFixed(2)} MB`;
  }
  function humanTime(ts) { try { return new Date(ts*1000).toLocaleString(); } catch { return "—"; } }

  // ===== Disk + System =====
  function humanGB(bytes) {
    if (bytes == null) return '—';
    return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
  }
  
  async function loadDiskUsage() {
    try {
      const r = await fetch('/api/disk', { cache:'no-store' });
      const d = await r.json();
      const txt = (d && d.percent != null)
        ? `Disk: ${humanGB(d.used)} / ${humanGB(d.total)} (${Number(d.percent).toFixed(1)}%)`
        : 'Disk: —';
      $('#diskUsage').textContent = txt;
    } catch {
      $('#diskUsage').textContent = 'Disk: —';
    }
  }

  async function loadSystemHost() {
    try {
      const s = await fetch('/api/system/host', { cache:'no-store' }).then(r=>r.json());
      $('#sysOs').textContent = s.os || '—';
      $('#sysCpuTemp').textContent = (s.cpu_temp_c != null) ? `${Number(s.cpu_temp_c).toFixed(1)} °C` : '—';
      if (s.mem && s.mem.total_kb) {
        const used = s.mem.used_kb || 0, total = s.mem.total_kb || 1;
        const pct = Math.round((used/total)*100);
        $('#sysMemBar').style.width = pct + '%';
        $('#sysMemText').textContent = `${(used/1024/1024).toFixed(2)} / ${(total/1024/1024).toFixed(2)} GB (${pct}%)`;
      }
    } catch {}
  }

  // ===== File manager =====
  let machineContextMenu = null;

  function _createMachineContextMenu() {
      if (document.getElementById('machineContextMenu')) return;
      const menu = document.createElement('ul');
      menu.id = 'machineContextMenu';
      menu.className = 'context-menu';
      menu.innerHTML = `
          <li><button data-act="edit">Upravit</button></li>
          <li><button data-act="download">Stáhnout</button></li>
          <li><button data-act="delete" style="color:#f57c7c;">Smazat</button></li>
      `;
      document.body.appendChild(menu);
      machineContextMenu = menu;

      menu.addEventListener('click', (e) => {
          const button = e.target.closest('button');
          if (!button) return;
          _handleMachineAction(button.dataset.act, menu.dataset.fileName);
          _hideMachineContextMenu();
      });
  }

  function _showMachineContextMenu(event, fileName) {
      machineContextMenu.dataset.fileName = fileName;
      machineContextMenu.style.display = 'block';
      machineContextMenu.style.left = `${event.pageX}px`;
      machineContextMenu.style.top = `${event.pageY}px`;
  }

  function _hideMachineContextMenu() {
      if (machineContextMenu) machineContextMenu.style.display = 'none';
  }

  async function _handleMachineAction(act, name) {
      if (!act || !name) return;
      try {
          if (act === 'edit') {
              await openEditor(name); // Tuto funkci už máme
          } else if (act === 'download') {
              const content = await fetchFileContent(name); // Tuto funkci už máme
              const blob = new Blob([content], { type: 'text/plain' });
              const a = document.createElement('a');
              a.download = name.split('/').pop();
              a.href = URL.createObjectURL(blob);
              a.click();
              URL.revokeObjectURL(a.href);
          } else if (act === 'delete') {
              if (!confirm(`Smazat soubor: ${name}?`)) return;
              const r = await fetch(`/api/delete-file`, {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name })
              });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              await loadMachineFiles();
          }
      } catch (err) {
          Toast.show('Akce selhala: ' + (err?.message || err), 'error');
      }
  }

  async function onFilesTableClick(e) {
    const btn = e.target.closest('button'); if (!btn) return;
    const act = btn.getAttribute('data-act'); const name = btn.getAttribute('data-name');
    if (!act || !name) return;

    try {
      if (act === 'edit') {
        await openEditor(name);
      } else if (act === 'download') {
        const content = await fetchFileContent(name);
        const blob = new Blob([content], { type: 'text/plain' });
        const a = document.createElement('a');
        a.download = name.split('/').pop();
        a.href = URL.createObjectURL(blob);
        a.click(); URL.revokeObjectURL(a.href);
      } else if (act === 'delete') {
        if (!confirm(`Delete file: ${name}?`)) return;
        const r = await fetch(`/api/delete-file`, {
          method:'DELETE',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
        await loadMachineFiles();
      }
    } catch (err) {
      Toast.show('Akce selhala: ' + (err?.message || err), 'error');
    }
  }

  async function fetchFileContent(name) {
    const url = `/api/config/file?name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
    const j = await r.json();
    return j.content || '';
  }

  // --- Create file modal ---
  async function openCreateModal(){
    const m = $('#createFileModal'); 
    if (!m) return;
    m.style.display = 'flex';

    // lazy-load CodeMirror a přepnout textarea → editor
    try {
      await loadCodeMirrorOnce();
      const ta = $('#createFileContent');
      if (!ta) return;

      if (cmCreate) {
        setTimeout(() => { try { cmCreate.refresh(); } catch {} }, 60);
      } else {
        cmCreate = window.CodeMirror.fromTextArea(ta, {
          lineNumbers: true,
          theme: 'material-darker',
          mode: 'properties',      // nebo 'klipper' pokud ho máš
          viewportMargin: Infinity,
          lineWrapping: true,
          indentUnit: 2,
          tabSize: 2,
          extraKeys: {
            'Ctrl-S': () => createFileSave(),
            'Cmd-S':  () => createFileSave()
          }
        });
        cmCreate.setSize('100%', '40vh');
        setTimeout(() => { try { cmCreate.refresh(); } catch {} }, 60);
        window.addEventListener('resize', () => { if (cmCreate) cmCreate.refresh(); });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMachineFiles() {
      const tbody = $('#machineTable tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;opacity:.7;">Loading…</td></tr>';
      try {
          const r = await fetch('/api/config/files', { cache: 'no-store' });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const data = await r.json();
          const files = (data && data.files) || [];
          tbody.innerHTML = '';
          files.forEach(f => {
              const name = f.name;
              const tr = document.createElement('tr');
              tr.classList.add('clickable-row'); // Přidáme třídu pro styl a JS
              tr.setAttribute('data-name', name); // Přidáme jméno souboru na řádek
              tr.innerHTML = `
                <td class="name-cell" data-label="Name">
                    <span class="fname">${name}</span>
                </td>
                <td data-label="File size">${humanSize(f.size)}</td>
                <td data-label="Last modified">${humanTime(f.mtime)}</td>`;
              tbody.appendChild(tr);
          });
      } catch (e) {
          console.error(e);
          tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#f55;">Failed to load.</td></tr>';
      }
  }

  function closeCreateModal(){
    const m = $('#createFileModal'); 
    if (m) m.style.display = 'none';
    if (cmCreate) { try { cmCreate.toTextArea(); } catch {} cmCreate = null; }
  }

  async function createFileSave() {
    const name = ($('#createFilePath').value || '').trim();
    const content = cmCreate ? cmCreate.getValue() : ($('#createFileContent').value || '');
        if (!name) {
      Toast.show('Zadej název souboru.', 'info');
      return;
    }

    try {
      const r = await fetch('/api/create-file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
      if (content.trim()) {
        const r2 = await fetch('/api/config/file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, content }) });
        if (!r2.ok) throw new Error('HTTP ' + r2.status + ' ' + await r2.text());
      }
      Toast.show(`Soubor ${name} vytvořen.`, 'success');
      closeCreateModal();
      await loadMachineFiles();
    } catch (e) {
      Toast.show('Vytvoření selhalo: ' + (e?.message || e), 'error');
    }
  }

  // --- Edit file modal (CodeMirror lazy-load) ---
  async function loadCodeMirrorOnce() {
    if (window.CodeMirror) return;
    const loadCSS = (href) => new Promise(res => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; l.onload = res; document.head.appendChild(l);
    });
    const loadJS = (src) => new Promise(res => {
      const s = document.createElement('script'); s.src = src; s.onload = res; document.body.appendChild(s);
    });
    await loadCSS('/static/vendor/codemirror/lib/codemirror.css');
    await loadCSS('/static/vendor/codemirror/theme/material-darker.css');
    await loadJS('/static/vendor/codemirror/lib/codemirror.js');
    await loadJS('/static/vendor/codemirror/addon/overlay.js');
    try { await loadJS('/static/vendor/codemirror/mode/klipper.js'); } catch {}
    try { await loadJS('/static/vendor/codemirror/mode/properties/properties.js'); } catch {}
  }

  function openEditModal(){ const m = $('#editFileModal'); if (m) m.style.display = 'flex'; }
  function closeEditModal(){
    const m = $('#editFileModal');
    if (m) m.style.display = 'none';
    if (cm) { try { cm.toTextArea(); } catch {} cm = null; }
    editingName = null;
    editingOriginalName = null;
  }

  async function openEditor(name) {
    try {
      await loadCodeMirrorOnce();
      const content = await fetchFileContent(name);

      editingOriginalName = name;
      editingName = name;

      const nameInput = $('#editFileName');
      if (nameInput) nameInput.value = name;

      const ta = $('#editFileTextarea');
      ta.value = content;

      openEditModal();

      cm = window.CodeMirror.fromTextArea(ta, {
        lineNumbers: true,
        theme: 'material-darker',
        mode: 'properties',          // nebo 'klipper', pokud máš mode
        viewportMargin: Infinity,
        lineWrapping: true,
        indentUnit: 2,
        tabSize: 2,
        extraKeys: {
          'Ctrl-S': () => saveEditor(),
          'Cmd-S':  () => saveEditor()
        }
      });
      cm.setSize('100%', '60vh');
      setTimeout(() => cm && cm.refresh(), 60);
      window.addEventListener('resize', () => { if (cm) cm.refresh(); });
    } catch (e) {
      Toast.show('Otevření souboru selhalo: ' + (e?.message || e), 'error');
    }
  }

  async function saveEditor() {
    const nameInput = $('#editFileName');
    const targetName = (nameInput?.value || '').trim();
    if (!targetName) {
      Toast.show('Zadej název souboru.', 'info');
      return;
    }

    const content = cm ? cm.getValue() : ($('#editFileTextarea').value || '');

    try {
      if (targetName !== editingOriginalName) {
        // === RENAME ===
        const rSaveNew = await fetch('/api/config/file', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: targetName, content })
        });
        if (!rSaveNew.ok) throw new Error('HTTP ' + rSaveNew.status + ' ' + await rSaveNew.text());

        // smaž původní soubor (best-effort)
        try {
          await fetch('/api/delete-file', {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name: editingOriginalName })
          });
        } catch (_) {}

        editingOriginalName = targetName;
        editingName = targetName;
        Toast.show('Soubor přejmenován a uložen.', 'success');
      } else {
        // === Save same name ===
        const r = await fetch('/api/config/file', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: targetName, content })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
        Toast.show('Uloženo', 'success');
      }

      closeEditModal();
      await loadMachineFiles();
    } catch (e) {
      Toast.show('Save failed: ' + (e?.message || e), 'error');
    }
  }

  // ===== Update manager (pouze version_info → klipper/moonraker) =====
    function normalizeVersion(v) {
    if (!v) return v;
    let s = String(v).trim();
    // odstraň cokoliv v závorkách na konci (např. build info)
    s = s.replace(/\s*\(.*\)\s*$/, '');
    // odstraň suffix s git hashem: "-g<hex>" + případné další přípony (dirty apod.)
    s = s.replace(/-g[0-9a-f]{7,40}\b.*$/i, '');
    return s;
  }

  async function refreshUpdates() {
    const tb = $('#updateTable tbody');
    if (!tb) return;

    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.7;">Loading…</td></tr>';

    const wanted = ['klipper', 'moonraker'];
    const isMeta = (k) => k === 'system' || k.startsWith('github_');

    async function loadOnce() {
      const r = await fetch('/api/update/status', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      const vi = data?.result?.version_info || {};
      const rows = [];

      Object.keys(vi).forEach((name) => {
        const low = name.toLowerCase();
        if (isMeta(low)) return;
        if (!wanted.includes(low)) return;

        const c = vi[name] || {};
        const installedRaw = c.full_version_string || c.version || c.local_version || c.current_version || '';
        const latestRaw    = c.remote_version || c.available_version || '';

        const installed = normalizeVersion(installedRaw);
        const latest    = normalizeVersion(latestRaw);

        const upToDate  = !!(c.is_up_to_date ?? (installed && latest && installed === latest));
        const canUpdate = !!(c.can_update ?? !upToDate);

        rows.push({ name, installed, latest, upToDate, canUpdate });
      });

      return rows;
    }

    try {
      let rows = await loadOnce();

      if (!rows.length) {
        try { await fetch('/api/update/refresh', { method: 'POST' }); } catch {}
        await new Promise((r) => setTimeout(r, 1000));
        rows = await loadOnce();
      }

      tb.innerHTML = '';
      if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;opacity:.7;">No components reported.</td></tr>';
        return;
      }

      rows.forEach((row) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align:left">${row.name}</td>
          <td>${row.installed || '—'}</td>
          <td>${row.latest || '—'}</td>
          <td>${
            row.upToDate
              ? '<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#1f3a2e;color:#5bd08c;font-weight:600;font-size:.85rem;">UP-TO-DATE</span>'
              : '<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#3a2a2a;color:#f57c7c;font-weight:600;font-size:.85rem;">UPDATE</span>'
          }</td>
          <td>${row.canUpdate ? `<button data-upd="${row.name}">Update</button>` : ''}</td>
        `;
        tb.appendChild(tr);
      });

      tb.onclick = async (e) => {
        const b = e.target.closest('button[data-upd]');
        if (!b) return;
        const name = b.getAttribute('data-upd');
        try {
          b.disabled = true;
          const r2 = await fetch(`/api/update/update?name=${encodeURIComponent(name)}`, { method: 'POST' });
          if (!r2.ok) throw new Error('HTTP ' + r2.status + ' ' + await r2.text());
          await refreshUpdates();
        } catch (err) {
          Toast.show('Update selhal: ' + (err?.message || err), 'error');
        } finally {
          b.disabled = false;
        }
      };
    } catch (e) {
      console.error(e);
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#f55;">Failed to load.</td></tr>';
    }
  }

  async function updateAll() {
    try {
      const btn = $('#updAllBtn'); if (btn) btn.disabled = true;
      const r = await fetch('/api/update/update_all', { method:'POST' });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
      await refreshUpdates();
    } catch (e) {
      Toast.show('Update všech selhal: ' + (e?.message || e), 'error');
    } finally { const btn = $('#updAllBtn'); if (btn) btn.disabled = false; }
  }

  // ===== Bindings & init =====
  function bindUI() {
    $('#machineRefreshBtn')?.addEventListener('click', () => { loadMachineFiles(); loadDiskUsage(); });
    $('#openCreateFileBtn')?.addEventListener('click', openCreateModal);
    $('#createCloseBtn')?.addEventListener('click', closeCreateModal);
    $('#createFileSaveBtn')?.addEventListener('click', createFileSave);

    $('#editFileCloseBtn')?.addEventListener('click', closeEditModal);
    $('#editFileSaveBtn')?.addEventListener('click', saveEditor);

    $('#updRefreshBtn')?.addEventListener('click', refreshUpdates);
    $('#updAllBtn')?.addEventListener('click', updateAll);

    // --- Nové navázání událostí na tabulku s detekcí dotyku ---
    const tbody = $('#machineTable tbody');
    if (tbody) {
      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

      if (isTouchDevice) {
        // --- CHOVÁNÍ PRO MOBILNÍ ZAŘÍZENÍ ---
        // Obyčejné klepnutí (click) otevře kontextové menu
        tbody.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = e.target.closest('tr.clickable-row');
            if (row) _showMachineContextMenu(e, row.dataset.name);
        });
      } else {
        // --- PŮVODNÍ CHOVÁNÍ PRO POČÍTAČ S MYŠÍ ---
        // Levý klik otevře editor
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr.clickable-row');
            if (row) openEditor(row.dataset.name);
        });
        // Pravý klik zobrazí kontextové menu
        tbody.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const row = e.target.closest('tr.clickable-row');
            if (row) _showMachineContextMenu(e, row.dataset.name);
        });
      }
    }
    // Skrytí menu (funguje pro obě verze)
    document.addEventListener('click', _hideMachineContextMenu);
  }

  function init() {
    _createMachineContextMenu();
    bindUI();
    loadMachineFiles();
    loadDiskUsage();
    loadSystemHost();
    refreshUpdates();

    // lehké refreshe
    let tMem = setInterval(loadSystemHost, 10000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearInterval(tStatus); clearInterval(tMem); }
      else { loadSystemHost(); tStatus = setInterval(refreshStatusMini, 3000); tMem = setInterval(loadSystemHost, 10000); }
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
