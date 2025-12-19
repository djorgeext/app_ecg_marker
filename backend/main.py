from email import header
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from scipy.signal import butter, filtfilt, iircomb
from ecgdetectors import Detectors
from sklearn.preprocessing import OneHotEncoder
import tensorflow as tf


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

def find_r_peaks(ecg_signal: np.ndarray, fs: int = 300):
    """Find R-peaks using Engzee detector with fixed fs=300 Hz.
    ecg_signal should be a 1-D array (single lead). Returns sample indices.
    """
    sig = np.asarray(ecg_signal, dtype=float)
    if sig.ndim != 1:
        sig = sig.ravel()
    sig = normalize(sig)
    detectors = Detectors(fs)
    try:
        r = detectors.engzee_detector(sig)
    except Exception as e:
        # Fallback: return empty list if detector fails
        r = []
    return np.array(r, dtype=int)

def segment_data(ecg_signal, r_peaks, segment_length=225, pre_r=78, post_r=147):
    return [
        np.array([normalize(ecg_signal[start:end, j]) for j in range(ecg_signal.shape[1])]).T
        for start, end in [(r - pre_r, r + post_r) for r in r_peaks]
        if 0 <= start < len(ecg_signal) and end <= len(ecg_signal)
    ]

# Reconvert values in predictions to binary for each segment
def reconvert_and_inverse_transform(delineados):
    return [
        encoder.inverse_transform(np.array([np.where(segment[i] == np.max(segment[i]), 1, 0) for i in range(segment.shape[0])]))
        for segment in delineados
    ]

# Retrieve P and T points based on segmented labels
def get_P_and_T_points(segmentos_delineados, r_peaks, pre_r=78):
    P_points, T_points = [], []
    for i, seg in enumerate(segmentos_delineados):
        start = r_peaks[i] - pre_r
        P_points.append(np.where(seg == 'P')[0][0] + start)
        T_points.append(np.where(seg == 'R')[0][-1] + start)
    return P_points, T_points

ecg_signal: Optional[np.ndarray] = None   # last uploaded matrix
model: Optional[tf.keras.Model] = None    # loaded once
encoder: Optional[OneHotEncoder] = None
detectors: Optional[Detectors] = None     # reused Engzee detector

@app.on_event("startup")
def load_model_once():
    global model, encoder, detectors
    try:
        # Load model from current working directory (already /app/backend). Original user path 'backend/model.keras' was incorrect inside container.
        model = tf.keras.models.load_model('model.keras')
    except Exception as e:
        print(f"WARNING: Could not load model 'model.keras' at startup: {e}")
        model = None
    # Prepare encoder no matter what (labels used downstream if model ok)
    encoder = OneHotEncoder(sparse_output=False)
    encoder.fit([['N'], ['P'], ['R']])
    try:
        detectors = Detectors(300)
    except Exception as e:
        print(f"WARNING: Could not init Detectors: {e}")
        detectors = None

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
        # Use lead at column index 2 (time=0, lead1=1, lead2=2) following user's original logic
        # Prefer re-used detectors if available (slightly faster for many calls)
        try:
            if detectors is not None:
                lead_sig = normalize(ecg_signal[:, 2])
                r_peaks_arr = detectors.engzee_detector(lead_sig)
                r_peaks = np.asarray(r_peaks_arr, dtype=int)
            else:
                r_peaks = find_r_peaks(ecg_signal[:, 2], fs=300)
        except Exception as e:
            print(f"R-peak detection failed: {e}")
            r_peaks = np.array([], dtype=int)

        # If model is available, run segmentation; otherwise return empty P/T
        P_points, T_points = [], []
        if model is not None and r_peaks.size > 0:
            try:
                segments_list = segment_data(ecg_signal[:, 1:], r_peaks)
                if segments_list:
                    segments_array = np.asarray(segments_list)
                    delineados = model.predict(segments_array, verbose=0)
                    segmentos_delineados = reconvert_and_inverse_transform(delineados)
                    P_points, T_points = get_P_and_T_points(segmentos_delineados, r_peaks)
            except Exception as e:
                print(f"Segmentation pipeline failed: {e}")
                P_points, T_points = [], []

        # Shift indices by starting time value if it exists (assuming time monotonic)
        t0 = ecg_signal[0, 0] if ecg_signal.shape[0] > 0 else 0
        if np.isfinite(t0):
            r_peaks = r_peaks + t0
            P_points = np.array(P_points) + t0 if len(P_points) else []
            T_points = np.array(T_points) + t0 if len(T_points) else []

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid matrix values: {e}")
    if ecg_signal.ndim != 2 or ecg_signal.shape[1] != 13:
        raise HTTPException(status_code=400, detail=f"Matrix must be 2D with 13 columns, got shape {ecg_signal.shape}")
    return {
        "status": "ok",
        "shape": list(ecg_signal.shape),
        "r_peaks": list(map(int, np.asarray(r_peaks).ravel() if r_peaks is not None else [])),
        "P_points": list(map(int, np.asarray(P_points).ravel() if len(P_points) else [])),
        "T_points": list(map(int, np.asarray(T_points).ravel() if len(T_points) else [])),
    }

@app.get("/api/get_ecg_shape")
def get_ecg_shape():
    if ecg_signal is None:
        return {"loaded": False}
    return {"loaded": True, "shape": list(ecg_signal.shape)}

@app.post("/api/clean_signal")
def clean_signal(payload: ECGMatrixPayload):
    """Clean the ECG signal.
    Input: 13-column matrix (time + 12 channels).
    Output: 13-column matrix (time + 12 filtered channels).
    """
    # Basic validation
    if not payload.matrix:
        raise HTTPException(status_code=400, detail="Matrix is empty")
    
    try:
        # Convert to numpy array
        # Shape: (N, 13)
        signal = np.array([[np.nan if v is None else float(v) for v in row] for row in payload.matrix], dtype=float)
        
        if signal.ndim != 2 or signal.shape[1] != 13:
             raise HTTPException(status_code=400, detail=f"Matrix must be 2D with 13 columns, got shape {signal.shape}")

        # ---------------------------------------------------------
        # TODO: INSERT YOUR FILTERING CODE HERE
        # 
        # bandpass filter between 0.5 Hz and 150 Hz for ECG signal
        ecg_signal = signal[:, 1:]  # Extract only the 12 ECG leads
        lowcut = 0.5
        highcut = 150.0
        fs = 500.0
        order = 5
        b, a = butter(order, [lowcut, highcut], btype='bandpass', fs=fs)
        b2, a2 = butter(order+1, [lowcut, highcut], btype='bandpass', fs=fs)

        # comb filter at w0=50 Hz to remove powerline noise
        w0 = 50.0  # Frequency to be removed from signal (Hz)
        quality_factor = 30.0  # Quality factor
        b_notch, a_notch = iircomb(w0, quality_factor, ftype='notch', fs=fs)
        ecg_signal = np.array(ecg_signal)
        ecg_signal = ecg_signal.astype(np.float32)

        ecg_signal = filtfilt(b, a, ecg_signal, axis=0)
        ecg_signal = filtfilt(b_notch, a_notch, ecg_signal, axis=0)
        ecg_signal = filtfilt(b2, a2, ecg_signal, axis=0)
        # ---------------------------------------------------------
        signal[:, 1:] = ecg_signal
        filtered_signal = signal
        
        # Convert back to list for JSON response
        # Replace NaNs with None if necessary, but standard JSON handles null
        # Here we return list of lists
        matrix_out = filtered_signal.tolist()
        
        return {
            "status": "ok",
            "matrix": matrix_out
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error processing signal: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
