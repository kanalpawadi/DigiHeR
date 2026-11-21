"""
Tiny document store on the local disk: one JSON file per record, grouped by
collection. It plays the role of the paper's NoSQL database (Firestore) for a
single-machine deployment, and keeps the same document-shaped records.

    data/
      images/<id>.json        metadata + IQA scores
      files/<siteId>/<id>.jpg the uploaded photo
      jobs/<id>.json          reconstruction job state
      work/<jobId>/           COLMAP / mesh working files
      models/<siteId>.glb     latest model per site
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Any

from .config import DATA_DIR

_lock = threading.Lock()


def path(*parts: str) -> Path:
    p = DATA_DIR.joinpath(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def put(collection: str, doc_id: str, doc: dict[str, Any]) -> None:
    target = path(collection, f"{doc_id}.json")
    tmp = target.with_suffix(".tmp")
    with _lock:
        tmp.write_text(json.dumps(doc, indent=2), encoding="utf-8")
        os.replace(tmp, target)


def get(collection: str, doc_id: str) -> dict[str, Any] | None:
    target = DATA_DIR / collection / f"{doc_id}.json"
    if not target.exists():
        return None
    with _lock:
        return json.loads(target.read_text(encoding="utf-8"))


def delete(collection: str, doc_id: str) -> bool:
    target = DATA_DIR / collection / f"{doc_id}.json"
    if target.exists():
        target.unlink()
        return True
    return False


def query(collection: str, **equals: Any) -> list[dict[str, Any]]:
    folder = DATA_DIR / collection
    if not folder.exists():
        return []
    out = []
    for f in folder.glob("*.json"):
        with _lock:
            doc = json.loads(f.read_text(encoding="utf-8"))
        if all(doc.get(k) == v for k, v in equals.items()):
            out.append(doc)
    return out
