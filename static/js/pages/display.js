// /static/js/pages/display.js

import { sendGcode, StartJobModal, Toast } from '../app.js';

const ICONS = {
    wifi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C7.31 4 3.07 5.9 0 8.98L12 21 24 8.98C20.93 5.9 16.69 4 12 4z"/></svg>`,
    lan: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6h-2V4h-2v2H9V4H7v2H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2zM9 18H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z"/></svg>`
};

function updateDateTime() {
    const timeEl = document.getElementById('displayTime');
    if (!timeEl) return;
    const now = new Date();
    timeEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function updateNetworkStatus() {
    const networkEl = document.getElementById('displayNetworkStatus');
    if (!networkEl) return;
    try {
        const response = await fetch('/api/system/host');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.network && data.network.length > 0) {
            const activeInterface = data.network[0];
            networkEl.innerHTML = `${ICONS[activeInterface.type] || ''} <span>${activeInterface.ip_address}</span>`;
        } else {
            networkEl.innerHTML = `<span>Not Connected</span>`;
        }
    } catch (error) {
        console.error('Failed to fetch network status:', error);
        networkEl.innerHTML = `<span>Network Error</span>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const mainScreen = document.getElementById('mainScreen');
    const profileScreen = document.getElementById('profileScreen');
    const controlsContainer = document.querySelector('.controls');
    const currentTempEl = document.getElementById('currentTemp');
    const targetTempEl = document.getElementById('targetTemp');
    const progressBarEl = document.getElementById('progressBar');
    const statusTimeEl = document.getElementById('statusTime');
    const progressPanel = document.getElementById('progressPanel');
    const progressPercent = document.getElementById('progressPercent');
    const timePanel = document.getElementById('timePanel');
    const btnStart = document.getElementById('btnStart');
    const btnCancel = document.getElementById('btnCancel');
    const btnPause = document.getElementById('btnPause');
    const btnResume = document.getElementById('btnResume');
    const btnBack = document.getElementById('btnBack');
    const btnClearStatus = document.getElementById('btnClearStatus');
    const btnActions = document.getElementById('btnActions');
    const actionsOverlay = document.getElementById('actionsOverlay');
    const actionsCloseBtn = document.getElementById('actionsCloseBtn');
    const actionsHomeView = document.getElementById('actionsHomeView');
    const actionsTempView = document.getElementById('actionsTempView');
    const actionsPidView = document.getElementById('actionsPidView');
    const actionsBtnSetTemp = document.getElementById('actionsBtnSetTemp');
    const actionsBtnPid = document.getElementById('actionsBtnPid');
    const targetTempOverlayEl = document.getElementById('targetTempOverlay');
    const btnTempDown = document.getElementById('btnTempDown');
    const btnTempUp = document.getElementById('btnTempUp');
    const pidStartBtn = document.getElementById('pidStartBtn');
    const pidTempInput = document.getElementById('pidTempInput');
    const pidCoolTimeInput = document.getElementById('pidCoolTimeInput');
    const settingsModal = document.getElementById('settingsModal');
    const openSettingsBtn = document.getElementById('displaySettingsBtn');
    const closeSettingsBtn = document.getElementById('settingsCloseBtn');
    const profileListEl = document.getElementById('profileList');

    let manualTargetTemp = 0;
    const TEMP_STEP = 5;
    
    updateDateTime();
    setInterval(updateDateTime, 1000);
    updateNetworkStatus();
    setInterval(updateNetworkStatus, 30000);
    
    if (settingsModal && openSettingsBtn && closeSettingsBtn) {
        openSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
        closeSettingsBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });
        settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });
    }

    function showActionsView(viewName) {
        if(!actionsHomeView || !actionsTempView || !actionsPidView) return;
        actionsHomeView.style.display = viewName === 'home' ? 'block' : 'none';
        actionsTempView.style.display = viewName === 'temp' ? 'block' : 'none';
        actionsPidView.style.display = viewName === 'pid' ? 'block' : 'none';
    }

    btnActions.addEventListener('click', () => {
        showActionsView('home');
        actionsOverlay.style.display = 'flex';
    });
    actionsCloseBtn.addEventListener('click', () => { actionsOverlay.style.display = 'none'; });
    actionsBtnSetTemp.addEventListener('click', () => showActionsView('temp'));
    actionsBtnPid.addEventListener('click', () => showActionsView('pid'));

    function setManualTemperature() {
        if(targetTempOverlayEl) targetTempOverlayEl.textContent = `${manualTargetTemp} °C`;
        sendGcode(`SET_HEATER_TEMPERATURE HEATER=pizza_oven TARGET=${manualTargetTemp}`);
    }
    btnTempUp.addEventListener('click', () => {
        manualTargetTemp = Math.min(manualTargetTemp + TEMP_STEP, 300);
        setManualTemperature();
    });
    btnTempDown.addEventListener('click', () => {
        manualTargetTemp = Math.max(manualTargetTemp - TEMP_STEP, 0);
        setManualTemperature();
    });

    pidStartBtn.addEventListener('click', () => {
        const temp = pidTempInput.value;
        const coolTime = pidCoolTimeInput.value;
        if (!temp || !coolTime || isNaN(temp) || isNaN(coolTime)) {
            Toast.show('Zadejte platné hodnoty.', 'error');
            return;
        }
        sendGcode(`CALIBRATE_OVEN TEMP=${temp} COOL_RATE_TIME=${coolTime}`);
        Toast.show('Spouštím PID kalibraci...', 'info');
        actionsOverlay.style.display = 'none';
    });

    function showScreen(screen) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        screen.classList.add('active');
    }

    btnStart.addEventListener('click', async () => {
        await loadProfiles();
        showScreen(profileScreen);
    });
    btnBack.addEventListener('click', () => { showScreen(mainScreen); });

    async function loadProfiles() {
        try {
            const response = await fetch('/api/gcodes');
            const data = await response.json();
            profileListEl.innerHTML = '';
            if (data.files && data.files.length > 0) {
                data.files.forEach(file => {
                    const item = document.createElement('div');
                    item.className = 'profile-item';
                    item.textContent = file.name;
                    item.dataset.filename = file.name;
                    item.addEventListener('click', () => startProfile(file.name));
                    profileListEl.appendChild(item);
                });
            } else {
                profileListEl.innerHTML = '<div class="profile-item">No profiles found.</div>';
            }
        } catch (error) {
            console.error('Failed to load profiles:', error);
            profileListEl.innerHTML = '<div class="profile-item">Error loading.</div>';
        }
    }

    function startProfile(filename) {
        // Otevřeme modální okno. O layout se nyní stará čistě CSS.
        StartJobModal.open(filename);

        // Získáme původní funkce pro zavření a start, abychom k nim mohli přidat úklid.
        const originalClose = StartJobModal.close;
        const originalStart = StartJobModal.start;

        // Funkce pro úklid posluchačů událostí
        const cleanup = () => {
            // TENTO ŘÁDEK ZPŮSOBOVAL CHYBU A JE ODEBRÁN:
            // window.removeEventListener('resize', onResize); 
            
            // Vrátíme původní chování tlačítkům
            StartJobModal.close = originalClose;
            StartJobModal.start = originalStart;
        };

        // Rozšíříme funkci close o úklid
        StartJobModal.close = function () {
            originalClose.call(StartJobModal);
            cleanup();
        };

        // Rozšíříme funkci start o přechod na hlavní obrazovku a úklid
        StartJobModal.start = function () {
            originalStart.call(StartJobModal);
            showScreen(mainScreen);
            cleanup();
        };
    }
    
    btnCancel.addEventListener('click', () => sendGcode('CANCEL_PRINT'));
    btnPause.addEventListener('click', () => sendGcode('PAUSE'));
    btnResume.addEventListener('click', () => sendGcode('RESUME'));
    btnClearStatus.addEventListener('click', () => sendGcode('SDCARD_RESET_FILE'));

    document.addEventListener('klipper-status-update', (event) => {
        const status = event.detail;
        if (!status) return;

        const oven = status['pizza_oven'];
        const currentTemp = oven?.temperature;
        const targetTemp = oven?.target;
        currentTempEl.textContent = (currentTemp != null) ? currentTemp.toFixed(0) : '--';
        targetTempEl.textContent = `Target: ${(targetTemp != null) ? targetTemp.toFixed(0) : '--'} °C`;

        const printStats = status.print_stats || {};
        const state = (printStats.state || 'standby').toLowerCase();
        const duration = printStats.print_duration;

        const statusPill = document.querySelector('.status-text-prominent');
        if (statusPill) {
            const stateMap = {
                standby: { text: 'Standby', color: '#2e7d32' },
                printing: { text: 'Probíhá proces', color: '#b38900' },
                paused: { text: 'Paused', color: '#ef6c00' },
                complete: { text: 'Finished', color: '#1e88e5' },
                error: { text: 'Error', color: '#c62828' }
            };
            const displayState = stateMap[state] || { text: state, color: '#666' };
            statusPill.textContent = displayState.text;
            statusPill.style.backgroundColor = displayState.color;
        }

        const progress = status.display_status?.progress || 0;
        progressBarEl.style.width = `${progress * 100}%`;
        if (progressPercent) {
            progressPercent.textContent = `${Math.round(progress * 100)}%`;
        }

        statusTimeEl.textContent = (duration != null) ? new Date(duration * 1000).toISOString().substr(11, 8) : '--:--:--';
        
        const isStandby = (state === 'standby');
        const isPrintingOrPaused = (state === 'printing' || state === 'paused');
        const isFinished = ['complete', 'error'].includes(state);

        if(progressPanel) {
            progressPanel.style.display = isPrintingOrPaused ? 'block' : 'none';
        }
        if(timePanel && duration === 0 && !isPrintingOrPaused){
            timePanel.style.display = 'none';
        } else if (timePanel) {
            timePanel.style.display = 'flex';
        }

        if (targetTempOverlayEl) {
            const overlayTemp = targetTemp || 0;
            targetTempOverlayEl.textContent = `${overlayTemp.toFixed(0)} °C`;
            manualTargetTemp = overlayTemp;
        }

        if (controlsContainer) {
            controlsContainer.className = `controls state-${state}`;
        }
        
        if (!isStandby && actionsOverlay && actionsOverlay.style.display === 'flex') {
            actionsOverlay.style.display = 'none';
        }

        btnStart.style.display = (isStandby || isFinished) && !isFinished ? 'block' : 'none';
        btnActions.style.display = isStandby ? 'block' : 'none';
        
        btnClearStatus.style.display = isFinished ? 'block' : 'none';
        btnCancel.style.display = isPrintingOrPaused ? 'block' : 'none';
        btnPause.style.display = state === 'printing' ? 'block' : 'none';
        btnResume.style.display = state === 'paused' ? 'block' : 'none';
    });
});