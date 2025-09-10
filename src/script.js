// ECG-only script: load file, plot 12 leads, mark P/Q/R/S/T, shade segments, navigate, and export.
(function(){
  const input = document.getElementById('fileInput');
  const statusOutput = document.getElementById('statusOutput');
  const loadFileBtn = document.getElementById('loadFileBtn');
  if (loadFileBtn && input) loadFileBtn.addEventListener('click', () => input.click());

  const myPlot = document.getElementById('myDiv');
  const rightPanel = document.getElementById('channelPanel');
  // Note: some right-panel elements are created after this script tag; look them up on demand
  const exportBtn = document.getElementById('exportBtn');
  const exportMenu = document.getElementById('exportMenu');
  const aecgModal = document.getElementById('aecgModal');
  const aecgCancel = document.getElementById('aecgCancel');
  const aecgDownload = document.getElementById('aecgDownload');
  const aecgInfo = document.getElementById('aecgInfo');
  const sb = document.getElementById('scrollbar');
  const sbContent = document.getElementById('scrollbarContent');
  const btnLeft = document.getElementById('scrollLeft');
  const btnRight = document.getElementById('scrollRight');

  // Will be looked up when needed

  const eventModeCb = document.getElementById('eventMode');
  const eventTypeSel = document.getElementById('eventType');
  const deleteSegBtn = document.getElementById('deleteSegBtn');
  const segFilterCbs = Array.from(document.querySelectorAll('.seg-filter'));
  const segFilterAllBtn = document.getElementById('segFilterAll');
  const segFilterNoneBtn = document.getElementById('segFilterNone');

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

  const getTrace = (parsedArr, column) => parsedArr.map(row => {
    const raw = row[column] !== undefined ? row[column].trim() : '';
    if (raw === '') return null;
    const n = Number(raw.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  });

  // Note: .vak expected as tab-delimited with 1 time column + 12 channels

  const getEnabledTypes = () => new Set(segFilterCbs.filter(el => el.checked).map(el => String(el.dataset.type)));
  const syncCounts = () => { const el = document.getElementById('countsLine'); if (el) el.textContent = `${marksAll.length} marks | ${segmentsAll.length} segments`; };

  const getRightPanelHeight = () => { if (!rightPanel) return Math.max(window.innerHeight - 32, 640); return Math.max(320, rightPanel.clientHeight || 0); };
  const updatePlotContainerHeight = (visibleChannelsCount) => {
    const base = getRightPanelHeight();
    const extra = Math.max(0, (visibleChannelsCount - 8)) * 60;
    const maxExtra = 600;
    const target = base + Math.min(extra, maxExtra);
    if (myPlot && Math.abs((myPlot.clientHeight || 0) - target) > 4) myPlot.style.height = `${target}px`;
  };

  if (eventModeCb) {
    eventModeCb.addEventListener('change', () => {
      pendingSegStartIdx = null;
      if (eventModeCb.checked && deleteSegMode) { deleteSegMode = false; deleteSegBtn && deleteSegBtn.classList.remove('active'); }
      if (statusOutput) statusOutput.innerText = eventModeCb.checked ? 'Event mode: click start and end' : '';
    });
  }
  let deleteSegMode = false;
  let pendingSegStartIdx = null;
  if (deleteSegBtn) {
    deleteSegBtn.addEventListener('click', () => {
      deleteSegMode = !deleteSegMode;
      if (deleteSegMode && eventModeCb && eventModeCb.checked) { eventModeCb.checked = false; pendingSegStartIdx = null; }
      deleteSegBtn.classList.toggle('active', deleteSegMode);
      if (statusOutput) statusOutput.innerText = deleteSegMode ? 'Delete mode: click shaded segment to remove' : '';
    });
  }
  segFilterAllBtn && segFilterAllBtn.addEventListener('click', () => { segFilterCbs.forEach(cb => cb.checked = true); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
  segFilterNoneBtn && segFilterNoneBtn.addEventListener('click', () => { segFilterCbs.forEach(cb => cb.checked = false); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
  segFilterCbs.forEach(cb => cb.addEventListener('change', () => { const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); }));

  const findIndex = (arr, val) => { let lo = 0, hi = arr.length - 1; while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (arr[mid] < val) lo = mid + 1; else hi = mid; } return lo; };
  const decimate = (xs, ys, maxPoints) => { const n = xs.length; if (n <= maxPoints) return { x: xs, y: ys }; const step = Math.ceil(n / maxPoints); const nx = [], ny = []; for (let i = 0; i < n; i += step) { nx.push(xs[i]); ny.push(ys[i]); } return { x: nx, y: ny }; };

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
  window.addEventListener('resize', () => { if (resizeTimer) clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { const selCount = getSelectedIndices().length || 0; updatePlotContainerHeight(selCount); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }, 120); });

  let plotEventsWired = false;

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
    const nSlice = Math.max(1, endIndex - startIndex); const step = Math.ceil(nSlice / maxPerTrace);
    sel.forEach((chIdx, i) => { const xs = fullX.slice(startIndex, endIndex); const ys = channels[chIdx].slice(startIndex, endIndex); const dec = decimate(xs, ys, maxPerTrace); dataOut.push({ x: dec.x, y: dec.y, type:'scatter', mode:'lines', name:'Ch' + (chIdx + 1), line:{ width:1 }, yaxis: i === 0 ? 'y' : 'y' + (i + 1) }); });
    layout.xaxis = { anchor: 'y' + (m === 1 ? '' : (m)), showgrid:true, gridcolor:'#e5e7eb', gridwidth:1, zeroline:false, layer:'below traces', title:{ text:'' } };

    const existingShapes = Array.isArray(myPlot.layout && myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => !s.id || !/^(vline-|seg-)/.test(String(s.id))) : [];
    const existingAnns = Array.isArray(myPlot.layout && myPlot.layout.annotations) ? myPlot.layout.annotations.filter(a => !a.id || !/^(ann-|seg-ann-)/.test(String(a.id))) : [];
    const visibleMarks = (marksAll || []).filter(m => m && m.idx >= startIndex && m.idx < endIndex);
    const enabled = getEnabledTypes();
    const visibleSegs = (segmentsAll || []).filter(s => enabled.has(String(s.type)) && !(s.endIdx < startIndex || s.startIdx > endIndex));
    const colorForType = (t) => { switch (String(t)) { case 'Arrhythmia': return { fill:'rgba(16,185,129,0.25)', line:'rgba(16,185,129,0.8)' }; case 'Artifact': return { fill:'rgba(245,158,11,0.25)', line:'rgba(180,83,9,0.8)' }; case 'Noise': return { fill:'rgba(107,114,128,0.30)', line:'rgba(55,65,81,0.8)' }; case 'ST change': return { fill:'rgba(239,68,68,0.20)', line:'rgba(153,27,27,0.8)' }; default: return { fill:'rgba(139,92,246,0.25)', line:'rgba(109,40,217,0.8)' }; } };
    const segShapes = visibleSegs.map(s => { const x0 = fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]; const x1 = fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]; const c = colorForType(s.type); return { type:'rect', xref:'x', yref:'paper', x0, x1, y0:0, y1:1, fillcolor:c.fill, line:{ color:c.line, width:1, dash:'dot' }, id:`seg-${s.startIdx}-${s.endIdx}-${s.type}`, layer:'below' }; });
    const markShapes = visibleMarks.map(m => { const x = fullX[m.idx]; return { type:'line', xref:'x', yref:'paper', x0:x, x1:x, y0:0, y1:1, line:{ color:'#d0d0d0', width:1 }, id:`vline-${m.idx}-${m.type}`, layer:'below' }; });
    const markAnns = [];
    visibleMarks.forEach(m => { const x = fullX[m.idx]; const baseY = 1.0; markAnns.push({ x, y:baseY, xref:'x', yref:'paper', text:String(x), showarrow:false, align:'center', yanchor:'bottom', yshift:2, bgcolor:'rgba(255,255,255,0.85)', bordercolor:'#d9534f', borderwidth:1, font:{ color:'#d9534f', size:10 }, id:`ann-time-${m.idx}-${m.type}` }); markAnns.push({ x, y:baseY, xref:'x', yref:'paper', text:String(m.type), showarrow:false, align:'center', yanchor:'bottom', yshift:22, bgcolor:'rgba(255,255,255,0.9)', bordercolor:'#111827', borderwidth:1, font:{ color:'#111827', size:11, family:'monospace' }, id:`ann-type-${m.idx}-${m.type}` }); });
    layout.shapes = existingShapes.concat(segShapes, markShapes);
    layout.annotations = existingAnns.concat(markAnns);
    visibleMarks.forEach((m) => { const xval = fullX[m.idx]; const selIdx = getSelectedIndices(); selIdx.forEach((chIdx, i) => { const yaxisName = i === 0 ? 'y' : 'y' + (i+1); const yval = channels[chIdx] && channels[chIdx][m.idx] !== undefined ? channels[chIdx][m.idx] : null; if (yval == null) return; dataOut.push({ x:[xval], y:[yval], type:'scatter', mode:'markers', marker:{ color:'red', size:8 }, showlegend:false, hoverinfo:'skip', customdata:[m.idx], yaxis:yaxisName }); }); });
  const reactResult = Plotly.react(myPlot, dataOut, layout, { displayModeBar:true, editable:true, edits:{ titleText:false, axisTitleText:false, annotationText:false, legendPosition:false, colorbarPosition:false, shapePosition:false } });
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
  if (aecgInfo && !aecgModal.classList.contains('hidden')) { const sr = inferSamplingRate(fullX); aecgInfo.textContent = `Sampling rate: ${sr || '-'} Hz | Leads: ${channels.length}`; }
  };

  window.renderWindow = renderWindow;

  const hideMenu = () => { exportMenu && exportMenu.classList.add('hidden'); };
  const toggleMenu = () => { exportMenu && exportMenu.classList.toggle('hidden'); };
  exportBtn && exportBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', hideMenu);
  exportMenu && exportMenu.addEventListener('click', (e) => { e.stopPropagation(); });

  const downloadText = (text, filename) => { const blob = new Blob([text], { type:'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); };
  const inferSamplingRate = (xs) => { if (!xs || xs.length < 3) return null; const dts = []; for (let i = 1; i < Math.min(xs.length, 4096); i++) { const d = Number(xs[i]) - Number(xs[i-1]); if (isFinite(d) && d > 0) dts.push(d); } if (!dts.length) return null; dts.sort((a,b)=>a-b); const med = dts[Math.floor(dts.length/2)]; return med > 0 ? Math.round(1/med) : null; };

  exportMenu && exportMenu.querySelectorAll('button[data-exp="marks"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const typ = String(btn.dataset.type);
      const list = marksAll.filter(m => m.type === typ).map(m => String(Number(fullX[m.idx]) || 0.0));
      if (list.length === 0) { alert(`No ${typ} marks to export`); hideMenu(); return; }
      downloadText(list.join('\n') + '\n', `${typ}_marks.txt`);
      hideMenu();
    });
  });

  exportMenu && exportMenu.querySelectorAll('button[data-exp="segs"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const typ = String(btn.dataset.type);
      const rows = segmentsAll.filter(s => String(s.type) === typ).map(s => { const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0; const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0; return `${x0}\t${x1}`; });
      if (rows.length === 0) { alert(`No ${typ} segments to export`); hideMenu(); return; }
      downloadText(rows.join('\n') + '\n', `${typ.replace(/\s+/g,'_')}_segments.txt`);
      hideMenu();
    });
  });

  const openAecg = () => { if (!aecgModal) return; const sr = inferSamplingRate(fullX); if (aecgInfo) aecgInfo.textContent = `Sampling rate: ${sr || '-'} Hz | Leads: ${channels.length}`; aecgModal.classList.remove('hidden'); };
  const closeAecg = () => { aecgModal && aecgModal.classList.add('hidden'); };
  const aecgBtn = document.getElementById('exportAecgBtn');
  aecgBtn && aecgBtn.addEventListener('click', () => { hideMenu(); openAecg(); });
  aecgCancel && aecgCancel.addEventListener('click', closeAecg);
  aecgModal && aecgModal.addEventListener('click', (e) => { if (e.target === aecgModal) closeAecg(); });
  aecgDownload && aecgDownload.addEventListener('click', () => {
    const pid = (document.getElementById('aecgPid')?.value || '').trim();
    const pname = (document.getElementById('aecgPname')?.value || '').trim();
    const sex = (document.getElementById('aecgSex')?.value || 'U').trim();
    const dob = (document.getElementById('aecgDob')?.value || '').trim();
    const study = (document.getElementById('aecgStudyId')?.value || '').trim();
    const device = (document.getElementById('aecgDevice')?.value || '').trim();
    const sr = inferSamplingRate(fullX) || 0;
    const xmlEscape = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
    const marksXml = marksAll.map(m => `    <mark type="${xmlEscape(m.type)}" time="${xmlEscape(Number(fullX[m.idx])||0)}"/>`).join('\n');
    const segsXml = segmentsAll.map(s => { const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0; const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0; return `    <segment type=\"${xmlEscape(s.type)}\" start=\"${xmlEscape(x0)}\" end=\"${xmlEscape(x1)}\"/>`; }).join('\n');
    const body = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<aECG approximate=\"true\">\n  <patient id=\"${xmlEscape(pid)}\" name=\"${xmlEscape(pname)}\" sex=\"${xmlEscape(sex)}\" dob=\"${xmlEscape(dob)}\"/>\n  <study id=\"${xmlEscape(study)}\" device=\"${xmlEscape(device)}\" samplingRate=\"${xmlEscape(sr)}\" leads=\"${channels.length}\"/>\n  <marks>\n${marksXml}\n  </marks>\n  <segments>\n${segsXml}\n  </segments>\n</aECG>\n`;
    downloadText(body, 'export_aecg.xml');
    closeAecg();
  });

  const setScrollbar = () => { if (!sb || !sbContent) return; const ratio = fullX.length > 0 ? (fullX.length / Math.max(windowSize, 1)) : 1; sbContent.style.width = `${Math.max(ratio * 100, 500)}px`; syncScrollToCurrent(); };
  const syncScrollToCurrent = () => { if (!sb || !sbContent) return; const maxScroll = sbContent.scrollWidth - sb.clientWidth; const maxStart = Math.max(0, fullX.length - windowSize); const pos = maxStart > 0 ? (currentStart / maxStart) * maxScroll : 0; sb.scrollLeft = isFinite(pos) ? pos : 0; };
  sb && sb.addEventListener('scroll', () => { const maxScroll = sbContent.scrollWidth - sb.clientWidth; const frac = maxScroll > 0 ? (sb.scrollLeft / maxScroll) : 0; const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.round(frac * maxStart); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); const info = document.getElementById('navigatorInfo'); if (info) info.innerText = `Window: ${currentStart} - ${end} / ${fullX.length}`; });
  const stepSmall = () => Math.max(1, Math.floor(windowSize * 0.1));
  const stepLarge = () => Math.max(1, Math.floor(windowSize * 0.5));
  let holdTimer = null; const stopHold = () => { if (holdTimer) { clearInterval(holdTimer); holdTimer = null; } }; const startHold = (dir) => { stopHold(); const stepHold = () => Math.max(1, Math.floor(windowSize * 0.02)); holdTimer = setInterval(() => { const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, Math.max(0, currentStart + (dir === 'left' ? -stepHold() : stepHold()))); syncScrollToCurrent(); }, 40); };
  if (btnLeft) { btnLeft.addEventListener('click', (e) => { e.preventDefault(); currentStart = Math.max(0, currentStart - stepSmall()); syncScrollToCurrent(); }); btnLeft.addEventListener('contextmenu', (e) => { e.preventDefault(); currentStart = Math.max(0, currentStart - stepLarge()); syncScrollToCurrent(); }); btnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('left'); }); btnLeft.addEventListener('mouseup', stopHold); btnLeft.addEventListener('mouseleave', stopHold); btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('left'); }, { passive:false }); btnLeft.addEventListener('touchend', stopHold); btnLeft.addEventListener('touchcancel', stopHold); }
  if (btnRight) { btnRight.addEventListener('click', (e) => { e.preventDefault(); const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, currentStart + stepSmall()); syncScrollToCurrent(); }); btnRight.addEventListener('contextmenu', (e) => { e.preventDefault(); const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(maxStart, currentStart + stepLarge()); syncScrollToCurrent(); }); btnRight.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('right'); }); btnRight.addEventListener('mouseup', stopHold); btnRight.addEventListener('mouseleave', stopHold); btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('right'); }, { passive:false }); btnRight.addEventListener('touchend', stopHold); btnRight.addEventListener('touchcancel', stopHold); }
  document.addEventListener('mouseup', stopHold);
  window.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const maxStart = Math.max(0, fullX.length - windowSize); const step = e.shiftKey ? stepLarge() : stepSmall(); currentStart = Math.min(maxStart, Math.max(0, currentStart + (e.key === 'ArrowLeft' ? -step : step))); syncScrollToCurrent(); e.preventDefault(); } });

  // Attach a fallback Show handler now and re-attach after building the UI, in case this runs before DOM is ready
  { const btn = document.getElementById('showSelected'); if (btn) btn.addEventListener('click', () => { const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }); }

  myPlot && myPlot.addEventListener('plotly_click', (evt) => {});
  // Use Plotly events via Plotly.on below

  function attachPlotEvents() {
    const plot = myPlot;
    const findIdx = (xNum) => findIndex(fullX, xNum);

    plot.on('plotly_click', function(evt){
      const pts = evt.points && evt.points.length ? evt.points : null; if (!pts) return;
      if (!deleteSegMode && eventModeCb && eventModeCb.checked) {
        const p0 = pts[0]; const xNum = Number(p0.x); const idx = findIdx(xNum);
        if (pendingSegStartIdx == null) { pendingSegStartIdx = idx; if (statusOutput) statusOutput.innerText = `Start set @ ${fullX[idx]}`; }
        else { const startI = Math.min(pendingSegStartIdx, idx); const endI = Math.max(pendingSegStartIdx, idx); const typ = eventTypeSel ? String(eventTypeSel.value || 'Event') : 'Event'; segmentsAll.push({ startIdx:startI, endIdx:endI, type:typ }); segmentsAll.sort((a,b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx); pendingSegStartIdx = null; if (statusOutput) statusOutput.innerText = `${typ}: ${fullX[startI]} - ${fullX[endI]}`; const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }
        return;
      }
      if (deleteSegMode) {
        const p0 = pts[0]; const xNum = Number(p0.x); const i = segmentsAll.findIndex(s => { const x0 = fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]; const x1 = fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]; return xNum >= Math.min(x0, x1) && xNum <= Math.max(x0, x1); });
        if (i !== -1) { const removed = segmentsAll.splice(i, 1)[0]; if (statusOutput) statusOutput.innerText = `Removed segment: ${removed.type}`; const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); }
        return;
      }
      const markPt = pts.find(p => p && p.customdata != null);
      const p0 = markPt || pts[0]; const xNum = Number(p0.x); const idx = findIdx(xNum);
      const dt = (fullX.length > 1) ? Math.abs(Number(fullX[1]) - Number(fullX[0])) : 0; const startForTol = Number(currentStart || 0); const endForTol = Math.min(fullX.length, startForTol + windowSize); const leftX = (startForTol < fullX.length) ? Number(fullX[startForTol]) : xNum; const rightX = (endForTol-1 >= 0 && endForTol-1 < fullX.length) ? Number(fullX[endForTol-1]) : xNum; const viewWidth = Math.abs(rightX - leftX); const tolX = Math.max(Math.abs(dt) * 1.5, viewWidth * 0.01, 1e-9);
      if (p0 && p0.customdata != null) { const mIdx = Array.isArray(p0.customdata) ? p0.customdata[0] : p0.customdata; const pos = marksAll.findIndex(m => m.idx === Number(mIdx)); if (pos !== -1) marksAll.splice(pos, 1); else marksAll.push({ idx: Number(mIdx), type: getCurrentFid() }); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); return; }
      let nearestPos = -1; let nearestDX = Infinity; for (let i = 0; i < marksAll.length; i++) { const xm = Number(fullX[marksAll[i].idx]); if (!isFinite(xm)) continue; const d = Math.abs(xm - xNum); if (d < nearestDX) { nearestDX = d; nearestPos = i; } }
      if (nearestPos !== -1 && nearestDX <= tolX) { marksAll.splice(nearestPos, 1); }
      else { marksAll.push({ idx, type: getCurrentFid() }); }
      const map = new Map(); marksAll.forEach(m => { if (!map.has(m.idx)) map.set(m.idx, m); }); const uniq = Array.from(map.values()).sort((a,b) => a.idx - b.idx); marksAll.length = 0; uniq.forEach(v => marksAll.push(v));
      const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end);
    });

    plot.on('plotly_clickannotation', function(e){ if (!e || !e.annotation || !e.annotation.id) return; const m = String(e.annotation.id).match(/ann-(?:time|type)-(\d+)-([PQRST])/); if (m) { const idx = Number(m[1]); const pos = marksAll.findIndex(mm => mm.idx === idx); if (pos !== -1) marksAll.splice(pos, 1); else marksAll.push({ idx, type: getCurrentFid() }); const start = Number(currentStart || 0); const end = Math.min(fullX.length, start + windowSize); renderWindow(start, end); } });

    plot.on('plotly_relayout', function(eventdata){
      const left = eventdata['xaxis.range[0]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][0] : null);
      const right = eventdata['xaxis.range[1]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][1] : null);
      if (left == null || right == null) return;
      const startIndex = Math.max(0, findIndex(fullX, left));
      let endIndex = Math.min(fullX.length, findIndex(fullX, right) + 1);
      if (endIndex <= startIndex) endIndex = Math.min(fullX.length, startIndex + windowSize);
      windowSize = endIndex - startIndex; const maxStart = Math.max(0, fullX.length - windowSize); currentStart = Math.min(Math.max(0, startIndex), maxStart); setScrollbar(); if (navInfo) navInfo.innerText = `Window: ${startIndex} - ${endIndex} / ${fullX.length} (${windowSize} pts)`; renderWindow(startIndex, endIndex);
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

  const processFileText = (text) => {
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
  // Render immediately using default-selected channels (first 3)
  renderWindow(initialStart, initialEnd);
    statusOutput && (statusOutput.innerText = 'File loaded');
  };

  if (input) {
    input.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) { statusOutput && (statusOutput.innerText = 'No file selected'); return; }
      statusOutput && (statusOutput.innerText = `Loading ${f.name}`);
      const fr = new FileReader();
      fr.onerror = () => { console.error('FileReader error', fr.error); statusOutput && (statusOutput.innerText = 'Error reading file (see console)'); };
      fr.onload = (ev) => { try { processFileText(ev.target.result); } catch (err) { console.error('Error processing file:', err); statusOutput && (statusOutput.innerText = 'Error processing file (see console)'); } };
      fr.readAsText(f, 'UTF-8');
    });
  }

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
})();