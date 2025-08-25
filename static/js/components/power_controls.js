// /static/js/components/power_controls.js
import { Toast, showLoadingOverlay, hideLoadingOverlay, ConfirmModal } from '../app.js';

async function handlePowerAction(action, title, message) {
    const confirmed = await ConfirmModal.show(title, message);
    if (!confirmed) return;

    // Speciální chování pro restart aplikace
    if (action === 'restart_service') {
        Toast.show('Restart command sent. The application will restart...', 'info');
        try {
            const response = await fetch(`/api/power/${action}`, { method: 'POST' });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || `HTTP ${response.status}`);
            }
            // Úmyslně nezobrazujeme loading overlay, prohlížeč se sám postará o znovupřipojení
        } catch (error) {
            Toast.show(`Failed to send restart command: ${error.message}`, 'error');
        }
        return; // Konec funkce pro tento specifický případ
    }

    // Původní chování pro ostatní akce (Reboot, Shutdown)
    showLoadingOverlay(`${title}...`);
    try {
        const response = await fetch(`/api/power/${action}`, { method: 'POST' });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || `HTTP ${response.status}`);
        }
        Toast.show(`${title} command sent successfully.`, 'success');
    } catch (error) {
        hideLoadingOverlay();
        Toast.show(`Failed to execute ${title}: ${error.message}`, 'error');
    }
}

function bindPowerControls() {
    // Navážeme listener na celý dokument, aby fungoval pro všechna modální okna
    document.body.addEventListener('click', (event) => {
        const target = event.target.closest('button');
        if (!target) return;
        
        const actionMap = {
            'powerRestartServiceBtn': () => handlePowerAction('restart_service', 'Restart Application', 'Are you sure you want to restart the web application service?'),
            'powerRestartDisplayBtn': () => handlePowerAction('restart_display', 'Restart Display', 'Are you sure you want to restart the display application (Midori)? This will clear its cache.'),
            'powerRebootHostBtn': () => handlePowerAction('reboot_host', 'Reboot Host', 'ARE YOU SURE you want to reboot the entire device? Any running process will be terminated.'),
            'powerShutdownHostBtn': () => handlePowerAction('shutdown_host', 'Shutdown Host', 'ARE YOU SURE you want to shut down the entire device? You will have to manually turn it back on.')
        };
        
        if (target.id in actionMap) {
            actionMap[target.id]();
        }
    });
}

// Spustíme navázání událostí po načtení DOM
document.addEventListener('DOMContentLoaded', bindPowerControls);