// /static/js/components/statusbar.js

import { handleFirmwareRestart, handleEmergencyStop } from '../app.js';
import { mapReadableState } from '../utils.js';

// Function that takes data and updates ONE status bar panel
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

  const ovenTemp = statusData["pizza_oven"]?.temperature;
  if (tempEl) {
    tempEl.textContent = (ovenTemp != null ? Number(ovenTemp).toFixed(1) : '--') + ' °C';
  }
}

// Main logic: Listen for the global 'klipper-status-update' signal
document.addEventListener('klipper-status-update', (event) => {
  const statusData = event.detail;
  if (!statusData) return;

  document.querySelectorAll('.ovenStatusPanel').forEach(panel => {
    updateStatusBarUI(panel, statusData);
  });
});

function bindStatusBarEmergency() {
  // CHANGE HERE: Use querySelectorAll in case the status bar is on the page more than once
  document.querySelectorAll('.ovenStatusPanel').forEach(panel => {
      const fwRestartBtn = panel.querySelector('#osFwRestart');
      const eStopBtn = panel.querySelector('#osEStop');

      if (fwRestartBtn) {
        fwRestartBtn.addEventListener('click', () => handleFirmwareRestart());
      }
      if (eStopBtn) {
        eStopBtn.addEventListener('click', () => handleEmergencyStop());
      }
  });
}

// Run the button binding after the page loads
document.addEventListener('DOMContentLoaded', bindStatusBarEmergency);