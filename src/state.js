(function(){
  // State helpers that rely on window.__state provided by script.js
  const S = () => window.__state || {};
  function setData(x, chs){ S().fullX = x || []; S().channels = chs || []; }
  function setWindow(start, size){ S().currentStart = start; S().windowSize = size; }
  function getPlot(){ return S().plot; }
  function getData(){ return { x:S().fullX, channels:S().channels, marks:S().marks, segments:S().segments }; }
  window.State = { setData, setWindow, getPlot, getData };
})();
