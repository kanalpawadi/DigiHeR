"""
Image Quality Assessment (paper §5.3):  S_IQA = w_T·Q_T + w_A·Q_A

Q_T, technical quality, is what Structure-from-Motion actually depends on:
sharpness, exposure, sensor noise, and how many distinctive features the photo
has to match (ORB keypoints).

Q_A, perceptual quality, comes from a ResNet-50 with a NIMA head when
fine-tuned weights are present (models/iqa_resnet50_nima.pt). Without them,
classical perceptual measures stand in: contrast, colourfulness, dynamic range.
The /health endpoint reports which one is active.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, asdict

import cv2
import numpy as np
from PIL import Image

from .config import IQA_WEIGHTS, REVIEW_FLOOR, THRESHOLD, W_A, W_T

log = logging.getLogger(__name__)
ANALYSIS_SIZE = 1024


def _clamp(v: float) -> float:
    return float(min(1.0, max(0.0, v)))


@dataclass
class Scores:
    sharpness: float
    exposure: float
    noise: float
    texture: float
    contrast: float
    colorfulness: float
    dynamicRange: float
    qT: float
    qA: float
    s: float


# ---------------------------------------------------------------- deep model

class _NimaModel:
    """ResNet-50 backbone + NIMA head (10-bin score distribution, paper §5.3a)."""

    def __init__(self) -> None:
        self.model = None
        self.device = "cpu"
        if not IQA_WEIGHTS.exists():
            log.info("No IQA weights at %s; using classical perceptual measures for Q_A", IQA_WEIGHTS)
            return
        try:
            import torch
            import torchvision

            net = torchvision.models.resnet50(weights=None)
            net.fc = torch.nn.Sequential(torch.nn.Dropout(0.2), torch.nn.Linear(2048, 10), torch.nn.Softmax(dim=1))
            net.load_state_dict(torch.load(IQA_WEIGHTS, map_location="cpu"))
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self.model = net.eval().to(self.device)
            self.torch = torch
            log.info("Loaded IQA model from %s on %s", IQA_WEIGHTS, self.device)
        except Exception:  # keep the API usable even if the weights are bad
            log.exception("Could not load IQA weights; falling back to classical Q_A")
            self.model = None

    @property
    def name(self) -> str:
        return f"ResNet-50 NIMA ({self.device})" if self.model else "classical (contrast, colour, dynamic range)"

    def score(self, rgb: np.ndarray) -> float | None:
        if self.model is None:
            return None
        t = self.torch
        img = cv2.resize(rgb, (224, 224), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        img = (img - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
        x = t.from_numpy(img.transpose(2, 0, 1)).float().unsqueeze(0).to(self.device)
        with t.no_grad():
            dist = self.model(x)[0].cpu().numpy()
        mean = float((dist * np.arange(1, 11)).sum())  # NIMA mean score, 1..10
        return _clamp((mean - 1) / 9)


nima = _NimaModel()
_orb = cv2.ORB_create(nfeatures=3000)


def score_image(img: Image.Image) -> Scores:
    rgb = np.asarray(img.convert("RGB"))
    h, w = rgb.shape[:2]
    scale = ANALYSIS_SIZE / max(h, w)
    if scale < 1:
        rgb = cv2.resize(rgb, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # Q_T
    lap_var = float(cv2.Laplacian(gray, cv2.CV_32F).var())
    sharpness = _clamp(1 - np.exp(-lap_var / 150))
    mean = float(gray.mean())
    clipped = float(((gray < 5) | (gray > 250)).mean())
    exposure = _clamp(1 - abs(mean / 255 - 0.5) * 1.6 - clipped * 2)
    kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], np.float32)
    conv = cv2.filter2D(gray, -1, kernel)[1:-1, 1:-1]
    sigma = float(np.sqrt(np.pi / 2) * np.abs(conv).sum() / (6 * conv.size))  # Immerkær
    noise = _clamp(1 - max(0.0, sigma - 2) / 14)
    keypoints = _orb.detect(gray.astype(np.uint8), None)
    texture = _clamp(len(keypoints) / 1500)
    q_t = 0.35 * sharpness + 0.15 * exposure + 0.15 * noise + 0.35 * texture

    # Q_A (classical measures are always reported; the deep score replaces them when available)
    contrast = _clamp(float(gray.std()) / 60)
    r, g, b = (rgb[..., i].astype(np.float32) for i in range(3))
    rg, yb = r - g, 0.5 * (r + g) - b
    colorful = float(np.hypot(rg.std(), yb.std()) + 0.3 * np.hypot(rg.mean(), yb.mean()))
    colorfulness = _clamp(colorful / 60)
    p2, p98 = np.percentile(gray, [2, 98])
    dynamic_range = _clamp(float(p98 - p2) / 200)
    deep = nima.score(rgb)
    q_a = deep if deep is not None else 0.5 * contrast + 0.3 * colorfulness + 0.2 * dynamic_range

    s = W_T * q_t + W_A * q_a
    return Scores(sharpness, exposure, noise, texture, contrast, colorfulness, dynamic_range, q_t, q_a, s)


def verdict(scores: Scores) -> tuple[str, list[str]]:
    if scores.s >= THRESHOLD:
        return "accepted", []
    reasons = []
    if scores.sharpness < 0.5:
        reasons.append("Blurred or out of focus")
    if scores.exposure < 0.5:
        reasons.append("Under- or over-exposed")
    if scores.noise < 0.5:
        reasons.append("High sensor noise")
    if scores.texture < 0.4:
        reasons.append("Too few distinctive features for matching")
    if scores.contrast < 0.4:
        reasons.append("Flat, low-contrast lighting")
    if not reasons:
        reasons.append(f"Overall score {scores.s:.2f} is below {THRESHOLD}")
    return ("review" if scores.s >= REVIEW_FLOOR else "rejected"), reasons


def as_dict(scores: Scores) -> dict:
    return {k: round(v, 4) for k, v in asdict(scores).items()}
