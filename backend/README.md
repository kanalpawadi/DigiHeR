# DigiHeR backend

A Python API that takes contributors' photos and turns them into a GLB model that the React viewer and WebXR AR load. It follows paper §4–5:

| Stage | Implementation | File |
|---|---|---|
| API gateway | FastAPI | `app/main.py` |
| Metadata store (NoSQL role) | JSON documents on disk under `data/` | `app/storage.py` |
| Upload checks | JPEG/PNG, ≥ 0.79 MP (1024×768 worth of pixels) | `app/main.py` |
| Geospatial clustering | DBSCAN, haversine metric, 30 m / 3 photos | `app/geo.py` |
| IQA | `S = 0.7·Q_T + 0.3·Q_A`, accept ≥ 0.65, review 0.55–0.65 | `app/iqa.py` |
| Structure-from-Motion | COLMAP via `pycolmap`: SIFT, exhaustive matching, RANSAC, incremental BA | `app/recon.py` |
| Surface | OpenMVS dense mesh if installed, else a Poisson mesh from the SfM points | `app/recon.py` |
| QEM decimation | Open3D quadric decimation to ≤ 200k faces | `app/recon.py` |
| GLB export | Up-axis alignment and centring, then `trimesh` export | `app/recon.py` |
| Job queue | One worker thread; progress saved after every stage | `app/pipeline.py` |

## Run

Everything installs into `backend/.venv`; nothing goes into your system Python.

```powershell
cd backend
.\start.ps1
```

The first run creates the venv and installs `requirements.txt`. After that, it starts the API at `http://127.0.0.1:8000`. Open `http://127.0.0.1:8000/docs` for the interactive API docs.

Then run the frontend from the project root, either `npm run dev` or `npm run dev:https` for phones. The header shows **Backend connected** once it's working.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Which IQA model, COLMAP version, CUDA and surface method are active |
| POST | `/images` | Form fields `siteId` and `file`. Stores the photo, returns scores and verdict |
| GET | `/images?siteId=` | Photos for a site |
| DELETE | `/images/{id}` | Remove a photo |
| POST | `/reconstructions` | `{ siteId, imageIds }` starts a job |
| GET | `/reconstructions/{id}` | Job with per-stage state and details |
| GET | `/sites/{id}/model` | Whether a model exists |
| GET | `/sites/{id}/model.glb` | The model |

## Getting good results

- Take **20–60 photos** of one structure, walking around it, with **about 60% overlap** between neighbouring shots.
- Keep the same zoom. Avoid people and moving objects in front of the building. Even, cloudy light works best.
- Small sets take a few minutes on a laptop CPU. COLMAP's pip build runs SIFT on the CPU.

## Limits on this setup, and how to lift them

**Surface quality.** Without OpenMVS, the mesh is fitted to the sparse SfM points: recognisable, but coarse. For the dense MVS stage from the paper, download the OpenMVS Windows binaries from the official releases at github.com/cdcseacave/openMVS, unzip them, and start the backend with:

```powershell
$env:OPENMVS_BIN = 'C:\tools\OpenMVS'
.\start.ps1
```

Note that this path is implemented but hasn't been tested on this machine yet.

**Learned IQA.** The ResNet-50 + NIMA architecture is in `app/iqa.py`, but there are no public weights fine-tuned for photogrammetric suitability. Until you train them and save them as `models/iqa_resnet50_nima.pt` (a `state_dict` with `fc = Dropout, Linear(2048, 10), Softmax`), Q_A uses classical perceptual measures. Q_T is always computed: sharpness, exposure, noise and ORB feature count. `/health` tells you which is active.

**GPU.** The installed PyTorch is the CPU build, which keeps the install small. To use the RTX 3050 for the IQA model:

```powershell
.\.venv\Scripts\python.exe -m pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu121
```

## Data

Everything is kept under `backend/data/`: photos, job records, COLMAP working folders and the final `models/<siteId>.glb`. Delete the folder to start fresh. The `work/` subfolder can get large; it's safe to delete it between runs.
