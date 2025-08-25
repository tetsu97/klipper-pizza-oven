// /static/js/pages/dashboard.js
import { sendGcode, StartJobModal, Toast, handleFirmwareRestart, handleEmergencyStop, ConfirmModal, PromptModal } from '../app.js';
import { fmtSec, mapReadableState, humanSize, humanTime } from '../utils.js';

(function () {
    if (!location.pathname.startsWith('/dashboard')) return;

    // =============================================
    // ČÁST 1: POMOCNÉ FUNKCE A PROMĚNNÉ
    // =============================================
    const $ = (s, c = document) => c.querySelector(s);
    const MAX_POINTS = 180;
    let tempChart = null;
    let lastActiveFile = null;
    let dashPreviewReqId = 0;
    let dashPreviewCurrent = null;

    function ensureChart() {
        if (window.tempChart && !window.tempChart._destroyed) return window.tempChart;
        const ctx = document.getElementById('dashTempChart')?.getContext('2d');
        if (!ctx) return null;
        window.tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                scales: {
                    x: {
                        type: 'category',
                        ticks: { color: '#ddd', maxRotation: 0 },
                        grid: { color: 'rgba(255,255,255,.07)' }
                    },
                    y: {
                        ticks: { color: '#ddd' },
                        title: { display: true, text: '°C', color: '#ddd' },
                        grid: { color: 'rgba(255,255,255,.07)' },
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: { labels: { color: '#ddd' } },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: '#2a2a40',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        boxPadding: 4,
                    }
                }
            }
        });
        return window.tempChart;
    }

    function pickColor(i) {
        const palette = ["#5b86ff", "#f44336", "#00c9a7", "#ffa726", "#ab47bc", "#66bb6a", "#26c6da"];
        return palette[i % palette.length];
    }

    async function updateTemperatures() {
        const chart = ensureChart();
        if (!chart) return;
    
        try {
            const response = await fetch('/api/temps');
            if (!response.ok) return;
            const temps = await response.json();
            const tbody = $("#dashTempsTable");
            const nowLabel = new Date().toLocaleTimeString();
            const activeSensorNames = Object.keys(temps);
    
            if (tbody) {
                tbody.innerHTML = "";
            }
    
            if (chart.data.labels.length > MAX_POINTS) {
                chart.data.labels.shift();
                chart.data.datasets.forEach(ds => ds.data.shift());
            }
            chart.data.labels.push(nowLabel);
    
            chart.data.datasets = chart.data.datasets.filter(ds => activeSensorNames.includes(ds.label));
    
            activeSensorNames.forEach((name, index) => {
                const sensor = temps[name];
                const actual = sensor.actual;
    
                if (tbody) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${name}</td><td>${actual?.toFixed(1) ?? '—'}</td><td>${sensor.target?.toFixed(1) ?? '—'}</td>`;
                    tbody.appendChild(tr);
                }
    
                let dataset = chart.data.datasets.find(ds => ds.label === name);
                if (!dataset) {
                    dataset = {
                        label: name,
                        data: new Array(chart.data.labels.length - 1).fill(null),
                        borderColor: pickColor(index),
                        tension: 0.15,
                        pointRadius: 1,
                        fill: false
                    };
                    chart.data.datasets.push(dataset);
                }
                
                dataset.data.push(actual);
            });
            
            chart.update('none');
    
        } catch (error) {
            console.error("Failed to update temperatures:", error);
        }
    }

    async function refreshRecentFiles() {
        try {
            const data = await fetch("/api/gcodes", { cache: "no-store" }).then((r) => r.json());
            const files = (data && data.files) || [];
            const tbody = $("#dashRecentFiles");
            if (!tbody) return;
            tbody.innerHTML = "";
            for (const f of files) {
                const tr = document.createElement("tr");
                tr.dataset.name = f.name;
                tr.classList.add('clickable-row');
                const date = humanTime(f.mtime);
                const size = humanSize(f.size);
                tr.innerHTML = `
                    <td class="name-cell"><span class="fname">${f.name}</span></td>
                    <td data-label="Last Modified">${date}</td>
                    <td data-label="File Size">${size}</td>
                `;
                tbody.appendChild(tr);
            }
            tbody.onclick = (e) => {
                const row = e.target.closest("tr.clickable-row");
                if (row && typeof StartJobModal !== 'undefined') StartJobModal.open(row.dataset.name);
            };
        } catch (e) {
            console.warn("Failed to refresh recent files", e);
        }
    }

    // =============================================
    // ČÁST 2: HLAVNÍ FUNKCE PRO AKTUALIZACI UI
    // =============================================
    function updateUIFromStatus(statusObjects) {
        if (!statusObjects) return;
        const printStats = statusObjects.print_stats || {};
        const displayStatus = statusObjects.display_status || {};
        const rawState = printStats.state || "standby";
        const state = rawState.toLowerCase();
        const filename = printStats.filename || null;

        if (filename && ['printing', 'paused', 'complete'].includes(state)) {
            lastActiveFile = filename;
        }

        const showJobDetails = (state === 'printing' || state === 'paused' || state === 'complete') || (state === 'error' && lastActiveFile);

        const jobDetail = $('#dashJobDetail');
        const fileList = $('#dashFileList');
        if (jobDetail) jobDetail.hidden = !showJobDetails;
        if (fileList) fileList.hidden = showJobDetails;

        if (showJobDetails) {
            const fileToShow = filename || lastActiveFile;
            $('#dashJobTitle').textContent = "Actual program";
            $('#dashJobName').textContent = fileToShow;
            $('#dashFile').textContent = fileToShow;
        } else {
            $('#dashJobTitle').textContent = "Select a program";
            $('#dashJobName').textContent = "—";
            $('#dashFile').textContent = "—";
        }

        $("#dashClearStateContainer").style.display = ['complete', 'error'].includes(state) ? 'block' : 'none';

        const pill = $('#dashState');
        if (pill) {
            const { text, color } = mapReadableState(rawState);
            pill.textContent = text;
            pill.style.backgroundColor = color;
        }
        
        const isPrinting = (state === 'printing');
        const isPaused = (state === 'paused');
        $('#dashPause').style.display = isPrinting ? 'inline-flex' : 'none';
        $('#dashCancel').style.display = isPrinting || isPaused ? 'inline-flex' : 'none';
        $('#dashResume').style.display = isPaused ? 'inline-flex' : 'none';

        const progress = displayStatus.progress || 0;
        const pct = Math.round(progress * 100);
        $("#dashProgressText").textContent = `${pct}%`;
        $("#dashProgressBar").style.width = `${pct}%`;
        const printDuration = printStats.print_duration || 0;
        let eta_s = null;
        if (progress > 0.001 && printDuration > 0) {
            eta_s = Math.max(0, parseInt(String(printDuration * (1.0 / progress - 1.0))));
        }
        $("#dashTimes").textContent = `${fmtSec(printDuration)} / ETA ${fmtSec(eta_s)}`;
    }

    // =============================================
    // ČÁST 3: POSLUCHAČE SIGNÁLŮ Z app.js
    // =============================================
    document.addEventListener('klipper-status-update', (event) => {
        if (event.detail) {
            updateUIFromStatus(event.detail);
        }
    });

    document.addEventListener('klipper-gcode-response', (event) => {
        const line = event.detail;
        const consoleBox = $("#dashConsoleLog");
        if (consoleBox && typeof line === 'string') {
            const div = document.createElement('div');
            div.textContent = line.trim();
            consoleBox.appendChild(div);
            if (consoleBox.children.length > 200) {
                consoleBox.removeChild(consoleBox.firstChild);
            }
            consoleBox.scrollTop = consoleBox.scrollHeight;
        }
    });

    // ==========================================================
    // ČÁST 4: LOGIKA PRO KONTEXTOVÉ MENU NA DASHBOARDU
    // ==========================================================
    let dashContextMenu = null;

    function _createDashContextMenu() {
        if (document.getElementById('dashContextMenu')) return;
        const menu = document.createElement('ul');
        menu.id = 'dashContextMenu';
        menu.className = 'context-menu';
        menu.innerHTML = `
            <li><button data-act="start">Start</button></li>
            <li><button data-act="edit">Edit (Visual)</button></li>
            <li><button data-act="edit-gcode">Edit G-code</button></li>
            <li><button data-act="duplicate">Duplicate</button></li>
            <li><button data-act="delete" class="btn--danger" style="color:#f57c7c;">Delete</button></li>`;
        document.body.appendChild(menu);
        dashContextMenu = menu;

        menu.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            _handleDashAction(button.dataset.act, menu.dataset.name);
            _hideDashContextMenu();
        });
    }

    function _showDashContextMenu(event, fileName) {
        if (!dashContextMenu) _createDashContextMenu();
        dashContextMenu.dataset.name = fileName;
        dashContextMenu.style.display = 'block';
        dashContextMenu.style.left = `${event.pageX}px`;
        dashContextMenu.style.top = `${event.pageY}px`;
    }

    function _hideDashContextMenu() {
        if (dashContextMenu) dashContextMenu.style.display = 'none';
    }

    async function _handleDashAction(act, name) {
        if (!act || !name) return;
        try {
            if (act === 'start') {
                StartJobModal.open(name);
            } else if (act === 'edit') {
                window.location.href = `/profiles?edit=${encodeURIComponent(name)}`;
            } else if (act === 'edit-gcode') {
                window.location.href = `/profiles?edit-gcode=${encodeURIComponent(name)}`;
            } else if (act === 'duplicate') {
                const newName = await PromptModal.show('Duplicate Profile', `Enter a new name for the copy of "${name}":`, `${name} (copy)`);
                if (!newName || newName.trim() === '') return;

                showLoadingOverlay(`Duplicating profile '${name}'...`);
                try {
                    const payload = { originalName: name, newName: newName.trim() };
                    const response = await fetch('/api/gcodes/duplicate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    if (!response.ok) {
                        const err = await response.json();
                        throw new Error(err.detail || `HTTP ${response.status}`);
                    }
                    const result = await response.json();
                    Toast.show(`Profile duplicated as '${result.newName}'.`, 'success');
                    await refreshRecentFiles();
                } catch (err) {
                    Toast.show(`Duplication failed: ${err.message}`, 'error');
                } finally {
                    hideLoadingOverlay();
                }
            } else if (act === 'delete') {
                const confirmed = await ConfirmModal.show('Delete Profile', `Are you sure you want to delete the profile: ${name}?`);
                if (confirmed) {
                    await fetch(`/api/gcodes/?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
                    Toast.show(`Profile ${name} deleted.`, 'success');
                    await refreshRecentFiles();
                }
            }
        } catch (err) {
            Toast.show(`Action failed: ${err.message}`, 'error');
        }
    }

    // =============================================
    // ČÁST 5: INICIALIZACE STRÁNKY
    // =============================================
    function init() {
        _createDashContextMenu();
        document.addEventListener('click', _hideDashContextMenu);
        
        const recentFilesTbody = $("#dashRecentFiles");
        if (recentFilesTbody) {
            recentFilesTbody.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const row = e.target.closest('tr.clickable-row');
                if (row) {
                    _showDashContextMenu(e, row.dataset.name);
                }
            });
        }
        
        $("#dashPause")?.addEventListener("click", () => sendGcode("PAUSE"));
        $("#dashResume")?.addEventListener("click", () => sendGcode("RESUME"));
        $("#dashCancel")?.addEventListener("click", async () => {
            const confirmed = await ConfirmModal.show(
                'Cancel Process',
                'Are you sure you want to cancel the current process? This action cannot be undone.'
            );
            if (confirmed) {
                sendGcode("CANCEL_PRINT");
            }
        });

        $("#btnFwRestart")?.addEventListener("click", () => handleFirmwareRestart());
        $("#btnEStop")?.addEventListener("click", () => handleEmergencyStop());

        $("#dashConsoleSend")?.addEventListener("click", () => {
            const input = $("#dashConsoleInput");
            if (input && input.value && typeof sendGcode === 'function') {
                sendGcode(input.value);
                input.value = "";
            }
        });
        $("#dashConsoleInput")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                $("#dashConsoleSend")?.click();
                e.preventDefault();
            }
        });
        
        $("#dashClearStateBtn")?.addEventListener("click", () => {
            lastActiveFile = null;
            if(typeof sendGcode === 'function') sendGcode('SDCARD_RESET_FILE');
            refreshRecentFiles();
        });

        refreshRecentFiles();
        
        updateTemperatures();
        setInterval(updateTemperatures, 2500);
    }

    window.addEventListener('DOMContentLoaded', init);
})();