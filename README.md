# ECG Marker

ECG marker app with a simple web UI and a FastAPI backend.

## What it does
- Load ECG files and plot 12 leads.
- Add fiducial marks (P, Q, R, S, T).
- Mark segments like noise or arrhythmia.
- Export marks and segments.
- Run optional automatic delineation (non-BMECG only).

## Quick start (Docker)
```bash
docker compose up --build
```
Open http://localhost:8080

Backend docs: http://localhost:8000/docs

Stop:
```bash
docker compose down
```

## Local dev

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend
Serve the static files in `src/`.
```bash
cd src
python -m http.server 8080
```
Open http://localhost:8080

## File loading
- You can select any file type.
- The app validates that the content looks like ECG data.
- Text files must contain 13 columns: time + 12 channels.
- Delimiters can be tab, comma, or whitespace.
- The first row can be a header.
- BMECG binary files use the `BMECG1` signature and are treated as 500 Hz.

Validation rules (current):
- At least 50 rows.
- Time must be monotonic.
- 12 channels must exist and match length.
- Channels must have numeric samples and non-flat values.

## Buttons and limits
- Automatic Delineation is disabled for BMECG files (500 Hz not supported).
- Clean Signal and Find R Peaks run only for BMECG in the current UI.

## API summary
Base URL: http://localhost:8000

- GET `/api/health` -> status ok.
- POST `/api/set_ecg` -> send JSON `{ matrix: [[t,ch1..ch12], ...] }`.
- POST `/api/clean_signal` -> JSON in, JSON out.
- POST `/api/clean_signal_bin` -> binary float32 payload.
- POST `/api/find_r_peaks` -> JSON in, R-peak list out.
- GET `/api/get_ecg_shape` -> info about loaded data.

## Model note
The backend loads `backend/model.keras` at startup.
If it is missing, the API still runs but P/T points are empty.

## Repo layout
- `src/` frontend files.
- `backend/` FastAPI service.
- `docker-compose.yml` local stack.

## Troubleshooting
- CORS errors usually mean the backend is not running.
- If Plotly fails to load, check `src/node_modules`.
- If a file is rejected, check the validation rules above.
