"""
3D reconstruction stages (paper §5.4–5.5):

  SfM    COLMAP via pycolmap: SIFT features, exhaustive matching, RANSAC
         geometric verification, incremental mapping with bundle adjustment.
  MVS    OpenMVS (DensifyPointCloud + ReconstructMesh) when OPENMVS_BIN is set.
         Otherwise a screened-Poisson surface is fitted to the SfM points, a
         coarser but dependency-free preview mesh.
  QEM    Quadric-error decimation into the 50k–200k face band.
  GLB    Up-axis alignment, centring, and glTF binary export.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import open3d as o3d
import pycolmap
import trimesh
from PIL import Image, ImageOps
from sklearn.neighbors import NearestNeighbors

from .config import FACE_MAX, OPENMVS_BIN, SFM_MAX_IMAGE_SIZE

log = logging.getLogger(__name__)


class StageError(Exception):
    """A stage failed for a reason the contributor can act on."""


@dataclass
class SparseModel:
    points: np.ndarray      # (N, 3)
    colors: np.ndarray      # (N, 3) in 0..1
    cam_centers: np.ndarray  # (M, 3)
    cam_ups: np.ndarray      # (M, 3) world-space "up" of each camera
    registered: int
    sparse_dir: Path


def prepare_images(sources: list[Path], dest: Path) -> None:
    """Copy photos for COLMAP, applying EXIF rotation and capping the size."""
    dest.mkdir(parents=True, exist_ok=True)
    for src in sources:
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((SFM_MAX_IMAGE_SIZE, SFM_MAX_IMAGE_SIZE), Image.LANCZOS)
            im.save(dest / f"{src.stem}.jpg", quality=95)


def run_sfm(work: Path) -> SparseModel:
    images = work / "images"
    db = work / "database.db"
    out = work / "sparse"
    out.mkdir(parents=True, exist_ok=True)
    if db.exists():
        db.unlink()

    pycolmap.extract_features(db, images, camera_mode=pycolmap.CameraMode.AUTO)
    pycolmap.match_exhaustive(db)
    maps = pycolmap.incremental_mapping(db, images, out)
    if not maps:
        raise StageError("COLMAP could not connect the photos. Take more photos with about 60% overlap, walking around the structure.")

    rec = max(maps.values(), key=lambda r: r.num_reg_images())
    rec_dir = out / "best"
    rec_dir.mkdir(exist_ok=True)
    rec.write(rec_dir)

    pts = np.array([p.xyz for p in rec.points3D.values()], dtype=np.float64)
    cols = np.array([p.color for p in rec.points3D.values()], dtype=np.float64) / 255.0
    centers, ups = [], []
    for img in rec.images.values():
        pose = img.cam_from_world() if callable(img.cam_from_world) else img.cam_from_world
        R = pose.rotation.matrix()
        t = np.asarray(pose.translation)
        centers.append(-R.T @ t)
        ups.append(-R.T @ np.array([0.0, 1.0, 0.0]))  # COLMAP camera y points down
    if len(pts) < 100:
        raise StageError(f"Only {len(pts)} 3D points were recovered. Add photos with more overlap and texture.")
    return SparseModel(pts, cols, np.array(centers), np.array(ups), rec.num_reg_images(), rec_dir)


def _openmvs(work: Path, sparse: SparseModel) -> o3d.geometry.TriangleMesh:
    bin_dir = Path(OPENMVS_BIN)
    dense = work / "dense"
    if dense.exists():
        shutil.rmtree(dense)
    pycolmap.undistort_images(dense, sparse.sparse_dir, work / "images")

    def run(tool: str, *args: str) -> None:
        exe = bin_dir / (tool + (".exe" if (bin_dir / f"{tool}.exe").exists() else ""))
        res = subprocess.run([str(exe), *args, "-w", str(dense)], capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"{tool} failed: {res.stderr[-500:] or res.stdout[-500:]}")

    run("InterfaceCOLMAP", "-i", str(dense), "-o", str(dense / "scene.mvs"), "--image-folder", str(dense / "images"))
    run("DensifyPointCloud", str(dense / "scene.mvs"))
    run("ReconstructMesh", str(dense / "scene_dense.mvs"), "-p", str(dense / "scene_dense.ply"))
    mesh = o3d.io.read_triangle_mesh(str(dense / "scene_dense_mesh.ply"))
    cloud = o3d.io.read_point_cloud(str(dense / "scene_dense.ply"))
    if cloud.has_colors() and not mesh.has_vertex_colors():
        nn = NearestNeighbors(n_neighbors=1).fit(np.asarray(cloud.points))
        idx = nn.kneighbors(np.asarray(mesh.vertices), return_distance=False)[:, 0]
        mesh.vertex_colors = o3d.utility.Vector3dVector(np.asarray(cloud.colors)[idx])
    return mesh


def _poisson(sparse: SparseModel) -> o3d.geometry.TriangleMesh:
    pcd = o3d.geometry.PointCloud(o3d.utility.Vector3dVector(sparse.points))
    pcd.colors = o3d.utility.Vector3dVector(sparse.colors)
    pcd, _ = pcd.remove_statistical_outlier(nb_neighbors=20, std_ratio=2.0)
    pts = np.asarray(pcd.points)
    diag = float(np.linalg.norm(pts.max(0) - pts.min(0)))
    pcd.estimate_normals(o3d.geometry.KDTreeSearchParamHybrid(radius=diag * 0.05, max_nn=30))
    # Orient every normal towards the nearest camera that photographed the scene.
    nn = NearestNeighbors(n_neighbors=1).fit(sparse.cam_centers)
    nearest = sparse.cam_centers[nn.kneighbors(pts, return_distance=False)[:, 0]]
    normals = np.asarray(pcd.normals)
    flip = (normals * (nearest - pts)).sum(1) < 0
    normals[flip] *= -1
    pcd.normals = o3d.utility.Vector3dVector(normals)

    mesh, density = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(pcd, depth=8)
    density = np.asarray(density)
    mesh.remove_vertices_by_mask(density < np.quantile(density, 0.12))
    mesh = mesh.crop(pcd.get_axis_aligned_bounding_box())
    return mesh


def build_mesh(work: Path, sparse: SparseModel) -> tuple[o3d.geometry.TriangleMesh, str]:
    """Returns the mesh and a note saying which method produced it."""
    if OPENMVS_BIN:
        try:
            return _openmvs(work, sparse), "Dense mesh from OpenMVS"
        except Exception as exc:  # fall back rather than lose the whole job
            log.exception("OpenMVS failed")
            mesh = _poisson(sparse)
            return mesh, f"OpenMVS failed ({exc}); preview mesh fitted to the sparse points instead"
    return _poisson(sparse), "Preview mesh fitted to the sparse SfM points (set OPENMVS_BIN for a dense mesh)"


def clean(mesh: o3d.geometry.TriangleMesh) -> o3d.geometry.TriangleMesh:
    mesh.remove_degenerate_triangles()
    mesh.remove_duplicated_triangles()
    mesh.remove_duplicated_vertices()
    mesh.remove_non_manifold_edges()
    # Drop small floating pieces (stray points that became surface): keep
    # connected parts holding at least 2% of the largest part's triangles.
    labels, sizes, _ = mesh.cluster_connected_triangles()
    labels, sizes = np.asarray(labels), np.asarray(sizes)
    if len(sizes) > 1:
        mesh.remove_triangles_by_mask(sizes[labels] < 0.02 * sizes.max())
    mesh.remove_unreferenced_vertices()
    if len(mesh.triangles) == 0:
        raise StageError("The surface could not be built from these photos. Add more photos from more angles.")
    return mesh


def decimate(mesh: o3d.geometry.TriangleMesh) -> o3d.geometry.TriangleMesh:
    """Quadric Error Metrics decimation down to the mobile budget (paper §5.5)."""
    if len(mesh.triangles) > FACE_MAX:
        mesh = mesh.simplify_quadric_decimation(target_number_of_triangles=FACE_MAX)
    return mesh


def export_glb(mesh: o3d.geometry.TriangleMesh, sparse: SparseModel, target: Path) -> int:
    v = np.asarray(mesh.vertices)
    f = np.asarray(mesh.triangles)
    # Rotate so the photographers' average "up" becomes +Y (glTF up axis).
    up = sparse.cam_ups.mean(0)
    up /= np.linalg.norm(up) or 1.0
    y = np.array([0.0, 1.0, 0.0])
    axis = np.cross(up, y)
    s, c = np.linalg.norm(axis), float(up @ y)
    if s > 1e-8:
        k = axis / s
        K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
        R = np.eye(3) + s * K + (1 - c) * K @ K
    else:
        R = np.eye(3) if c > 0 else np.diag([1.0, -1.0, -1.0])
    v = v @ R.T
    v[:, [0, 2]] -= v[:, [0, 2]].mean(0)
    v[:, 1] -= v[:, 1].min()

    colors = None
    if mesh.has_vertex_colors():
        colors = (np.clip(np.asarray(mesh.vertex_colors), 0, 1) * 255).astype(np.uint8)
    tm = trimesh.Trimesh(vertices=v, faces=f, vertex_colors=colors, process=False)
    target.parent.mkdir(parents=True, exist_ok=True)
    tm.export(target, file_type="glb")
    return int(len(f))
