// /static/js/app.js (FINÁLNÍ OPRAVENÁ A KOMPLETNÍ VERZE)

let ws = null;
let reconnectTimer = null;
let rpcId = 1;

// --- EXPORTOVANÉ FUNKCE A OBJEKTY (pro moduly) ---

export function sendGcode(script) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.warn("WebSocket not open, G-code not sent:", script);
        return;
    }
    ws.send(JSON.stringify({
        jsonrpc: "2.0", method: "printer.gcode.script",
        params: { "script": script }, id: rpcId++
    }));
}

export const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
  },
  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();
    if (!this.container) return;
    const toastElement = document.createElement('div');
    toastElement.className = `toast toast--${type}`;
    toastElement.textContent = message;
    this.container.appendChild(toastElement);
    setTimeout(() => {
      toastElement.classList.add('show');
    }, 10);
    setTimeout(() => {
      toastElement.classList.remove('show');
      toastElement.addEventListener('transitionend', () => {
        toastElement.remove();
      });
    }, duration);
  }
};

export const StartJobModal = {
  modal: null,
  titleEl: null,
  durationEl: null,
  confirmBtn: null,
  chartCanvas: null,
  chart: null,
  currentFile: null,
  init() {
    this.modal = document.getElementById('startJobModal');
    this.titleEl = document.getElementById('startJobModalTitle');
    this.durationEl = document.getElementById('startJobModalDuration');
    this.confirmBtn = document.getElementById('startJobModalConfirmBtn');
    this.chartCanvas = document.getElementById('startJobModalChart');
    const closeBtn = document.getElementById('startJobModalCloseBtn');
    if (!this.modal) return;
    closeBtn?.addEventListener('click', () => this.close());
    this.confirmBtn?.addEventListener('click', () => this.start());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  },
  async open(fileName) {
    if (!this.modal) this.init();
    this.currentFile = fileName;
    this.titleEl.textContent = fileName;
    this.durationEl.textContent = 'Načítám...';
    this.modal.style.display = 'flex';

    try {
      // ZMĚNA ZDE: Voláme nový, správný endpoint
      const res = await fetch(`/api/gcodes/${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error('Nepodařilo se načíst data programu.');
      const data = await res.json();
      
      const points = data.points || [];

      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        const totalMinutes = lastPoint.time || 0;
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        this.durationEl.textContent = `${h}h ${m}m`;
      } else {
        this.durationEl.textContent = 'Neznámý';
      }
      this.renderChart(points);
    } catch (e) {
      console.error(e);
      this.durationEl.textContent = 'Chyba!';
      if(this.chart) this.chart.destroy();
    }
    // Tato část je pro display.js, necháme ji zde pro budoucí použití
    return Promise.resolve(); 
  },
  close() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  },
  async start() {
    if (!this.currentFile) return;
    try {
      Toast.show(`Spouštím profil: ${this.currentFile}`, 'info');
      sendGcode(`LOAD_TEMP_PROGRAM NAME="${this.currentFile}"`);
      setTimeout(() => { sendGcode(`EXECUTE_PROGRAM`); }, 200);
    } catch (err) {
      Toast.show(`Spuštění selhalo: ${err.message}`, 'error');
    } finally {
      this.close();
    }
  },
  renderChart(points) {
    if (this.chart) this.chart.destroy();
    if (!this.chartCanvas) return;
    const ctx = this.chartCanvas.getContext('2d');
    const labels = points.map(p => p.time);
    const temps = points.map(p => p.temp);
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Temperature (°C)',
          data: temps,
          borderColor: '#f44336',
          backgroundColor: 'rgba(244,67,54,.2)',
          tension: .1,
          pointRadius: 4,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#fff' }, title: { display: true, text: 'Time (min)', color: '#fff' } },
          y: { ticks: { color: '#fff' }, title: { display: true, text: 'Temperature (°C)', color: '#fff' } }
        }
      }
    });
  }
};

export function showLoadingOverlay(message = 'Pracuji...') {
  const overlay = document.getElementById('loadingOverlay');
  const overlayText = document.getElementById('loadingOverlayText');
  if (overlayText) {
    overlayText.textContent = message;
  }
  if (overlay) {
    overlay.style.display = 'flex';
  }
}

export function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

export async function handleFirmwareRestart() {
  if (!confirm('Opravdu restartovat Klipper firmware?\n(Tím se zruší jakýkoliv běžící proces.)')) return;

  showLoadingOverlay('Restartuji Klipper... čekejte prosím.');
  sendGcode('FIRMWARE_RESTART');

  const waitForReady = new Promise((resolve) => {
    const listener = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method === 'notify_klippy_ready') {
          ws.removeEventListener('message', listener);
          resolve();
        }
      } catch (e) {}
    };
    ws.addEventListener('message', listener);
  });

  const timeout = new Promise(resolve => setTimeout(resolve, 15000));
  await Promise.race([waitForReady, timeout]);

  hideLoadingOverlay();
  Toast.show('Klipper je připraven.', 'success');
}

export function handleEmergencyStop() {
  if (!confirm('VÁŽNĚ PROVÉST NOUZOVÉ ZASTAVENÍ?\nTato akce okamžitě zastaví stroj.')) return;
  sendGcode('M112');
  Toast.show('NOUZOVÉ ZASTAVENÍ AKTIVOVÁNO!', 'error');
}


// --- INTERNÍ LOGIKA MODULU ---

function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/websocket`;
    console.log("Global WS: Connecting to", url);

    try {
        ws = new WebSocket(url);
        ws.onopen = () => {
            console.log("Global WS: Connected");
            rpcId = 1;
            ws.send(JSON.stringify({
                jsonrpc: "2.0", method: "printer.objects.query",
                params: { objects: { "print_stats": null, "display_status": null, "toolhead": null, "gcode_move": null, "heater_generic pizza_oven": null } },
                id: rpcId++
            }));
            ws.send(JSON.stringify({
                jsonrpc: "2.0", method: "printer.objects.subscribe",
                params: { objects: { "print_stats": null, "display_status": null, "heater_generic pizza_oven": null, "gcode": null } },
                id: rpcId++
            }));
        };
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            let statusData = null;
            if (msg.id === 1 && msg.result?.status) {
                statusData = msg.result.status;
            } else if (msg.method === 'notify_status_update') {
                statusData = msg.params[0];
            }
            if (statusData) {
                document.dispatchEvent(new CustomEvent('klipper-status-update', { detail: statusData }));
            }
            if (msg.method === 'notify_gcode_response') {
                document.dispatchEvent(new CustomEvent('klipper-gcode-response', { detail: msg.params[0] }));
            }
        };
        ws.onclose = () => {
            console.log("Global WS: Disconnected. Reconnecting in 3s...");
            ws = null; clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectWebSocket, 3000);
        };
        ws.onerror = (err) => { ws.close(); };
    } catch (e) {
        console.error("Global WS: Failed to create WebSocket", e);
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectWebSocket, 5000);
    }
}

function initializeSharedComponents() {
    Toast.init();
    StartJobModal.init();
}

// --- HLAVNÍ SPUŠTĚNÍ ---
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    initializeSharedComponents();
});