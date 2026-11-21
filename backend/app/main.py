"""DigiHeR API gateway (paper §4.1). Run with:  python -m uvicorn app.main:app --port 8000"""
from __future__ import annotations

import io
import logging
import time
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from . import geo, iqa, pipeline, storage
from .config import CORS_ORIGINS, MIN_PIXELS, OPENMVS_BIN

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
app = FastAPI(title="DigiHeR API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

ACCEPTED_TYPES = {"JPEG", "PNG"}
MAX_UPLOAD_BYTES = 40 * 1024 * 1024


@app.get("/health")
def health() -> dict:
    import pycolmap
    import torch

    return {
        "ok": True,
        "iqaModel": iqa.nima.name,
        "colmap": pycolmap.__version__,
        "cuda": torch.cuda.is_available(),
        "dense": "OpenMVS" if OPENMVS_BIN else "Poisson preview from sparse points",
    }


@app.post("/images")
async def upload_image(siteId: str = Form(...), file: UploadFile = File(...)) -> dict:
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Photo is larger than 40 MB.")
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, f"{file.filename} could not be read as an image.")

    fmt = img.format or ""
    gps = geo.read_gps(img)
    img = ImageOps.exif_transpose(img)
    w, h = img.size
    doc = {
        "id": uuid.uuid4().hex,
        "siteId": siteId,
        "fileName": file.filename,
        "width": w,
        "height": h,
        "gps": gps,
        "createdAt": int(time.time() * 1000),
    }
    reasons = []
    if fmt not in ACCEPTED_TYPES:
        reasons.append(f"Format {fmt or 'unknown'} is not JPEG or PNG")
    if w * h < MIN_PIXELS or max(w, h) < 1024:
        reasons.append(f"{w}×{h} is {w * h / 1e6:.2f} MP; at least {MIN_PIXELS / 1e6:.2f} MP (1024×768) is needed")

    if reasons:
        doc.update(scores=None, verdict="rejected", reasons=reasons)
    else:
        scores = iqa.score_image(img)
        verdict, why = iqa.verdict(scores)
        doc.update(scores=iqa.as_dict(scores), verdict=verdict, reasons=why)
        target = storage.path("files", siteId, f"{doc['id']}.{'png' if fmt == 'PNG' else 'jpg'}")
        target.write_bytes(data)
        doc["file"] = str(target)

    storage.put("images", doc["id"], doc)
    return {k: v for k, v in doc.items() if k != "file"}


@app.get("/images")
def list_images(siteId: str) -> list[dict]:
    return [{k: v for k, v in d.items() if k != "file"} for d in storage.query("images", siteId=siteId)]


@app.delete("/images/{image_id}")
def delete_image(image_id: str) -> dict:
    doc = storage.get("images", image_id)
    if not doc:
        raise HTTPException(404, "No such photo.")
    if doc.get("file"):
        from pathlib import Path

        Path(doc["file"]).unlink(missing_ok=True)
    storage.delete("images", image_id)
    return {"deleted": image_id}


class ReconstructionRequest(BaseModel):
    siteId: str
    imageIds: list[str]


@app.post("/reconstructions")
def start_reconstruction(req: ReconstructionRequest) -> dict:
    known = [i for i in req.imageIds if storage.get("images", i)]
    if not known:
        raise HTTPException(400, "None of these photos were uploaded to the server. Upload them again with the backend running.")
    return pipeline.create_job(req.siteId, known)


@app.get("/reconstructions/{job_id}")
def get_reconstruction(job_id: str) -> dict:
    job = storage.get("jobs", job_id)
    if not job:
        raise HTTPException(404, "No such reconstruction.")
    return job


@app.get("/sites/{site_id}/model.glb")
def site_model(site_id: str) -> FileResponse:
    path = pipeline.model_path(site_id)
    if not path.exists():
        raise HTTPException(404, "This site has no reconstructed model yet.")
    return FileResponse(path, media_type="model/gltf-binary", headers={"Cache-Control": "no-cache"})


@app.get("/sites/{site_id}/model")
def site_model_info(site_id: str) -> dict:
    path = pipeline.model_path(site_id)
    if not path.exists():
        return {"available": False}
    return {"available": True, "url": f"/sites/{site_id}/model.glb", "updatedAt": int(path.stat().st_mtime * 1000), "bytes": path.stat().st_size}
