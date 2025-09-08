// ECG Analysis specific script - handles navigation to RR Analysis
// This script overrides the RR Analysis button behavior to navigate to the separate page

// Wait for the original script to load and then override the navigation
document.addEventListener('DOMContentLoaded', function() {
  // Override the "Serie Analysis" button to navigate to RR analysis page
  const serieAnalysisBtn = document.getElementById('serieAnalysis');
  if (serieAnalysisBtn) {
    serieAnalysisBtn.addEventListener('click', function() {
      // Save current ECG data to sessionStorage if available
      if (window.marksAll && window.marksAll.length > 0) {
        sessionStorage.setItem('ecgMarks', JSON.stringify(window.marksAll));
      }
      if (window.segmentsAll && window.segmentsAll.length > 0) {
        sessionStorage.setItem('ecgSegments', JSON.stringify(window.segmentsAll));
      }
      if (window.fullX && window.channels) {
        sessionStorage.setItem('ecgData', JSON.stringify({
          time: window.fullX,
          channels: window.channels
        }));
      }
      
      // Navigate to RR analysis page
      window.location.href = 'rr_analysis.html';
    });
  }
  
  // Remove RR-related functionality from this interface
  const rrAnalysisBtn = document.getElementById('rrAnalysis');
  if (rrAnalysisBtn) {
    rrAnalysisBtn.style.display = 'none';
  }
  
  const backToEcgBtn = document.getElementById('backToEcg');
  if (backToEcgBtn) {
    backToEcgBtn.style.display = 'none';
  }
  
  const computeFFTBtn = document.getElementById('computeRRFFTNow');
  if (computeFFTBtn) {
    computeFFTBtn.style.display = 'none';
  }
  
  // Hide RR-related elements
  const rrDiv = document.getElementById('rrDiv');
  if (rrDiv) {
    rrDiv.style.display = 'none';
  }
  
  const fftDiv = document.getElementById('fftDiv');
  if (fftDiv) {
    fftDiv.style.display = 'none';
  }
  
  const rrTools = document.getElementById('rrTools');
  if (rrTools) {
    rrTools.style.display = 'none';
  }
});