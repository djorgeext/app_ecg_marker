from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np
def fft_rr(rr: np.ndarray):
    rr = np.asarray(rr, dtype=np.float64)
    n = rr.size
    if n < 2:
        raise ValueError("RR series too short")
    # Detrend/normalize
    power = average_psd(rr)
    freq = np.linspace(0, 0.5, len(power))
    return freq[1:], power[1:]

def compute_psd(segment):
    segment = (segment - np.mean(segment))   #/np.std(segment)  # Normalize
    return np.abs(np.fft.fft(segment))**2  # Power spectral density

def average_psd(series, window_size=4096, overlap=2048):
    segment_length = overlap + 1
    avg_psd = np.zeros((segment_length), dtype=np.float32)
    segments_quantity = len(series) // overlap - 1

    # Compute PSD across segments and flipped series
    for flip in [False, True]:
        if flip:
            series = np.flip(series)
            for start in range(0, len(series) - window_size + 1, overlap):
                segment = series[start:start + window_size]
                avg_psd += compute_psd(segment)[:segment_length]

    avg_psd /= 2 * segments_quantity  # Average PSD for both directions
    return avg_psd

class RRFFTRequest(BaseModel):
    r_indices: List[int]


class RRFFTResponse(BaseModel):
    rr: List[float]
    freq: List[float]
    power: List[float]


class RRArrayRequest(BaseModel):
    rr: List[float]


app = FastAPI(title="ECG RR FFT Service")

# Allow cross-origin so the static index.html (file:// or other host) can call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/api/rr-fft", response_model=RRFFTResponse)
def rr_fft(req: RRFFTRequest):
    r = np.array(sorted(set(int(i) for i in req.r_indices)), dtype=np.int64)
    if r.size < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 R peaks")

    # RR series as difference in sample counts between consecutive R peaks
    rr = np.diff(r).astype(np.float64)
    if rr.size < 2:
        raise HTTPException(status_code=400, detail="RR series too short")

    freq, power = fft_rr(rr)

    return RRFFTResponse(
        rr=rr.tolist(),
        freq=freq.tolist(),
        power=power.tolist(),
    )



@app.post("/api/rr-fft-from-rr", response_model=RRFFTResponse)
def rr_fft_from_rr(req: RRArrayRequest):
    rr = np.array([float(x) for x in req.rr], dtype=np.float64)
    if rr.size < 2:
        raise HTTPException(status_code=400, detail="RR series too short")
    
    freq, power = fft_rr(rr)

    return RRFFTResponse(
        rr=rr.tolist(),
        freq=freq.tolist(),
        power=power.tolist(),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
