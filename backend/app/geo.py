"""EXIF GPS reading and DBSCAN geospatial clustering (paper §5.2)."""
from __future__ import annotations

import numpy as np
from PIL import Image
from sklearn.cluster import DBSCAN

EARTH_RADIUS_M = 6_371_000


def read_gps(img: Image.Image) -> dict | None:
    try:
        gps = img.getexif().get_ifd(0x8825)  # GPSInfo
    except Exception:
        return None
    if not gps or 2 not in gps or 4 not in gps:
        return None

    def deg(v) -> float:
        d, m, s = (float(x) for x in v)
        return d + m / 60 + s / 3600

    try:
        lat = deg(gps[2]) * (-1 if gps.get(1) == "S" else 1)
        lon = deg(gps[4]) * (-1 if gps.get(3) == "W" else 1)
    except Exception:
        return None
    if not (np.isfinite(lat) and np.isfinite(lon)) or (lat == 0 and lon == 0):
        return None
    return {"lat": lat, "lon": lon}


def cluster(points: list[dict], eps_m: float, min_samples: int) -> list[int]:
    """Label per point: 0..k-1 for clusters, -1 for noise. Haversine distance in metres."""
    if not points:
        return []
    coords = np.radians([[p["lat"], p["lon"]] for p in points])
    model = DBSCAN(eps=eps_m / EARTH_RADIUS_M, min_samples=min_samples, metric="haversine")
    return [int(x) for x in model.fit_predict(coords)]
