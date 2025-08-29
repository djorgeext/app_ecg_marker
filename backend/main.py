from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import numpy as np


class RRFFTRequest(BaseModel):
    r_indices: List[int]


class RRFFTResponse(BaseModel):
    rr: List[float]
    freq: List[float]
    power: List[float]


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

    # Detrend by removing mean to emphasize variability
    x = rr - rr.mean()
    n = x.size
    # Real FFT and corresponding frequency bins (cycles per beat)
    X = np.fft.rfft(x)
    freq = np.fft.rfftfreq(n, d=1.0)  # sample spacing = 1 beat
    power = (np.abs(X) ** 2) / max(n, 1)

    return RRFFTResponse(
        rr=rr.tolist(),
        freq=freq.tolist(),
        power=power.tolist(),
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
