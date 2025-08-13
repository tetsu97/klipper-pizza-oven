// /static/js/pages/console.js

// --- Helpers ---
const $  = (s, c = document) => c.querySelector(s);

function mapReadableState(state) {
  const s = String(state || 'unknown').toLowerCase();
  switch (s) {
    case 'standby':
    case 'idle':     return { text: 'Standby',        color: '#2e7d32' }; // green
    case 'printing': return { text: 'Probíhá proces', color: '#b38900' }; // gold
    case 'paused':   return { text: 'Pozastaveno',    color: '#ef6c00' }; // orange
    case 'complete': return { text: 'Dokončeno',      color: '#1e88e5' }; // blue
    case 'error':    return { text: 'Chyba',          color: '#c62828' }; // red
    default:         return { text: state || 'Neznámý', color: '#666' };
  }
}
function setWsStatus(text) { const el = $("#consoleStatus"); if (el) el.textContent = text; }
function appendLine(line) {
  const box = $("#consoleLog"); if (!box) return;
  const div = document.createElement("div");
  div.textContent = line;
  box.appendChild(div);
  if (box.children.length > 1200) box.removeChild(box.firstChild); // malý GC
  box.scrollTop = box.scrollHeight;
}

// --- Backend proxy (stejné endpointy jako máš v main.py) ---
async function sendConsole(script) {
  script = (script || "").trim();
  if (!script) return;
  appendLine(`>>> ${script}`);
  try {
    await fetch("/api/console/send", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ script })
    });
  } catch (e) {
    appendLine(`; send failed: ${e.message}`);
  }
}

// --- WebSocket to Moonraker přes FastAPI proxy (/ws/console) ---
let ws = null;
let reconnectTimer = null;

function connectWS() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const proto = (location.protocol === 'https:') ? 'wss' : 'ws';
  const url = `${proto}://${location.hostname}:7125/websocket`;
  setWsStatus('WS: connecting…');

  try {
    ws = new WebSocket(url);

    let rpcId = 1;
    const sendRpc = (method, params = {}, expectReply = true) => {
      const id = rpcId++;
      ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
      return expectReply ? id : null;
    };
    const waitFor = (wantedId, timeoutMs = 5000) => new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      const onMsg = (ev) => {
        let data; try { data = JSON.parse(ev.data); } catch { return; }
        if (data && data.id === wantedId) {
          clearTimeout(t);
          ws.removeEventListener('message', onMsg);
          if (data.error) reject(new Error(data.error.message || 'rpc error'));
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', onMsg);
    });

    ws.onopen = async () => {
      setWsStatus('WS: connected');

      try {
        // Jen identifikace (type+url jsou důležité)
        const idIdentify = sendRpc('server.connection.identify', {
          client_name: 'pizza_oven_console',
          version: '0.1',
          type: 'web',
          url: location.origin
        });
        await waitFor(idIdentify);
        // ŽÁDNÝ subscribe – Moonraker sám posílá notify_gcode_response všem WS klientům
      } catch (e) {
        appendLine(`; ws identify failed: ${e.message}`);
      }
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { msg = null; }
      if (!msg) return;

      if (msg.method === 'notify_gcode_response' && Array.isArray(msg.params)) {
        appendLine(msg.params[0]);
      } else if (msg.error) {
        appendLine(`; ws error: ${JSON.stringify(msg.error)}`);
      }
    };

    ws.onerror = () => setWsStatus('WS: error');

    ws.onclose = (ev) => {
      setWsStatus(`WS: disconnected (${ev.code}) – reconnecting…`);
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectWS, 1500);
    };
  } catch (e) {
    setWsStatus('WS: exception: ' + e.message);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWS, 1500);
  }
}

// --- UI bindings (input, send, history, quick buttons) ---
let historyBuf = [];
let histIdx = -1;

function bindUI() {
  const input = $("#consoleInput");
  $("#consoleSendBtn")?.addEventListener("click", () => {
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;
    if (historyBuf[historyBuf.length - 1] !== cmd) historyBuf.push(cmd);
    histIdx = historyBuf.length;
    sendConsole(cmd);
    input.value = "";
  });

  $("#consoleClearBtn")?.addEventListener("click", () => {
    const box = $("#consoleLog"); if (box) box.innerHTML = "";
  });

  $("#consoleM105Btn")?.addEventListener("click", () => {
    if (input) input.value = "M105";
    $("#consoleSendBtn")?.click();
  });

  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      $("#consoleSendBtn")?.click();
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      if (histIdx > 0) histIdx--;
      input.value = historyBuf[histIdx] ?? '';
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      if (histIdx < historyBuf.length) histIdx++;
      input.value = historyBuf[histIdx] ?? '';
      e.preventDefault();
    }
  });
}

// --- Init (jen na /console) ---
function init() {
  bindUI();
  connectWS();

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearInterval(t1); clearInterval(t2); }
    else {
      refreshStatus(); refreshTemp();
      t1 = setInterval(refreshStatus, 2000);
      t2 = setInterval(refreshTemp, 3000);
    }
  });
}

if (location.pathname.startsWith("/console")) {
  window.addEventListener("DOMContentLoaded", init);
}
