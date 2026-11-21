"""
Reconstruction jobs. One worker thread runs jobs in order (a laptop has one
GPU/CPU budget); on a cluster this queue is what Kubernetes workers would pull
from. Every stage change is saved, so the frontend can poll progress.
"""
from __future__ import annotations

import logging
import shutil
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import geo, recon, storage
from .config import DBSCAN_EPS_M, DBSCAN_MIN_SAMPLES, MIN_SFM_IMAGES, REVIEW_FLOOR

log = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="recon")

STAGES = [
    ("cluster", "Geospatial clustering", "DBSCAN on photo GPS removes stray and outlying photos"),
    ("iqa", "AI quality check", "Photos scoring below the review floor are dropped"),
    ("sfm", "Structure-from-Motion", "COLMAP: SIFT features, matching, RANSAC, bundle adjustment"),
    ("mvs", "Surface reconstruction", "OpenMVS dense mesh, or a Poisson preview from the sparse points"),
    ("decimate", "Mesh decimation", "Quadric Error Metrics down to at most 200k faces"),
    ("export", "GLB export", "Align, centre and save as glTF binary for WebXR"),
]


def model_path(site_id: str) -> Path:
    return storage.path("models", f"{site_id}.glb")


def create_job(site_id: str, image_ids: list[str]) -> dict:
    job = {
        "id": uuid.uuid4().hex,
        "siteId": site_id,
        "imageIds": image_ids,
        "startedAt": int(time.time() * 1000),
        "simulated": False,
        "stages": [{"id": i, "label": l, "detail": d, "state": "waiting"} for i, l, d in STAGES],
    }
    storage.put("jobs", job["id"], job)
    _executor.submit(_run, job["id"])
    return job


def _set(job: dict, stage: str, state: str, detail: str | None = None) -> None:
    for s in job["stages"]:
        if s["id"] == stage:
            s["state"] = state
            if detail:
                s["detail"] = detail
    storage.put("jobs", job["id"], job)


def _run(job_id: str) -> None:
    job = storage.get("jobs", job_id)
    assert job
    current = "cluster"
    work = storage.path("work", job_id, "x").parent
    try:
        images = [d for i in job["imageIds"] if (d := storage.get("images", i)) and d["siteId"] == job["siteId"]]

        # 1. DBSCAN on GPS: keep the biggest group (+ photos without GPS), drop outliers.
        _set(job, "cluster", "running")
        with_gps = [d for d in images if d.get("gps")]
        if len(with_gps) >= DBSCAN_MIN_SAMPLES:
            labels = geo.cluster([d["gps"] for d in with_gps], DBSCAN_EPS_M, DBSCAN_MIN_SAMPLES)
            groups = [l for l in labels if l >= 0]
            main = max(set(groups), key=groups.count) if groups else None
            dropped = {d["id"] for d, l in zip(with_gps, labels) if main is not None and l != main}
            images = [d for d in images if d["id"] not in dropped]
            detail = f"{len(with_gps)} geotagged photos, {len(set(groups))} group(s); {len(dropped)} outlier(s) removed"
        else:
            detail = f"Skipped: {len(with_gps)} of {len(images)} photos have GPS, clustering needs {DBSCAN_MIN_SAMPLES}"
        _set(job, "cluster", "done", detail)

        # 2. IQA filter (scores were computed at upload; reviewed photos 0.55–0.65 are allowed through).
        current = "iqa"
        _set(job, "iqa", "running")
        kept = [d for d in images if d.get("scores") and d["scores"]["s"] >= REVIEW_FLOOR]
        _set(job, "iqa", "done", f"{len(kept)} of {len(images)} photos passed (S_IQA ≥ {REVIEW_FLOOR} after review)")
        if len(kept) < MIN_SFM_IMAGES:
            raise recon.StageError(f"Only {len(kept)} usable photos; at least {MIN_SFM_IMAGES} are needed.")

        # 3. SfM
        current = "sfm"
        _set(job, "sfm", "running", f"Matching {len(kept)} photos with COLMAP. This can take several minutes.")
        if work.exists():
            shutil.rmtree(work)
        recon.prepare_images([Path(d["file"]) for d in kept], work / "images")
        t0 = time.time()
        sparse = recon.run_sfm(work)
        _set(job, "sfm", "done", f"{sparse.registered} of {len(kept)} photos registered, {len(sparse.points):,} 3D points ({time.time() - t0:.0f}s)")

        # 4. Surface
        current = "mvs"
        _set(job, "mvs", "running")
        mesh, note = recon.build_mesh(work, sparse)
        mesh = recon.clean(mesh)
        _set(job, "mvs", "done", f"{note}: {len(mesh.triangles):,} faces")

        # 5. QEM
        current = "decimate"
        _set(job, "decimate", "running")
        before = len(mesh.triangles)
        mesh = recon.decimate(mesh)
        after = len(mesh.triangles)
        _set(job, "decimate", "done", f"{before:,} → {after:,} faces" if after < before else f"{after:,} faces, already within budget")

        # 6. GLB
        current = "export"
        _set(job, "export", "running")
        faces = recon.export_glb(mesh, sparse, model_path(job["siteId"]))
        _set(job, "export", "done", f"Saved {model_path(job['siteId']).stat().st_size / 1e6:.1f} MB GLB")

        job["result"] = {
            "faces": faces,
            "sparsePoints": int(len(sparse.points)),
            "acceptedImages": sparse.registered,
            "modelUrl": f"/sites/{job['siteId']}/model.glb",
            "note": note,
        }
        storage.put("jobs", job["id"], job)
    except recon.StageError as exc:
        _set(job, current, "failed", str(exc))
    except Exception as exc:
        log.error("Job %s failed in %s:\n%s", job_id, current, traceback.format_exc())
        _set(job, current, "failed", f"Unexpected error: {exc}")
