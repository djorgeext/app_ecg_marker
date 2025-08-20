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

          console.log('Ejemplo parsed[0]:', parsed[0]);
          console.log('Número de filas parseadas:', parsed.length);

          // 6) extraer columna time (primera columna) y convertir a número
          const time = getTrace(parsed, 0);

          console.log('time length:', time.length);
          console.log('time sample (primeros 10):', time.slice(0,10));
          

          // 7) ejemplo: columna 1 (channel 1)
          const ch1 = getTrace(parsed, 1);
          console.log('channel 1 sample (primeros 10):', ch1.slice(0,10));

          statusOutput.innerText = `Leídas ${parsed.length} filas. Revisa la consola para ver muestras.`;
          var myPlot = document.getElementById('myDiv'),
              trace1 = { x: time, y: ch1, type: 'scatter', mode: 'lines', name: 'Channel 1' },
              data = [ trace1 ],
              layout = {
                  hovermode:'closest',
                  title: {text: 'Click on Points to add an Annotation on it'}
              };
          Plotly.newPlot('myDiv', data, layout);
          myPlot.on('plotly_click', function(data){
              var pts = '';
              for(var i=0; i < data.points.length; i++){
                  annotate_text = 'x = '+data.points[i].x +
                                'y = '+data.points[i].y.toPrecision(4);
                  annotation = {
                    text: annotate_text,
                    x: data.points[i].x,
                    y: parseFloat(data.points[i].y.toPrecision(4))
                  }
                  annotations = myPlot.layout.annotations || [];
                  annotations.push(annotation);
                  Plotly.relayout('myDiv',{annotations: annotations})
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