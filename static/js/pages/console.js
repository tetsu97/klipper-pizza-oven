// /static/js/pages/console.js (Sjednocená verze)

// --- Pomocné funkce ---
const $ = (s, c = document) => c.querySelector(s);
let historyBuf = [];
let histIdx = -1;

/**
 * Připojí řádek textu do logu konzole.
 * @param {string} line Text k přidání.
 */
function appendLine(line) {
  const box = $("#consoleLog");
  if (!box) return;
  const div = document.createElement("div");
  div.textContent = (line || "").trim();
  box.appendChild(div);
  if (box.children.length > 1000) {
    box.removeChild(box.firstChild);
  }
  box.scrollTop = box.scrollHeight;
}

// --- Navázání UI prvků ---
function bindUI() {
  const input = $("#consoleInput");
  const sendBtn = $("#consoleSendBtn");
  
  const sendCommand = () => {
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;

    if (historyBuf[historyBuf.length - 1] !== cmd) {
      historyBuf.push(cmd);
    }
    histIdx = historyBuf.length;

    // ✅ Používáme globální funkci z app.js
    if (typeof sendGcode === 'function') {
      sendGcode(cmd);
    } else {
      console.error("Globální funkce 'sendGcode' není dostupná.");
      appendLine("; Chyba: Nepodařilo se odeslat příkaz.");
    }
    
    input.value = "";
    input.focus();
  };

  sendBtn?.addEventListener("click", sendCommand);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (histIdx > 0) histIdx--;
      input.value = historyBuf[histIdx] ?? '';
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < historyBuf.length) histIdx++;
      input.value = historyBuf[histIdx] ?? '';
    }
  });

  $("#consoleClearBtn")?.addEventListener("click", () => {
    const box = $("#consoleLog");
    if (box) box.innerHTML = "";
  });
}

// --- Inicializace stránky ---
function init() {
  bindUI();

  // ✅ Nasloucháme na globální událost pro odpovědi
  document.addEventListener('klipper-gcode-response', (event) => {
    const line = event.detail;
    if (typeof line === 'string') {
      // Zobrazíme POUZE odpovědi, ne odeslané příkazy (ty už přidáváme sami)
      if (!line.startsWith(">>>")) {
        appendLine(line);
      }
    }
  });

  // Požádáme o úvodní stav
  if (typeof sendGcode === 'function') {
    setTimeout(() => sendGcode("M115"), 200);
  }
}

if (location.pathname.startsWith("/console")) {
  window.addEventListener("DOMContentLoaded", init);
}
