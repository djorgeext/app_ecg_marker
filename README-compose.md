# Docker Compose setup (frontend + backend)

## Services
- frontend: nginx serves static `src/` at port 8080
- backend: FastAPI (uvicorn) at port 8000

## Quick start

```bash
# Build and run both services
docker compose up --build

# Or run in detached mode
# docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend:  http://localhost:8000/docs

## Live-dev tips
- Frontend mounts `./src:/var/www/html:ro` so changes reflect without rebuild.
- Backend mounts `./backend:/app/backend` and runs `--reload`.

## Notes
- In production, prefer separate images without bind mounts and disable `--reload`.
- Both services are attached to `ecg_marker_net` network.
