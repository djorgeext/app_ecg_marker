from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from ecgdetectors import Detectors


app = FastAPI(title="ECG Marker Backend")

# Allow cross-origin so the static index.html (file:// or other host) can call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health():
    return {"status": "ok"}

def normalize(signal: np.ndarray) -> np.ndarray:
    """Normalize signal to [0,1] handling NaNs gracefully."""
    s = np.asarray(signal, dtype=float)
    if s.size == 0:
        return s
    # Use nan-aware min/max to avoid propagating NaNs
    s_min = np.nanmin(s)
    s_max = np.nanmax(s)
    denom = (s_max - s_min)
    if not np.isfinite(denom) or denom == 0:
        # Flat or invalid; return zeros
        return np.nan_to_num(s - s_min)
    return np.nan_to_num((s - s_min) / denom)

# Find R-peaks in the ECG signal
def find_r_peaks(ecg_signal: np.ndarray, fs: int = 300):
    """Find R-peaks using Engzee detector on channel 1 with a fixed fs=300 Hz.

    Returns indices (sample positions) of detected R-peaks.
    """
    ecg_channel = normalize(ecg_signal[:, 2]).astype(float)
    detectors = Detectors(fs)
    return detectors.engzee_detector(ecg_channel)

# Global variable to hold the last uploaded ECG matrix (time + 12 channels)
ecg_signal: Optional[np.ndarray] = None

class ECGMatrixPayload(BaseModel):
    # A 2D matrix: each row has 13 numbers (time + 12 channels). Values may be null.
    matrix: List[List[Optional[float]]]

@app.post("/api/set_ecg")
def set_ecg(payload: ECGMatrixPayload):
    """Set the global ecg_signal from a 13-column matrix (time + 12 channels)."""
    global ecg_signal
    # Basic validation
    if not payload.matrix:
        raise HTTPException(status_code=400, detail="Matrix is empty")
    # Ensure every row has exactly 13 entries
    try:
        ecg_signal = np.array([[np.nan if v is None else float(v) for v in row] for row in payload.matrix], dtype=float)
        # Detect R-peaks (indices) with fixed fs=300; do not infer sampling rate.
        r_peaks = find_r_peaks(ecg_signal, fs=300)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid matrix values: {e}")
    if ecg_signal.ndim != 2 or ecg_signal.shape[1] != 13:
        raise HTTPException(status_code=400, detail=f"Matrix must be 2D with 13 columns, got shape {ecg_signal.shape}")
    return {"status": "ok", "shape": list(ecg_signal.shape), "r_peaks": list(map(int, r_peaks))}

@app.get("/api/get_ecg_shape")
def get_ecg_shape():
    if ecg_signal is None:
        return {"loaded": False}
    return {"loaded": True, "shape": list(ecg_signal.shape)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
