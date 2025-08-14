// /static/js/pages/console.js (UPRAVENÁ VERZE)

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
  // Přidáme trim(), abychom odstranili případné bílé znaky na konci odpovědi
  div.textContent = (line || "").trim();
  box.appendChild(div);
  // Omezení počtu řádků v DOM, aby se nezpomaloval prohlížeč
  if (box.children.length > 1000) {
    box.removeChild(box.firstChild);
  }
  // Vždy odscrollovat dolů
  box.scrollTop = box.scrollHeight;
}

/**
 * Odešle G-code příkaz přes globální WebSocket.
 * @param {string} script G-code příkaz.
 */
function sendConsoleCommand(script) {
  script = (script || "").trim();
  if (!script) return;

  appendLine(`>>> ${script}`);

  // ✅ POUŽÍVÁME NOVOU GLOBÁLNÍ FUNKCI z app.js
  // Globální 'sendGcode' je definována v app.js a je dostupná všude.
  if (typeof sendGcode === 'function') {
    sendGcode(script);
  } else {
    console.error("Globální funkce 'sendGcode' není dostupná. Ujistěte se, že app.js je načtený.");
    appendLine("; Chyba: Nepodařilo se odeslat příkaz.");
  }
}

// --- Navázání UI prvků (vstup, tlačítka, historie) ---
function bindUI() {
  const input = $("#consoleInput");
  const sendBtn = $("#consoleSendBtn");
  const clearBtn = $("#consoleClearBtn");
  const m105Btn = $("#consoleM105Btn");

  // Odeslání příkazu po kliknutí na tlačítko
  sendBtn?.addEventListener("click", () => {
    if (!input) return;
    const cmd = input.value.trim();
    if (!cmd) return;

    // Uložíme do historie, jen pokud se neopakuje
    if (historyBuf[historyBuf.length - 1] !== cmd) {
      historyBuf.push(cmd);
    }
    histIdx = historyBuf.length; // Resetujeme pozici v historii

    sendConsoleCommand(cmd);
    input.value = "";
    input.focus(); // Vrátíme focus zpět do inputu
  });

  // Vyčištění logu
  clearBtn?.addEventListener("click", () => {
    const box = $("#consoleLog");
    if (box) box.innerHTML = "";
  });

  // Rychlé tlačítko pro M105 (status teploty)
  m105Btn?.addEventListener("click", () => {
    if (input) input.value = "M105";
    sendBtn?.click();
  });

  // Zpracování klávesnice v inputu (Enter, šipky pro historii)
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn?.click();
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

  // ✅ PŘIJÍMÁME ODPOVĚDI Z GLOBÁLNÍHO WEBSOCKETU
  // Nasloucháme na vlastní událost, kterou posílá app.js, když přijde G-code odpověď.
  document.addEventListener('klipper-gcode-response', (event) => {
    const line = event.detail;
    if (typeof line === 'string') {
      appendLine(line);
    }
  });

  // Požádáme o úvodní stav, abychom naplnili konzoli
  setTimeout(() => sendConsoleCommand("M115"), 200); // Získání verze firmwaru
  setTimeout(() => sendConsoleCommand("M105"), 400); // Získání aktuálních teplot
}

// Spustíme logiku jen na stránce /console
if (location.pathname.startsWith("/console")) {
  window.addEventListener("DOMContentLoaded", init);
}