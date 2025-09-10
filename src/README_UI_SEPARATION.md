# ECG Marker

Single-page ECG signal analysis and fiducial marking.

**Features**:
- Fiducial point markers (P, Q, R, S, T)
- Events/segments marking functionality
- Channel selector and visualization controls
- Clear marks functionality
- Export data capabilities

**Usage**:
1. Load an ECG file using the "Load File" button
2. Select fiducial points (P, Q, R, S, T) and mark them on the signal
3. Mark segments by selecting event types and using segment marking mode
4. Use channel controls to show/hide specific channels
5. Export your marks and segments as needed
6. Save or export.

## File Structure

```
src/
├── ecg_analysis.html    # ECG analysis interface
├── script.js            # Core functionality
├── dropdown_handlers.js # UI interactions
├── styles.css           # Styling
└── ecg_script.js        # Placeholder (RR removed)
```