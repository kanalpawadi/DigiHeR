# DigiHeR

React frontend and Python backend for **DigiHeR: Scalable AI-based Framework of Crowdsourced 3D Cultural Heritage Reconstruction with WebXR** (ICDAM-2026, paper ID 731).

## Run it

Use two terminals. Each part keeps its dependencies inside the project: `node_modules/` for the frontend and `backend/.venv/` for the backend.

**1. Backend** (photo checks, COLMAP reconstruction, GLB models):

```powershell
cd backend
.\start.ps1
```

**2. Frontend** (from the project root):

```powershell
npm run dev          # http://localhost:5173 on this laptop
npm run dev:https    # HTTPS on your Wi-Fi, for AR on a phone
```

The header shows **Backend connected** when both are running. The frontend reaches the backend through Vite's `/api` proxy, so a phone only needs the frontend address. If the backend is off, the app still runs, but the reconstruction is only simulated.

Requires Node.js 18+ (tested on 22) and Python 3.10.

## From photos to an AR model

1. **Contribute:** pick or add a site, then upload 20–60 overlapping photos of one structure. Each photo is checked in the browser, then uploaded and scored again on the server.
2. **Sites:** open the site and press **Start reconstruction**. The stages run on the server, and progress shows live.
3. **Viewer & AR:** choose the site to see the reconstructed model, then press **View in AR** on an Android phone.

Tested end to end with 30 rendered test photos. COLMAP registered 29 of them (the unrelated photo was left out), recovered about 15,400 3D points in under 2 minutes on this laptop's CPU, and produced a 0.7 MB GLB.

## What each part does

| Page | What it does | Runs on |
|---|---|---|
| Home | 3D temple you can switch between sparse cloud, dense cloud and mesh | Procedural illustration model |
| Contribute | Format and size check, quality score `S = 0.7·Q_T + 0.3·Q_A` (threshold 0.65), GPS from photo data | Browser first, then backend |
| Sites | DBSCAN grouping of photo GPS, reconstruction job | Backend: COLMAP SfM, surface mesh, QEM decimation, GLB. Simulated if the backend is off |
| Viewer & AR | Site picker, server model or attached GLB, face-budget check, markerless AR | Browser (AR needs an ARCore Android phone) |
| Dashboard | Session stats, review queue for 0.55–0.65 scores, paper results | Browser |

See [backend/README.md](backend/README.md) for the API, the current limits (sparse-point preview mesh unless OpenMVS is installed, classical Q_A until fine-tuned IQA weights exist, CPU PyTorch) and how to lift them.

## Layout

```
src/                 React frontend
  lib/               iqa.ts, dbscan.ts, modelStore.ts (GLB per site), types.ts
  services/api.ts    backend calls, with a simulator when it's offline
  components/        ModelViewer (Three.js + WebXR), TempleModel, RmseChart
  pages/             Home, Contribute, Sites, Viewer, Dashboard
backend/             Python backend (FastAPI)
  app/               main.py (API), iqa.py, geo.py, recon.py, pipeline.py, storage.py
  data/              photos, jobs and models (created at runtime)
docs/ANALYSIS.md     analysis of the paper
```
