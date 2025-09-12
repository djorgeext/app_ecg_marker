(function(){
  const { binarySearchIndex:findIndex, dtOf, timeAt, hashMarksSegs } = window.Utils;
  const S = () => window.__state || {};
  let lastShapesHash = '';
  function renderWindow(startIndex, endIndex){
    const myPlot = S().plot; const fullX = S().fullX; const channels = S().channels;
    if (!myPlot || !fullX || !fullX.length || !channels || !channels.length){ Plotly.purge(myPlot); return; }
    const scriptRender = window.renderWindow; // fallback to legacy function if needed
    if (typeof scriptRender === 'function') return scriptRender(startIndex, endIndex);
  }
  window.Render = { renderWindow };
})();
