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

          statusOutput.innerText = `Leídas ${parsed.length} filas. Revisa la consola para ver muestras.`;

          const myPlot = document.getElementById('myDiv');
          const fullX = time;
          const fullY = ch1;

          const windowSize = 1000; // cantidad de puntos visibles en la ventana (valor por defecto para el slider)
          const maxRender = 5000;  // máximo de puntos a renderizar sin decimar (ajusta según rendimiento)

          // helper: búsqueda binaria (encuentra primer índice i con arr[i] >= val)
          const findIndex = (arr, val) => {
            let lo = 0, hi = arr.length - 1;
            while (lo < hi) {
              const mid = Math.floor((lo + hi) / 2);
              if (arr[mid] < val) lo = mid + 1; else hi = mid;
            }
            return lo;
          };

          // helper: decimar por stride simple (mantiene orden)
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

          const initialX = fullX.slice(0, windowSize);
          const initialY = fullY.slice(0, windowSize);

          const trace1 = { x: initialX, y: initialY, type: 'scatter', mode: 'lines', name: 'Channel 1' };
          const data = [ trace1 ];
          const layout = {
              hovermode: 'closest',
              title: { text: 'Click on Points to add an Annotation on it' },
              xaxis: {
                rangeslider: { visible: false } // desactivo el rangeslider por defecto
              }
          };

          Plotly.newPlot('myDiv', data, layout);

          // configurar navegador (slider) personalizado
          const slider = document.getElementById('navigator');
          const navInfo = document.getElementById('navigatorInfo');
          if (slider && navInfo) {
            slider.max = Math.max(0, fullX.length - windowSize);
            slider.step = 1;
            slider.value = 0;
            navInfo.innerText = `Ventana: 0 - ${Math.min(windowSize, fullX.length)} / ${fullX.length}`;

            slider.addEventListener('input', () => {
              const start = Number(slider.value);
              const end = Math.min(fullX.length, start + windowSize);
              const slicedX = fullX.slice(start, end);
              const slicedY = fullY.slice(start, end);
              const dec = decimate(slicedX, slicedY, maxRender);
              Plotly.restyle(myPlot, { x: [dec.x], y: [dec.y] }, [0]);
              navInfo.innerText = `Ventana: ${start} - ${end} / ${fullX.length} (${dec.x.length} pts)`;
            });
          }

          // click para anotar (mantengo tu lógica)
          myPlot.on('plotly_click', function(data){
              for(var i=0; i < data.points.length; i++){
                  const annotate_text = 'x = '+data.points[i].x +
                                ' y = '+data.points[i].y.toPrecision(4);
                  const annotation = {
                    text: annotate_text,
                    x: data.points[i].x,
                    y: parseFloat(data.points[i].y.toPrecision(4))
                  };
                  const annotations = myPlot.layout.annotations || [];
                  annotations.push(annotation);
                  Plotly.relayout('myDiv',{annotations: annotations});
              }
          });

          // Actualizar la ventana visible cuando cambia el rango (p. ej. zoom/relayout)
          myPlot.on('plotly_relayout', function(eventdata){
            // intento leer rango completo (izq y der)
            const left = eventdata['xaxis.range[0]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][0] : null);
            const right = eventdata['xaxis.range[1]'] ?? (eventdata['xaxis.range'] ? eventdata['xaxis.range'][1] : null);

            // si no hay rango completo (por ejemplo se cambia otra cosa), salir
            if (left == null || right == null) return;

            // encontrar índices para left/right
            const startIndex = Math.max(0, findIndex(fullX, left));
            let endIndex = Math.min(fullX.length, findIndex(fullX, right) + 1); // +1 para incluir punto derecho

            if (endIndex <= startIndex) {
              // fallback: usa al menos windowSize
              endIndex = Math.min(fullX.length, startIndex + windowSize);
            }

            const requestedCount = endIndex - startIndex;

            // slice y decimar si hace falta
            const sliceX = fullX.slice(startIndex, endIndex);
            const sliceY = fullY.slice(startIndex, endIndex);
            const dec = decimate(sliceX, sliceY, maxRender);

            Plotly.restyle(myPlot, { x: [dec.x], y: [dec.y] }, [0]);

            // sincronizar slider si está presente
            if (slider && navInfo) {
              // mantener slider coherente: si la ventana actual es mayor que windowSize, colocamos slider en startIndex
              slider.value = startIndex;
              navInfo.innerText = `Ventana: ${startIndex} - ${endIndex} / ${fullX.length} (${dec.x.length} pts)`;
            }
          });

        } catch (err) {
          console.error('Error procesando archivo:', err);
          statusOutput.innerText = 'Error procesando archivo (ver consola)';
        }
      };

      // leer como UTF-8 (si no es UTF-8, cambia a 'ISO-8859-1' en readAsText)
      fr.readAsText(f, 'UTF-8');
    });