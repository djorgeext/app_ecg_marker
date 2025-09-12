(function(){
  function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
  function median(arr){ if(!arr||!arr.length) return null; const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; }
  function binarySearchIndex(arr,val){ let lo=0, hi=arr.length-1; while(lo<hi){ const mid=(lo+hi)>>>1; if(arr[mid]<val) lo=mid+1; else hi=mid; } return lo; }
  function dtOf(xs){ return (xs && xs.length>1 ? Math.abs(Number(xs[1])-Number(xs[0]))||1 : 1); }
  function timeAt(xs,i){ return Number(xs[clamp(i,0,xs.length-1)]); }
  function downloadText(text, filename){ const blob=new Blob([text],{type:'text/plain;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
  function hashMarksSegs(marks, segs){
    // Simple stable string hash source
    const m = (marks||[]).map(m=>`${m.idx}|${m.type}`).join(',');
    const s = (segs||[]).map(s=>`${s.startIdx}|${s.endIdx}|${s.type}`).join(',');
    return `${m}::${s}`;
  }
  window.Utils = { clamp, median, binarySearchIndex, dtOf, timeAt, downloadText, hashMarksSegs };
})();
