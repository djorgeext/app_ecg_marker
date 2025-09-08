# ECG Marker - Separated UI

This application now features a separated user interface to improve user experience:

## ECG Analysis Interface (`ecg_analysis.html`)

**Purpose**: Dedicated interface for ECG signal analysis and fiducial marking

**Features**:
- Fiducial point markers (P, Q, R, S, T)
- Events/segments marking functionality
- Channel selector and visualization controls
- Clear marks functionality
- Export data capabilities
- Navigation to RR Analysis via "Serie Analysis" button

**Usage**:
1. Load an ECG file using the "Load File" button
2. Select fiducial points (P, Q, R, S, T) and mark them on the signal
3. Mark segments by selecting event types and using segment marking mode
4. Use channel controls to show/hide specific channels
5. Export your marks and segments as needed
6. Click "Serie Analysis" to proceed to RR interval analysis

## RR Analysis Interface (`rr_analysis.html`)

**Purpose**: Dedicated interface for RR series analysis and FFT computation

**Features**:
- Automatic RR interval calculation from ECG marks (when coming from ECG Analysis)
- External RR series loading capability
- FFT computation and visualization
- Navigation back to ECG Analysis

**Usage**:
1. **From ECG Analysis**: Click "Serie Analysis" to automatically transfer R marks and calculate RR intervals
2. **Standalone**: Use "Load RR series (txt)" to import external RR data
3. Click "Compute FFT" to perform frequency analysis
4. Use "Back to ECG Analysis" to return to ECG interface

## Data Flow

The interfaces are designed to work together seamlessly:
- ECG marks and segments are automatically saved when navigating to RR Analysis
- R peaks are converted to RR intervals for analysis
- Navigation preserves your work between interfaces

## File Structure

```
src/
├── ecg_analysis.html    # ECG analysis interface
├── rr_analysis.html     # RR analysis interface
├── script.js            # Core functionality
├── ecg_script.js        # ECG-specific navigation logic
├── rr_script.js         # RR-specific navigation logic
└── styles.css           # Shared styling
```

## Technical Notes

- Data is transferred between interfaces using browser sessionStorage
- Both interfaces share the same core JavaScript functionality
- The separation is achieved through selective element hiding and custom navigation scripts
- All original functionality is preserved while providing a cleaner, more focused user experience