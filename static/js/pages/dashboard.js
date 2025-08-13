// /static/js/pages/dashboard.js (FINÁLNÍ OPRAVENÁ VERZE)

// =============================================
// ČÁST 1: POMOCNÉ FUNKCE (Kompletní verze)
// =============================================
const $ = (s, c = document) => c.querySelector(s);
const MAX_POINTS = 180;
let tempChart = null;
let tempSeries = {};
let dashPreviewReqId = 0;
let dashPreviewCurrent = null;
let lastActiveFile = null;
let isClearingState = false;

function fmtSec(s) {
    if (s == null || isNaN(s)) return "—";
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [h, m.toString().padStart(2, "0"), ss.toString().padStart(2, "0")].join(":");
}

function mapReadableState(state) {
    const s = String(state || 'unknown').toLowerCase();
    switch (s) {
        case 'standby':
        case 'idle': return { text: 'Standby', color: '#2e7d32' };
        case 'printing': return { text: 'Probíhá proces', color: '#b38900' };
        case 'paused': return { text: 'Paused', color: '#ef6c00' };
        case 'complete': return { text: 'Completed', color: '#1e88e5' };
        case 'error': return { text: 'Error', color: '#c62828' };
        default: return { text: state || 'Unknown', color: '#666' };
    }
}

function applyDashState(state) {
    const { text, color } = mapReadableState(state);
    const pill = document.getElementById('dashState');
    if (pill) {
        pill.textContent = text;
        pill.style.backgroundColor = color;
    }
}

function updateDashActionButtons(state) {
    const s = String(state || '').toLowerCase();
    const isPrinting = (s === 'printing');
    const isPaused = (s === 'paused');
    const btnPause = document.getElementById('dashPause');
    const btnResume = document.getElementById('dashResume');
    const btnCancel = document.getElementById('dashCancel');
    if(btnPause) btnPause.style.display = isPrinting ? 'inline-flex' : 'none';
    if(btnCancel) btnCancel.style.display = isPrinting || isPaused ? 'inline-flex' : 'none';
    if(btnResume) btnResume.style.display = isPaused ? 'inline-flex' : 'none';
}

function ensureChart() {
    if (window.tempChart && !window.tempChart._destroyed) return window.tempChart;
    const ctx = document.getElementById('dashTempChart')?.getContext('2d');
    if (!ctx) return null;
    window.tempChart = new Chart(ctx, {
        type: 'line', data: { labels: [], datasets: [] },
        options: {
            responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
            interaction: { mode: 'nearest', intersect: false }, layout: { padding: 0 },
            scales: {
                x: { ticks: { color: '#ddd', maxRotation: 0 }, grid: { color: 'rgba(255,255,255,.07)' } },
                y: { ticks: { color: '#ddd' }, title: { display: true, text: '°C', color: '#ddd' }, grid: { color: 'rgba(255,255,255,.07)' } }
            },
            plugins: { legend: { labels: { color: '#ddd' } } }
        }
    });
    return window.tempChart;
}

function pickColor(i) {
    const palette = ["#5b86ff", "#f44336", "#00c9a7", "#ffa726", "#ab47bc", "#66bb6a", "#26c6da"];
    return palette[i % palette.length];
}

async function refreshRecentFiles() {
    try {
        const data = await fetch("/api/gcodes", { cache: "no-store" }).then((r) => r.json());
        const files = (data && data.files) || [];
        const tbody = $("#dashRecentFiles");
        if (!tbody) return;

        tbody.innerHTML = ""; // Vyčistíme tabulku

        for (const f of files) {
            const tr = document.createElement("tr");
            tr.dataset.name = f.name;
            tr.classList.add('clickable-row'); // <<< PŘIDALI JSME TŘÍDU

            const date = f.mtime ? new Date(f.mtime * 1000).toLocaleString() : "—";
            const size = f.size != null ? (f.size / 1024 / 1024).toFixed(2) + " MB" : "—";

            // HTML je teď bez posledního sloupce a tlačítka
            tr.innerHTML = `
                <td class="name-cell">
                    <span class="fname">${f.name}</span>
                </td>
                <td data-label="Last modified">${date}</td>
                <td data-label="Size">${size}</td>
            `;
            tbody.appendChild(tr);
        }

        // ZMĚNILI JSME LOGIKU ONCLICK
        tbody.onclick = (e) => {
            // Reagujeme na klik na celý řádek
            const row = e.target.closest("tr.clickable-row");
            if (!row) return;

            const name = row.dataset.name; // Jméno souboru si vezmeme z řádku
            StartJobModal.open(name); // Otevřeme naše globální okno
        };
    } catch (e) {
        console.warn("Failed to refresh recent files", e);
    }
}

function bindUpload() {
    const btn = $("#dashUploadBtn");
    const inp = $("#dashUpload");
    if (!btn || !inp) return;

    btn.addEventListener("click", () => inp.click());
    inp.addEventListener("change", async () => {
        const file = inp.files && inp.files[0];
        if (!file) return;

        const text = await file.text();
        try {
            const resp = await fetch("/api/save_gcode", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ filename: file.name, gcode: text })
            });
            if (!resp.ok) {
              const error = await resp.text();
              throw new Error(`Save failed: ${error}`);
            }
            Toast.show("G-code úspěšně nahrán.", 'success');
            refreshRecentFiles();
        } catch (e) {
            Toast.show("Nahrávání selhalo: " + e.message, 'error');
        } finally {
            inp.value = "";
        }
    });
}

function bindDashEmergencyButtons() {
    const fw = document.getElementById('btnFwRestart');
    const es = document.getElementById('btnEStop');
    if (fw) fw.addEventListener('click', () => {
        if (confirm('Restart Klipper firmware now?\n(This will stop any running job.)')) {
            sendGcode('FIRMWARE_RESTART');
        }
    });
    if (es) es.addEventListener('click', () => {
        if (confirm('EMERGENCY STOP?\nThis immediately halts the machine.')) {
            sendGcode('M112');
        }
    });
}

// Funkce pro náhledy G-kódu (thumbnails)
function dashExtractThumbs(text) {
    const map = {}; if (!text) return map;
    const lines = String(text).split(/\r?\n/);
    const beginRe = /^\s*;\s*thumbnail begin\s+(\d+)x(\d+)\s+(\d+)/i, endRe = /^\s*;\s*thumbnail end\b/i;
    let capturing = false, curW = 0, curH = 0, buf = [];
    for (const raw of lines) {
        const line = raw || '';
        if (!capturing) {
            const m = line.match(beginRe);
            if (m) { curW = parseInt(m[1], 10); curH = parseInt(m[2], 10); buf = []; capturing = true; }
        } else {
            if (endRe.test(line)) {
                const key = `${curW}x${curH}`, b64 = buf.join('').replace(/\s+/g, '');
                if (b64) map[key] = b64;
                capturing = false; curW = curH = 0; buf = [];
            } else {
                const payload = line.replace(/^\s*;\s?/, '').trim();
                if (payload && /^[A-Za-z0-9+/=]+$/.test(payload)) buf.push(payload);
            }
        }
    }
    return map;
}
async function dashFetchThumbDataURL(name) {
    try {
        const r = await fetch(`/api/gcodes/download?name=${encodeURIComponent(name)}`);
        if (!r.ok) return null;
        const text = await r.text();
        const thumbs = dashExtractThumbs(text);
        if (!Object.keys(thumbs).length) return null;
        const prefer = ['480x270', '300x300', '48x48'];
        let key = prefer.find(k => thumbs[k]) || Object.keys(thumbs)[0];
        return key ? `data:image/png;base64,${thumbs[key]}` : null;
    } catch { return null; }
}
async function setDashPreview(name) {
    const box = document.getElementById('dashPreview');
    if (!box || !name || dashPreviewCurrent === name) return;
    const myReq = ++dashPreviewReqId;
    const url = await dashFetchThumbDataURL(name);
    if (myReq !== dashPreviewReqId) return;
    if (!url) {
        box.textContent = '—';
        box.classList.remove('has-img');
        dashPreviewCurrent = null;
        return;
    }
    const img = new Image();
    img.onload = () => {
        if (myReq !== dashPreviewReqId) return;
        box.innerHTML = '';
        img.className = 'dash-preview-img';
        img.alt = 'Preview';
        box.appendChild(img);
        box.classList.add('has-img');
        dashPreviewCurrent = name;
    };
    img.src = url;
}


// =============================================
// ČÁST 2: HLAVNÍ FUNKCE PRO AKTUALIZACI UI
// =============================================
function updateUIFromStatus(statusObjects) {
    if (!statusObjects) return;
    const printStats = statusObjects.print_stats || {};
    const displayStatus = statusObjects.display_status || {};
    const ovenTemp = statusObjects["heater_generic pizza_oven"] || {};
    const rawState = printStats.state || "standby";
    const state = rawState.toLowerCase();
    const filename = printStats.filename || null;

    if (filename && (state === 'printing' || state === 'paused' || state === 'complete')) {
        lastActiveFile = filename;
    }
    const showPreview = (state === 'printing' || state === 'paused' || state === 'complete') || (state === 'error' && lastActiveFile);

    $("#dashJobDetail").hidden = !showPreview;
    if (showPreview) {
        const fileToShow = filename || lastActiveFile;
        setDashPreview(fileToShow);
        $("#dashJobName").textContent = fileToShow;
        $("#dashJobTitle").textContent = "Actual Program";
    } else {
        lastActiveFile = null;
        $("#dashJobTitle").textContent = "Recent Files";
    }

    const clearBtnContainer = $("#dashClearStateContainer");
    if (clearBtnContainer) {
        clearBtnContainer.style.display = (state === 'complete' || state === 'error') ? 'block' : 'none';
    }

    $("#dashFileList").hidden = false;
    applyDashState(rawState);
    updateDashActionButtons(state);

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
    const tbody = $("#dashTempsTable");
    if (tbody) {
        tbody.innerHTML = `<tr><td>pizza_oven</td><td>${ovenTemp.temperature?.toFixed(1) ?? "—"}</td><td>${ovenTemp.target?.toFixed(1) ?? "—"}</td></tr>`;
    }
    const chart = ensureChart();
    if (chart && ovenTemp.temperature != null) {
        const nowLabel = new Date().toLocaleTimeString();
        if (chart.data.labels.length > MAX_POINTS) chart.data.labels.shift();
        chart.data.labels.push(nowLabel);
        let ovenDataset = chart.data.datasets.find(ds => ds.label === 'pizza_oven');
        if (!ovenDataset) {
            ovenDataset = { label: 'pizza_oven', data: [], borderColor: pickColor(0), tension: 0.15, pointRadius: 0, fill: false };
            chart.data.datasets.push(ovenDataset);
        }
        if (ovenDataset.data.length > MAX_POINTS) ovenDataset.data.shift();
        ovenDataset.data.push(ovenTemp.temperature);
        chart.data.datasets.forEach(ds => {
            while (ds.data.length < chart.data.labels.length) ds.data.unshift(null);
            while (ds.data.length > chart.data.labels.length) ds.data.shift();
        });
        chart.update('none');
    }
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
    if (consoleBox) {
        consoleBox.textContent += (line.endsWith("\n") ? line : line + "\n");
        consoleBox.scrollTop = consoleBox.scrollHeight;
    }
});


// =============================================
// ČÁST 4: INICIALIZACE STRÁNKY
// =============================================
function init() {
    $("#dashPause")?.addEventListener("click", () => sendGcode("PAUSE"));
    $("#dashResume")?.addEventListener("click", () => sendGcode("RESUME"));
    $("#dashCancel")?.addEventListener("click", () => {
        if (confirm("Opravdu chcete zrušit aktuální proces?")) { sendGcode("CANCEL_PRINT"); }
    });
    bindDashEmergencyButtons();
    $("#dashConsoleSend")?.addEventListener("click", () => {
        const input = $("#dashConsoleInput");
        if (input && input.value) { sendGcode(input.value); input.value = ""; }
    });
    $("#dashConsoleInput")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { $("#dashConsoleSend")?.click(); e.preventDefault(); }
    });
    $("#dashClearStateBtn")?.addEventListener("click", () => {
        $("#dashJobDetail").hidden = true;
        lastActiveFile = null;
        $("#dashJobTitle").textContent = "Recent Files";
        sendGcode('SDCARD_RESET_FILE');
        refreshRecentFiles();
    });
    bindUpload();
    refreshRecentFiles();
}

// Tento kód pod funkcí init zůstává stejný
if (location.pathname.startsWith("/dashboard")) {
    window.addEventListener('DOMContentLoaded', init);
}