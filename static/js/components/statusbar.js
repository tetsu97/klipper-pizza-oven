// /static/js/components/statusbar.js (FINÁLNÍ ZJEDNODUŠENÁ VERZE)

(function (document) {
  // Pomocná funkce pro převod stavu na text a barvu
  function mapReadableState(state) {
    const s = String(state || 'unknown').toLowerCase();
    switch (s) {
      case 'standby':
      case 'idle':     return { text: 'Standby', color: '#2e7d32' };
      case 'printing': return { text: 'Probíhá proces', color: '#b38900' };
      case 'paused':   return { text: 'Paused', color: '#ef6c00' };
      case 'complete': return { text: 'Completed', color: '#1e88e5' };
      case 'error':    return { text: 'Error', color: '#c62828' };
      default:         return { text: (state || 'Unknown'), color: '#666' };
    }
  }

  // Funkce, která vezme data a aktualizuje JEDEN status bar panel
  function updateStatusBarUI(panel, statusData) {
    if (!panel || !statusData) return;

    const pill = panel.querySelector('.js-status-icon');
    const tempEl = panel.querySelector('.js-oven-temp');
    const bar = panel.querySelector('.os-progress .bar');

    const printState = statusData.print_stats?.state || 'standby';
    const m = mapReadableState(printState);
    if (pill) {
      pill.textContent = m.text;
      pill.style.background = m.color;
    }

    const progress = statusData.display_status?.progress || 0;
    if (bar) {
      bar.style.width = `${Math.round(progress * 100)}%`;
    }

    const ovenTemp = statusData["heater_generic pizza_oven"]?.temperature;
    if (tempEl) {
      tempEl.textContent = (ovenTemp != null ? Number(ovenTemp).toFixed(1) : '--') + ' °C';
    }
  }

  // Hlavní logika: Posloucháme na globální signál 'klipper-status-update'
  document.addEventListener('klipper-status-update', (event) => {
    const statusData = event.detail;
    if (!statusData) return;

    document.querySelectorAll('.ovenStatusPanel').forEach(panel => {
      updateStatusBarUI(panel, statusData);
    });
  });

  function bindStatusBarEmergency() {
    const fwRestartBtn = document.getElementById('osFwRestart');
    const eStopBtn = document.getElementById('osEStop');

    // Používáme globální funkce z app.js
    if (fwRestartBtn) {
      fwRestartBtn.addEventListener('click', () => handleFirmwareRestart());
    }
    if (eStopBtn) {
      eStopBtn.addEventListener('click', () => handleEmergencyStop());
    }
  }

  // Spustíme navázání tlačítek po načtení stránky
  document.addEventListener('DOMContentLoaded', bindStatusBarEmergency);

})(document);