"""Settings for the DigiHeR backend. Override any of them with environment variables."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DIGIHER_DATA", ROOT / "data"))
MODELS_DIR = ROOT / "models"

# Paper §5.1 and §5.3
MIN_PIXELS = 1024 * 768
W_T, W_A = 0.7, 0.3
THRESHOLD = 0.65
REVIEW_FLOOR = 0.55  # 0.55–0.65 is flagged for human review instead of dropped

# Paper §5.2: DBSCAN on photo GPS
DBSCAN_EPS_M = float(os.environ.get("DIGIHER_DBSCAN_EPS_M", 30))
DBSCAN_MIN_SAMPLES = int(os.environ.get("DIGIHER_DBSCAN_MIN", 3))

# Paper §5.5: QEM decimation band
FACE_MIN, FACE_MAX = 50_000, 200_000

# Images are downscaled before SfM to keep a laptop run in minutes, not hours.
SFM_MAX_IMAGE_SIZE = int(os.environ.get("DIGIHER_SFM_MAX_SIZE", 1600))
MIN_SFM_IMAGES = 3

# Optional: folder containing OpenMVS binaries (DensifyPointCloud.exe, ...).
# When unset, the mesh is built from the SfM point cloud with Poisson instead.
OPENMVS_BIN = os.environ.get("OPENMVS_BIN", "")

# Optional fine-tuned IQA weights (ResNet-50 + NIMA head). See README.
IQA_WEIGHTS = Path(os.environ.get("DIGIHER_IQA_WEIGHTS", MODELS_DIR / "iqa_resnet50_nima.pt"))

CORS_ORIGINS = os.environ.get("DIGIHER_CORS", "*").split(",")
