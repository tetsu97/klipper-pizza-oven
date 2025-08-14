// /static/js/pages/profiles.js (FINÁLNÍ OPRAVENÁ VERZE)

(function () {
  if (!location.pathname.startsWith('/profiles')) return;

  // =================================================================
  // ===== ČÁST 1: SDÍLENÉ NÁSTROJE A KOMPONENTY =======================
  // =================================================================
  
  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const toInt = (v, d=0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
  const humanSize = (bytes) => {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  };
  const humanTime = (ts) => { try { return new Date(ts*1000).toLocaleString(); } catch { return "—"; } };

  const Orca = {
    extractMapFromGcode(text) {
      const map = {};
      if (!text) return map;
      const lines = String(text).split(/\r?\n/);
      const beginRe = /^\s*;\s*thumbnail begin\s+(\d+)x(\d+)\s+(\d+)/i;
      const endRe   = /^\s*;\s*thumbnail end\b/i;
      let capturing=false, curW=0, curH=0, buf=[];
      for (const raw of lines) {
        const line=raw||'';
        if (!capturing) {
          const m=line.match(beginRe);
          if (m){ curW=+m[1]; curH=+m[2]; buf=[]; capturing=true; }
        } else {
          if (endRe.test(line)) {
            const k=`${curW}x${curH}`; const b64=buf.join('').replace(/\s+/g,'');
            if (b64) map[k]=b64;
            capturing=false;
          } else {
            const payload=line.replace(/^\s*;\s?/,'').trim();
            if (payload && /^[A-Za-z0-9+/=]+$/.test(payload)) buf.push(payload);
          }
        }
      }
      return map;
    }
  };

  const Thumbs = {
    async fetchThumbDataURL(name) {
      try {
        const r = await fetch(`/api/gcodes/download?name=${encodeURIComponent(name)}`, { cache:'no-store' });
        if (!r.ok) return null;
        const text = await r.text();
        const thumbs = Orca.extractMapFromGcode(text);
        const order = ['480x270','300x300','48x48','32x32'];
        const key = order.find(k => thumbs[k]);
        return key ? `data:image/png;base64,${thumbs[key]}` : null;
      } catch { return null; }
    },
  };

  const ProfileMath = {
    dedupePoints(points) {
        const pts = (points || []).map(p => ({ time: +p.time || 0, temp: +p.temp || 0 })).sort((a, b) => a.time - b.time);
        if (pts.length <= 1) return pts;
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i], last = out[out.length - 1];
            if (p.time === last.time) { out[out.length - 1] = p; continue; }
            out.push(p);
        }
        return out;
    },
    pointsToSegments(points) {
        const pts = (points || []).map(p => ({ time: +p.time || 0, temp: +p.temp || 0 })).sort((a, b) => a.time - b.time);
        const segs = [];
        for (let i = 0; i < pts.length - 1; i++) {
            const from = pts[i].time, to = pts[i + 1].time, temp = pts[i + 1].temp;
            if (to - from > 0) segs.push({ from, to, temp });
        }
        return segs;
    },
    segmentsToPoints(segments, startTemp) {
        const segs = (segments || []).map(s => ({ from: +s.from || 0, to: +s.to || 0, temp: +s.temp || 0 })).filter(s => s.to > s.from).sort((a, b) => a.from - b.from);
        const pts = [];
        const first = (typeof startTemp === 'number') ? startTemp : (segs[0] ? segs[0].temp : 0);
        pts.push({ time: 0, temp: first });
        let t = 0;
        for (const s of segs) {
            if (s.from > t) pts.push({ time: s.from, temp: pts[pts.length - 1].temp });
            pts.push({ time: s.to, temp: s.temp });
            t = s.to;
        }
        return pts;
    },
    dedupeSegments(segments) {
        const sorted = (segments || []).map(s => ({ from: +s.from || 0, to: +s.to || 0, temp: +s.temp || 0 })).filter(s => s.to > s.from).sort((a, b) => (a.from - b.from) || (a.to - b.to) || (a.temp - b.temp));
        const out = [];
        for (const s of sorted) {
            const last = out[out.length - 1];
            if (last && last.to === s.from && last.temp === s.temp) { last.to = s.to; }
            else { out.push({ ...s }); }
        }
        return out;
    },
    pointsToSegmentsForTable(points) {
        const clean = this.dedupePoints(points || []);
        const segs = this.pointsToSegments(clean);
        return this.dedupeSegments(segs);
    }
  };

  const ProfilesService = {
    async list(){ const r=await fetch('/api/gcodes',{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); },
    async start(name){ StartJobModal.open(name); },
    async download(name){ window.open(`/api/gcodes/download?name=${encodeURIComponent(name)}`,'_blank'); },
    async remove(name){ const r=await fetch(`/api/gcodes?name=${encodeURIComponent(name)}`,{method:'DELETE'}); if(!r.ok) throw new Error('HTTP '+r.status); },
    async load(name){ const r=await fetch(`/api/gcodes/load?name=${encodeURIComponent(name)}`,{cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); },
    async generate(payload){
      const r=await fetch('/api/generate_gcode',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`); return r.json();
    },
    async saveToKlipper(filename, gcode){
      const payload = { name: filename, gcode: gcode, overwrite: true };
      const r=await fetch('/api/gcodes/save',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`); return r.json();
    }
  };

  class Modal {
    constructor(rootId) { this.root = document.getElementById(rootId); }
    open(){ if (this.root){ this.root.style.display='flex'; } }
    close(){ if (this.root){ this.root.style.display='none'; } }

    /** ✅ OPRAVA: Chybějící statická metoda je zpět */
    static lockBackdrop(ids=['profileEditorModal']){
        ids.forEach(id => {
            const m = document.getElementById(id);
            if (!m) return;
            m.addEventListener('click', (e) => { if (e.target === m) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
        });
        window.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const anyOpen = ids.some(id => {
                const el = document.getElementById(id);
                return el && (el.style.display === 'flex' || el.style.display === 'block');
            });
            if (anyOpen) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
    }
  }

  class ChartView {
    constructor(canvasSel){ this.canvasSel = canvasSel; this.chart = null; }
    _ctx(){ const c=$(this.canvasSel); return c? c.getContext('2d') : null; }
    destroy(){ try{ this.chart?.destroy(); }catch{} this.chart=null; }
    render(points, {dedupe=true}={}){
      const ctx=this._ctx(); if (!ctx) return;
      const src = dedupe ? ProfileMath.dedupePoints(points||[]) : (points||[]);
      const labels = src.map(p=>p.time);
      const temps  = src.map(p=>p.temp);
      this.destroy();
      this.chart = new Chart(ctx, {
        type:'line',
        data:{ labels, datasets:[{ label:'Temperature (°C)', data:temps, borderColor:'#f44336',
          backgroundColor:'rgba(244,67,54,.2)', tension:.1, pointRadius:4, fill:true }] },
        options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display: false } },
          scales:{ x:{ ticks:{color:'#fff'}, title:{display:true,text:'Time (min)',color:'#fff'} },
                   y:{ ticks:{color:'#fff'}, title:{display:true,text:'Temperature (°C)',color:'#fff'} } } }
      });
    }
  }

  class SegmentsTable {
    constructor(tbodySel, onChange){
      this.tbody = document.querySelector(tbodySel);
      this.onChange = onChange;
      this._bind();
    }
    _bind(){
      if (!this.tbody) return;
      this.tbody.addEventListener('click', (e)=>{
        const del = e.target.closest('.row-del');
        if (del){ del.closest('tr')?.remove(); this.onChange?.(); }
      });
      this.tbody.addEventListener('input', ()=> this.onChange?.());
    }
    load(segments){
      if (!this.tbody) return;
      this.tbody.innerHTML='';
      (segments||[]).forEach(s=>{ this.addRow(s, false); });
    }
    addRow(defaults={}, triggerChange=true) {
      if (!this.tbody) return;
      const last = this.tbody.lastElementChild;
      const lastTo = last ? toInt(last.cells[1].querySelector('input').value, 0) : 0;
      const lastTemp = last ? toInt(last.cells[2].querySelector('input').value, 20) : 20;

      let newTemp = lastTemp + 5;
      if (newTemp > 120) newTemp = 30;
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td><input type="number" value="${defaults.from ?? lastTo}" min="0" step="1" style="width:90px"></td>
        <td><input type="number" value="${defaults.to ?? (lastTo+60)}" min="0" step="1" style="width:90px"></td>
        <td><input type="number" value="${defaults.temp ?? lastTemp}" min="0" step="1" style="width:90px"></td>
        <td><button type="button" class="row-del btn--danger" style="padding: 4px 8px; min-height: 0;">X</button></td>`;
      this.tbody.appendChild(tr);
      if (triggerChange) this.onChange?.();
    }
    read(){
      if (!this.tbody) return [];
      const segs = [];
      this.tbody.querySelectorAll('tr').forEach(tr=>{
        const from = toInt(tr.cells[0].querySelector('input').value);
        const to   = toInt(tr.cells[1].querySelector('input').value);
        const temp = toInt(tr.cells[2].querySelector('input').value);
        if (to > from) segs.push({from,to,temp});
      });
      return segs.sort((a,b)=>a.from-b.from);
    }
  }

  // =================================================================
  // ===== ČÁST 2: CENTRÁLNÍ MANAGER PRO EDITOR/GENERÁTOR ==============
  // =================================================================

  class ProfileEditorManager {
  constructor() {
    this.modal = new Modal('profileEditorModal');
    this.chart = new ChartView('#editorChart');
    this.segTable = new SegmentsTable('#segmentsTable tbody', () => this.onUiChange());
    this.state = {};
    this._reloadCallback = null; // 🔧 přidáno
    this._bind();
  }

  setReloadCallback(fn) {
    this._reloadCallback = fn;
  }

    _bind() {
      $('#editorCloseBtn')?.addEventListener('click', () => this.modal.close());
      $('#editorCancelBtn')?.addEventListener('click', () => this.modal.close());
      $('#btn-annealing')?.addEventListener('click', () => this.setProgramType('annealing'));
      $('#btn-drying')?.addEventListener('click', () => this.setProgramType('drying'));
      $('#addSegmentBtn')?.addEventListener('click', () => this.addSegment());
      $('#downloadGcodeBtn')?.addEventListener('click', () => this.download());
      $('#editorSaveBtn')?.addEventListener('click', () => this.save());
      
      $('#programName').addEventListener('input', () => this.onUiChange());
      $('#filamentType').addEventListener('input', () => this.onUiChange());
      $('#dryingTime').addEventListener('input', () => this.onUiChange());
      $('#dryingTemp').addEventListener('input', () => this.onUiChange());
    }
    
    openForCreate() {
      this.state = {
        mode: 'create',
        programType: 'annealing',
        currentFile: null,
        startTemp: 0,
        programName: 'Nový profil žíhání',
        filamentType: '',
        segments: [ { from:0, to:60, temp:80 } ],
        dryingTime: 300,
        dryingTemp: 60,
        gcode: '',
      };
      this.updateUiFromState();
      this.modal.open();
      this.updateGcodePreview();
    }

    async openForEdit(fileName) {
      try {
        const data = await ProfilesService.load(fileName);
        const points = data.points || [];
        this.state = {
            mode: 'edit',
            programType: 'annealing',
            currentFile: fileName,
            startTemp: points[0]?.temp ?? 0,
            programName: data.program_name || '',
            filamentType: data.filament_type || '',
            segments: ProfileMath.pointsToSegments(points),
            originalPoints: points,
            gcode: '',
        };
        this.updateUiFromState();
        this.modal.open();
        this.updateGcodePreview();
      } catch (e) {
        Toast.show(`Nepodařilo se načíst profil: ${e.message}`, 'error');
      }
    }
    
    setProgramType(type) {
      this.state.programType = type;
      this.updateUiFromState();
    }
    
    addSegment() {
      this.segTable.addRow({}, true);
    }
    
    onUiChange() {
      this.state.programName = $('#programName').value;
      this.state.filamentType = $('#filamentType').value;
      this.state.segments = this.segTable.read();
      this.state.dryingTime = toInt($('#dryingTime').value);
      this.state.dryingTemp = toInt($('#dryingTemp').value);
      this.updateGcodePreview(false);

      if (this.state.programType === 'annealing') {
        const points = ProfileMath.segmentsToPoints(this.state.segments, this.state.startTemp);
        this.chart.render(points, { dedupe: false });
      } else {
        const dryingPoints = [
          { time: 0, temp: this.state.dryingTemp },
          { time: this.state.dryingTime, temp: this.state.dryingTemp }
        ];
        this.chart.render(dryingPoints, { dedupe: false });
      }
    }
    
    updateUiFromState() {
      const { mode, programType, programName, filamentType, segments, gcode } = this.state;
      const isCreate = mode === 'create';
      const isAnnealing = programType === 'annealing';
      const cleanSegments = ProfileMath.dedupeSegments(this.state.segments);
      this.segTable.load(cleanSegments);

      $('#editorTitle').textContent = isCreate ? 'Vytvořit Profil' : `Upravit: ${this.state.currentFile}`;
      $('#editorModeSwitcher').style.display = isCreate ? 'flex' : 'none';
      //$('#generatorActions').style.display = isCreate ? 'flex' : 'none';

      $('#programName').value = programName;
      $('#filamentType').value = filamentType;
      $('#gcodeOutput').value = gcode;

      $('#annealingInputs').style.display = isAnnealing ? 'block' : 'none';
      $('#dryingInputs').style.display = isAnnealing ? 'none' : 'block';
      $('#btn-annealing').classList.toggle('active', isAnnealing);
      $('#btn-drying').classList.toggle('active', !isAnnealing);
      
      const uniqueSegments = [];
      const seen = new Set();

      for (const s of segments) {
        const key = `${s.from}-${s.to}-${s.temp}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueSegments.push(s);
        }
      }
      this.segTable.load(uniqueSegments);

      if(isAnnealing) {
          this.chart.render(ProfileMath.segmentsToPoints(segments, this.state.startTemp), { dedupe: false });
      } else {
          const dryingPoints = [
          { time: 0, temp: this.state.dryingTemp },
          { time: this.state.dryingTime, temp: this.state.dryingTemp }
      ];
      this.chart.render(dryingPoints, { dedupe: false });
      }
    }

    async updateGcodePreview(showToast = false) {
      const rawSegments = this.segTable.read();

      const payload = {
        program_name: this.state.programName,
        filament_type: this.state.filamentType,
        mode: this.state.programType,
        points: this.state.programType === 'annealing'
          ? ProfileMath.segmentsToPoints(rawSegments, this.state.startTemp)
          : [],
        drying_time: this.state.dryingTime,
        drying_temp: this.state.dryingTemp,
      };

      try {
        const res = await ProfilesService.generate(payload);
        let gcode = res.gcode || '';

        // === VLOŽENÍ THUMBNAILU DO G-KÓDU ===
        const canvas = document.querySelector('#editorChart');
        if (canvas) {
          const thumbW = 300, thumbH = 300;
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = thumbW;
          tmpCanvas.height = thumbH;
          const tmpCtx = tmpCanvas.getContext('2d');

          // Bílé pozadí
          tmpCtx.fillStyle = '#1e1e1e';
          tmpCtx.fillRect(0, 0, thumbW, thumbH);

          // Překreslení canvasu do thumbnailu
          tmpCtx.drawImage(canvas, 0, 0, thumbW, thumbH);

          // Získání PNG jako base64
          const dataUrl = tmpCanvas.toDataURL('image/png');
          const b64 = dataUrl.split(',')[1]; // odstraníme prefix "data:image/png;base64,"

          // Rozřezání na 76 znakové řádky
          const lines = b64.match(/.{1,76}/g) || [];
          const sizeEstimate = b64.length;

          const thumbGcode = [];
          thumbGcode.push(`; thumbnail begin ${thumbW}x${thumbH} ${sizeEstimate}`);
          lines.forEach(line => thumbGcode.push(`; ${line}`));
          thumbGcode.push(`; thumbnail end`);

          // Přidání na začátek G-kódu
          gcode = `${thumbGcode.join('\n')}\n${gcode}`;
        }

        // Uložení do stavu a UI
        this.state.gcode = gcode;
        $('#gcodeOutput').value = this.state.gcode;

        if (showToast) Toast.show('Náhled G-kódu vygenerován.', 'info');
      } catch (e) {
        this.state.gcode = '';
        $('#gcodeOutput').value = '';
        if (showToast) Toast.show('Generování G-kódu selhalo.', 'error');
      }
    }
    
    _buildFileName() {
        const name = this.state.programName || 'program';
        const safe = name.replace(/\s+/g, '_').replace(/[^\w\-\.]/g, '');
        let totalMinutes = 0;
        if (this.state.programType === 'annealing') {
            const lastSeg = this.state.segments.slice().sort((a,b) => b.to - a.to)[0];
            if (lastSeg) totalMinutes = lastSeg.to;
        } else {
            totalMinutes = this.state.dryingTime;
        }
        const h=Math.floor(totalMinutes/60), m=totalMinutes%60;
        const suffixTime = h>0 ? (m>0?`_${h}h${m}m`:`_${h}h`) : `_${m}m`;
        const suffixMode = this.state.programType==='drying' ? '_drying' : '_annealing';
        return `${safe}${suffixMode}${suffixTime}.gcode`;
    }

    _generateUniqueFileName(baseName, existingNames) {
        if (!existingNames.includes(baseName)) return baseName;
        const nameWithoutExt = baseName.replace(/\.gcode$/i, '');
        let counter = 1;
        let newName = `${nameWithoutExt}_${counter}.gcode`;
        while (existingNames.includes(newName)) {
            counter++;
            newName = `${nameWithoutExt}_${counter}.gcode`;
        }
        return newName;
    }

    async download() {
      await this.updateGcodePreview();
      if (!this.state.gcode) return Toast.show('Nejdříve vygenerujte G-kód.', 'info');
      const filename = this.state.mode === 'edit' ? this.state.currentFile : this._buildFileName();
      const blob = new Blob([this.state.gcode], {type:'text/plain'});
      const a = document.createElement('a'); a.download = filename; a.href = URL.createObjectURL(blob); a.click(); URL.revokeObjectURL(a.href);
    }
    
    async save() {
      this.state.segments = this.segTable.read();
      this.state.dryingTime = toInt($('#dryingTime').value);
      this.state.dryingTemp = toInt($('#dryingTemp').value);

      await this.updateGcodePreview();
      if (!this.state.gcode) return Toast.show('Nelze uložit prázdný G-kód.', 'error');

      let filename = this.state.currentFile;
      if (this.state.mode === 'create') {
        const baseName = this._buildFileName();
        filename = this._generateUniqueFileName(baseName, ProfilesPage.existingFiles);
        if (filename !== baseName) {
          Toast.show(`Soubor již existoval. Ukládám jako '${filename}'.`, 'info');
        }
      }

      try {
        const r = await ProfilesService.saveToKlipper(filename, this.state.gcode);
        Toast.show('Uloženo jako: ' + r.name, 'success');
        this.modal.close();
        if (this._reloadCallback) await this._reloadCallback();
      } catch (e) {
        Toast.show('Ukládání selhalo: ' + e.message, 'error');
      }
    }
  }

  // =================================================================
  // ===== ČÁST 3: HLAVNÍ LOGIKA STRÁNKY ===============================
  // =================================================================

  const ProfilesPage = {
    editor: null,
    contextMenu: null,
    existingFiles: [],

    init() {
      this.editor = new ProfileEditorManager();
      this.editor.setReloadCallback(() => this.loadList()); // 🔧 nový callback
      this._createContextMenu();
      this.bind();
      this.loadList();
    },

    bind() {
      $('#profilesRefreshBtn')?.addEventListener('click', () => this.loadList());
      $('#openGeneratorBtn')?.addEventListener('click', () => this.editor.openForCreate());
      
      const tbody = $('#profilesTable tbody');
      if (!tbody) return;

      const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
      if (isTouchDevice) {
        tbody.addEventListener('click', (e) => {
          const row = e.target.closest('tr.clickable-row');
          if (row) { e.stopPropagation(); this._showContextMenu(e, row.dataset.name); }
        });
      } else {
        tbody.addEventListener('click', (e) => {
          const row = e.target.closest('tr.clickable-row');
          if (row) ProfilesService.start(row.dataset.name);
        });
        tbody.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const row = e.target.closest('tr.clickable-row');
          if (row) this._showContextMenu(e, row.dataset.name);
        });
      }
      document.addEventListener('click', () => this._hideContextMenu());
      Modal.lockBackdrop(['profileEditorModal']);
    },

    async loadList() {
      const tbody = $('#profilesTable tbody');
      if (!tbody) return;
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Načítám…</td></tr>';
      try {
        const data = await ProfilesService.list();
        const files = data?.files || [];
        this.existingFiles = files.map(f => f.name);
        tbody.innerHTML = '';
        files.forEach(f => {
          const tr = document.createElement('tr');
          tr.dataset.name = f.name;
          tr.classList.add('clickable-row');
          tr.innerHTML = `
            <td class="name-cell" data-label="Name"><img class="gthumb" alt="thumb" /><span class="fname">${f.name}</span></td>
            <td data-label="File size">${humanSize(f.size)}</td>
            <td data-label="Last modified">${humanTime(f.mtime)}</td>
            <td data-label="Filament">${f.filament_type || '—'}</td>
          `;
          tbody.appendChild(tr);
          this._loadThumb(f.name, tr.querySelector('img.gthumb'));
        });
      } catch (e) {
        console.error(e);
        this.existingFiles = [];
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:red;">Nepodařilo se načíst profily.</td></tr>';
      }
    },

    async _loadThumb(name, imgEl) {
      if (!imgEl) return;
      imgEl.src = ''; imgEl.style.opacity = '0';
      const url = await Thumbs.fetchThumbDataURL(name);
      if (url) { imgEl.src = url; imgEl.style.opacity = '1'; }
    },

    _createContextMenu() {
      if ($('#profilesContextMenu')) return;
      const menu = document.createElement('ul');
      menu.id = 'profilesContextMenu';
      menu.className = 'context-menu';
      menu.innerHTML = `
        <li><button data-act="start">Spustit</button></li>
        <li><button data-act="edit">Upravit</button></li>
        <li><button data-act="download">Stáhnout</button></li>
        <li><button data-act="delete" class="btn--danger">Smazat</button></li>
      `;
      document.body.appendChild(menu);
      this.contextMenu = menu;
      menu.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        this._handleAction(button.dataset.act, menu.dataset.fileName);
        this._hideContextMenu();
      });
    },
    
    _showContextMenu(event, fileName) {
      this.contextMenu.dataset.fileName = fileName;
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
        switch (act) {
          case 'start': await ProfilesService.start(name); break;
          case 'edit': await this.editor.openForEdit(name); break;
          case 'download': await ProfilesService.download(name); break;
          case 'delete':
            if (confirm(`Opravdu smazat profil: ${name}?`)) {
              await ProfilesService.remove(name);
              Toast.show(`Profil ${name} smazán.`, 'success');
              await this.loadList();
            }
            break;
        }
      } catch (err) {
        console.error(err);
        Toast.show('Akce selhala: ' + (err?.message || err), 'error');
      }
    },
  };

  window.addEventListener('DOMContentLoaded', () => ProfilesPage.init());
})();