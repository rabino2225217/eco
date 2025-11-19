# EcoSense Deployment

This repository now ships with containerized services for the React frontend, Express API server, Python model service, and MongoDB. Follow the instructions below to build, run, and scan the stack.

## Prerequisites
- Docker Desktop 4.0+ (or compatible Docker Engine + Compose v2)
- Node.js 20+ (optional, for local development outside containers)
- Git LFS if you plan to update the model weights

## Configuration
1. Copy `env.sample` to `.env` in the repository root:
   ```bash
   cp env.sample .env
   ```
2. Edit the `.env` file as needed. Key values:
   - `FRONTEND_PORT`: external port for the React app (defaults to `5173`).
   - `SERVER_PORT`: API port (defaults to `4000`).
   - `MODEL_PORT`: Flask model service port (defaults to `5001`).
   - `CLIENT_ORIGIN`: comma-separated list of allowed browser origins for CORS.
   - `SESSION_SECRET`, `MONGODB_URI`, and any satellite/model endpoints you integrate.

## Build & Run
```bash
docker compose up --build
```

Services and default ports:
- Frontend: http://localhost:5173
- API server: http://localhost:4000
- Model service: http://localhost:5001
- MongoDB: mongodb://localhost:27017 (exposed for local tooling)

To stop everything:
```bash
docker compose down
```

## Deployment Scan
1. Build images locally (as above) or via your CI pipeline.
2. Run your preferred scanner (e.g., Trivy) per image:
   ```bash
   trivy image ecosense-frontend:latest
   trivy image ecosense-server:latest
   trivy image ecosense-model:latest
   ```
3. Address any reported CVEs, then push the images to your registry of choice for deployment (ECS, AKS, GKE, etc.).

## Notes
- The Express server now accepts `CLIENT_ORIGIN` to align CORS with your deployed frontend URL(s).
- The frontend build embeds `VITE_API_URL` at build-time. Update the `.env` value before running `docker compose build` if your API base URL differs.
- Model weights live under `model/models`. They are mounted into the container so you can update them without rebuilding the image.

