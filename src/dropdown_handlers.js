// Dropdown functionality for ECG Analysis interface
// Handles collapsible sections for Fiducial Points, Events/Segments, and Channels

document.addEventListener('DOMContentLoaded', function() {
  // Initialize dropdown functionality
  initializeDropdowns();
  
  // Set up event listeners for dynamic updates
  setupDropdownUpdates();
});

function setExpanded(header, targetContent, expanded) {
  if (header) {
    header.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }
  if (!targetContent) return;

  targetContent.classList.toggle('expanded', expanded);
  if (header) header.classList.toggle('active', expanded);
  targetContent.setAttribute('aria-hidden', expanded ? 'false' : 'true');
  targetContent.style.maxHeight = '';
}

function initializeDropdowns() {
  // Get all dropdown headers
  const dropdownHeaders = document.querySelectorAll('.dropdown-header');
  
  dropdownHeaders.forEach(header => {
    const targetId = header.getAttribute('data-target');
    const targetContent = targetId ? document.getElementById(targetId) : null;
    const titleEl = header.querySelector('.dropdown-title');
    const headerLabel = titleEl ? titleEl.textContent.trim() : header.textContent.trim();

    if (targetId) header.setAttribute('aria-controls', targetId);
    if (!header.hasAttribute('aria-expanded')) header.setAttribute('aria-expanded', 'false');

    if (targetContent) {
      targetContent.setAttribute('aria-hidden', 'true');
      if (!targetContent.hasAttribute('role')) targetContent.setAttribute('role', 'region');
      if (headerLabel && !targetContent.hasAttribute('aria-label')) {
        targetContent.setAttribute('aria-label', headerLabel);
      }
    }

    const toggle = () => {
      if (!targetContent) return;
      const isExpanded = targetContent.classList.contains('expanded');
      setExpanded(header, targetContent, !isExpanded);
    };

    header.addEventListener('click', function() {
      toggle();
    });

    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape') {
        if (targetContent && targetContent.classList.contains('expanded')) {
          e.preventDefault();
          setExpanded(header, targetContent, false);
        }
      }
    });

    setExpanded(header, targetContent, false);
  });
  
  // Set initial state - start with all sections collapsed for cleaner UI
  document.querySelectorAll('.dropdown-content').forEach(content => {
    content.classList.remove('expanded');
    // Remove inline styles to let CSS handle the state
    content.style.maxHeight = '';
    content.style.padding = '';
    if (!content.hasAttribute('aria-hidden')) content.setAttribute('aria-hidden', 'true');
  });
}

function setupDropdownUpdates() {
  // Update fiducial current selection
  const fiducialRadios = document.querySelectorAll('input[name="fiducial"]');
  const fiducialCurrent = document.getElementById('fiducialCurrent');
  
  fiducialRadios.forEach(radio => {
    radio.addEventListener('change', function() {
      if (this.checked && fiducialCurrent) {
        fiducialCurrent.textContent = this.value;
      }
    });
  });
  
  // Update events current selection
  const eventTypeSelect = document.getElementById('eventType');
  const eventsCurrent = document.getElementById('eventsCurrent');
  
  if (eventTypeSelect && eventsCurrent) {
    eventTypeSelect.addEventListener('change', function() {
      eventsCurrent.textContent = this.value;
    });
  }
  
  // Update channels current selection
  const channelCheckboxes = document.querySelectorAll('#channelList input[type="checkbox"], #ch_all');
  const channelsCurrent = document.getElementById('channelsCurrent');
  
  function updateChannelsCurrent() {
    if (!channelsCurrent) return;
    
    const allCheckbox = document.getElementById('ch_all');
    const channelCheckboxes = document.querySelectorAll('#channelList input[type="checkbox"]:checked');
    
    if (allCheckbox && allCheckbox.checked) {
      channelsCurrent.textContent = 'All';
    } else if (channelCheckboxes.length === 0) {
      channelsCurrent.textContent = 'None';
    } else if (channelCheckboxes.length === 1) {
      // Find the label text for the single checked channel
      const checkedChannel = channelCheckboxes[0];
      const label = checkedChannel.closest('label');
      if (label) {
        const labelText = label.textContent.trim();
        channelsCurrent.textContent = labelText;
      } else {
        channelsCurrent.textContent = '1 channel';
      }
    } else {
      channelsCurrent.textContent = `${channelCheckboxes.length} channels`;
    }
  }
  
  // Listen for changes in channel selection
  const channelsContainer = document.getElementById('channelList');
  const allCheckbox = document.getElementById('ch_all');
  
  if (channelsContainer) {
    // Use event delegation for dynamically generated checkboxes
    channelsContainer.addEventListener('change', function(e) {
      if (e.target.type === 'checkbox') {
        updateChannelsCurrent();
      }
    });
  }
  
  if (allCheckbox) {
    allCheckbox.addEventListener('change', updateChannelsCurrent);
  }
  
  // Initial update
  updateChannelsCurrent();
  
  // Watch for dynamically added channel checkboxes
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        updateChannelsCurrent();
      }
    });
  });
  
  if (channelsContainer) {
    observer.observe(channelsContainer, { childList: true, subtree: true });
  }
}

// Export functions for potential external use
window.ECGDropdowns = {
  initializeDropdowns,
  setupDropdownUpdates
};