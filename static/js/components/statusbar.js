// /static/js/components/statusbar.js (nová verze)

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

    // Aktualizace stavu (z print_stats)
    const printState = statusData.print_stats?.state || 'standby';
    const m = mapReadableState(printState);
    if (pill) {
      pill.textContent = m.text;
      pill.style.background = m.color;
    }

    // Aktualizace progress baru (z display_status)
    const progress = statusData.display_status?.progress || 0;
    if (bar) {
      bar.style.width = `${Math.round(progress * 100)}%`;
    }

    // Aktualizace teploty (z heater_generic_pizza_oven)
    const ovenTemp = statusData["heater_generic pizza_oven"]?.temperature;
    if (tempEl) {
      tempEl.textContent = (ovenTemp != null ? Number(ovenTemp).toFixed(1) : '--') + ' °C';
    }
  }

  // Hlavní logika: Posloucháme na globální signál 'klipper-status-update'
  document.addEventListener('klipper-status-update', (event) => {
    const statusData = event.detail; // Zde jsou data, která poslal dashboard.js
    if (!statusData) return;

    // Najdeme všechny status bary na stránce a aktualizujeme je
    document.querySelectorAll('.ovenStatusPanel').forEach(panel => {
      updateStatusBarUI(panel, statusData);
    });
  });

  // Tlačítka pro nouzové zastavení zůstávají stejná, tato logika se nemění
  function bindStatusBarEmergency() {
    const fw = document.getElementById('osFwRestart');
    const es = document.getElementById('osEStop');

    if (fw) fw.addEventListener('click', async () => {
      if (!confirm('Restart Klipper firmware now?\n(This will stop any running job.)')) return;
      try {
        // Tuto funkci jsme si definovali v dashboard.js, ale pro jednoduchost
        // zde můžeme použít standardní fetch, protože je to jen pro tlačítka.
        await fetch('/api/console/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: 'FIRMWARE_RESTART' })
        });
      } catch (e) { alert('Firmware restart failed: ' + e.message); }
    });

    if (es) es.addEventListener('click', async () => {
      if (!confirm('EMERGENCY STOP?\nThis immediately halts the machine.')) return;
      try {
        await fetch('/api/console/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: 'M112' })
        });
      } catch (e) { alert('Emergency stop failed: ' + e.message); }
    });
  }

  // Spustíme navázání tlačítek po načtení stránky
  document.addEventListener('DOMContentLoaded', bindStatusBarEmergency);

})(document);