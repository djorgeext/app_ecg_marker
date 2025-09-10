from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import numpy as np
from ecgdetectors import Detectors
import tensorflow as tf
from sklearn.preprocessing import OneHotEncoder


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

def normalize(signal):
    return (signal - np.min(signal)) / (np.max(signal) - np.min(signal))

# Find R-peaks in the ECG signal
def find_r_peaks(ecg_signal, fs=300):
    ecg_channel = normalize(ecg_signal[:, 1], method="std1").astype(float)
    detectors = Detectors(fs)
    return detectors.engzee_detector(ecg_channel)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
