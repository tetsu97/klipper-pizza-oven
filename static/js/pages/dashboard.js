// /static/js/pages/dashboard.js - KOMPLETNÍ OPRAVENÁ VERZE
import { sendGcode, StartJobModal, Toast, handleFirmwareRestart, handleEmergencyStop, ConfirmModal, PromptModal, showLoadingOverlay, hideLoadingOverlay } from '../app.js';
import { fmtSec, mapReadableState, humanSize, humanTime } from '../utils.js';

(function () {
    // Zastavíme provádění skriptu, pokud nejsme na stránce dashboardu
    if (!location.pathname.startsWith('/dashboard') && location.pathname !== '/') return;

    // Zapouzdříme veškerou logiku do jednoho objektu, abychom předešli globálním konfliktům
    const DashboardPage = {
        tempChart: null,
        lastActiveFile: null,
        contextMenu: null,
        MAX_POINTS: 180,

        // Inicializační metoda, která se spustí po načtení stránky
        init() {
            this._createContextMenu();
            this.bindUI();

            this.refreshRecentFiles();
            
            this.updateTemperatures();
            setInterval(() => this.updateTemperatures(), 2500);

            // Globální listenery pro aktualizace z Klipperu
            document.addEventListener('klipper-status-update', (event) => {
                if (event.detail) {
                    this.updateUIFromStatus(event.detail);
                }
            });

            document.addEventListener('klipper-gcode-response', (event) => {
                this.handleGcodeResponse(event.detail);
            });
        },

        // Metoda pro navázání všech event listenerů na prvky UI
        bindUI() {
            document.addEventListener('click', () => this._hideContextMenu());

            const recentFilesTbody = document.getElementById("dashRecentFiles");
            if (recentFilesTbody) {
                recentFilesTbody.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const row = e.target.closest('tr.clickable-row');
                    if (row) {
                        this._showContextMenu(e, row.dataset.name);
                    }
                });
                recentFilesTbody.addEventListener('click', (e) => {
                    const row = e.target.closest("tr.clickable-row");
                    if (row && typeof StartJobModal !== 'undefined') StartJobModal.open(row.dataset.name);
                });
            }

            document.getElementById("dashPause")?.addEventListener("click", () => sendGcode("PAUSE"));
            document.getElementById("dashResume")?.addEventListener("click", () => sendGcode("RESUME"));
            document.getElementById("dashCancel")?.addEventListener("click", async () => {
                const confirmed = await ConfirmModal.show(
                    'Cancel Process',
                    'Are you sure you want to cancel the current process? This action cannot be undone.'
                );
                if (confirmed) {
                    sendGcode("CANCEL_PRINT");
                }
            });

            document.getElementById("btnFwRestart")?.addEventListener("click", () => handleFirmwareRestart());
            document.getElementById("btnEStop")?.addEventListener("click", () => handleEmergencyStop());

            document.getElementById("dashConsoleSend")?.addEventListener("click", () => {
                const input = document.getElementById("dashConsoleInput");
                if (input && input.value) {
                    sendGcode(input.value);
                    input.value = "";
                }
            });
            document.getElementById("dashConsoleInput")?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    document.getElementById("dashConsoleSend")?.click();
                    e.preventDefault();
                }
            });
            
            document.getElementById("dashClearStateBtn")?.addEventListener("click", () => {
                this.lastActiveFile = null;
                sendGcode('SDCARD_RESET_FILE');
                this.refreshRecentFiles();
            });
        },
        
        // Zpracování odpovědí z Klipperu pro konzoli
        handleGcodeResponse(line) {
            const consoleBox = document.getElementById("dashConsoleLog");
            if (consoleBox && typeof line === 'string') {
                const div = document.createElement('div');
                div.textContent = line.trim();
                consoleBox.appendChild(div);
                if (consoleBox.children.length > 200) {
                    consoleBox.removeChild(consoleBox.firstChild);
                }
                consoleBox.scrollTop = consoleBox.scrollHeight;
            }
        },

        // Zajistí, že graf existuje, a pokud ne, vytvoří ho
        ensureChart() {
            if (this.tempChart && !this.tempChart._destroyed) return this.tempChart;
            const ctx = document.getElementById('dashTempChart')?.getContext('2d');
            if (!ctx) return null;

            const pickColor = (i) => {
                const palette = ["#5b86ff", "#f44336", "#00c9a7", "#ffa726", "#ab47bc", "#66bb6a", "#26c6da"];
                return palette[i % palette.length];
            };

            this.tempChart = new Chart(ctx, {
                type: 'line',
                data: { labels: [], datasets: [] },
                options: {
                    responsive: true, maintainAspectRatio: false, animation: false,
                    scales: {
                        x: { type: 'category', ticks: { color: '#ddd', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,.07)' } },
                        y: { ticks: { color: '#ddd' }, title: { display: true, text: '°C', color: '#ddd' }, grid: { color: 'rgba(255,255,255,.07)' }, beginAtZero: true }
                    },
                    plugins: {
                        legend: { labels: { color: '#ddd' } },
                        tooltip: { mode: 'index', intersect: false, backgroundColor: '#2a2a40', titleFont: { size: 14, weight: 'bold' }, bodyFont: { size: 12 }, padding: 10, cornerRadius: 8, boxPadding: 4 }
                    }
                }
            });
            return this.tempChart;
        },

        // Aktualizuje graf a tabulku teplot
        async updateTemperatures() {
            const chart = this.ensureChart();
            if (!chart) return;
        
            try {
                const response = await fetch('/api/temps');
                if (!response.ok) return;
                const temps = await response.json();
                const tbody = document.getElementById("dashTempsTable");
                const nowLabel = new Date().toLocaleTimeString();
                const activeSensorNames = Object.keys(temps);
        
                if (tbody) tbody.innerHTML = "";
        
                if (chart.data.labels.length > 180) { // MAX_POINTS
                    chart.data.labels.shift();
                    chart.data.datasets.forEach(ds => ds.data.shift());
                }
                chart.data.labels.push(nowLabel);
        
                chart.data.datasets = chart.data.datasets.filter(ds => activeSensorNames.includes(ds.label));
        
                activeSensorNames.forEach((name, index) => {
                    const sensor = temps[name];
                    if (tbody) {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td>${name}</td><td>${sensor.actual?.toFixed(1) ?? '—'}</td><td>${sensor.target?.toFixed(1) ?? '—'}</td>`;
                        tbody.appendChild(tr);
                    }
        
                    let dataset = chart.data.datasets.find(ds => ds.label === name);
                    if (!dataset) {
                        dataset = {
                            label: name,
                            data: new Array(chart.data.labels.length - 1).fill(null),
                            borderColor: this.ensureChart().options.plugins.legend.labels.color, // Použijeme funkci pro barvu
                            tension: 0.15,
                            pointRadius: 1,
                            fill: false
                        };
                        chart.data.datasets.push(dataset);
                    }
                    dataset.data.push(sensor.actual);
                });
                
                chart.update('none');
            } catch (error) {
                console.error("Failed to update temperatures:", error);
            }
        },

        // Načte a zobrazí seznam posledních profilů
        async refreshRecentFiles() {
            try {
                const data = await fetch("/api/gcodes", { cache: "no-store" }).then((r) => r.json());
                const files = (data && data.files) || [];
                const tbody = document.getElementById("dashRecentFiles");
                if (!tbody) return;
                tbody.innerHTML = "";
                for (const f of files) {
                    const tr = document.createElement("tr");
                    tr.dataset.name = f.name;
                    tr.classList.add('clickable-row');
                    tr.innerHTML = `
                        <td class="name-cell"><span class="fname">${f.name}</span></td>
                        <td data-label="Last Modified">${humanTime(f.mtime)}</td>
                        <td data-label="File Size">${humanSize(f.size)}</td>
                    `;
                    tbody.appendChild(tr);
                }
            } catch (e) {
                console.warn("Failed to refresh recent files", e);
            }
        },

        // Aktualizuje celé UI na základě stavových dat z Klipperu
        updateUIFromStatus(statusObjects) {
            if (!statusObjects) return;
            const printStats = statusObjects.print_stats || {};
            const displayStatus = statusObjects.display_status || {};
            const rawState = printStats.state || "standby";
            const state = rawState.toLowerCase();
            const filename = printStats.filename || null;

            if (filename && ['printing', 'paused', 'complete'].includes(state)) {
                this.lastActiveFile = filename;
            }

            const showJobDetails = (state === 'printing' || state === 'paused' || state === 'complete') || (state === 'error' && this.lastActiveFile);

            const jobDetail = document.getElementById('dashJobDetail');
            const fileList = document.getElementById('dashFileList');
            if (jobDetail) jobDetail.hidden = !showJobDetails;
            if (fileList) fileList.hidden = showJobDetails;

            if (showJobDetails) {
                const fileToShow = filename || this.lastActiveFile;
                document.getElementById('dashJobTitle').textContent = "Current Program";
                document.getElementById('dashJobName').textContent = fileToShow;
                document.getElementById('dashFile').textContent = fileToShow;
            } else {
                document.getElementById('dashJobTitle').textContent = "Select a Program";
                document.getElementById('dashJobName').textContent = "—";
                document.getElementById('dashFile').textContent = "—";
            }

            document.getElementById("dashClearStateContainer").style.display = ['complete', 'error'].includes(state) ? 'block' : 'none';

            const pill = document.getElementById('dashState');
            if (pill) {
                const { text, color } = mapReadableState(rawState);
                pill.textContent = text;
                pill.style.backgroundColor = color;
            }
            
            const isPrinting = (state === 'printing');
            const isPaused = (state === 'paused');
            document.getElementById('dashPause').style.display = isPrinting ? 'inline-flex' : 'none';
            document.getElementById('dashCancel').style.display = isPrinting || isPaused ? 'inline-flex' : 'none';
            document.getElementById('dashResume').style.display = isPaused ? 'inline-flex' : 'none';

            const progress = displayStatus.progress || 0;
            const pct = Math.round(progress * 100);
            document.getElementById("dashProgressText").textContent = `${pct}%`;
            document.getElementById("dashProgressBar").style.width = `${pct}%`;
            const printDuration = printStats.print_duration || 0;
            let eta_s = null;
            if (progress > 0.001 && printDuration > 0) {
                eta_s = Math.max(0, parseInt(String(printDuration * (1.0 / progress - 1.0))));
            }
            document.getElementById("dashTimes").textContent = `${fmtSec(printDuration)} / ETA ${fmtSec(eta_s)}`;
        },

        // --- Kontextové menu pro dashboard ---
        // V souboru /static/js/pages/dashboard.js nahraďte tuto metodu

        _createContextMenu() {
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
            this.contextMenu = menu;

            // ===== ZDE JE STEJNÁ OPRAVA =====
            menu.addEventListener('click', async (e) => { // Přidáno async
                e.stopPropagation();
                const button = e.target.closest('button');
                if (!button) return;

                await this._handleAction(button.dataset.act, menu.dataset.name); // Přidáno await
                
                this._hideContextMenu();
            });
        },

        _showContextMenu(event, fileName) {
            if (!this.contextMenu) this._createContextMenu();
            this.contextMenu.dataset.name = fileName;
            this.contextMenu.style.display = 'block';
            this.contextMenu.style.left = `${event.pageX}px`;
            this.contextMenu.style.top = `${event.pageY}px`;
        },

        _hideContextMenu() {
            if (this.contextMenu) this.contextMenu.style.display = 'none';
        },

        async _handleAction(act, name) {
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
                        await this.refreshRecentFiles();
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
                        await this.refreshRecentFiles();
                    }
                }
            } catch (err) {
                Toast.show(`Action failed: ${err.message}`, 'error');
            }
        }
    };

    // Spustíme inicializaci po načtení celého DOM
    window.addEventListener('DOMContentLoaded', () => {
        DashboardPage.init();
    });
})();