# DigiHeR: analysis of the idea

## The idea in one line
Ordinary visitors photograph a heritage site on their phones. AI discards unusable photos, COLMAP/OpenMVS reconstruct a 3D model from the rest, and anyone can explore it in a browser or place it in AR through WebXR.

## Pipeline (paper §4–5)

| # | Stage | Method | Where it runs |
|---|---|---|---|
| 1 | Upload | JPEG/PNG, at least 1024×768 | Frontend |
| 2 | Geospatial clustering | DBSCAN on EXIF GPS removes outliers and duplicates | Backend (also in browser here) |
| 3 | AI IQA | ResNet-50 + NIMA; `S_IQA = 0.7·Q_T + 0.3·Q_A`; accept if 0.65 or above, else drop or review | Python / PyTorch |
| 4 | SfM | COLMAP or OpenSfM: SIFT, matching, RANSAC, bundle adjustment, sparse cloud | Docker on Kubernetes (GPU) |
| 5 | MVS | OpenMVS: depth maps, dense cloud, mesh, texture | Docker on Kubernetes (GPU) |
| 6 | Optimisation | QEM decimation to 50k–200k faces, GLB export | Backend |
| 7 | Visualisation | Three.js viewer, WebXR markerless AR | Frontend |
| 8 | Admin | Validation, monitoring, Firestore metadata | Frontend + Firestore |

## Reported results
- RMSE against laser scan: 4.6 mm (Somanatha, 1,512 photos), 5.9 mm (Gopinatha, 968 photos)
- AI rejected 25.1% and 29.8% of photos; SfM success was 98.7% and 96.2%
- Cost reduction factor above 6.5 (over 85% saving); about 40% time reduction; 92% AR placement success

## Strengths
- One end-to-end pipeline, where prior work covers only collection, reconstruction or viewing.
- Filtering photos before reconstruction saves GPU time, which is the main cost driver.
- Browser delivery (WebXR + GLB) removes the hardware barrier for viewers.

## Issues to fix in a revision of the paper
1. Contributions 5–8 repeat 1–4 almost word for word.
2. "2530 percent" appears in the abstract and §6.2; it should be "25–30 percent".
3. The abstract is truncated after "Multi-View".
4. The paper defines Q_T/Q_A as technical/perceptual, but the slides say texture/aesthetic. Use one pair of names.
5. The text claims results are "within about ±5 mm", but Gopinatha's 5.9 mm is outside that.
6. The "Deviation ±8.2% / ±10.5%" column in Table 3 doesn't say what it's a percentage of.
7. Numbering: §7.3.1 appears with no §7.3, and section XIII follows XI.
8. §6.2 says "containerized databases run on Kubernetes"; it presumably means containerized services.
9. "~40%" is given for both acquisition time and processing time; state which was measured.
10. Q_T and Q_A are not defined as formulas, and the fine-tuning dataset isn't described, so the IQA result can't be reproduced.

## How the frontend maps to the paper
- **Real in the browser:** format and resolution checks, a classical no-reference IQA using the paper's weights and threshold, EXIF GPS, DBSCAN, the GLB viewer, the face-budget check and WebXR AR.
- **Simulated until a backend exists:** the SfM/MVS/decimation/export job. It sits behind `src/services/api.ts`, and setting `VITE_API_URL` swaps in the real backend.

## Hardware fit (development laptop)
i5-12450H, 16 GB RAM, RTX 3050 4 GB. The frontend runs comfortably. A local backend can run ResNet-50 inference and COLMAP on CUDA for about 100–300 photos. Full 1,500-photo sets and OpenMVS at full resolution will be slow or memory-bound. AR testing needs an Android phone with ARCore.
