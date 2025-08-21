// wapp/static/js/pages/profiles.js

import { Toast, showLoadingOverlay, hideLoadingOverlay, StartJobModal, sendGcode, ConfirmModal } from '../app.js';

(function () {
  if (!location.pathname.startsWith('/profiles')) return;

  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const toInt = (v, d=0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  const humanSize = (bytes) => {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };
  const humanTime = (ts) => { try { return new Date(ts*1000).toLocaleString(); } catch { return "—"; } };

  class Modal {
      constructor(rootId) { this.root = document.getElementById(rootId); }
      open(){ if (this.root){ this.root.style.display='flex'; } }
      close(){ if (this.root){ this.root.style.display='none'; } }
  }

  class ChartView {
    constructor(canvasSel){ this.canvasSel = canvasSel; this.chart = null; }
    _ctx(){ const c=$(this.canvasSel); return c? c.getContext('2d') : null; }
    destroy(){ try{ this.chart?.destroy(); }catch{} this.chart=null; }
    render(points){ // CHANGE: Removed the startTemp parameter
        const ctx=this._ctx(); if (!ctx) return;
        // The points array is now expected to be complete, including the starting point.
        const pts = points.sort((a,b) => a.time - b.time);
        const labels = pts.map(p => p.time);
        const temps  = pts.map(p => p.temp);
        this.destroy();
        this.chart = new Chart(ctx, {
            type:'line',
            data:{ labels, datasets:[{ label:'Temperature (°C)', data:temps, borderColor:'#f44336', backgroundColor:'rgba(244,67,54,.2)', tension:.1, pointRadius:4, fill:true }] },
            options:{
                responsive:true,
                maintainAspectRatio:false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins:{
                    legend:{ display: false },
                    tooltip: {
                        backgroundColor: '#2a2a40',
                        titleFont: { size: 14, weight: 'bold' },
                        bodyFont: { size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        boxPadding: 4,
                        callbacks: {
                            title: function(tooltipItems) {
                                return 'Time: ' + tooltipItems[0].label + ' min';
                            },
                            label: function(tooltipItem) {
                                return ' Temperature: ' + tooltipItem.formattedValue + ' °C';
                            }
                        }
                    }
                },
                scales:{
                     x:{ type: 'linear', ticks:{color:'#fff'}, title:{display:true,text:'Time (minutes)',color:'#fff'} },
                     y:{ ticks:{color:'#fff'}, title:{display:true,text:'Temperature (°C)',color:'#fff'} }
                }
            }
        });
    }
  }

  class SegmentsManager {
    constructor(containerSel, onChange){
      this.container = document.querySelector(containerSel);
      this.onChange = onChange;
      this._bind();
    }
    _bind(){
      if (!this.container) return;
      this.container.addEventListener('click', (e)=>{
        const del = e.target.closest('.row-del');
        if (del){ del.closest('.segment-row')?.remove(); this.onChange?.(); }
      });
      this.container.addEventListener('input', ()=> this.onChange?.());
    }
    load(segments){
      if (!this.container) return;
      this.container.innerHTML='';
      (segments||[]).forEach(s=>{ this.addRow(s, false); });
    }
    addRow(defaults={}, triggerChange=true) {
        if (!this.container) return;
        const lastRow = this.container.lastElementChild;
        const lastTemp = lastRow ? toInt(lastRow.querySelector('.seg-temp').value, 20) : 20;

        const row = document.createElement('div');
        row.className = 'segment-row';
        row.innerHTML = `
            <div class="segment-input-group">
            <label>Ramp Time (min)
                <span class="tooltip-container">
                    <i class="tooltip-icon">?</i>
                    <span class="tooltip-text">Time in minutes for the oven to reach the target temperature of this segment.</span>
                </span>
            </label>
            <input type="number" class="seg-ramptime" value="${defaults.ramp_time || 60}" min="1" step="1">
            </div>
            <div class="segment-input-group">
            <label>Hold Time (min)
                <span class="tooltip-container">
                    <i class="tooltip-icon">?</i>
                    <span class="tooltip-text">Time in minutes for the oven to maintain the target temperature after reaching it.</span>
                </span>
            </label>
            <input type="number" class="seg-holdtime" value="${defaults.hold_time || 0}" min="0" step="1">
            </div>
            <div class="segment-input-group">
            <label>Target Temperature (°C)
                 <span class="tooltip-container">
                    <i class="tooltip-icon">?</i>
                    <span class="tooltip-text">The temperature in degrees Celsius to be reached in this segment.</span>
                </span>
            </label>
            <input type="number" class="seg-temp" value="${defaults.temp ?? lastTemp}" min="0" step="1">
            </div>
            <div class="segment-action-group">
            <button type="button" class="row-del btn btn--danger">X</button>
            </div>
        `;
        this.container.appendChild(row);
        if (triggerChange) this.onChange?.();
    }
    read(){
        if (!this.container) return [];
        const segs = [];
        this.container.querySelectorAll('.segment-row').forEach(row => {
            const ramp_time = toInt(row.querySelector('.seg-ramptime').value);
            const hold_time = toInt(row.querySelector('.seg-holdtime').value);
            const temp = toInt(row.querySelector('.seg-temp').value);
            if (ramp_time > 0) segs.push({ramp_time, hold_time, temp, ramp_mode: 'LINEAR'});
        });
        return segs;
    }
  }
  
  const ProfilesService = {
    async list(){ const r=await fetch('/api/gcodes/',{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); },
    
    async getDetails(name) {
        const r = await fetch(`/api/gcodes/${encodeURIComponent(name)}`, {cache:'no-store'});
        if(!r.ok) throw new Error('HTTP '+r.status + ' ' + await r.text());
        return r.json();
    },

    async start(name){
      const r = await fetch('/api/gcodes/start', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
      Toast.show(`Starting profile: ${name}`, 'info');
    },

    async remove(name){
        const r = await fetch(`/api/gcodes/?name=${encodeURIComponent(name)}`, {
            method:'DELETE'
        });
        if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
    },
  };

  class ProfileEditorManager {
    constructor() {
        this.modal = new Modal('profileEditorModal');
        this.chart = new ChartView('#editorChart');
        this.segManager = new SegmentsManager('#segmentsList', () => this.onUiChange());
        this.state = {};
        this._reloadCallback = null;
        this._bind();
    }

    setReloadCallback(fn) { this._reloadCallback = fn; }

    _bind() {
        $('#editorCloseBtn')?.addEventListener('click', () => this.modal.close());
        $('#editorCancelBtn')?.addEventListener('click', () => this.modal.close());
        $('#btn-annealing')?.addEventListener('click', () => this.setProgramType('annealing'));
        $('#btn-drying')?.addEventListener('click', () => this.setProgramType('drying'));
        $('#addSegmentBtn')?.addEventListener('click', () => this.segManager.addRow());
        $('#editorSaveBtn')?.addEventListener('click', () => this.save());
        
        document.querySelectorAll('#programName, #filamentType, #dryingTime, #dryingTemp').forEach(el => {
            el?.addEventListener('input', () => this.onUiChange());
        });
    }

    openForCreate() {
        this.state = {
            mode: 'create',
            programType: 'annealing',
            programName: '',
            filamentType: '',
            segments: [],
            dryingTime: 300,
            dryingTemp: 60,
        };
        this.updateUiFromState();
        this.modal.open();
    }

    async openForEdit(name) {
        try {
            showLoadingOverlay(`Loading profile '${name}'...`);
            const data = await ProfilesService.getDetails(name);
            hideLoadingOverlay();
            
            if (!data.segments) {
                throw new Error("Profile data is missing 'segments' information.");
            }

            const isDrying = data.segments.length === 1 && data.segments[0].ramp_time <= 1 && data.segments[0].hold_time > 0;

            this.state = {
                mode: 'edit',
                programType: isDrying ? 'drying' : 'annealing',
                programName: data.name,
                filamentType: data.filament_type || '',
                segments: isDrying ? [] : data.segments,
                dryingTime: isDrying ? data.segments[0].hold_time : 300,
                dryingTemp: isDrying ? data.segments[0].temp : 60,
            };

            this.updateUiFromState();
            this.modal.open();
        } catch(e) {
            hideLoadingOverlay();
            Toast.show(`Failed to load profile for editing: ${e.message}`, 'error');
        }
    }

    setProgramType(type) {
        this.state.programType = type;
        this.updateUiFromState();
    }

    onUiChange() {
        this.state.programName = $('#programName').value;
        this.state.filamentType = $('#filamentType').value;
        this.state.segments = this.segManager.read();
        this.state.dryingTime = toInt($('#dryingTime').value);
        this.state.dryingTemp = toInt($('#dryingTemp').value);
        this.updateChart();
    }

    updateChart() {
        if (this.state.programType === 'annealing') {
            const points = [];
            let currentTime = 0;
            let lastTemp = 25; // Start from ambient
            points.push({ time: 0, temp: 25 }); // Always add the starting point

            this.state.segments.forEach(seg => {
                if (seg.temp !== lastTemp) {
                    points.push({ time: currentTime, temp: lastTemp });
                }
                currentTime += seg.ramp_time;
                points.push({ time: currentTime, temp: seg.temp });
                if (seg.hold_time > 0) {
                    currentTime += seg.hold_time;
                    points.push({ time: currentTime, temp: seg.temp });
                }
                lastTemp = seg.temp;
            });
            this.chart.render(points);
        } else { // Drying mode
            // For drying, we create a simple horizontal line at the target temperature
            const points = [
                { time: 0, temp: this.state.dryingTemp },
                { time: this.state.dryingTime, temp: this.state.dryingTemp }
            ];
            // We pass this array directly, without any ambient temp point
            this.chart.render(points);
        }
    }
    
    updateUiFromState() {
        const { mode, programType, programName, filamentType, segments, dryingTime, dryingTemp } = this.state;
        const isAnnealing = programType === 'annealing';
        
        $('#editorTitle').textContent = mode === 'edit' ? `Edit Profile: ${programName}` : 'Create Profile';
        $('#programName').value = programName;
        $('#filamentType').value = filamentType;
        $('#dryingTime').value = dryingTime;
        $('#dryingTemp').value = dryingTemp;
        
        $('#programName').disabled = (mode === 'edit');

        const switcher = $('#editorModeSwitcher');
        if (switcher) {
            switcher.style.display = (mode === 'create') ? 'flex' : 'none';
        }

        this.segManager.load(segments);

        $('#annealingInputs').style.display = isAnnealing ? 'block' : 'none';
        $('#dryingInputs').style.display = isAnnealing ? 'none' : 'block';
        $('#btn-annealing').classList.toggle('active', isAnnealing);
        $('#btn-drying').classList.toggle('active', !isAnnealing);
        
        this.updateChart();
    }

    _buildFileName() {
        return (this.state.programName || '').trim();
    }

    async save() {
        const programName = this._buildFileName();
        if (!programName) {
            return Toast.show('Please enter a valid profile name.', 'info');
        }
        
        showLoadingOverlay(`Saving profile '${programName}'...`);

        const payload = {
            name: programName,
            filament_type: this.state.filamentType,
            mode: this.state.programType,
            points: this.state.programType === 'annealing' ? this.segManager.read() : null,
            drying_time: this.state.programType === 'drying' ? this.state.dryingTime : null,
            drying_temp: this.state.programType === 'drying' ? this.state.dryingTemp : null,
        };

        try {
            const response = await fetch('/api/gcodes/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || `HTTP ${response.status}`);
            }

            const result = await response.json();

            hideLoadingOverlay();
            Toast.show(`Profile '${result.name}' successfully saved.`, 'success');
            this.modal.close();
            if (this._reloadCallback) await this._reloadCallback();

        } catch (e) {
            hideLoadingOverlay();
            Toast.show(`Save failed: ${e.message}`, 'error');
        }
    }
  }

  // --- Main page logic ---
  const ProfilesPage = {
    editor: null,
    contextMenu: null,

    init() {
        this.editor = new ProfileEditorManager();
        this.editor.setReloadCallback(() => this.loadList());
        this._createContextMenu();
        this.bind();
        this.loadList();
    },

    bind() {
        $('#profilesRefreshBtn')?.addEventListener('click', () => this.loadList());
        $('#openGeneratorBtn')?.addEventListener('click', () => this.editor.openForCreate());
        
        const tbody = $('#profilesTable tbody');
        tbody?.addEventListener('click', (e) => {
            const row = e.target.closest('tr.clickable-row');
            if (row) {
                e.preventDefault();
                StartJobModal.open(row.dataset.name);
            }
        });
        tbody?.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const row = e.target.closest('tr.clickable-row');
            if (row) this._showContextMenu(e, row.dataset.name);
        });
        document.addEventListener('click', () => this._hideContextMenu());
    },

    async loadList() {
        const tbody = $('#profilesTable tbody');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Loading…</td></tr>';
        try {
            const data = await ProfilesService.list();
            const files = data?.files || [];
            tbody.innerHTML = '';
            files.forEach(f => {
                const tr = document.createElement('tr');
                tr.dataset.name = f.name;
                tr.classList.add('clickable-row');
                tr.innerHTML = `
                    <td class="name-cell" data-label="Name"><span class="fname">${f.name}</span></td>
                    <td data-label="File size">${humanSize(f.size)}</td>
                    <td data-label="Last modified">${humanTime(f.mtime)}</td>
                    <td data-label="Filament">${f.filament_type || '—'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:red;">Failed to load profiles.</td></tr>';
        }
    },

    _createContextMenu() {
        if ($('#profilesContextMenu')) return;
        const menu = document.createElement('ul');
        menu.id = 'profilesContextMenu';
        menu.className = 'context-menu';
        menu.innerHTML = `
            <li><button data-act="start">Start</button></li>
            <li><button data-act="edit">Edit</button></li>
            <li><button data-act="delete" class="btn--danger" style="color:#f57c7c;">Delete</button></li>
        `;
        document.body.appendChild(menu);
        this.contextMenu = menu;
        menu.addEventListener('click', async (e) => {
            const button = e.target.closest('button');
            if (!button) return;
            this._handleAction(button.dataset.act, menu.dataset.name);
            this._hideContextMenu();
        });
    },
    
    _showContextMenu(event, fileName) {
        this.contextMenu.dataset.name = fileName;
        this.contextMenu.style.display = 'block';
        this.contextMenu.style.left = `${event.pageX}px`;
        this.contextMenu.style.top = `${event.pageY}px`;
    },
    _hideContextMenu() {
        if (this.contextMenu) this.contextMenu.style.display = 'none';
    },

    async _handleAction(act, name) {
        if (!act || !name) return;
        try {
            if (act === 'start') {
                StartJobModal.open(name);
            }
            if (act === 'edit') {
                this.editor.openForEdit(name);
            }
            if (act === 'delete') {
                const confirmed = await ConfirmModal.show('Delete Profile', `Are you sure you want to delete the profile: ${name}?`);
                if (confirmed) {
                    await ProfilesService.remove(name);
                    Toast.show(`Profile ${name} deleted.`, 'success');
                    await this.loadList();
                }
            }
        } catch (err) {
            Toast.show(`Action failed: ${err.message}`, 'error');
        }
    },
  };

  window.addEventListener('DOMContentLoaded', () => ProfilesPage.init());
})();