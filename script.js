// Minimal script: reads .vak file, splits lines, removes header,
// splits by tab '\t', converts first column (time) to number and plots it.
const input = document.getElementById('fileInput');
const statusOutput = document.getElementById('statusOutput');
const loadFileBtn = document.getElementById('loadFileBtn');
if (loadFileBtn && input) {
  loadFileBtn.addEventListener('click', () => input.click());
}
const getTrace = (parsedArr, column) => parsedArr.map(row => {
            const raw = row[column] !== undefined ? row[column].trim() : '';
            if (raw === '') return null;
            const n = Number(raw.replace(',', '.'));
            return Number.isNaN(n) ? null : n;
          });

input.addEventListener('change', function (ev) {
    const f = ev.target.files && ev.target.files[0];
  if (!f) {
    console.warn('No file selected');
    statusOutput.innerText = 'No file selected';
        return;
    }
  statusOutput.innerText = `Loading ${f.name}`;
    const fr = new FileReader();

    fr.onerror = () => {
        console.error('FileReader error', fr.error);
  statusOutput.innerText = 'Error reading file (see console)';
    };

    fr.onload = (e) => {
        try {
          const text = e.target.result;
          if (!text) {
            console.warn('Empty file');
            statusOutput.innerText = 'Empty file';
            return;
          }

          // 1) separar líneas (maneja \r\n y \n)
          const rawLines = text.split(/\r?\n/);
          console.log('total lines read (includes header and empty):', rawLines.length);

          // 2) primeras 8 líneas crudas para inspección
          console.log('--- first raw lines ---');
          rawLines.slice(0,8).forEach((l,i) => console.log(i, JSON.stringify(l)));

          // 3) eliminar líneas vacías (si las hubiera)
          const lines = rawLines.filter(l => l.trim().length > 0);
          if (lines.length <= 1) {
            console.warn('Too few useful lines (maybe header only)');
            statusOutput.innerText = 'Too few useful lines';
            return;
          }

          // 4) eliminar cabecera (primera línea)
          const header = lines.shift();
          console.log('header:', header);

          // 5) parse sencillo por tab (\t)
          //    cada row -> array de columnas
          const parsed = lines.map(r => r.replace(/\r$/,'').split('\t'));

          // 6) extraer columna time (primera columna) y convertir a número
          const time = getTrace(parsed, 0);
          
          // 7) 12 columns
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

          const channels = [ch1,ch2,ch3,ch4,ch5,ch6,ch7,ch8,ch9,ch10,ch11,ch12];

          // estado y referencias (asegura que están definidas antes de usarse)
          const fullX = time; // array completo de tiempos
          let windowSize = 1000; // puntos visibles por defecto (mutable para zoom)
          const maxRender = 5000;  // máximo de puntos sin decimar
          const myPlot = document.getElementById('myDiv');
          const rightPanel = document.getElementById('channelPanel');
          const navInfo = document.getElementById('navigatorInfo');
          const countsLine = document.getElementById('countsLine');
          const exportBtn = document.getElementById('exportBtn');
          const exportMenu = document.getElementById('exportMenu');
          const aecgModal = document.getElementById('aecgModal');
          const aecgCancel = document.getElementById('aecgCancel');
          const aecgDownload = document.getElementById('aecgDownload');
          const aecgInfo = document.getElementById('aecgInfo');
          // custom scrollbar elements
          const sb = document.getElementById('scrollbar');
          const sbContent = document.getElementById('scrollbarContent');
          const btnLeft = document.getElementById('scrollLeft');
          const btnRight = document.getElementById('scrollRight');

          // marcas persistentes: guardamos objetos { idx:number, type:'P'|'Q'|'R'|'S'|'T' }
          const marksAll = [];
          // exponer marksAll para debugging (índices)
          window.marksAll = marksAll;
          // fiducial selector
          const fidRadios = () => Array.from(document.querySelectorAll('input[name="fiducial"]'));
          const getCurrentFid = () => {
            const r = fidRadios().find(x => x.checked);
            return r ? r.value : 'R';
          };
          // events (segment) marking
          const eventModeCb = document.getElementById('eventMode');
          const eventTypeSel = document.getElementById('eventType');
          const deleteSegBtn = document.getElementById('deleteSegBtn');
          const segFilterCbs = Array.from(document.querySelectorAll('.seg-filter'));
          const segFilterAllBtn = document.getElementById('segFilterAll');
          const segFilterNoneBtn = document.getElementById('segFilterNone');
          let deleteSegMode = false; // when true, clicking removes the segment under the cursor
          const segmentsAll = []; // { startIdx:number, endIdx:number, type:string }
          let pendingSegStartIdx = null; // null or index waiting for end
          window.segmentsAll = segmentsAll;

          // ---- Layout/height helpers ----
          // Rule: The plot container should initially match the right panel height,
          // and grow a bit when many channels are displayed so all subplots remain readable.
          const getRightPanelHeight = () => {
            if (!rightPanel) return Math.max(window.innerHeight - 2 * 16, 640);
            return Math.max(320, rightPanel.clientHeight || 0);
          };
          const updatePlotContainerHeight = (visibleChannelsCount) => {
            const base = getRightPanelHeight();
            // add extra after 8 channels, up to +600px
            const extra = Math.max(0, (visibleChannelsCount - 8)) * 60;
            const maxExtra = 600;
            const target = base + Math.min(extra, maxExtra);
            if (myPlot && Math.abs((myPlot.clientHeight || 0) - target) > 4) {
              myPlot.style.height = `${target}px`;
            }
          };
          if (eventModeCb) {
            eventModeCb.addEventListener('change', () => {
              pendingSegStartIdx = null;
              if (eventModeCb.checked && deleteSegMode) {
                // turn off delete mode if enabling event mode
                deleteSegMode = false;
                if (deleteSegBtn) deleteSegBtn.classList.remove('active');
              }
              if (statusOutput) statusOutput.innerText = eventModeCb.checked ? 'Event mode: click start and end' : '';
            });
          }
          if (deleteSegBtn) {
            deleteSegBtn.addEventListener('click', () => {
              deleteSegMode = !deleteSegMode;
              // mutually exclusive with event marking mode
              if (deleteSegMode && eventModeCb && eventModeCb.checked) {
                eventModeCb.checked = false;
                pendingSegStartIdx = null;
              }
              if (deleteSegBtn) deleteSegBtn.classList.toggle('active', deleteSegMode);
              if (statusOutput) statusOutput.innerText = deleteSegMode ? 'Delete mode: click shaded segment to remove' : '';
            });
          }
          const getEnabledTypes = () => new Set(segFilterCbs.filter(el => el.checked).map(el => String(el.dataset.type)));
          const syncCounts = () => {
            if (!countsLine) return;
            countsLine.textContent = `${marksAll.length} marks • ${segmentsAll.length} segments`;
          };
          segFilterAllBtn && segFilterAllBtn.addEventListener('click', () => { segFilterCbs.forEach(cb => cb.checked = true); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
          segFilterNoneBtn && segFilterNoneBtn.addEventListener('click', () => { segFilterCbs.forEach(cb => cb.checked = false); const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); });
          segFilterCbs.forEach(cb => cb.addEventListener('change', () => { const end = Math.min(fullX.length, currentStart + windowSize); renderWindow(currentStart, end); }));
          // tolerancia dinámica para toggle por índice (depende de la decimación actual)
          let currentIndexTol = 1;

          // helper: búsqueda binaria (primer índice con arr[i] >= val)
          const findIndex = (arr, val) => {
            let lo = 0, hi = arr.length - 1;
            while (lo < hi) {
              const mid = Math.floor((lo + hi) / 2);
              if (arr[mid] < val) lo = mid + 1; else hi = mid;
            }
            return lo;
          };

          // helper: decimar por stride simple
          const decimate = (xs, ys, maxPoints) => {
            const n = xs.length;
            if (n <= maxPoints) return { x: xs, y: ys };
            const step = Math.ceil(n / maxPoints);
            const nx = [], ny = [];
            for (let i = 0; i < n; i += step) {
              nx.push(xs[i]);
              ny.push(ys[i]);
            }
            return { x: nx, y: ny };
          };

           // --- UI: build checkboxes in right panel ---
           const channelListDiv = document.getElementById('channelList');
           const allCheckbox = document.getElementById('ch_all');
           const showBtn = document.getElementById('showSelected');

           // create checkboxes for 12 channels
           channelListDiv.innerHTML = '';
           channels.forEach((_, idx) => {
             const n = idx + 1;
             const wrapper = document.createElement('div');
             // default: first 3 channels checked
             const isChecked = idx < 3 ? 'checked' : '';
             wrapper.innerHTML = `<label style="display:block"><input type="checkbox" class="ch_cb" data-idx="${idx}" ${isChecked} /> Ch${n}</label>`;
             channelListDiv.appendChild(wrapper);
           });

          // helper: read selection
          const getSelectedIndices = () => {
            const cbs = Array.from(document.querySelectorAll('.ch_cb'));
            const selected = cbs.filter(cb => cb.checked).map(cb => Number(cb.dataset.idx));
            if (allCheckbox && allCheckbox.checked) return channels.map((_,i) => i);
            return selected;
          };

          // sync "All" checkbox
          const syncAllCheckbox = () => {
            const cbs = Array.from(document.querySelectorAll('.ch_cb'));
            const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
            if (allCheckbox) allCheckbox.checked = allChecked;
          };
          channelListDiv.addEventListener('change', () => {
            syncAllCheckbox();
            // Update height preview immediately as selection changes
            const selCount = getSelectedIndices().length || 0;
            updatePlotContainerHeight(selCount);
          });
          if (allCheckbox) {
            allCheckbox.addEventListener('change', () => {
              const cbs = Array.from(document.querySelectorAll('.ch_cb'));
              cbs.forEach(cb => cb.checked = allCheckbox.checked);
              // After toggling all, resize and re-render to fit new channel count
              const selCount = getSelectedIndices().length || 0;
              updatePlotContainerHeight(selCount);
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            });
          }
          // initialize "All" checkbox state (first 3 checked by default)
          syncAllCheckbox();

          // Keep plot height in sync with panel on resize
          let resizeTimer = null;
          window.addEventListener('resize', () => {
            if (resizeTimer) clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
              const selCount = getSelectedIndices().length || 0;
              updatePlotContainerHeight(selCount);
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            }, 120);
          });

          // --- render dinámico: dibuja las derivaciones apiladas ---
          const renderWindow = (startIndex, endIndex) => {
             const sel = getSelectedIndices();
             if (sel.length === 0) {
               // nothing selected: clear plot
               Plotly.purge(myPlot);
               return;
             }

            const m = sel.length;
            // ensure container follows the rule before measuring
            updatePlotContainerHeight(m);
            const gap = 0.02;
            const totalGap = gap * (m - 1);
            const h = (1 - totalGap) / m;

            const dataOut = [];
            // dynamic height so subplots fill the container
            // use actual container size if available
            let containerHeight = 600; // fallback
            try {
              const rect = myPlot.getBoundingClientRect();
              if (rect && rect.height > 0) containerHeight = rect.height;
            } catch (err) {
              // ignore
            }

            const layout = {
              showlegend: false,
              // extra top margin to comfortably display time and letter annotations
              margin: { t: 70, r: 20, l: 50, b: 40 },
              // Match container height (which already accounts for panel height and channel count)
              height: containerHeight,
              title: { text: '' }
            };

            // create domains and y-axes
            for (let i = 0; i < m; i++) {
              const top = 1 - i * (h + gap);
              const bottom = top - h;
              const yName = i === 0 ? 'yaxis' : 'yaxis' + (i + 1);
              layout[yName] = {
                domain: [bottom, top],
                anchor: 'x',
                showgrid: true,
                gridcolor: '#e5e7eb',
                gridwidth: 1,
                zeroline: false,
                layer: 'below traces',
                title: { text: '' }
              };
              // leave ticks on every subplot
            }

            // construir trazas (una por canal seleccionada)
            const maxPerTrace = Math.max(1000, Math.floor(maxRender / Math.max(1, m))); // reparto de decimación
            // calcular y guardar tolerancia de índice según stride de decimación
            const nSlice = Math.max(1, endIndex - startIndex);
            const step = Math.ceil(nSlice / maxPerTrace);
            currentIndexTol = Math.max(1, Math.ceil(step / 2));
            sel.forEach((chIdx, i) => {
              const xs = fullX.slice(startIndex, endIndex);
              const ys = channels[chIdx].slice(startIndex, endIndex);
              // decimar
              const dec = decimate(xs, ys, maxPerTrace);
              const trace = {
                x: dec.x,
                y: dec.y,
                type: 'scatter',
                mode: 'lines',
                name: 'Ch' + (chIdx + 1),
                line: { width: 1 },
                yaxis: i === 0 ? 'y' : 'y' + (i + 1) // primera traza usa y (implícito), otras y2,y3...
              };
              dataOut.push(trace);
            });

            // X axis: anchor to last y axis
            layout.xaxis = {
              anchor: 'y' + (m === 1 ? '' : (m)),
              showgrid: true,
              gridcolor: '#e5e7eb',
              gridwidth: 1,
              zeroline: false,
              layer: 'below traces',
              title: { text: '' }
            };

            // inject persistent marks (shapes and annotations) into layout
            const existingShapes = Array.isArray(myPlot.layout && myPlot.layout.shapes)
              ? myPlot.layout.shapes.filter(s => !s.id || !/^(vline-|seg-)/.test(String(s.id)))
              : [];
            const existingAnns = Array.isArray(myPlot.layout && myPlot.layout.annotations)
              ? myPlot.layout.annotations.filter(a => !a.id || !/^(ann-|seg-ann-)/.test(String(a.id)))
              : [];

            // only marks visible within [startIndex, endIndex)
            const visibleMarks = (marksAll || []).filter(m => m && m.idx >= startIndex && m.idx < endIndex);
            // visible segments intersecting view
            const enabled = getEnabledTypes();
            const visibleSegs = (segmentsAll || []).filter(s => enabled.has(String(s.type)) && !(s.endIdx < startIndex || s.startIdx > endIndex));
            const colorForType = (t) => {
              switch (String(t)) {
                case 'Arrhythmia': return { fill: 'rgba(16,185,129,0.10)', line: 'rgba(16,185,129,0.7)' }; // green
                case 'Artifact':   return { fill: 'rgba(245,158,11,0.10)', line: 'rgba(180,83,9,0.7)' };  // amber
                case 'Noise':      return { fill: 'rgba(107,114,128,0.12)', line: 'rgba(55,65,81,0.7)' }; // gray
                case 'ST change':  return { fill: 'rgba(239,68,68,0.08)', line: 'rgba(153,27,27,0.7)' };  // red
                default:           return { fill: 'rgba(139,92,246,0.10)', line: 'rgba(109,40,217,0.7)' }; // violet
              }
            };
            const segShapes = visibleSegs.map(s => {
              const x0 = fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))];
              const x1 = fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))];
              const c = colorForType(s.type);
              return {
                type: 'rect', xref: 'x', yref: 'paper', x0: x0, x1: x1, y0: 0, y1: 1,
                fillcolor: c.fill, line: { color: c.line, width: 1, dash: 'dot' },
                id: `seg-${s.startIdx}-${s.endIdx}-${s.type}`,
                layer: 'below'
              };
            });
            const markShapes = visibleMarks.map((m) => {
              const x = fullX[m.idx];
              return {
                type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1,
                // línea fina y gris claro
                line: { color: '#d0d0d0', width: 1 }, id: `vline-${m.idx}-${m.type}`,
                layer: 'below'
              };
            });

            const markAnns = [];
            visibleMarks.forEach(m => {
              const x = fullX[m.idx];
              // Use pixel-based offsets to avoid overlap regardless of scale
              const baseY = 1.0; // top of plot area
              // time annotation (closer to axis)
              markAnns.push({
                x, y: baseY, xref: 'x', yref: 'paper', text: String(x), showarrow: false,
                align: 'center', yanchor: 'bottom', yshift: 2,
                bgcolor: 'rgba(255,255,255,0.85)', bordercolor: '#d9534f', borderwidth: 1,
                font: { color: '#d9534f', size: 10 }, id: `ann-time-${m.idx}-${m.type}`
              });
              // letter annotation stacked above time label
              markAnns.push({
                x, y: baseY, xref: 'x', yref: 'paper', text: String(m.type), showarrow: false,
                align: 'center', yanchor: 'bottom', yshift: 22,
                bgcolor: 'rgba(255,255,255,0.9)', bordercolor: '#111827', borderwidth: 1,
                font: { color: '#111827', size: 11, family: 'monospace' }, id: `ann-type-${m.idx}-${m.type}`
              });
            });


            // remove segment top labels (as requested)

            layout.shapes = existingShapes.concat(segShapes, markShapes);
            layout.annotations = existingAnns.concat(markAnns);

  // Add red points at intersections per subplot per mark
            visibleMarks.forEach((m) => {
              const xval = fullX[m.idx];
              sel.forEach((chIdx, i) => {
                const yaxisName = i === 0 ? 'y' : 'y' + (i+1);
                const yval = channels[chIdx] && channels[chIdx][m.idx] !== undefined ? channels[chIdx][m.idx] : null;
                if (yval === null || yval === undefined) return;
                // crear traza de marcador puntual
                dataOut.push({
                  x: [xval],
                  y: [yval],
                  type: 'scatter',
                  mode: 'markers',
  marker: { color: 'red', size: 8 },
                  showlegend: false,
      hoverinfo: 'skip',
      customdata: [m.idx],
                  yaxis: yaxisName
                });
              });
            });

            // keep editable true, but disable title/axis/annotation edits to remove placeholders
            Plotly.react(myPlot, dataOut, layout, {
              displayModeBar: true,
              editable: true,
              edits: {
                titleText: false,
                axisTitleText: false,
                annotationText: false,
                legendPosition: false,
                colorbarPosition: false,
                shapePosition: false
              }
            });
            syncCounts();
            // update aECG info if modal is open
            if (aecgInfo && !aecgModal.classList.contains('hidden')) {
              const sr = inferSamplingRate(fullX);
              aecgInfo.textContent = `Sampling rate: ${sr || '—'} Hz • Leads: ${channels.length}`;
            }
          };

          // Export menu logic
          const hideMenu = () => { exportMenu && exportMenu.classList.add('hidden'); };
          const toggleMenu = () => { exportMenu && exportMenu.classList.toggle('hidden'); };
          exportBtn && exportBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
          document.addEventListener('click', hideMenu);
          exportMenu && exportMenu.addEventListener('click', (e) => { e.stopPropagation(); });

          // Helpers
          const downloadText = (text, filename) => {
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          };
          const inferSamplingRate = (xs) => {
            if (!xs || xs.length < 3) return null;
            // assume evenly spaced, derive from median dt
            const dts = [];
            for (let i = 1; i < Math.min(xs.length, 4096); i++) {
              const d = Number(xs[i]) - Number(xs[i-1]);
              if (isFinite(d) && d > 0) dts.push(d);
            }
            if (!dts.length) return null;
            dts.sort((a,b)=>a-b);
            const med = dts[Math.floor(dts.length/2)];
            return med > 0 ? Math.round(1/med) : null;
          };

          // Handle export menu items
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

          // aECG modal open/close
          const openAecg = () => {
            if (!aecgModal) return;
            const sr = inferSamplingRate(fullX);
            if (aecgInfo) aecgInfo.textContent = `Sampling rate: ${sr || '—'} Hz • Leads: ${channels.length}`;
            aecgModal.classList.remove('hidden');
          };
          const closeAecg = () => { aecgModal && aecgModal.classList.add('hidden'); };
          const aecgBtn = document.getElementById('exportAecgBtn');
          aecgBtn && aecgBtn.addEventListener('click', () => { hideMenu(); openAecg(); });
          aecgCancel && aecgCancel.addEventListener('click', closeAecg);
          aecgModal && aecgModal.addEventListener('click', (e) => { if (e.target === aecgModal) closeAecg(); });

          // aECG download (very lightweight placeholder XML; real aECG schema can be added later)
          aecgDownload && aecgDownload.addEventListener('click', () => {
            // Collect form fields
            const pid = (document.getElementById('aecgPid')?.value || '').trim();
            const pname = (document.getElementById('aecgPname')?.value || '').trim();
            const sex = (document.getElementById('aecgSex')?.value || 'U').trim();
            const dob = (document.getElementById('aecgDob')?.value || '').trim();
            const study = (document.getElementById('aecgStudyId')?.value || '').trim();
            const device = (document.getElementById('aecgDevice')?.value || '').trim();

            const sr = inferSamplingRate(fullX) || 0;
            const xmlEscape = (s) => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
            const marksXml = marksAll.map(m => `    <mark type="${xmlEscape(m.type)}" time="${xmlEscape(Number(fullX[m.idx])||0)}"/>`).join('\n');
            const segsXml = segmentsAll.map(s => {
              const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0;
              const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0;
              return `    <segment type="${xmlEscape(s.type)}" start="${xmlEscape(x0)}" end="${xmlEscape(x1)}"/>`;
            }).join('\n');
            const body = `<?xml version="1.0" encoding="UTF-8"?>\n<aECG approximate="true">\n  <patient id="${xmlEscape(pid)}" name="${xmlEscape(pname)}" sex="${xmlEscape(sex)}" dob="${xmlEscape(dob)}"/>\n  <study id="${xmlEscape(study)}" device="${xmlEscape(device)}" samplingRate="${xmlEscape(sr)}" leads="${channels.length}"/>\n  <marks>\n${marksXml}\n  </marks>\n  <segments>\n${segsXml}\n  </segments>\n</aECG>\n`;
            downloadText(body, 'export_aecg.xml');
            closeAecg();
          });

          // initial state: show first 3 channels
          // ensure UI reflects first 3 checked by default
          const initialStart = 0;
          const initialEnd = Math.min(fullX.length, initialStart + windowSize);
          // if slider/info exists, initialize
          let maxStart = Math.max(0, fullX.length - windowSize);
          let currentStart = 0;
          const updateInfo = (start) => {
            const end = Math.min(fullX.length, start + windowSize);
            navInfo.innerText = `Window: ${start} - ${end} / ${fullX.length}`;
          };
          updateInfo(0);
          // initialize scrollbar content width to represent total length vs window
          const setScrollbar = () => {
            if (!sb || !sbContent) return;
            // represent content width proportional to total length; use pixels
            const ratio = fullX.length > 0 ? (fullX.length / Math.max(windowSize, 1)) : 1;
            // ensure a reasonable min width to make dragging feasible
            sbContent.style.width = `${Math.max(ratio * 100, 500)}px`;
            // sync scrollLeft to currentStart
            syncScrollToCurrent();
          };
          const syncScrollToCurrent = () => {
            if (!sb || !sbContent) return;
            const maxScroll = sbContent.scrollWidth - sb.clientWidth;
            const pos = maxStart > 0 ? (currentStart / maxStart) * maxScroll : 0;
            sb.scrollLeft = isFinite(pos) ? pos : 0;
          };
          setScrollbar();
          renderWindow(initialStart, initialEnd);

          // slider -> window
          // scroll -> window mapping
          if (sb) {
            sb.addEventListener('scroll', () => {
              const maxScroll = sbContent.scrollWidth - sb.clientWidth;
              const frac = maxScroll > 0 ? (sb.scrollLeft / maxScroll) : 0;
              currentStart = Math.round(frac * maxStart);
              const end = Math.min(fullX.length, currentStart + windowSize);
              renderWindow(currentStart, end);
              updateInfo(currentStart);
            });
          }
          // keyboard navigation: arrows and shift for big steps
          window.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              const step = e.shiftKey ? Math.max(1, Math.floor(windowSize * 0.5)) : Math.max(1, Math.floor(windowSize * 0.1));
              currentStart = Math.min(maxStart, Math.max(0, currentStart + (e.key === 'ArrowLeft' ? -step : step)));
              syncScrollToCurrent();
              e.preventDefault();
            }
          });
          // arrow buttons
          const stepSmall = () => Math.max(1, Math.floor(windowSize * 0.1));
          const stepLarge = () => Math.max(1, Math.floor(windowSize * 0.5));
          let holdTimer = null;
          const stopHold = () => { if (holdTimer) { clearInterval(holdTimer); holdTimer = null; } };
          const startHold = (dir) => {
            stopHold();
            const stepHold = () => Math.max(1, Math.floor(windowSize * 0.02));
            holdTimer = setInterval(() => {
              currentStart = Math.min(maxStart, Math.max(0, currentStart + (dir === 'left' ? -stepHold() : stepHold())));
              syncScrollToCurrent();
            }, 40);
          };
          if (btnLeft) {
            btnLeft.addEventListener('click', (e) => {
              e.preventDefault();
              currentStart = Math.max(0, currentStart - stepSmall());
              syncScrollToCurrent();
            });
            btnLeft.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              currentStart = Math.max(0, currentStart - stepLarge());
              syncScrollToCurrent();
            });
            btnLeft.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('left'); });
            btnLeft.addEventListener('mouseup', stopHold);
            btnLeft.addEventListener('mouseleave', stopHold);
            btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('left'); }, { passive: false });
            btnLeft.addEventListener('touchend', stopHold);
            btnLeft.addEventListener('touchcancel', stopHold);
          }
          if (btnRight) {
            btnRight.addEventListener('click', (e) => {
              e.preventDefault();
              currentStart = Math.min(maxStart, currentStart + stepSmall());
              syncScrollToCurrent();
            });
            btnRight.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              currentStart = Math.min(maxStart, currentStart + stepLarge());
              syncScrollToCurrent();
            });
            btnRight.addEventListener('mousedown', (e) => { e.preventDefault(); startHold('right'); });
            btnRight.addEventListener('mouseup', stopHold);
            btnRight.addEventListener('mouseleave', stopHold);
            btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); startHold('right'); }, { passive: false });
            btnRight.addEventListener('touchend', stopHold);
            btnRight.addEventListener('touchcancel', stopHold);
          }
          document.addEventListener('mouseup', stopHold);

          // "Show" applies current selection
          if (showBtn) {
            showBtn.addEventListener('click', () => {
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            });
          }

          // clicking adds/removes a vertical line mark and persists via indices
          myPlot.on('plotly_click', function(evt){
            const pts = evt.points && evt.points.length ? evt.points : null;
            if (!pts) return;
            // Segment event mode: first click sets start, second sets end
            if (!deleteSegMode && eventModeCb && eventModeCb.checked) {
              const p0 = pts[0];
              const xNum = Number(p0.x);
              const idx = findIndex(fullX, xNum);
              if (pendingSegStartIdx == null) {
                pendingSegStartIdx = idx;
                if (statusOutput) statusOutput.innerText = `Start set @ ${fullX[idx]}`;
              } else {
                const startI = Math.min(pendingSegStartIdx, idx);
                const endI = Math.max(pendingSegStartIdx, idx);
                const typ = eventTypeSel ? String(eventTypeSel.value || 'Event') : 'Event';
                segmentsAll.push({ startIdx: startI, endIdx: endI, type: typ });
                // sort and compact (optional merge of identical)
                segmentsAll.sort((a,b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx);
                pendingSegStartIdx = null;
                if (statusOutput) statusOutput.innerText = `${typ}: ${fullX[startI]} - ${fullX[endI]}`;
                const start = Number(currentStart || 0);
                const end = Math.min(fullX.length, start + windowSize);
                renderWindow(start, end);
              }
              return;
            }
            // Delete mode: remove the first segment that contains clicked x
            if (deleteSegMode) {
              const p0 = pts[0];
              const xNum = Number(p0.x);
              const i = segmentsAll.findIndex(s => {
                const x0 = fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))];
                const x1 = fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))];
                return xNum >= Math.min(x0, x1) && xNum <= Math.max(x0, x1);
              });
              if (i !== -1) {
                const removed = segmentsAll.splice(i, 1)[0];
                if (statusOutput) statusOutput.innerText = `Removed segment: ${removed.type}`;
                const start = Number(currentStart || 0);
                const end = Math.min(fullX.length, start + windowSize);
                renderWindow(start, end);
              }
              return;
            }
            // prefer any point with customdata (mark) among clicked points
            const markPt = pts.find(p => p && p.customdata != null);
            const p0 = markPt || pts[0];
            // If clicked a mark's red point (customdata with index), toggle directly
            if (p0 && p0.customdata != null) {
              const mIdx = Array.isArray(p0.customdata) ? p0.customdata[0] : p0.customdata;
              const pos = marksAll.findIndex(m => m.idx === Number(mIdx));
              if (pos !== -1) marksAll.splice(pos, 1);
              else marksAll.push({ idx: Number(mIdx), type: getCurrentFid() });
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
              return;
            }

            const xval = p0.x;

            // closest index in fullX
            const xNum = Number(xval);
            const idx = findIndex(fullX, xNum);
            // X tolerance: half dt or 1% of current view width, whichever is larger
            const dt = (fullX.length > 1) ? Math.abs(Number(fullX[1]) - Number(fullX[0])) : 0;
            const startForTol = Number(currentStart || 0);
            const endForTol = Math.min(fullX.length, startForTol + windowSize);
            const leftX = (startForTol < fullX.length) ? Number(fullX[startForTol]) : xNum;
            const rightX = (endForTol-1 >= 0 && endForTol-1 < fullX.length) ? Number(fullX[endForTol-1]) : xNum;
            const viewWidth = Math.abs(rightX - leftX);
            const tolX = Math.max(Math.abs(dt) * 1.5, viewWidth * 0.01, 1e-9);

            // find nearest existing mark by X
            let nearestPos = -1;
            let nearestDX = Infinity;
            for (let i = 0; i < marksAll.length; i++) {
              const xm = Number(fullX[marksAll[i].idx]);
              if (!isFinite(xm)) continue;
              const d = Math.abs(xm - xNum);
              if (d < nearestDX) {
                nearestDX = d;
                nearestPos = i;
              }
            }

            if (nearestPos !== -1 && nearestDX <= tolX) {
              // remove existing nearby mark
              marksAll.splice(nearestPos, 1);
            } else {
              // add new mark at nearest index
              marksAll.push({ idx, type: getCurrentFid() });
            }
            // dedupe & ordenar
            const map = new Map();
            marksAll.forEach(m => { if (!map.has(m.idx)) map.set(m.idx, m); });
            const uniq = Array.from(map.values()).sort((a,b) => a.idx - b.idx);
            marksAll.length = 0; uniq.forEach(v => marksAll.push(v));

            // re-render current window so marks render
            const start = Number(currentStart || 0);
            const end = Math.min(fullX.length, start + windowSize);
            renderWindow(start, end);
          });

          // also allow toggling by clicking the annotation label
          myPlot.on('plotly_clickannotation', function(e){
            if (!e || !e.annotation || !e.annotation.id) return;
            const m = String(e.annotation.id).match(/ann-(?:time|type)-(\d+)-([PQRST])/);
            if (m) {
              const idx = Number(m[1]);
              const pos = marksAll.findIndex(mm => mm.idx === idx);
              if (pos !== -1) marksAll.splice(pos, 1);
              else marksAll.push({ idx, type: getCurrentFid() });
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
              return;
            }
            // no segment annotation click behavior since we removed them
          });

          // button: clear marks (empties master marksAll)
          const clearBtn = document.getElementById('clearMarks');
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              marksAll.length = 0;
              segmentsAll.length = 0;
              pendingSegStartIdx = null;
              const start = Number(currentStart || 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            });
          }

          // button: download marks as plain text (.txt), one time per line
          const downloadBtn = document.getElementById('downloadMarks');
          if (downloadBtn) {
            downloadBtn.addEventListener('click', () => {
              if (!Array.isArray(marksAll) || marksAll.length === 0) {
                alert('There are no marks to download');
                return;
              }
              // convertir índices a tiempo (string) y unir por saltos de línea
              // export time and type (time\ttype)
              const lines = marksAll.map(m => `${String(Number(fullX[m.idx]) || 0.0)}\t${m.type}`);
              const text = lines.join('\n') + '\n';
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'marks.txt';
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            });
          }
          // button: download segments as TSV start_time end_time type
          const downloadSegBtn = document.getElementById('downloadSegments');
          if (downloadSegBtn) {
            downloadSegBtn.addEventListener('click', () => {
              if (!Array.isArray(segmentsAll) || segmentsAll.length === 0) {
                alert('There are no segments to download');
                return;
              }
              const lines = segmentsAll.map(s => {
                const x0 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.startIdx))]) || 0;
                const x1 = Number(fullX[Math.max(0, Math.min(fullX.length - 1, s.endIdx))]) || 0;
                return `${x0}\t${x1}\t${s.type}`;
              });
              const text = lines.join('\n') + '\n';
              const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url; a.download = 'segments.txt';
              document.body.appendChild(a); a.click(); a.remove();
              URL.revokeObjectURL(url);
            });
          }

          // zoom/relayout -> update actual range
          myPlot.on('plotly_relayout', function(eventdata){
            const left = eventdata['xaxis.range[0]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][0] : null);
            const right = eventdata['xaxis.range[1]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][1] : null);
            if (left == null || right == null) return;

            const startIndex = Math.max(0, findIndex(fullX, left));
            let endIndex = Math.min(fullX.length, findIndex(fullX, right) + 1);
            if (endIndex <= startIndex) endIndex = Math.min(fullX.length, startIndex + windowSize);

            // recalcular windowSize según el zoom actual
            windowSize = endIndex - startIndex;
            // update scrollbar metrics after zoom/pan
            maxStart = Math.max(0, fullX.length - windowSize);
            currentStart = Math.min(Math.max(0, startIndex), maxStart);
            setScrollbar();
            if (navInfo) navInfo.innerText = `Window: ${startIndex} - ${endIndex} / ${fullX.length} (${windowSize} pts)`;

            renderWindow(startIndex, endIndex);
          });

          // detect shape drag (if any) and sync marks (map shape x to index)
          myPlot.on('plotly_relayout', function(eventdata){
            const updated = Object.keys(eventdata).filter(k => k.startsWith('shapes[') && (k.endsWith('.x0') || k.endsWith('.x1')));
            if (updated.length === 0) return;

            // para cada shape actual con id 'vline-index-<oldIdx>' obtener su x y mapear a nuevo índice
            const curShapes = Array.isArray(myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => s.id && /^vline-/.test(String(s.id))) : [];
            // crear mapa oldIdx -> newIdx
            const updates = {};
            curShapes.forEach(s => {
              const m = String(s.id).match(/vline-(\d+)-([PQRST])/);
              if (!m) return;
              const oldIdx = Number(m[1]);
              const typ = String(m[2]);
              const x = s.x0 !== undefined ? Number(s.x0) : (s.x1 !== undefined ? Number(s.x1) : null);
              if (x === null) return;
              const newIdx = findIndex(fullX, x);
              updates[`${oldIdx}|${typ}`] = newIdx;
            });

            // aplicar updates en marksAll: reemplazar con misma type
            Object.keys(updates).forEach(k => {
              const [oldI, typ] = k.split('|');
              const newI = updates[k];
              const pos = marksAll.findIndex(m => m.idx === Number(oldI) && m.type === typ);
              if (pos !== -1) marksAll[pos] = { idx: newI, type: typ };
            });
            // dedupe y ordenar
            const map2 = new Map();
            marksAll.forEach(m => { if (!map2.has(m.idx)) map2.set(m.idx, m); });
            const unique = Array.from(map2.values()).sort((a,b) => a.idx - b.idx);
            marksAll.length = 0; unique.forEach(v => marksAll.push(v));

            const start = Number(currentStart || 0);
            const end = Math.min(fullX.length, start + windowSize);
            renderWindow(start, end);
          });

          // end of onload
        } catch (err) {
          console.error('Error processing file:', err);
          statusOutput.innerText = 'Error processing file (see console)';
        }
      };

  // read as UTF-8 (change to 'ISO-8859-1' if needed)
      fr.readAsText(f, 'UTF-8');
    });