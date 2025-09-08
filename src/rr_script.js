// RR Analysis specific script - handles navigation back to ECG Analysis
// This script overrides the back button behavior and initializes RR analysis mode

// Wait for the original script to load and then override the navigation
document.addEventListener('DOMContentLoaded', function() {
  // Set body to RR mode
  document.body.classList.add('rr-mode');
  
  // Override the "Back to ECG Analysis" button
  const backToEcgBtn = document.getElementById('backToEcg');
  if (backToEcgBtn) {
    backToEcgBtn.addEventListener('click', function() {
      // Navigate back to ECG analysis page
      window.location.href = 'ecg_analysis.html';
    });
  }
  
  // Hide ECG-only elements
  const ecgElements = document.querySelectorAll('.ecg-only');
  ecgElements.forEach(el => {
    el.style.display = 'none';
  });
  
  // Hide the main ECG plot
  const myPlot = document.getElementById('myDiv');
  if (myPlot) {
    myPlot.style.display = 'none';
  }
  
  // Show RR-related elements
  const rrDiv = document.getElementById('rrDiv');
  if (rrDiv) {
    rrDiv.style.display = 'block';
  }
  
  const rrTools = document.getElementById('rrTools');
  if (rrTools) {
    rrTools.style.display = 'block';
  }
  
  // Try to load data from ECG analysis if available
  const loadFromEcgData = () => {
    try {
      const marksData = sessionStorage.getItem('ecgMarks');
      const segmentsData = sessionStorage.getItem('ecgSegments');
      const ecgData = sessionStorage.getItem('ecgData');
      
      if (marksData) {
        const marks = JSON.parse(marksData);
        const rMarks = marks.filter(mark => mark.type === 'R');
        
        if (rMarks.length >= 2 && ecgData) {
          const data = JSON.parse(ecgData);
          // Calculate RR intervals from R marks
          const rrIntervals = [];
          for (let i = 1; i < rMarks.length; i++) {
            const prevTime = data.time[rMarks[i-1].idx];
            const currTime = data.time[rMarks[i].idx];
            if (prevTime !== undefined && currTime !== undefined) {
              rrIntervals.push(currTime - prevTime);
            }
          }
          
          if (rrIntervals.length > 0) {
            // Hide RR tools since we have data from ECG
            if (rrTools) {
              rrTools.style.display = 'none';
            }
            
            // Plot RR intervals
            if (window.Plotly && rrDiv) {
              const rrX = Array.from({ length: rrIntervals.length }, (_, i) => i + 1);
              const trRR = { 
                x: rrX, 
                y: rrIntervals, 
                type: 'scatter', 
                mode: 'lines+markers', 
                line: { color: '#111827' }, 
                marker: { size: 5, color: '#2563eb' }, 
                name: 'RR (samples)' 
              };
              
              const layoutRR = { 
                margin: { t: 40, r: 30, l: 50, b: 40 }, 
                xaxis: { title: 'Beat index' }, 
                yaxis: { title: 'RR (samples)' }, 
                height: 400 
              };
              
              Plotly.react(rrDiv, [trRR], layoutRR, { displayModeBar: true });
              window.__rrCurrentRR = rrIntervals.slice();
              
              // Initialize RR scrolling if function exists
              if (window.__rrInitScroll) {
                window.__rrInitScroll(rrIntervals.length);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error loading ECG data for RR analysis:', error);
    }
  };
  
  // Load data after a short delay to ensure all scripts are loaded
  setTimeout(loadFromEcgData, 100);
});