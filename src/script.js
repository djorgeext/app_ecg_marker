// ECG-only script: load file, plot 12 leads, mark P/Q/R/S/T, shade segments, navigate, and export.
(function(){
  // Expose internal state bridge for modules
  // Filled later once variables are declared
  let __bridgeInit = null;
  let isBmecg = false;
  // Utility helpers
  const clamp = (v,min,max)=> v<min?min:(v>max?max:v);
  const median = (arr)=>{ if(!arr||!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
  const binarySearchIndex = (arr,val)=>{ let lo=0, hi=arr.length-1; while(lo<hi){ const mid=(lo+hi)>>>1; if(arr[mid]<val) lo=mid+1; else hi=mid; } return lo; };
  const dtOf = (xs)=> (xs && xs.length>1 ? Math.abs(Number(xs[1])-Number(xs[0]))||1 : 1);
  const timeAt = (xs,i)=> Number(xs[clamp(i,0,xs.length-1)]);
  const downloadText = (text, filename)=>{ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
  const input = document.getElementById('fileInput');
  const statusOutput = document.getElementById('statusOutput');
  const loadFileBtn = document.getElementById('loadFileBtn');
  if (loadFileBtn && input) loadFileBtn.addEventListener('click', () => input.click());

  const myPlot = document.getElementById('myDiv');
  const rightPanel = document.getElementById('channelPanel');
  // Note: many right-panel elements are created after this script tag; we will wire them on DOMContentLoaded
  const sb = document.getElementById('scrollbar');
  const sbContent = document.getElementById('scrollbarContent');
  const btnLeft = document.getElementById('scrollLeft');
  const btnRight = document.getElementById('scrollRight');

  // Will be looked up when needed
  const API_BASE = (window.API_BASE || 'http://localhost:8000');

  // Segment / events controls – wired after DOM ready
  let eventModeCb = null;
  let eventTypeSel = null;
  let deleteSegBtn = null;
  let segFilterAllBtn = null;
  let segFilterNoneBtn = null;
  const getSegFilterCbs = () => Array.from(document.querySelectorAll('.seg-filter'));
  function wireSegmentControlsOnce(){
    if (eventModeCb && eventModeCb.__wiredSegment) return;
    eventModeCb = document.getElementById('eventMode');
    eventTypeSel = document.getElementById('eventType');
    deleteSegBtn = document.getElementById('deleteSegBtn');
    segFilterAllBtn = document.getElementById('segFilterAll');
    segFilterNoneBtn = document.getElementById('segFilterNone');
    if (!eventModeCb) return; // elements not yet present
    eventModeCb.addEventListener('change', () => {
      pendingSegStartIdx = null;
      if (eventModeCb.checked && deleteSegMode) { deleteSegMode = false; deleteSegBtn && deleteSegBtn.classList.remove('active'); }
      statusOutput && (statusOutput.innerText = eventModeCb.checked ? 'Event mode: click start and end' : '');
    });
    if (deleteSegBtn && !deleteSegBtn.__wired) {
      deleteSegBtn.addEventListener('click', () => {
        deleteSegMode = !deleteSegMode;
        if (deleteSegMode && eventModeCb && eventModeCb.checked) { eventModeCb.checked = false; pendingSegStartIdx = null; }
        deleteSegBtn.classList.toggle('active', deleteSegMode);
        statusOutput && (statusOutput.innerText = deleteSegMode ? 'Delete mode: click shaded segment to remove' : '');
      });
      deleteSegBtn.__wired = true;
    }
    if (segFilterAllBtn && !segFilterAllBtn.__wired) {
      segFilterAllBtn.addEventListener('click', () => { getSegFilterCbs().forEach(cb => cb.checked = true); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
      segFilterAllBtn.__wired = true;
    }
    if (segFilterNoneBtn && !segFilterNoneBtn.__wired) {
      segFilterNoneBtn.addEventListener('click', () => { getSegFilterCbs().forEach(cb => cb.checked = false); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
      segFilterNoneBtn.__wired = true;
    }
    // Individual filter checkboxes (dynamic)
    getSegFilterCbs().forEach(cb => {
      if (!cb.__wired) {
        cb.addEventListener('change', () => { const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
        cb.__wired = true;
      }
    });
    eventModeCb.__wiredSegment = true;
  }
  document.addEventListener('DOMContentLoaded', wireSegmentControlsOnce);

  const marksAll = []; // {idx, type}
  const segmentsAll = []; // {startIdx,endIdx,type}
  window.marksAll = marksAll;
  window.segmentsAll = segmentsAll;

  const fidRadios = () => Array.from(document.querySelectorAll('input[name="fiducial"]'));
  const getCurrentFid = () => { const r = fidRadios().find(x=>x.checked); return r ? r.value : 'R'; };

  let fullX = [];
  let channels = [];
  let windowSize = 1000;
  const maxRender = 5000;
  let currentStart = 0;
  if (!__bridgeInit) {
    window.__state = {
      get fullX(){ return fullX; }, set fullX(v){ fullX = Array.isArray(v)?v:[]; },
      get channels(){ return channels; }, set channels(v){ channels = Array.isArray(v)?v:[]; },
      get windowSize(){ return windowSize; }, set windowSize(v){ windowSize = Number(v)||windowSize; },
      get maxRender(){ return maxRender; },
      get currentStart(){ return currentStart; }, set currentStart(v){ currentStart = Number(v)||0; },
      get marks(){ return marksAll; }, get segments(){ return segmentsAll; },
      get plot(){ return myPlot; },
    };
    __bridgeInit = true;
  }

  const getTrace = (parsedArr, column) => parsedArr.map(row => {
    const raw = row[column] !== undefined ? row[column].trim() : '';
    if (raw === '') return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  });

  // Note: .vak expected as tab-delimited with 1 time column + 12 channels

  const getEnabledTypes = () => { return new Set(getSegFilterCbs().filter(el => el.checked).map(el => String(el.dataset.type))); };
  const syncCounts = () => {
    const el = document.getElementById('countsLine');
    if (el) el.textContent = `${marksAll.length} marks | ${segmentsAll.length} segments`;
    const detail = document.getElementById('countsDetails');
    if (detail) {
      if (!marksAll.length) { detail.textContent = ''; return; }
      const byType = marksAll.reduce((acc,m)=>{ acc[m.type]=(acc[m.type]||0)+1; return acc; },{});
      const order = ['P','Q','R','S','T'];
      const parts = order.filter(t=>byType[t]).map(t=>`${t}:${byType[t]}`);
      const extra = Object.keys(byType).filter(k=>!order.includes(k)).sort();
      extra.forEach(k=>parts.push(`${k}:${byType[k]}`));
      detail.textContent = parts.join('  •  ');
    }
  };

  const getRightPanelHeight = () => { if (!rightPanel) return Math.max(window.innerHeight - 32, 640); return Math.max(320, rightPanel.clientHeight || 0); };
  const updatePlotContainerHeight = (visibleChannelsCount) => {
    const base = getRightPanelHeight();
    const extra = Math.max(0, (visibleChannelsCount - 8)) * 60;
    const maxExtra = 600;
    const target = base + Math.min(extra, maxExtra);
    if (myPlot && Math.abs((myPlot.clientHeight || 0) - target) > 4) myPlot.style.height = `${target}px`;
  };

  let deleteSegMode = false;
  let pendingSegStartIdx = null;

  const findIndex = binarySearchIndex; window._binaryFindIndex = findIndex;
  // Decimation with simple step strategy; cached for speed during fast zooms
  const decimCache = new Map(); // key: `${ch}|${start}|${end}|${max}` -> {x,y}
  const decimate = (xs, ys, maxPoints, chIdx, startIndex, endIndex) => {
    const n = xs.length;
    if (n <= maxPoints) return { x: xs, y: ys };
    const key = `${chIdx}|${startIndex}|${endIndex}|${maxPoints}`;
    const cached = decimCache.get(key);
    if (cached) return cached;
    const step = Math.ceil(n / maxPoints);
    const nx = [], ny = [];
    for (let i = 0; i < n; i += step) { nx.push(xs[i]); ny.push(ys[i]); }
    const out = { x: nx, y: ny };
    decimCache.set(key, out);
    // Simple cache size control
    if (decimCache.size > 5000) {
      const it = decimCache.keys().next();
      if (!it.done) decimCache.delete(it.value);
    }
    return out;
  };

  // Throttled render queue
  let renderPending = false;
  let lastRenderArgs = null; // [startIndex, endIndex]
  const scheduleRender = (startIndex, endIndex) => {
    lastRenderArgs = [startIndex, endIndex];
    if (renderPending) return;
    renderPending = true;
    setTimeout(() => {
      renderPending = false;
      if (!lastRenderArgs) return;
      const [s,e] = lastRenderArgs; lastRenderArgs = null;
      renderWindow(s,e);
    }, 20); // ~50 FPS throttle
  };

  const buildChannelCheckboxes = () => {
    const container = document.getElementById('channelList');
    if (!container) return;
    container.innerHTML = '';
    (channels || []).forEach((_, idx) => {
      const n = idx + 1;
      const wrapper = document.createElement('div');
      const label = document.createElement('label');
      label.style.display = 'block';
      const inputEl = document.createElement('input');
      inputEl.type = 'checkbox';
      inputEl.className = 'ch_cb';
      inputEl.dataset.idx = String(idx);
      inputEl.checked = idx < 3; // ensure property is set
      label.appendChild(inputEl);
      label.appendChild(document.createTextNode(' Ch' + n));
      wrapper.appendChild(label);
      container.appendChild(wrapper);
    });
    // Reflect default selection in header label
    const channelsCurrent = document.getElementById('channelsCurrent');
    if (channelsCurrent) {
      const defaultSel = Math.min(3, (channels || []).length);
      channelsCurrent.textContent = defaultSel === (channels || []).length ? 'All' : (defaultSel <= 0 ? 'None' : `${defaultSel} channels`);
    }
  };
  const getSelectedIndices = () => {
    const cbs = Array.from(document.querySelectorAll('.ch_cb'));
    const selected = cbs.filter(cb => cb.checked).map(cb => Number(cb.dataset.idx));
    const allCheckbox = document.getElementById('ch_all');
    if (allCheckbox && allCheckbox.checked) return (channels || []).map((_,i)=>i);
    return selected;
  };
  const syncAllCheckbox = () => {
    const cbs = Array.from(document.querySelectorAll('.ch_cb'));
    const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
    const allCheckbox = document.getElementById('ch_all');
    if (allCheckbox) allCheckbox.checked = allChecked;
  };
  const wireChannelControls = () => {
    const container = document.getElementById('channelList');
    const allCheckbox = document.getElementById('ch_all');
    if (container && !container.__wired) {
      container.addEventListener('change', () => { syncAllCheckbox(); const selCount = getSelectedIndices().length || 0; updatePlotContainerHeight(selCount); });
      container.__wired = true;
    }
    if (allCheckbox && !allCheckbox.__wired) {
      allCheckbox.addEventListener('change', () => { const cbs = Array.from(document.querySelectorAll('.ch_cb')); cbs.forEach(cb => cb.checked = allCheckbox.checked); const selCount = getSelectedIndices().length || 0; updatePlotContainerHeight(selCount); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); });
      allCheckbox.__wired = true;
    }
    // Update the “Channels” label after wiring
    const channelsCurrent = document.getElementById('channelsCurrent');
    if (channelsCurrent) {
      const count = getSelectedIndices().length;
      channelsCurrent.textContent = count === 0 ? 'None' : (count === (channels || []).length ? 'All' : `${count} channels`);
    }
  };

  let resizeTimer = null;
  window.addEventListener('resize', () => { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { const selCount = getSelectedIndices().length || 0; updatePlotContainerHeight(selCount); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); }, 120); });

  let plotEventsWired = false;

  // Track last shapes hash to avoid rebuilding if no changes
  let lastShapesHash = '';
  const renderWindow = (startIndex, endIndex) => {
    if (!fullX || fullX.length === 0 || !channels || channels.length === 0) { Plotly.purge(myPlot); return; }
    let sel = getSelectedIndices();
    if (sel.length === 0) {
      // Auto-select first 3 channels by default
      const toSel = Math.min(3, channels.length);
      const cbs = Array.from(document.querySelectorAll('.ch_cb'));
      for (let i = 0; i < toSel; i++) {
        const cb = cbs.find(el => Number(el.dataset.idx) === i);
        if (cb) cb.checked = true;
      }
      sel = getSelectedIndices();
      const channelsCurrent = document.getElementById('channelsCurrent');
      if (channelsCurrent) channelsCurrent.textContent = sel.length === channels.length ? 'All' : (sel.length === 0 ? 'None' : `${sel.length} channels`);
    }
    if (sel.length === 0) { Plotly.purge(myPlot); return; }
    const m = sel.length; updatePlotContainerHeight(m);
    const gap = 0.02; const totalGap = gap * (m - 1); const h = (1 - totalGap) / m;
    const dataOut = [];
    let containerHeight = 600; try { const rect = myPlot.getBoundingClientRect(); if (rect && rect.height > 0) containerHeight = rect.height; } catch {}
    const layout = { showlegend:false, margin:{ t:70, r:20, l:50, b:40 }, height: containerHeight, title:{ text:'' } };
    for (let i = 0; i < m; i++) { const top = 1 - i * (h + gap); const bottom = top - h; const yName = i === 0 ? 'yaxis' : 'yaxis' + (i + 1); layout[yName] = { domain:[bottom, top], anchor:'x', showgrid:true, gridcolor:'#e5e7eb', gridwidth:1, zeroline:false, layer:'below traces', title:{ text:'' } }; }
    const maxPerTrace = Math.max(1000, Math.floor(maxRender / Math.max(1, m)));
    sel.forEach((chIdx, i) => {
      const xs = fullX.slice(startIndex, endIndex);
      const ys = channels[chIdx].slice(startIndex, endIndex);
      const dec = decimate(xs, ys, maxPerTrace, chIdx, startIndex, endIndex);
      dataOut.push({ x: dec.x, y: dec.y, type:'scatter', mode:'lines', name:'Ch' + (chIdx + 1), line:{ width:1 }, yaxis: i === 0 ? 'y' : 'y' + (i + 1) });
    });
    layout.xaxis = { anchor: 'y' + (m === 1 ? '' : (m)), showgrid:true, gridcolor:'#e5e7eb', gridwidth:1, zeroline:false, layer:'below traces', title:{ text:'' } };

    const existingShapes = Array.isArray(myPlot.layout && myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => !s.id || !/^(vline-|seg-)/.test(String(s.id))) : [];
    const existingAnns = Array.isArray(myPlot.layout && myPlot.layout.annotations) ? myPlot.layout.annotations.filter(a => !a.id || !/^(ann-|seg-ann-)/.test(String(a.id))) : [];
    const visibleMarks = (marksAll || []).filter(m => m && m.idx >= startIndex && m.idx < endIndex);
    const enabled = getEnabledTypes();
    const visibleSegs = (segmentsAll || []).filter(s => enabled.has(String(s.type)) && !(s.endIdx < startIndex || s.startIdx > endIndex));
    const colorForType = (t) => { switch (String(t)) { case 'Arrhythmia': return { fill:'rgba(16,185,129,0.25)', line:'rgba(16,185,129,0.8)' }; case 'Artifact': return { fill:'rgba(245,158,11,0.25)', line:'rgba(180,83,9,0.8)' }; case 'Noise': return { fill:'rgba(107,114,128,0.30)', line:'rgba(55,65,81,0.8)' }; case 'ST change': return { fill:'rgba(239,68,68,0.20)', line:'rgba(153,27,27,0.8)' }; default: return { fill:'rgba(139,92,246,0.25)', line:'rgba(109,40,217,0.8)' }; } };
  const segShapes = visibleSegs.map(s => { const x0 = timeAt(fullX,s.startIdx); const x1 = timeAt(fullX,s.endIdx); const c = colorForType(s.type); return { type:'rect', xref:'x', yref:'paper', x0, x1, y0:0, y1:1, fillcolor:c.fill, line:{ color:c.line, width:1, dash:'dot' }, id:`seg-${s.startIdx}-${s.endIdx}-${s.type}`, layer:'below' }; });
  const markShapes = visibleMarks.map(m => { const x = timeAt(fullX,m.idx); return { type:'line', xref:'x', yref:'paper', x0:x, x1:x, y0:0, y1:1, line:{ color:'#d0d0d0', width:1 }, id:`vline-${m.idx}-${m.type}`, layer:'below' }; });
    const markAnns = [];
    // Only show the fiducial letter permanently; index/time will appear on hover instead
    const colorForFid = (t)=>{
      switch(t){
        case 'P': return '#1d4ed8';
        case 'Q': return '#ea580c';
        case 'R': return '#dc2626';
        case 'S': return '#16a34a';
        case 'T': return '#9333ea';
        default: return '#111827';
      }
    };
    visibleMarks.forEach(m => {
      const x = timeAt(fullX,m.idx);
      const baseY = 1.0;
      markAnns.push({
        x, y: baseY,
        xref: 'x', yref: 'paper',
        text: String(m.type),
        showarrow: false,
        align: 'center',
        yanchor: 'bottom',
        yshift: 6, // closer to the line now that the numeric label is removed
        bgcolor: 'rgba(255,255,255,0.92)',
        bordercolor: colorForFid(m.type),
        borderwidth: 1,
        font: { color: colorForFid(m.type), size: 11, family: 'monospace', weight:600 },
        id: `ann-type-${m.idx}-${m.type}`
      });
    });
    // Guard: only rebuild shapes/annotations when changed
    const shapesHash = Utils.hashMarksSegs(visibleMarks, visibleSegs);
    if (shapesHash !== lastShapesHash) {
      layout.shapes = existingShapes.concat(segShapes, markShapes);
      layout.annotations = existingAnns.concat(markAnns);
      lastShapesHash = shapesHash;
    } else {
      layout.shapes = myPlot.layout && myPlot.layout.shapes ? myPlot.layout.shapes : existingShapes;
      layout.annotations = myPlot.layout && myPlot.layout.annotations ? myPlot.layout.annotations : existingAnns;
    }
    visibleMarks.forEach((m) => {
  const xval = timeAt(fullX,m.idx);
      const selIdx = getSelectedIndices();
      selIdx.forEach((chIdx, i) => {
        const yaxisName = i === 0 ? 'y' : 'y' + (i + 1);
        const yval = channels[chIdx] && channels[chIdx][m.idx] !== undefined ? channels[chIdx][m.idx] : null;
        if (yval == null) return;
        const fidColor = (m.type==='R')?'#dc2626':(m.type==='P')?'#1d4ed8':(m.type==='T')?'#9333ea':'red';
        dataOut.push({
          x: [xval],
          y: [yval],
          type: 'scatter',
          mode: 'markers',
          marker: { color: fidColor, size: 8 },
          showlegend: false,
          hoverinfo: 'text',
          text: [String(xval)], // show index on hover m.idx
          hovertemplate: '%{text}<extra></extra>',
          customdata: [m.idx],
          yaxis: yaxisName
        });
      });
    });
  const reactResult = Plotly.react(myPlot, dataOut, layout, { displayModeBar:true, scrollZoom:false, editable:true, edits:{ titleText:false, axisTitleText:false, annotationText:false, legendPosition:false, colorbarPosition:false, shapePosition:false } });
    if (reactResult && typeof reactResult.then === 'function') {
      reactResult.then((gd) => {
        if (!plotEventsWired && gd && typeof gd.on === 'function') {
          attachPlotEvents();
          plotEventsWired = true;
        }
      });
    } else if (!plotEventsWired && myPlot && typeof myPlot.on === 'function') {
      attachPlotEvents();
      plotEventsWired = true;
    }
    syncCounts();
  {
    const modal = document.getElementById('aecgModal');
    const info = document.getElementById('aecgInfo');
    if (modal && info && !modal.classList.contains('hidden')) { const sr = inferSamplingRate(fullX); info.textContent = `Sampling rate: ${sr || '-'} Hz | Leads: ${channels.length}`; }
  }
  };

  window.renderWindow = renderWindow;

  const inferSamplingRate = (xs) => { if(!xs||xs.length<3) return null; const dts=[]; for(let i=1;i<Math.min(xs.length,4096);i++){ const d=Number(xs[i])-Number(xs[i-1]); if(isFinite(d)&&d>0) dts.push(d);} const med=median(dts); return (med&&med>0)?Math.round(1/med):null; };

  function wireExportControls() {
    const exportBtnEl = document.getElementById('exportBtn');
    const exportMenuEl = document.getElementById('exportMenu');
    const aecgModalEl = document.getElementById('aecgModal');
    const aecgCancelEl = document.getElementById('aecgCancel');
    const aecgDownloadEl = document.getElementById('aecgDownload');
    const aecgBtnEl = document.getElementById('exportAecgBtn');

    const hideMenu = () => { const em = document.getElementById('exportMenu'); if (em) em.classList.add('hidden'); };
    const toggleMenu = () => { const em = document.getElementById('exportMenu'); if (em) em.classList.toggle('hidden'); };

  if (exportBtnEl && !exportBtnEl.__wired) {
      exportBtnEl.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
      exportBtnEl.__wired = true;
    }
    if (exportMenuEl && !exportMenuEl.__wired) {
      exportMenuEl.addEventListener('click', (e) => { e.stopPropagation(); });
      exportMenuEl.__wired = true;
    }
    if (!document.__exportHideWired) {
      document.addEventListener('click', hideMenu);
      document.__exportHideWired = true;
    }

    if (exportMenuEl && !exportMenuEl.__itemsWired) {
      exportMenuEl.querySelectorAll('button[data-exp="marks"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const typ = String(btn.dataset.type);
          const list = marksAll.filter(m => m.type === typ).map(m => String(Number(fullX[m.idx]) || 0.0));
          if (list.length === 0) { alert(`No ${typ} marks to export`); hideMenu(); return; }
          downloadText(list.join('\n') + '\n', `${typ}_marks.txt`);
          hideMenu();
        });
      });
      exportMenuEl.querySelectorAll('button[data-exp="segs"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const typ = String(btn.dataset.type);
          const rows = segmentsAll.filter(s => String(s.type) === typ).map(s => {
            const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0;
            const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0;
            return `${x0}\t${x1}`;
          });
          if (rows.length === 0) { alert(`No ${typ} segments to export`); hideMenu(); return; }
          downloadText(rows.join('\n') + '\n', `${typ.replace(/\s+/g,'_')}_segments.txt`);
          hideMenu();
        });
      });
      exportMenuEl.__itemsWired = true;
    }

    const openAecg = () => {
      const modal = document.getElementById('aecgModal');
      const info = document.getElementById('aecgInfo');
      if (!modal) return;
      const sr = inferSamplingRate(fullX);
      if (info) info.textContent = `Sampling rate: ${sr || '-'} Hz | Leads: ${channels.length}`;
      modal.classList.remove('hidden');
    };
    const closeAecg = () => { const modal = document.getElementById('aecgModal'); if (modal) modal.classList.add('hidden'); };

    if (aecgBtnEl && !aecgBtnEl.__wired) {
      aecgBtnEl.addEventListener('click', () => { hideMenu(); openAecg(); });
      aecgBtnEl.__wired = true;
    }
    if (aecgCancelEl && !aecgCancelEl.__wired) {
      aecgCancelEl.addEventListener('click', closeAecg);
      aecgCancelEl.__wired = true;
    }
    if (aecgModalEl && !aecgModalEl.__wired) {
      aecgModalEl.addEventListener('click', (e) => { if (e.target === aecgModalEl) closeAecg(); });
      aecgModalEl.__wired = true;
    }
    if (aecgDownloadEl && !aecgDownloadEl.__wired) {
      aecgDownloadEl.addEventListener('click', () => {
        const pid = (document.getElementById('aecgPid')?.value || '').trim();
        const pname = (document.getElementById('aecgPname')?.value || '').trim();
        const sex = (document.getElementById('aecgSex')?.value || 'U').trim();
        const dob = (document.getElementById('aecgDob')?.value || '').trim();
        const study = (document.getElementById('aecgStudyId')?.value || '').trim();
        const device = (document.getElementById('aecgDevice')?.value || '').trim();
        const sr = inferSamplingRate(fullX) || 0;
        const xmlEscape = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
        const marksXml = marksAll.map(m => `    <mark type=\"${xmlEscape(m.type)}\" time=\"${xmlEscape(Number(fullX[m.idx])||0)}\"/>`).join('\n');
        const segsXml = segmentsAll.map(s => {
          const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0;
          const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0;
          return `    <segment type=\"${xmlEscape(s.type)}\" start=\"${xmlEscape(x0)}\" end=\"${xmlEscape(x1)}\"/>`;
        }).join('\n');
        const body = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<aECG approximate=\"true\">\n  <patient id=\"${xmlEscape(pid)}\" name=\"${xmlEscape(pname)}\" sex=\"${xmlEscape(sex)}\" dob=\"${xmlEscape(dob)}\"/>\n  <study id=\"${xmlEscape(study)}\" device=\"${xmlEscape(device)}\" samplingRate=\"${xmlEscape(sr)}\" leads=\"${channels.length}\"/>\n  <marks>\n${marksXml}\n  </marks>\n  <segments>\n${segsXml}\n  </segments>\n</aECG>\n`;
        downloadText(body, 'export_aecg.xml');
        closeAecg();
      });
      aecgDownloadEl.__wired = true;
    }
  }
  document.addEventListener('DOMContentLoaded', wireExportControls);

  // Wire Clean Signal
  function wireCleanSignal() {
    const btn = document.getElementById('cleanSignal');
    const busy = document.getElementById('busyOverlay');
    if (!btn || btn.__wired) return;

    btn.addEventListener('click', async () => {
      if (!isBmecg) return;
      try {
        if (!fullX || !channels || fullX.length === 0 || channels.length !== 12) {
          alert('No valid ECG data loaded');
          return;
        }

        if (busy) busy.classList.remove('hidden');
        if (statusOutput) statusOutput.innerText = 'Cleaning signal...';

        const n = fullX.length;
        const matrix = new Array(n);
        for (let i = 0; i < n; i++) {
          const row = new Array(13);
          row[0] = fullX[i];
          for (let c = 0; c < 12; c++) {
            row[c + 1] = channels[c][i];
          }
          matrix[i] = row;
        }

        const resp = await fetch(`${API_BASE}/api/clean_signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matrix })
        });

        if (!resp.ok) throw new Error(`Backend error (${resp.status})`);

        const json = await resp.json();

        if (json.matrix && Array.isArray(json.matrix)) {
          const newMatrix = json.matrix;
          const newLen = newMatrix.length;
          const newTime = new Float32Array(newLen);
          const newChs = [];
          for (let c = 0; c < 12; c++) newChs.push(new Float32Array(newLen));

          for (let i = 0; i < newLen; i++) {
            newTime[i] = newMatrix[i][0];
            for (let c = 0; c < 12; c++) {
              newChs[c][i] = newMatrix[i][c + 1];
            }
          }

          fullX = newTime;
          channels = newChs;

          const start = Number(currentStart || 0);
          const end = Math.min(fullX.length, start + windowSize);
          renderWindow(start, end);

          if (statusOutput) statusOutput.innerText = 'Signal cleaned';
        } else {
          console.warn("Backend did not return a matrix", json);
          if (statusOutput) statusOutput.innerText = 'Signal cleaned (no data returned)';
        }

      } catch (err) {
        console.error('Clean Signal error:', err);
        alert('Error cleaning signal. Check console.');
        if (statusOutput) statusOutput.innerText = 'Error cleaning signal';
      } finally {
        if (busy) busy.classList.add('hidden');
      }
    });
    btn.__wired = true;
  }
  document.addEventListener('DOMContentLoaded', wireCleanSignal);

  // Wire Find R Peaks
  function wireFindRPeaks() {
    const btn = document.getElementById('findRPeaks');
    const busy = document.getElementById('busyOverlay');
    if (!btn || btn.__wired) return;

    btn.addEventListener('click', async () => {
      if (!isBmecg) return;
      try {
        if (!fullX || !channels || fullX.length === 0 || channels.length !== 12) {
          alert('No valid ECG data loaded');
          return;
        }

        if (busy) busy.classList.remove('hidden');
        if (statusOutput) statusOutput.innerText = 'Finding R Peaks...';

        const n = fullX.length;
        const matrix = new Array(n);
        for (let i = 0; i < n; i++) {
          const row = new Array(13);
          row[0] = fullX[i];
          for (let c = 0; c < 12; c++) {
            row[c + 1] = channels[c][i];
          }
          matrix[i] = row;
        }

        const resp = await fetch(`${API_BASE}/api/find_r_peaks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matrix })
        });

        if (!resp.ok) throw new Error(`Backend error (${resp.status})`);

        const json = await resp.json();

        if (json.r_peaks && Array.isArray(json.r_peaks)) {
           const pushMarks = (arr, label) => {
              if (!arr || arr.length === 0) return;
              const treatAsIndex = Math.max(...arr) < fullX.length;
              arr.forEach(val => {
                let idx = -1;
                if (treatAsIndex) {
                  idx = Math.round(val);
                } else {
                  idx = findIndex(fullX, val);
                }
                if (idx >= 0 && idx < fullX.length) {
                  marksAll.push({ idx, type: label });
                }
              });
            };
            
            pushMarks(json.r_peaks, 'R');
            
            // Deduplicate
            const dedupMap = new Map();
            for (let i = 0; i < marksAll.length; i++) {
              const m = marksAll[i];
              const key = `${m.idx}_${m.type}`;
              dedupMap.set(key, m);
            }
            const newList = Array.from(dedupMap.values()).sort((a,b) => a.idx - b.idx || a.type.localeCompare(b.type));
            marksAll.length = 0; newList.forEach(m => marksAll.push(m));

            const start = Number(currentStart || 0);
            const end = Math.min(fullX.length, start + windowSize);
            renderWindow(start, end);

            if (statusOutput) statusOutput.innerText = `Found ${json.r_peaks.length} R peaks`;
        } else {
             if (statusOutput) statusOutput.innerText = 'No R peaks found';
        }

      } catch (err) {
        console.error('Find R Peaks error:', err);
        alert('Error finding R peaks. Check console.');
        if (statusOutput) statusOutput.innerText = 'Error finding R peaks';
      } finally {
        if (busy) busy.classList.add('hidden');
      }
    });
    btn.__wired = true;
  }
  document.addEventListener('DOMContentLoaded', wireFindRPeaks);

  // Wire Automatic Delineation: send time + 12 channels to backend as a 13-column matrix
  function wireAutomaticDelineation() {
  const btn = document.getElementById('automaticDelineation');
  const busy = document.getElementById('busyOverlay');
    if (!btn || btn.__wired) return;
    btn.addEventListener('click', async () => {
      try {
        if (!fullX || !channels || fullX.length === 0 || channels.length !== 12) {
          alert('Load an ECG first (time + 12 channels).');
          return;
        }
        const n = fullX.length;
        // Build matrix: [time, ch1..ch12]
        const matrix = new Array(n);
        for (let i = 0; i < n; i++) {
          const row = new Array(13);
          row[0] = (fullX[i] == null || !isFinite(Number(fullX[i]))) ? null : Number(fullX[i]);
          for (let c = 0; c < 12; c++) {
            const v = channels[c] ? channels[c][i] : null;
            row[c+1] = (v == null || !isFinite(Number(v))) ? null : Number(v);
          }
          matrix[i] = row;
        }
  if (statusOutput) statusOutput.innerText = 'Analyzing';
  if (busy) busy.classList.remove('hidden');
  if (btn) btn.disabled = true;
  let cancelled = false;
  const cancel = () => { cancelled = true; if (busy) busy.classList.add('hidden'); if (btn) btn.disabled = false; statusOutput && (statusOutput.innerText='Cancelled'); };
  const escHandler = (ev)=>{ if(ev.key==='Escape'){ window.removeEventListener('keydown',escHandler); cancel(); } };
  window.addEventListener('keydown', escHandler);
  if (busy && !busy.__cancelBound){ busy.addEventListener('click', (e)=>{ if(e.target===busy) cancel(); }); busy.__cancelBound=true; }
        const resp = await fetch(`${API_BASE}/api/set_ecg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matrix })
        });
        if (!resp.ok) {
          const msg = await resp.text();
          throw new Error(`Backend error (${resp.status}): ${msg}`);
        }
  if (cancelled) return;
  const json = await resp.json();
  // (Logging removed per request)

        // -------- Auto-mark fiducial points (R, P, T) on the plot ----------
        // Heurística: si los valores caben dentro del rango de índices -> tratar como índices.
        // Si no, interpretarlos como tiempos y convertir a índice usando búsqueda binaria (findIndex).
        const treatAsIndex = (arr) => Array.isArray(arr) && arr.length > 0 && Math.max(...arr) < fullX.length;
        const pushMarks = (arr, label) => {
          if (!Array.isArray(arr)) return;
            const isIndex = treatAsIndex(arr);
            for (const v of arr) {
              if (v == null || !isFinite(v)) continue;
              let idx = -1;
              if (isIndex) {
                idx = Math.max(0, Math.min(fullX.length - 1, Math.round(v)));
              } else {
                // Interpretar como tiempo
                idx = findIndex(fullX, v);
              }
              if (idx < 0 || idx >= fullX.length) continue;
              marksAll.push({ idx, type: label });
            }
        };
        pushMarks(json.r_peaks, 'R');
        pushMarks(json.P_points, 'P');
        pushMarks(json.T_points, 'T');
        // Deduplicar manteniendo la última marca por índice y tipo preferentemente la última añadida
        const dedupMap = new Map();
        for (let i = 0; i < marksAll.length; i++) {
          const m = marksAll[i];
          dedupMap.set(`${m.idx}|${m.type}`, m);
        }
        const newList = Array.from(dedupMap.values()).sort((a,b) => a.idx - b.idx || a.type.localeCompare(b.type));
        marksAll.length = 0; newList.forEach(m => marksAll.push(m));
        // Re-render ventana actual
        const start = Number(currentStart || 0);
        const end = Math.min(fullX.length, start + windowSize);
        renderWindow(start, end);
  if (statusOutput) statusOutput.innerText = '';
  if (busy) busy.classList.add('hidden');
  if (btn) btn.disabled = false;
      } catch (err) {
        console.error('Automatic Delineation error:', err);
        alert('No se pudo enviar el ECG al backend. Revisa la consola.');
        if (statusOutput) statusOutput.innerText = 'Error sending ECG to backend';
  if (busy) busy.classList.add('hidden');
  if (btn) btn.disabled = false;
      }
    });
    btn.__wired = true;
  }
  document.addEventListener('DOMContentLoaded', wireAutomaticDelineation);

  const setScrollbar = () => { if (!sb || !sbContent) return; const ratio = fullX.length > 0 ? (fullX.length / Math.max(windowSize, 1)) : 1; sbContent.style.width = `${Math.max(ratio * 100, 500)}px`; syncScrollToCurrent(); };
  const syncScrollToCurrent = () => { if (!sb || !sbContent) return; const maxScroll = sbContent.scrollWidth - sb.clientWidth; const maxStart = Math.max(0, fullX.length - windowSize); const pos = maxStart > 0 ? (currentStart / maxStart) * maxScroll : 0; sb.scrollLeft = isFinite(pos) ? pos : 0; };
  sb && sb.addEventListener('scroll', () => { const maxScroll = sbContent.scrollWidth - sb.clientWidth; const frac = maxScroll > 0 ? (sb.scrollLeft / maxScroll) : 0; const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.round(frac * maxStart); const end = Math.min(fullX.length, currentStart + windowSize); scheduleRender(currentStart, end); const info = document.getElementById('navigatorInfo'); if (info) info.innerText = `Window: ${currentStart} - ${end} / ${fullX.length}`; });
  const stepSmall = () => Math.max(1, Math.floor(windowSize * 0.1));
  const stepLarge = () => Math.max(1, Math.floor(windowSize * 0.5));
  let holdTimer = null; const stopHold = () => { if (holdTimer) { clearInterval(holdTimer); holdTimer = null; } }; const startHold = (dir) => { stopHold(); const stepHold = () => Math.max(1, Math.floor(windowSize * 0.02)); holdTimer = setInterval(() => { const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, Math.max(0, currentStart + (dir === 'left' ? -stepHold() : stepHold()))); syncScrollToCurrent(); const end = Math.min(fullX.length, currentStart + windowSize); scheduleRender(currentStart, end); }, 40); };
  if (btnLeft) { btnLeft.addEventListener('click', (e) => { e.preventDefault(); currentStart = Math.max(0, currentStart - stepSmall()); syncScrollToCurrent(); }); btnLeft.addEventListener('contextmenu', (e) => { e.preventDefault(); currentStart = Math.max(0, currentStart - stepLarge()); syncScrollToCurrent(); }); btnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('left'); }); btnLeft.addEventListener('mouseup', stopHold); btnLeft.addEventListener('mouseleave', stopHold); btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('left'); }, { passive:false }); btnLeft.addEventListener('touchend', stopHold); btnLeft.addEventListener('touchcancel', stopHold); }
  if (btnRight) { btnRight.addEventListener('click', (e) => { e.preventDefault(); const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, currentStart + stepSmall()); syncScrollToCurrent(); }); btnRight.addEventListener('contextmenu', (e) => { e.preventDefault(); const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, currentStart + stepLarge()); syncScrollToCurrent(); }); btnRight.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('right'); }); btnRight.addEventListener('mouseup', stopHold); btnRight.addEventListener('mouseleave', stopHold); btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('right'); }, { passive:false }); btnRight.addEventListener('touchend', stopHold); btnRight.addEventListener('touchcancel', stopHold); }
  document.addEventListener('mouseup', stopHold);
  window.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const maxStart = Math.max(0, fullX.length - windowSize); const step = e.shiftKey ? stepLarge() : stepSmall(); currentStart = Math.min(maxStart, Math.max(0, currentStart + (e.key === 'ArrowLeft' ? -step : step))); syncScrollToCurrent(); const end = Math.min(fullX.length, currentStart + windowSize); scheduleRender(currentStart, end); e.preventDefault(); } });

  // Attach a fallback Show handler now and re-attach after building the UI, in case this runs before DOM is ready
  { const btn = document.getElementById('showSelected'); if (btn) btn.addEventListener('click', () => { const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); }); }

  myPlot && myPlot.addEventListener('plotly_click', (evt) => {});
  // Use Plotly events via Plotly.on below

  function attachPlotEvents() {
    const plot = myPlot;
    const findIdx = (xNum) => findIndex(fullX, xNum);

    // Custom wheel zoom: temporal axis only, keep pointer time fixed
    if (!plot.__wheelZoomBound) {
      plot.addEventListener('wheel', (e) => {
        if (!fullX || fullX.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const ax = plot._fullLayout && plot._fullLayout.xaxis;
        const rect = plot.getBoundingClientRect();
        const axisOffset = (ax && typeof ax._offset === 'number') ? ax._offset : rect.left;
        const axisLen = (ax && typeof ax._length === 'number' && ax._length > 0) ? ax._length : rect.width;
        const px = e.clientX - axisOffset;
        let frac = px / axisLen;
        if (!isFinite(frac)) frac = 0.5;
        frac = Math.max(0, Math.min(1, frac));

        // Current window
        const startIdxOrig = currentStart;
        const endIdxOrig = Math.min(fullX.length, startIdxOrig + windowSize);
        if (endIdxOrig - startIdxOrig < 2) return;
        const tStartOrig = Number(fullX[startIdxOrig]);
        const tEndOrig = Number(fullX[endIdxOrig - 1]);
        const spanOrig = (tEndOrig - tStartOrig) || 1;
        const tPointer = tStartOrig + spanOrig * frac;

  const zoomIn = e.deltaY < 0;
  // Slightly gentler zoom factor to reduce visual jump
  const factor = zoomIn ? 0.85 : 1/0.85; // ~0.85 / 1.176
  const dtGlobal = dtOf(fullX);
        let newSpan = spanOrig * factor;
        const minSpan = dtGlobal * 50;
        const maxSpan = (Number(fullX[fullX.length - 1]) - Number(fullX[0])) || spanOrig;
        if (newSpan < minSpan) newSpan = minSpan;
        if (newSpan > maxSpan) newSpan = maxSpan;

        // Initial new window aligned so pointer stays at same fractional position
        let newStartTime = tPointer - frac * newSpan;
        let newEndTime = newStartTime + newSpan;
        const globalStartTime = Number(fullX[0]);
        const globalEndTime = Number(fullX[fullX.length - 1]);
        if (newStartTime < globalStartTime) { newStartTime = globalStartTime; newEndTime = newStartTime + newSpan; }
        if (newEndTime > globalEndTime) { newEndTime = globalEndTime; newStartTime = newEndTime - newSpan; }

        let newStartIdx = findIndex(fullX, newStartTime);
        let newEndIdx = findIndex(fullX, newEndTime) + 1;
        if (newEndIdx <= newStartIdx) newEndIdx = Math.min(fullX.length, newStartIdx + 2);

        // Iterative correction to reduce drift (sub-sample anchoring approximation)
        for (let iter = 0; iter < 4; iter++) {
          const tStartTmp = Number(fullX[newStartIdx]);
          const tEndTmp = Number(fullX[Math.min(fullX.length - 1, newEndIdx - 1)]);
          const spanTmp = (tEndTmp - tStartTmp) || 1;
          const tUnder = tStartTmp + spanTmp * frac;
          const drift = tUnder - tPointer;
          if (Math.abs(drift) <= dtGlobal * 0.25) break; // good enough
          const shiftSamples = Math.round(drift / dtGlobal);
          if (shiftSamples === 0) break;
          newStartIdx -= shiftSamples;
          newEndIdx -= shiftSamples;
          if (newStartIdx < 0) { newEndIdx += -newStartIdx; newStartIdx = 0; }
          if (newEndIdx > fullX.length) { const diff = newEndIdx - fullX.length; newStartIdx -= diff; newEndIdx = fullX.length; if (newStartIdx < 0) newStartIdx = 0; }
          if (newEndIdx - newStartIdx < 2) newEndIdx = Math.min(fullX.length, newStartIdx + 2);
        }

        windowSize = newEndIdx - newStartIdx;
        currentStart = Math.max(0, Math.min(fullX.length - windowSize, newStartIdx));
        setScrollbar();
        const targetEnd = Math.min(fullX.length, currentStart + windowSize);
        // Faster: update only x-range, then schedule a light re-render (traces reuse)
        const x0 = Number(fullX[currentStart]);
        const x1 = Number(fullX[targetEnd-1]);
        Plotly.relayout(myPlot, { 'xaxis.range': [x0, x1] }).then(()=>{
          scheduleRender(currentStart, targetEnd);
        });

        // Post-render correction using actual new axis geometry
        const pointerClientX = e.clientX;
        setTimeout(() => {
          const ax2 = plot._fullLayout && plot._fullLayout.xaxis;
          if (!ax2) return;
          const axisOffset2 = (typeof ax2._offset === 'number') ? ax2._offset : plot.getBoundingClientRect().left;
          const axisLen2 = (typeof ax2._length === 'number' && ax2._length > 0) ? ax2._length : plot.getBoundingClientRect().width;
          let frac2 = (pointerClientX - axisOffset2) / axisLen2;
          if (!isFinite(frac2)) frac2 = 0.5; frac2 = Math.max(0, Math.min(1, frac2));
          const tStartNow = Number(fullX[currentStart]);
          const tEndNow = Number(fullX[Math.min(fullX.length - 1, currentStart + windowSize - 1)]);
          const spanNow = (tEndNow - tStartNow) || 1;
          const tUnderNow = tStartNow + spanNow * frac2;
          const driftNow = tUnderNow - tPointer;
          const dtLocal = dtGlobal;
          if (Math.abs(driftNow) > dtLocal * 0.6) {
            // Compute shift in samples (round) and clamp
            let shift = Math.round(driftNow / dtLocal);
            if (shift !== 0) {
              currentStart -= shift;
              if (currentStart < 0) currentStart = 0;
              if (currentStart > fullX.length - windowSize) currentStart = fullX.length - windowSize;
              const end3 = Math.min(fullX.length, currentStart + windowSize);
              Plotly.relayout(myPlot, { 'xaxis.range': [Number(fullX[currentStart]), Number(fullX[end3-1])] }).then(()=>{
                scheduleRender(currentStart, end3);
              });
              setScrollbar();
            }
          }
        }, 0);
      }, { passive:false });
      plot.__wheelZoomBound = true;
    }

    plot.on('plotly_click', function(evt){
      const pts = evt.points && evt.points.length ? evt.points : null; if (!pts) return;
  // Ensure controls exist
  if (!eventModeCb) wireSegmentControlsOnce();
  if (!deleteSegMode && eventModeCb && eventModeCb.checked) {
        const p0 = pts[0]; const xNum = Number(p0.x); const idx = findIdx(xNum);
        if (pendingSegStartIdx == null) { pendingSegStartIdx = idx; if (statusOutput) statusOutput.innerText = `Start set @ ${fullX[idx]}`; }
  else { const startI = Math.min(pendingSegStartIdx, idx); const endI = Math.max(pendingSegStartIdx, idx); const typ = eventTypeSel ? String(eventTypeSel.value || 'Event') : 'Event'; segmentsAll.push({ startIdx:startI, endIdx:endI, type:typ }); segmentsAll.sort((a,b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx); pendingSegStartIdx = null; if (statusOutput) statusOutput.innerText = `${typ}: ${fullX[startI]} - ${fullX[endI]}`; const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); }
        return;
      }
      if (deleteSegMode) {
        const p0 = pts[0]; const xNum = Number(p0.x); const i = segmentsAll.findIndex(s => { const x0 = fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]; const x1 = fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]; return xNum >= Math.min(x0, x1) && xNum <= Math.max(x0, x1); });
  if (i !== -1) { const removed = segmentsAll.splice(i, 1)[0]; if (statusOutput) statusOutput.innerText = `Removed segment: ${removed.type}`; const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); }
        return;
      }
      const markPt = pts.find(p => p && p.customdata != null);
      const p0 = markPt || pts[0]; const xNum = Number(p0.x); const idx = findIdx(xNum);
      const dt = (fullX.length > 1) ? Math.abs(Number(fullX[1]) - Number(fullX[0])) : 0; const startForTol = Number(currentStart || 0); const endForTol = Math.min(fullX.length, startForTol + windowSize); const leftX = (startForTol < fullX.length) ? Number(fullX[startForTol]) : xNum; const rightX = (endForTol-1 >= 0 && endForTol-1 < fullX.length) ? Number(fullX[endForTol-1]) : xNum; const viewWidth = Math.abs(rightX - leftX); const tolX = Math.max(Math.abs(dt) * 1.5, viewWidth * 0.01, 1e-9);
  if (p0 && p0.customdata != null) { const mIdx = Array.isArray(p0.customdata) ? p0.customdata[0] : p0.customdata; const pos = marksAll.findIndex(m => m.idx === Number(mIdx)); if (pos !== -1) marksAll.splice(pos, 1); else marksAll.push({ idx: Number(mIdx), type: getCurrentFid() }); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); return; }
      let nearestPos = -1; let nearestDX = Infinity; for (let i = 0; i < marksAll.length; i++) { const xm = Number(fullX[marksAll[i].idx]); if (!isFinite(xm)) continue; const d = Math.abs(xm - xNum); if (d < nearestDX) { nearestDX = d; nearestPos = i; } }
      if (nearestPos !== -1 && nearestDX <= tolX) { marksAll.splice(nearestPos, 1); }
      else { marksAll.push({ idx, type: getCurrentFid() }); }
      const map = new Map(); marksAll.forEach(m => { if (!map.has(m.idx)) map.set(m.idx, m); }); const uniq = Array.from(map.values()).sort((a,b) => a.idx - b.idx); marksAll.length = 0; uniq.forEach(v => marksAll.push(v));
  const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end);
    });

  plot.on('plotly_clickannotation', function(e){ if (!e || !e.annotation || !e.annotation.id) return; const m = String(e.annotation.id).match(/ann-(?:time|type)-(\d+)-([PQRST])/); if (m) { const idx = Number(m[1]); const pos = marksAll.findIndex(mm => mm.idx === idx); if (pos !== -1) marksAll.splice(pos, 1); else marksAll.push({ idx, type: getCurrentFid() }); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); scheduleRender(start, end); } });

  plot.on('plotly_relayout', function(eventdata){
      const left = eventdata['xaxis.range[0]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][0] : null);
      const right = eventdata['xaxis.range[1]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][1] : null);
      if (left == null || right == null) return;
      const startIndex = Math.max(0, findIndex(fullX, left));
      let endIndex = Math.min(fullX.length, findIndex(fullX, right) + 1);
      if (endIndex <= startIndex) endIndex = Math.min(fullX.length, startIndex + windowSize);
      windowSize = endIndex - startIndex;
      const maxStart = Math.max(0, fullX.length - windowSize);
      currentStart = Math.min(Math.max(0, startIndex), maxStart);
      setScrollbar();
      const navInfoEl = document.getElementById('navigatorInfo');
      if (navInfoEl) navInfoEl.innerText = `Window: ${startIndex} - ${endIndex} / ${fullX.length} (${windowSize} pts)`;
      renderWindow(startIndex, endIndex);
    });

    plot.on('plotly_relayout', function(eventdata){
      const updated = Object.keys(eventdata).filter(k => k.startsWith('shapes[') && (k.endsWith('.x0') || k.endsWith('.x1')));
      if (updated.length === 0) return; const curShapes = Array.isArray(myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => s.id && /^vline-/.test(String(s.id))) : [];
      const updates = {}; curShapes.forEach(s => { const m = String(s.id).match(/vline-(\d+)-([PQRST])/); if (!m) return; const oldIdx = Number(m[1]); const typ = String(m[2]); const x = s.x0 !== undefined ? Number(s.x0) : (s.x1 !== undefined ? Number(s.x1) : null); if (x === null) return; const newIdx = findIndex(fullX, x); updates[`${oldIdx}|${typ}`] = newIdx; });
      Object.keys(updates).forEach(k => { const [oldI, typ] = k.split('|'); const newI = updates[k]; const pos = marksAll.findIndex(m => m.idx === Number(oldI) && m.type === typ); if (pos !== -1) marksAll[pos] = { idx: newI, type: typ }; });
      const map2 = new Map(); marksAll.forEach(m => { if (!map2.has(m.idx)) map2.set(m.idx, m); }); const unique = Array.from(map2.values()).sort((a,b) => a.idx - b.idx); marksAll.length = 0; unique.forEach(v => marksAll.push(v));
      const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end);
    });
  }

  const processFileBinary = (buffer) => {
    isBmecg = true;
    const cleanBtn = document.getElementById('cleanSignal');
    if (cleanBtn) cleanBtn.disabled = false;
    const rPeaksBtn = document.getElementById('findRPeaks');
    if (rPeaksBtn) rPeaksBtn.disabled = false;
    try {
      const rawData = new Uint8Array(buffer);
      const headerStart = 6;
      
      // Find end of JSON '}}'
      let headerEndIndex = -1;
      for(let i = headerStart; i < rawData.length - 1; i++) {
          if (rawData[i] === 125 && rawData[i+1] === 125) {
              headerEndIndex = i + 2;
              break;
          }
      }
      
      if (headerEndIndex === -1) throw new Error("Invalid BMECG file: Header end not found");

      const decoder = new TextDecoder('utf-8');
      const headerJson = decoder.decode(rawData.subarray(headerStart, headerEndIndex));
      const header = JSON.parse(headerJson);
      
      console.log("Header parsed:", header);

      let dataStart = headerEndIndex;
      while (dataStart < rawData.length && rawData[dataStart] === 0) {
          dataStart++;
      }

      const numChannels = header.ecg.channels.length;
      const bytesPerSample = 2;
      const availableBytes = rawData.length - dataStart;
      const totalElements = Math.floor(availableBytes / bytesPerSample);
      const numSamples = Math.floor(totalElements / numChannels);
      
      let signalData;
      if (dataStart % 2 === 0) {
          signalData = new Int16Array(buffer, dataStart, numSamples * numChannels);
      } else {
          const sliced = rawData.slice(dataStart, dataStart + numSamples * numChannels * 2);
          signalData = new Int16Array(sliced.buffer);
      }
      
      const newChannels = [];
      const maxChannels = 12;
      const channelsToKeep = Math.min(numChannels, maxChannels);

      for (let c = 0; c < channelsToKeep; c++) {
          const channelArray = new Float32Array(numSamples);
          for (let s = 0; s < numSamples; s++) {
              channelArray[s] = signalData[s * numChannels + c];
          }
          newChannels.push(channelArray);
      }
      
      for (let c = channelsToKeep; c < 12; c++) {
          newChannels.push(new Float32Array(numSamples).fill(0));
      }

      const time = new Float32Array(numSamples);
      for(let i=0; i<numSamples; i++) time[i] = i;

      fullX = time;
      channels = newChannels;
      
      buildChannelCheckboxes(); 
      syncAllCheckbox();
      const selCount = getSelectedIndices().length || 0; 
      updatePlotContainerHeight(selCount);
      
      const initialStart = 0; 
      const initialEnd = Math.min(fullX.length, initialStart + windowSize);
      const updateInfo = (start) => { const end = Math.min(fullX.length, start + windowSize); const info = document.getElementById('navigatorInfo'); if (info) info.innerText = `Window: ${start} - ${end} / ${fullX.length}`; };
      updateInfo(0);
      
      buildChannelCheckboxes();
      wireChannelControls();
      { const btn = document.getElementById('showSelected'); if (btn && !btn.__wired) { btn.addEventListener('click', () => { const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }); btn.__wired = true; } }
      
      setScrollbar();
      scheduleRender(initialStart, initialEnd);
      statusOutput && (statusOutput.innerText = 'Binary file loaded');
    } catch (err) {
      console.error("Error processing binary file:", err);
      statusOutput && (statusOutput.innerText = 'Error processing binary file');
    }
  };

  const processFileText = (text) => {
    isBmecg = false;
    const cleanBtn = document.getElementById('cleanSignal');
    if (cleanBtn) cleanBtn.disabled = true;
    const rPeaksBtn = document.getElementById('findRPeaks');
    if (rPeaksBtn) rPeaksBtn.disabled = true;
    if (!text) { statusOutput && (statusOutput.innerText = 'Empty file'); return; }
    const rawLines = text.split(/\r?\n/);
    const lines = rawLines.filter(l => l.trim().length > 0);
    if (lines.length <= 1) { statusOutput && (statusOutput.innerText = 'Too few useful lines'); return; }
    lines.shift(); // drop header
    const parsed = lines.map(r => r.replace(/\r$/,'').split('\t'));
    const time = getTrace(parsed, 0);
    const ch1 = getTrace(parsed, 1);
    const ch2 = getTrace(parsed, 2);
    const ch3 = getTrace(parsed, 3);
    const ch4 = getTrace(parsed, 4);
    const ch5 = getTrace(parsed, 5);
    const ch6 = getTrace(parsed, 6);
    const ch7 = getTrace(parsed, 7);
    const ch8 = getTrace(parsed, 8);
    const ch9 = getTrace(parsed, 9);
    const ch10 = getTrace(parsed, 10);
    const ch11 = getTrace(parsed, 11);
    const ch12 = getTrace(parsed, 12);
    fullX = time;
    channels = [ch1,ch2,ch3,ch4,ch5,ch6,ch7,ch8,ch9,ch10,ch11,ch12];
    buildChannelCheckboxes(); syncAllCheckbox();
    const selCount = getSelectedIndices().length || 0; updatePlotContainerHeight(selCount);
  const initialStart = 0; const initialEnd = Math.min(fullX.length, initialStart + windowSize);
  const updateInfo = (start) => { const end = Math.min(fullX.length, start + windowSize); const info = document.getElementById('navigatorInfo'); if (info) info.innerText = `Window: ${start} - ${end} / ${fullX.length}`; };
  updateInfo(0);
  buildChannelCheckboxes();
  wireChannelControls();
  // Ensure Show button works if it wasn't bound earlier
  { const btn = document.getElementById('showSelected'); if (btn && !btn.__wired) { btn.addEventListener('click', () => { const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }); btn.__wired = true; } }
  setScrollbar();
  // Schedule initial render using default-selected channels (first 3)
  scheduleRender(initialStart, initialEnd);
    statusOutput && (statusOutput.innerText = 'File loaded');
  };

  if (input) {
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) { statusOutput && (statusOutput.innerText = 'No file selected'); return; }
      statusOutput && (statusOutput.innerText = `Loading ${f.name}`);
      const fr = new FileReader();
      fr.onerror = () => { console.error('FileReader error', fr.error); statusOutput && (statusOutput.innerText = 'Error reading file (see console)'); };
      fr.onload = (ev) => {
        try {
          const buffer = ev.target.result;
          const view = new Uint8Array(buffer);
          const signature = "BMECG1";
          let isBinary = true;
          if (buffer.byteLength < 6) isBinary = false;
          else {
            for (let i = 0; i < 6; i++) {
              if (view[i] !== signature.charCodeAt(i)) {
                isBinary = false;
                break;
              }
            }
          }

          if (isBinary) {
             processFileBinary(buffer);
          } else {
             const decoder = new TextDecoder('utf-8');
             const text = decoder.decode(buffer);
             processFileText(text);
          }
        } catch (err) {
           console.error('Error processing file:', err);
           statusOutput && (statusOutput.innerText = 'Error processing file (see console)');
        }
      };
      fr.readAsArrayBuffer(f);
    });
  }

  const parseIntegerXMarks = (text) => {
    const rows = String(text || '').split(/\r?\n/);
    const values = [];
    let invalid = 0;
    rows.forEach((row) => {
      const token = String(row || '').trim();
      if (!token) return;
      if (!/^[+-]?\d+$/.test(token)) { invalid += 1; return; }
      const x = Number(token);
      if (!Number.isFinite(x)) { invalid += 1; return; }
      values.push(x);
    });
    return { values, invalid };
  };

  const xToNearestIndex = (xVal) => {
    let idx = findIndex(fullX, xVal);
    if (idx <= 0) return 0;
    if (idx >= fullX.length) return fullX.length - 1;
    const left = Number(fullX[idx - 1]);
    const right = Number(fullX[idx]);
    return Math.abs(xVal - left) <= Math.abs(right - xVal) ? (idx - 1) : idx;
  };

  function wireLoadMarks() {
    const loadMarksBtn = document.getElementById('loadMarksBtn');
    const loadMarksInput = document.getElementById('loadMarksInput');
    if (!loadMarksBtn || !loadMarksInput || loadMarksBtn.__wired) return;

    loadMarksBtn.addEventListener('click', () => {
      if (!fullX || fullX.length === 0) {
        alert('Load an ECG file first');
        return;
      }
      loadMarksInput.click();
    });

    loadMarksInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!fullX || fullX.length === 0) {
        statusOutput && (statusOutput.innerText = 'Load an ECG file before importing marks');
        loadMarksInput.value = '';
        return;
      }

      const fr = new FileReader();
      fr.onerror = () => {
        console.error('Load marks read error:', fr.error);
        statusOutput && (statusOutput.innerText = 'Error reading marks file');
        loadMarksInput.value = '';
      };
      fr.onload = (ev) => {
        try {
          const fid = getCurrentFid();
          const { values, invalid } = parseIntegerXMarks(ev.target && ev.target.result);
          const existingIdx = new Set((marksAll || []).map(m => Number(m.idx)));

          const firstX = Number(fullX[0]);
          const lastX = Number(fullX[fullX.length - 1]);
          const minX = Math.min(firstX, lastX);
          const maxX = Math.max(firstX, lastX);

          let added = 0;
          let duplicates = 0;
          let outOfRange = 0;

          values.forEach((xVal) => {
            if (xVal < minX || xVal > maxX) { outOfRange += 1; return; }
            const idx = xToNearestIndex(xVal);
            if (idx < 0 || idx >= fullX.length) { outOfRange += 1; return; }
            if (existingIdx.has(idx)) { duplicates += 1; return; }
            marksAll.push({ idx, type: fid });
            existingIdx.add(idx);
            added += 1;
          });

          if (added > 0) {
            marksAll.sort((a,b) => a.idx - b.idx || String(a.type).localeCompare(String(b.type)));
            const start = Number(currentStart || 0);
            const end = Math.min(fullX.length, start + windowSize);
            scheduleRender(start, end);
          }
          syncCounts();

          const summary = [`LOAD MARKS (${fid}) +${added}`];
          if (duplicates) summary.push(`${duplicates} duplicates`);
          if (outOfRange) summary.push(`${outOfRange} out-of-range`);
          if (invalid) summary.push(`${invalid} invalid`);
          if (!added && !duplicates && !outOfRange && !invalid) summary.push('empty file');
          statusOutput && (statusOutput.innerText = summary.join(' | '));
        } catch (err) {
          console.error('Load marks parse error:', err);
          statusOutput && (statusOutput.innerText = 'Error parsing marks file');
        } finally {
          loadMarksInput.value = '';
        }
      };
      fr.readAsText(f);
    });

    loadMarksBtn.__wired = true;
  }
  document.addEventListener('DOMContentLoaded', wireLoadMarks);

  const clearBtn = document.getElementById('clearMarks');
  clearBtn && clearBtn.addEventListener('click', () => { marksAll.length = 0; segmentsAll.length = 0; pendingSegStartIdx = null; const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); });

  const downloadMarksBtn = document.getElementById('downloadMarks');
  downloadMarksBtn && downloadMarksBtn.addEventListener('click', () => {
    if (!Array.isArray(marksAll) || marksAll.length === 0) { alert('There are no marks to download'); return; }
    const lines = marksAll.map(m => `${String(Number(fullX[m.idx]) || 0.0)}\t${m.type}`); const text = lines.join('\n') + '\n';
    downloadText(text, 'marks.txt');
  });

  const downloadSegBtn = document.getElementById('downloadSegments');
  downloadSegBtn && downloadSegBtn.addEventListener('click', () => {
    if (!Array.isArray(segmentsAll) || segmentsAll.length === 0) { alert('There are no segments to download'); return; }
    const lines = segmentsAll.map(s => { const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0; const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0; return `${x0}\t${x1}\t${s.type}`; });
    const text = lines.join('\n') + '\n'; downloadText(text, 'segments.txt');
  });

  // Late wiring for Clear Marks (button appears after script tag in HTML)
  document.addEventListener('DOMContentLoaded', () => {
    const lateClearBtn = document.getElementById('clearMarks');
    if (lateClearBtn && !lateClearBtn.__wired) {
      lateClearBtn.addEventListener('click', () => {
        marksAll.length = 0;
        segmentsAll.length = 0;
        pendingSegStartIdx = null;
        const start = Number(currentStart || 0);
        const end = Math.min(fullX.length, start + windowSize);
        renderWindow(start, end);
        syncCounts();
        if (statusOutput) statusOutput.innerText = 'Cleared all marks & segments';
      });
      lateClearBtn.__wired = true;
    }
  });
  // Export scheduleRender if present (defined earlier in this file)
  if (typeof scheduleRender === 'function') {
    window.scheduleRender = scheduleRender;
  }
})();