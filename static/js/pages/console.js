// /static/js/pages/console.js
import { sendGcode } from '../app.js';

// --- Pomocné funkce ---
const $ = (s, c = document) => c.querySelector(s);
let historyBuf = [];
let histIdx = -1;

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

    sendGcode(cmd);
    
    input.value = "";
    input.focus();
  };

  // ZMĚNA ZDE: Přidání event listeneru
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
}

// --- Inicializace stránky ---
function init() {
  bindUI();

  document.addEventListener('klipper-gcode-response', (event) => {
    const line = event.detail;
    if (typeof line === 'string') {
      if (!line.startsWith(">>>")) {
        appendLine(line);
      }
    }
  });

  setTimeout(() => sendGcode("M115"), 200);
}

// Spustíme logiku pouze pokud jsme na správné stránce
if (location.pathname.startsWith("/console")) {
  window.addEventListener("DOMContentLoaded", init);
}