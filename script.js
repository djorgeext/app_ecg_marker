// Script mínimo: lee el archivo .vak, separa por líneas, elimina cabecera,
// divide por tab '\t', convierte a número la primera columna (time) y la muestra.
const input = document.getElementById('fileInput');
const statusOutput = document.getElementById('statusOutput');
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
        statusOutput.innerText = 'No se seleccionó archivo';
        return;
    }
    statusOutput.innerText = `Leyendo ${f.name} (${f.size} bytes)...`;
    const fr = new FileReader();

    fr.onerror = () => {
        console.error('FileReader error', fr.error);
        statusOutput.innerText = 'Error leyendo archivo (ver consola)';
    };

    fr.onload = (e) => {
        try {
          const text = e.target.result;
          if (!text) {
            console.warn('Archivo vacío');
            statusOutput.innerText = 'Archivo vacío';
            return;
          }

          // 1) separar líneas (maneja \r\n y \n)
          const rawLines = text.split(/\r?\n/);
          console.log('líneas totales leídas (incluye header y vacías):', rawLines.length);

          // 2) primeras 8 líneas crudas para inspección
          console.log('--- primeras líneas crudas ---');
          rawLines.slice(0,8).forEach((l,i) => console.log(i, JSON.stringify(l)));

          // 3) eliminar líneas vacías (si las hubiera)
          const lines = rawLines.filter(l => l.trim().length > 0);
          if (lines.length <= 1) {
            console.warn('Muy pocas líneas útiles (quizás solo header)');
            statusOutput.innerText = 'Pocas líneas útiles';
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
          const windowSize = 1000; // puntos visibles por defecto
          const maxRender = 5000;  // máximo de puntos sin decimar
          const myPlot = document.getElementById('myDiv');
          const slider = document.getElementById('navigator');
          const navInfo = document.getElementById('navigatorInfo');

          // marcas (coordenadas X) persistentes — declarar antes de renderWindow
          const marks = [];
          window.marks = marks;

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

           // --- UI: generar checkboxes en panel derecho ---
           const channelListDiv = document.getElementById('channelList');
           const allCheckbox = document.getElementById('ch_all');
           const showBtn = document.getElementById('showSelected');

           // crea checkboxes para 12 canales
           channelListDiv.innerHTML = '';
           channels.forEach((_, idx) => {
             const n = idx + 1;
             const wrapper = document.createElement('div');
             // marcar por defecto solo los primeros 3 canales
             const isChecked = idx < 3 ? 'checked' : '';
             wrapper.innerHTML = `<label style="display:block"><input type="checkbox" class="ch_cb" data-idx="${idx}" ${isChecked} /> Ch${n}</label>`;
             channelListDiv.appendChild(wrapper);
           });

          // helper: lee selección
          const getSelectedIndices = () => {
            const cbs = Array.from(document.querySelectorAll('.ch_cb'));
            const selected = cbs.filter(cb => cb.checked).map(cb => Number(cb.dataset.idx));
            if (allCheckbox && allCheckbox.checked) return channels.map((_,i) => i);
            return selected;
          };

          // sincronizar "Todos" checkbox
          const syncAllCheckbox = () => {
            const cbs = Array.from(document.querySelectorAll('.ch_cb'));
            const allChecked = cbs.length > 0 && cbs.every(cb => cb.checked);
            if (allCheckbox) allCheckbox.checked = allChecked;
          };
          channelListDiv.addEventListener('change', syncAllCheckbox);
          if (allCheckbox) {
            allCheckbox.addEventListener('change', () => {
              const cbs = Array.from(document.querySelectorAll('.ch_cb'));
              cbs.forEach(cb => cb.checked = allCheckbox.checked);
            });
          }
          // inicializar estado de "Todos" según checkboxes creados (primeros 3 checked)
          syncAllCheckbox();

          // --- render dinámico: dibuja las derivaciones apiladas ---
          const renderWindow = (startIndex, endIndex) => {
             const sel = getSelectedIndices();
             if (sel.length === 0) {
               // nada seleccionado: limpiar gráfico
               Plotly.purge(myPlot);
               return;
             }

            const m = sel.length;
            const gap = 0.02;
            const totalGap = gap * (m - 1);
            const h = (1 - totalGap) / m;

            const dataOut = [];
            // calcular altura dinámica para que los subplots llenen el contenedor myDiv
            // usamos el tamaño real del contenedor si está disponible
            let containerHeight = 600; // fallback
            try {
              const rect = myPlot.getBoundingClientRect();
              if (rect && rect.height > 0) containerHeight = rect.height;
            } catch (err) {
              // ignore
            }

            const layout = {
              showlegend: false,
              margin: { t: 40, r: 20, l: 50, b: 40 },
              height: Math.max(containerHeight, 120 * m),
              xaxis: { showgrid: false } // el eje x común (se mostrará en el bottom)
            };

            // crear dominios y yaxes
            for (let i = 0; i < m; i++) {
              const top = 1 - i * (h + gap);
              const bottom = top - h;
              const yName = i === 0 ? 'yaxis' : 'yaxis' + (i + 1);
              layout[yName] = {
                domain: [bottom, top],
                anchor: 'x',
                showgrid: false,
                zeroline: false
              };
              // mostrar ticks sólo en el eje central o a la izquierda? dejamos ticks en cada subplot
            }

            // construir trazas (una por canal seleccionada)
            const maxPerTrace = Math.max(1000, Math.floor(maxRender / Math.max(1, m))); // reparto de decimación
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

            // X axis: sólo mostrar labels en la última (inferior) y axis
            layout.xaxis = { anchor: 'y' + (m === 1 ? '' : (m)), showgrid: false };

            // incorporar marcas persistentes (shapes y annotations) en el layout
            const existingShapes = Array.isArray(myPlot.layout && myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => !s.id || !s.id.toString().startsWith('vline-')) : [];
            const existingAnns = Array.isArray(myPlot.layout && myPlot.layout.annotations) ? myPlot.layout.annotations.filter(a => !a.id || !a.id.toString().startsWith('ann-')) : [];

            const markShapes = (marks || []).map((x, i) => ({
              type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1,
              line: { color: 'red', width: 2 }, id: 'vline-' + (i+1), editable: true
            }));

            const markAnns = (marks || []).map((x, i) => ({
              x: x, y: 1.01, xref: 'x', yref: 'paper', text: String(x), showarrow: false,
              align: 'center', bgcolor: 'rgba(255,255,255,0.85)', bordercolor: 'red', font: { color: 'red', size: 12 }, id: 'ann-' + (i+1)
            }));

            layout.shapes = existingShapes.concat(markShapes);
            layout.annotations = existingAnns.concat(markAnns);

            // pasar editable:true en config para permitir arrastrar shapes/annotations
            Plotly.react(myPlot, dataOut, layout, {displayModeBar: true, editable: true});
          };

          // estado inicial: mostrar primeros 3 canales
          // aseguramos que la UI refleje que los primeros 3 están marcados por defecto
          const initialStart = 0;
          const initialEnd = Math.min(fullX.length, initialStart + windowSize);
          // si existe el slider/contadores, inicializar
          if (slider && navInfo) {
            slider.max = Math.max(0, fullX.length - windowSize);
            slider.step = 1;
            slider.value = 0;
            navInfo.innerText = `Ventana: 0 - ${Math.min(windowSize, fullX.length)} / ${fullX.length}`;
          }
          renderWindow(initialStart, initialEnd);

          // slider -> ventana
          if (slider && navInfo) {
            slider.max = Math.max(0, fullX.length - windowSize);
            slider.step = 1;
            slider.value = 0;
            navInfo.innerText = `Ventana: 0 - ${Math.min(windowSize, fullX.length)} / ${fullX.length}`;

            slider.addEventListener('input', () => {
              const start = Number(slider.value);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
              navInfo.innerText = `Ventana: ${start} - ${end} / ${fullX.length}`;
            });
          }

          // boton mostrar aplica selección actual
          if (showBtn) {
            showBtn.addEventListener('click', () => {
              const start = Number(slider ? slider.value : 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            });
          }

          // marcar puntos: cada click añade una línea vertical roja persistente y guarda X en marks
          myPlot.on('plotly_click', function(evt){
            const pts = evt.points && evt.points.length ? evt.points : null;
            if (!pts) return;
            const xval = pts[0].x;

            // evitar duplicados
            if (marks.some(m => m === xval)) return;
            marks.push(xval);

            // re-renderizar la ventana actual para que marks se inyecten en layout
            const start = Number(slider ? slider.value : 0);
            const end = Math.min(fullX.length, start + windowSize);
            renderWindow(start, end);
          });

          // botón para borrar marcas
          const clearBtn = document.getElementById('clearMarks');
          if (clearBtn) {
            clearBtn.addEventListener('click', () => {
              marks.length = 0;
              const start = Number(slider ? slider.value : 0);
              const end = Math.min(fullX.length, start + windowSize);
              renderWindow(start, end);
            });
          }

          // zoom/relayout -> actualizar datos reales del rango
          myPlot.on('plotly_relayout', function(eventdata){
            const left = eventdata['xaxis.range[0]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][0] : null);
            const right = eventdata['xaxis.range[1]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][1] : null);
            if (left == null || right == null) return;

            const startIndex = Math.max(0, findIndex(fullX, left));
            let endIndex = Math.min(fullX.length, findIndex(fullX, right) + 1);
            if (endIndex <= startIndex) endIndex = Math.min(fullX.length, startIndex + windowSize);

            // si la ventana es muy grande, actualizar slider y renderWindow con decimación
            if (slider && navInfo) {
              slider.value = startIndex;
              navInfo.innerText = `Ventana: ${startIndex} - ${endIndex} / ${fullX.length}`;
            }
            renderWindow(startIndex, endIndex);
          });

          // detectar movimiento de shapes (drag) y sincronizar marks
          myPlot.on('plotly_relayout', function(eventdata){
            // eventos de shape edit vienen como 'shapes[i].x0' o similar
            const updated = Object.keys(eventdata).filter(k => k.startsWith('shapes[') && (k.endsWith('.x0') || k.endsWith('.x1')));
            if (updated.length === 0) return;

            // reconstruir marks leyendo current shapes con prefijo vline-
            const curShapes = Array.isArray(myPlot.layout.shapes) ? myPlot.layout.shapes.filter(s => s.id && s.id.toString().startsWith('vline-')) : [];
            // extraer x positions (usar x0)
            const xs = curShapes.map(s => s.x0).filter(x => x !== undefined).map(x => Number(x));
            // ordenar y actualizar marks
            xs.sort((a,b) => a - b);
            marks.length = 0;
            xs.forEach(x => marks.push(x));
            // re-render para que annotations coincidan con shapes
            const start = Number(slider ? slider.value : 0);
            const end = Math.min(fullX.length, start + windowSize);
            renderWindow(start, end);
          });
        } catch (err) {
          console.error('Error procesando archivo:', err);
          statusOutput.innerText = 'Error procesando archivo (ver consola)';
        }
      };

      // leer como UTF-8 (si no es UTF-8, cambia a 'ISO-8859-1' en readAsText)
      fr.readAsText(f, 'UTF-8');
    });