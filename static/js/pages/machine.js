// /static/js/pages/machine.js

// Import shared functions from app.js
import { Toast, showLoadingOverlay, hideLoadingOverlay, AlertModal, ConfirmModal } from '../app.js';
import { humanSize, humanTime } from '../utils.js';

(function () {
  if (!location.pathname.startsWith('/machine')) return;

  const $ = (s, c=document) => c.querySelector(s);

  // shared editors / state
  let cm = null;
  let cmCreate = null;
  let editingName = null;
  let editingOriginalName = null;

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
          <li><button data-act="edit">Edit</button></li>
          <li><button data-act="download">Download</button></li>
          <li><button data-act="delete" style="color:#f57c7c;">Delete</button></li>
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
              await openEditor(name);
          } else if (act === 'download') {
              const content = await fetchFileContent(name);
              const blob = new Blob([content], { type: 'text/plain' });
              const a = document.createElement('a');
              a.download = name.split('/').pop();
              a.href = URL.createObjectURL(blob);
              a.click();
              URL.revokeObjectURL(a.href);
          } else if (act === 'delete') {
              const confirmed = await ConfirmModal.show(
                  'Delete File',
                  `Are you sure you want to permanently delete the file: ${name}?`
              );
              if (!confirmed) return;
              
              const r = await fetch(`/api/config/delete-file?name=${encodeURIComponent(name)}`, {
                  method: 'DELETE'
              });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              Toast.show(`File ${name} deleted.`, 'success'); // Přidáme i notifikaci o úspěchu
              await loadMachineFiles();
          }
      } catch (err) {
          Toast.show('Action failed: ' + (err?.message || err), 'error');
      }
  }
  
  async function fetchFileContent(name) {
    const url = `/api/config/file?name=${encodeURIComponent(name)}`;
    const r = await fetch(url, { cache:'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
    const j = await r.json();
    return j.content || '';
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
              tr.classList.add('clickable-row');
              tr.setAttribute('data-name', name);
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

  // --- Create file modal ---
  async function openCreateModal() {
    const m = $('#createFileModal');
    if (!m) return;
    m.style.display = 'flex';
    const ta = $('#createFileContent');
    if (!ta) return;

    if (cmCreate) {
        cmCreate.toTextArea(); // Safely remove the old instance
    }

    cmCreate = window.CodeMirror.fromTextArea(ta, {
      lineNumbers: true, theme: 'material-darker', mode: 'klipper',
      viewportMargin: Infinity, lineWrapping: true, indentUnit: 2, tabSize: 2,
      extraKeys: { 'Ctrl-S': () => createFileSave(), 'Cmd-S': () => createFileSave() }
    });
    cmCreate.setSize('100%', '40vh');
    setTimeout(() => cmCreate.refresh(), 50);
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
      Toast.show('Please enter a file name.', 'info');
      return;
    }

    try {
      const r = await fetch('/api/config/create-file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
      
      if (content.trim()) {
        const r2 = await fetch('/api/config/file', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, content }) });
        if (!r2.ok) throw new Error('HTTP ' + r2.status + ' ' + await r2.text());
      }
      
      Toast.show(`File ${name} created.`, 'success');
      closeCreateModal();
      await loadMachineFiles();
    } catch (e) {
      Toast.show('Creation failed: ' + (e?.message || e), 'error');
    }
  }

  // --- Edit file modal (CodeMirror lazy-load) ---
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
      const content = await fetchFileContent(name);
      editingOriginalName = name;
      editingName = name;

      $('#editFileName').value = name;
      const ta = $('#editFileTextarea');
      ta.value = content;

      openEditModal();

      if (cm) {
          cm.toTextArea(); // Safely remove the old instance
      }

      cm = window.CodeMirror.fromTextArea(ta, {
        lineNumbers: true, theme: 'material-darker', mode: 'klipper',
        viewportMargin: Infinity, lineWrapping: true, indentUnit: 2, tabSize: 2,
        extraKeys: { 'Ctrl-S': () => saveEditor(), 'Cmd-S': () => saveEditor() }
      });
      cm.setSize('100%', '60vh');
      setTimeout(() => cm && cm.refresh(), 50);
    } catch (e) {
      Toast.show('Failed to open file: ' + (e?.message || e), 'error');
    }
  }

  async function saveEditor() {
    const nameInput = $('#editFileName');
    const targetName = (nameInput?.value || '').trim();
    if (!targetName) {
      Toast.show('Please enter a file name.', 'info');
      return;
    }

    const content = cm ? cm.getValue() : ($('#editFileTextarea').value || '');

    try {
      if (targetName !== editingOriginalName) {
        const rSaveNew = await fetch('/api/config/file', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: targetName, content })
        });
        if (!rSaveNew.ok) throw new Error('HTTP ' + rSaveNew.status + ' ' + await rSaveNew.text());

        try {
          await fetch('/api/config/delete-file', {
            method: 'DELETE',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ name: editingOriginalName })
          });
        } catch (_) {}

        editingOriginalName = targetName;
        editingName = targetName;
        Toast.show('File renamed and saved.', 'success');
      } else {
        const r = await fetch('/api/config/file', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ name: targetName, content })
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
        Toast.show('Saved', 'success');
      }

      closeEditModal();
      await loadMachineFiles();
    } catch (e) {
      Toast.show('Save failed: ' + (e?.message || e), 'error');
    }
  }

  function bindUpload() {
    const uploadBtn = $('#uploadFileBtn');
    const fileInput = $('#fileUploadInput');
    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    // Zpracování vybraných souborů
    fileInput.addEventListener('change', async (event) => {
      const files = event.target.files;
      if (!files.length) return;

      showLoadingOverlay(`Uploading ${files.length} file(s)...`);

      const uploadPromises = Array.from(files).map(file => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const content = e.target.result;
              const payload = {
                name: file.name,
                content: content
              };
              
              const response = await fetch('/api/config/file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });

              if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to upload ${file.name}: ${errorText}`);
              }
              resolve(file.name);
            } catch (error) {
              reject(error);
            }
          };
          reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
          reader.readAsText(file);
        });
      });

      try {
        const results = await Promise.all(uploadPromises);
        Toast.show(`Successfully uploaded ${results.length} file(s).`, 'success');
      } catch (error) {
        Toast.show(error.message, 'error');
      } finally {
        hideLoadingOverlay();
        loadMachineFiles(); // Obnovíme seznam souborů
        event.target.value = ''; // Vyresetujeme input, aby bylo možné nahrát stejný soubor znovu
      }
    });
  }

  // ===== Update manager (only version_info → klipper/moonraker) =====
    function normalizeVersion(v) {
    if (!v) return v;
    let s = String(v).trim();
    s = s.replace(/\s*\(.*\)\s*$/, '');
    s = s.replace(/-g[0-9a-f]{7,40}\b.*$/i, '');
    return s;
  }

  async function refreshUpdates() {
    const tb = $('#updateTable tbody');
    if (!tb) return;
    showLoadingOverlay('Loading update status...');

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
          Toast.show('Update failed: ' + (err?.message || err), 'error');
        } finally {
          b.disabled = false;
        }
      };
      hideLoadingOverlay();
    } catch (e) {
      hideLoadingOverlay();
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
      Toast.show('Update all failed: ' + (e?.message || e), 'error');
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
    $('#installPizzaModuleBtn')?.addEventListener('click', installOvenModule);

    bindUpload();

    const tbody = $('#machineTable tbody');
    if (tbody) {
      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isTouchDevice) {
        tbody.addEventListener('click', (e) => {
            e.stopPropagation();
            const row = e.target.closest('tr.clickable-row');
            if (row) _showMachineContextMenu(e, row.dataset.name);
        });
      } else {
        tbody.addEventListener('click', (e) => {
            const row = e.target.closest('tr.clickable-row');
            if (row) openEditor(row.dataset.name);
        });
        tbody.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const row = e.target.closest('tr.clickable-row');
            if (row) _showMachineContextMenu(e, row.dataset.name);
        });
      }
    }
    document.addEventListener('click', _hideMachineContextMenu);
  }

  async function checkOvenModuleStatus() {
      const btn = $('#installPizzaModuleBtn');
      if (!btn) return;
      btn.disabled = true; // Prevent clicking during the check

      try {
          const response = await fetch('/api/installer/status');
          if (!response.ok) {
              btn.textContent = 'Install Module'; // In case of API error
              return;
          }
          const data = await response.json();

          // New main check: does a valid Klipper installation exist?
          if (!data.klipper_path_valid) {
              btn.textContent = 'Klipper Not Found';
              btn.style.backgroundColor = '#616161'; // Gray color
              const tooltip = btn.querySelector('.tooltip-text');
              if (tooltip) tooltip.textContent = 'The standard printer_data/config directory was not found. Ensure Klipper is correctly installed.';
              // The button remains disabled (disabled = true)
              return;
          }
          
          // The rest of the logic is executed only if Klipper is found
          if (data.installed) {
              btn.textContent = 'Module Installed';
              btn.style.backgroundColor = '#1f3a2e'; // Darker green
              const tooltip = btn.querySelector('.tooltip-text');
              if (tooltip) tooltip.textContent = 'The module is installed. Click to reinstall it.';
          } else {
              btn.textContent = 'Install Oven Module';
              btn.style.backgroundColor = '#2e7d32'; // Original green
              const tooltip = btn.querySelector('.tooltip-text');
              if (tooltip) tooltip.textContent = 'Installs and configures the advanced module for oven control. Requires a Klipper restart.';
          }
          btn.disabled = false; // Enable the button

      } catch (error) {
          console.error('Error checking module status:', error);
          btn.textContent = 'Error Checking Status';
          btn.style.backgroundColor = '#c62828'; // Red color for error
      }
  }

  async function installOvenModule() {
      const isInstalled = $('#installPizzaModuleBtn')?.textContent.includes('Installed');
      const message = isInstalled
          ? 'The module seems to be already installed. Do you want to reinstall it? This will overwrite the existing module files.'
          : 'Are you sure you want to install the oven module? This will modify your configuration files and will require a Klipper restart.';

      const confirmed = await ConfirmModal.show(
          isInstalled ? 'Reinstall Module' : 'Install Module',
          message
      );

      if (!confirmed) {
          return;
      }

      showLoadingOverlay('Installing oven module...');
      try {
          const response = await fetch('/api/installer/install_pizza_oven_module', {
              method: 'POST'
          });

          if (!response.ok) {
              let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
              try {
                  const errData = await response.json();
                  errorDetail = errData.detail || errorDetail;
              } catch (e) { /* Response was not JSON */ }
              throw new Error(errorDetail);
          }

          const result = await response.json();
          hideLoadingOverlay();
          
          Toast.show(result.message || 'Module successfully installed!', 'success');
          
          const formattedMessage = (result.actions || []).join('\n- ');
          AlertModal.show(
            'Installation Complete',
            'The following steps were performed:\n\n- ' + formattedMessage + '\n\nA Klipper firmware restart is required to activate the changes.'
          );
          
          await checkOvenModuleStatus();

      } catch (err) {
          hideLoadingOverlay();
          Toast.show('Installation failed: ' + err.message, 'error');
      }
  }

  function init() {
    _createMachineContextMenu();
    bindUI();
    loadMachineFiles();
    loadDiskUsage();
    loadSystemHost();
    refreshUpdates();
    checkOvenModuleStatus();

    let tMem = setInterval(loadSystemHost, 10000);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { clearInterval(tMem); }
      else { loadSystemHost(); tMem = setInterval(loadSystemHost, 10000); }
    });
  }

  window.addEventListener('DOMContentLoaded', init);
})();