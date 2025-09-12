(function(){
  // IO helpers (downloads, backend calls); reuse existing functions from script.js via window
  function downloadText(...args){ return window.Utils.downloadText(...args); }
  async function postECG(apiBase, matrix){
    const resp = await fetch(`${apiBase}/api/set_ecg`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ matrix }) });
    if (!resp.ok) throw new Error(`Backend error (${resp.status})`);
    return resp.json();
  }
  window.IO = { downloadText, postECG };
})();
