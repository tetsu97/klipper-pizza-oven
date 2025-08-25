// /static/js/app.js - FINÁLNÍ OPRAVENÁ A KOMPLETNÍ VERZE

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
    if (this.container) return; // Inicializovat pouze jednou
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

export const AlertModal = {
  modal: null,
  titleEl: null,
  messageEl: null,
  closeBtn: null,
  
  init() {
    if (this.modal) return; // Zabránění vícenásobné inicializaci
    this.modal = document.getElementById('alertModal');
    if (!this.modal) return;
    this.titleEl = document.getElementById('alertModalTitle');
    this.messageEl = document.getElementById('alertModalMessage');
    this.closeBtn = document.getElementById('alertModalCloseBtn');
    
    const hide = () => this.hide();
    this.closeBtn?.addEventListener('click', hide);
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) hide();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal.style.display === 'flex') {
            hide();
        }
    });
  },

  show(title, message) {
    if (!this.modal) this.init();
    if (!this.modal || !this.titleEl || !this.messageEl) return;
    
    this.titleEl.textContent = title;
    this.messageEl.textContent = message;
    this.modal.style.display = 'flex';
  },

  hide() {
    if (!this.modal) return;
    this.modal.style.display = 'none';
  }
};

export const ConfirmModal = {
    modal: null,
    titleEl: null,
    messageEl: null,
    okBtn: null,
    cancelBtn: null,
    _resolve: null,

    init() {
        if (this.modal) return;
        this.modal = document.getElementById('confirmModal');
        if (!this.modal) return;
        this.titleEl = document.getElementById('confirmModalTitle');
        this.messageEl = document.getElementById('confirmModalMessage');
        this.okBtn = document.getElementById('confirmModalOkBtn');
        this.cancelBtn = document.getElementById('confirmModalCancelBtn');

        this.okBtn?.addEventListener('click', () => this.hide(true));
        this.cancelBtn?.addEventListener('click', () => this.hide(false));
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'flex') {
                this.hide(false);
            }
        });
    },

    show(title, message) {
        if (!this.modal) this.init();
        if (!this.modal) return Promise.resolve(false);

        this.titleEl.textContent = title;
        this.messageEl.textContent = message;
        this.modal.style.display = 'flex';
        this.okBtn.focus(); // Zaměříme se na tlačítko OK

        return new Promise(resolve => {
            this._resolve = resolve;
        });
    },

    hide(result) {
        if (!this.modal) return;
        this.modal.style.display = 'none';
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
};

export const PromptModal = {
    modal: null,
    titleEl: null,
    messageEl: null,
    inputEl: null,
    okBtn: null,
    cancelBtn: null,
    _resolve: null,

    init() {
        if (this.modal) return;
        this.modal = document.getElementById('promptModal');
        if (!this.modal) return;
        this.titleEl = document.getElementById('promptModalTitle');
        this.messageEl = document.getElementById('promptModalMessage');
        this.inputEl = document.getElementById('promptModalInput');
        this.okBtn = document.getElementById('promptModalOkBtn');
        this.cancelBtn = document.getElementById('promptModalCancelBtn');

        this.okBtn?.addEventListener('click', () => this.hide(this.inputEl.value));
        this.cancelBtn?.addEventListener('click', () => this.hide(null));
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.hide(null);
        });
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.hide(this.inputEl.value);
            }
            if (e.key === 'Escape') this.hide(null);
        });
    },

    show(title, message, defaultValue = '') {
        if (!this.modal) this.init();
        if (!this.modal) return Promise.resolve(null);

        this.titleEl.textContent = title;
        this.messageEl.textContent = message;
        this.inputEl.value = defaultValue;
        this.modal.style.display = 'flex';
        this.inputEl.focus();
        this.inputEl.select();

        return new Promise(resolve => {
            this._resolve = resolve;
        });
    },

    hide(result) {
        if (!this.modal) return;
        this.modal.style.display = 'none';
        if (this._resolve) {
            this._resolve(result);
            this._resolve = null;
        }
    }
};

export const StartJobModal = {
  modal: null, titleEl: null, durationEl: null, confirmBtn: null,
  chartCanvas: null, chart: null, currentFile: null,

  init() {
    this.modal = document.getElementById('startJobModal');
    if (!this.modal) return;
    this.titleEl = document.getElementById('startJobModalTitle');
    this.durationEl = document.getElementById('startJobModalDuration');
    this.confirmBtn = document.getElementById('startJobModalConfirmBtn');
    this.chartCanvas = document.getElementById('startJobModalChart');
    const closeBtn = document.getElementById('startJobModalCloseBtn');
    
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
    this.durationEl.textContent = 'Loading...';
    this.modal.style.display = 'flex';

    try {
      const res = await fetch(`/api/gcodes/${encodeURIComponent(fileName)}`);
      if (!res.ok) throw new Error('Failed to load program data.');
      const data = await res.json();
      
      const points = data.points || [];
      const totalMinutes = points.length > 0 ? points[points.length - 1].time : 0;

      if (totalMinutes > 0) {
        const h = Math.floor(totalMinutes / 60);
        const m = Math.round(totalMinutes % 60);
        this.durationEl.textContent = `${h}h ${m}m`;
      } else {
        this.durationEl.textContent = 'Unknown';
      }
      this.renderChart(points);
    } catch (e) {
      console.error(e);
      this.durationEl.textContent = 'Error!';
      if(this.chart) this.chart.destroy();
    }
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
      const r = await fetch('/api/gcodes/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name: this.currentFile })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
      Toast.show(`Starting profile: ${this.currentFile}`, 'info');
    } catch (err) {
      Toast.show(`Failed to start: ${err.message}`, 'error');
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
      data: { labels, datasets: [{
          label: 'Temperature (°C)', data: temps, borderColor: '#f44336',
          backgroundColor: 'rgba(244,67,54,.2)', tension: .1, pointRadius: 4, fill: true
      }]},
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

export function showLoadingOverlay(message = 'Working...') {
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
    const confirmed = await ConfirmModal.show(
      'Firmware Restart',
      'Are you sure you want to restart the Klipper firmware?\n(This will cancel any running process.)'
    );
    if (!confirmed) return;

    showLoadingOverlay('Restarting Klipper... Please wait.');
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
    Toast.show('Klipper is ready.', 'success');
}

export async function handleEmergencyStop() {
    const confirmed = await ConfirmModal.show(
      'Emergency Stop',
      'ARE YOU SURE YOU WANT TO PERFORM AN EMERGENCY STOP?\nThis action will immediately halt the machine.'
    );
    if (confirmed) {
        sendGcode('M112');
        Toast.show('EMERGENCY STOP ACTIVATED!', 'error');
    }
}

// --- INTERNAL MODULE LOGIC ---

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
                params: { objects: { "print_stats": null, "display_status": null, "toolhead": null, "gcode_move": null, "pizza_oven": null } },
                id: rpcId++
            }));
            ws.send(JSON.stringify({
                jsonrpc: "2.0", method: "printer.objects.subscribe",
                params: { objects: { "print_stats": null, "display_status": null, "pizza_oven": null, "gcode": null } },
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
    AlertModal.init();
    ConfirmModal.init();
    PromptModal.init();
}

// --- MAIN EXECUTION ---
document.addEventListener('DOMContentLoaded', () => {
    connectWebSocket();
    initializeSharedComponents();
});