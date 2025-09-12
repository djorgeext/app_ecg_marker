(function(){
  // Interaction proxies. For now, we rely on existing handlers in script.js but expose placeholders for future split.
  function schedule(start,end){ if (typeof window.scheduleRender === 'function') window.scheduleRender(start,end); }
  window.Interactions = { schedule };
})();
