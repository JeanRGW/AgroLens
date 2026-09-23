"""
AgroLens inference service.

CPU-only, single-worker FastAPI app that loads YOLO .pt models and
runs object detection on images.  Called by the NestJS worker only;
never exposed to the internet.
"""

from __future__ import annotations

import asyncio
import hashlib
import math
import logging
import os
import socket
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import warnings
from io import BytesIO
from pathlib import Path
from typing import Any

# Ensure YOLO / PyTorch use writable /tmp in container with read-only root filesystem.
os.environ.setdefault("YOLO_CONFIG_DIR", "/tmp/ultralytics")
os.environ.setdefault("TMPDIR", "/tmp")
os.environ.setdefault("TORCH_HOME", "/tmp/torch")

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.security import APIKeyHeader
from PIL import Image, ImageOps, UnidentifiedImageError

# ---------------------------------------------------------------------------
# single-model cache
# ---------------------------------------------------------------------------
_model_cache: dict[str, tuple[Any, dict[int, str]]] = {}
_model_lock = threading.Lock()
# key: sha256 hex -> (ultralytics.YOLO instance, {int_id: class_name})
_MODEL_MAX_SIZE_BYTES = int(os.getenv("INFERENCE_MODEL_MAX_SIZE_BYTES", str(500 * 1024 * 1024)))
_PREDICT_MAX_SIZE_BYTES = int(os.getenv("INFERENCE_PREDICT_MAX_SIZE_BYTES", str(25 * 1024 * 1024)))
_IMAGE_MAX_PIXELS = int(os.getenv("INFERENCE_IMAGE_MAX_PIXELS", str(40_000_000)))
_IMAGE_MAX_DIMENSION = int(os.getenv("INFERENCE_IMAGE_MAX_DIMENSION", str(10_000)))
Image.MAX_IMAGE_PIXELS = _IMAGE_MAX_PIXELS
warnings.simplefilter('error', Image.DecompressionBombWarning)
_INFERENCE_API_KEY = os.getenv("INFERENCE_API_KEY")


def _normalize_origin(value: str) -> str:
    """Return a canonical HTTP origin, rejecting anything beyond host/port."""
    value = value.strip()
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError
        if parsed.username is not None or parsed.password is not None:
            raise ValueError
        if parsed.path or parsed.query or parsed.fragment:
            raise ValueError
        port = parsed.port
        if port is None:
            port = 80 if parsed.scheme == "http" else 443
        host = parsed.hostname.lower()
        # urlsplit.hostname removes brackets from IPv6 literals.
        if ":" in host:
            host = f"[{host}]"
        return f"{parsed.scheme}://{host}:{port}"
    except (ValueError, UnicodeError) as exc:
        raise ValueError(f"Invalid inference model download origin: {value!r}") from exc


def _load_model_download_origins() -> frozenset[str]:
    configured = os.getenv("INFERENCE_MODEL_DOWNLOAD_ORIGINS")
    if not configured or not configured.strip():
        raise ValueError("INFERENCE_MODEL_DOWNLOAD_ORIGINS must contain at least one origin")
    origins = frozenset(_normalize_origin(item) for item in configured.split(","))
    return origins


_INFERENCE_MODEL_DOWNLOAD_ORIGINS = _load_model_download_origins()
logging.getLogger(__name__).info(
    "Configured inference model download origins: %s",
    ",".join(sorted(_INFERENCE_MODEL_DOWNLOAD_ORIGINS)),
)
_API_KEY_HEADER = APIKeyHeader(name="X-Inference-Key", auto_error=False)


def _require_api_key(api_key: str | None = Depends(_API_KEY_HEADER)) -> None:
    if not _INFERENCE_API_KEY or api_key != _INFERENCE_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Reject redirects so signed model URLs cannot escape their origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Model URLs are presigned and their query must never reach another origin.
        if req is None:  # defensive support for direct unit-test invocation
            _validate_model_url(newurl)
            return None
        original = _canonical_url_origin(req.full_url)
        target_url = urllib.parse.urljoin(req.full_url, newurl)
        target = _canonical_url_origin(target_url)
        if target != original:
            raise HTTPException(status_code=422, detail="Cross-origin model redirect is not allowed.")
        _validate_model_url(target_url)
        # urllib's base handler does not resolve relative redirects itself on
        # Python 3.14; pass the validated absolute URL so it cannot fail open
        # or construct a request with an unresolved relative target.
        return super().redirect_request(req, fp, code, msg, headers, target_url)


def _canonical_url_origin(url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(url)
        if parsed.username is not None or parsed.password is not None:
            raise ValueError
        return _normalize_origin(f"{parsed.scheme}://{parsed.netloc}")
    except (ValueError, UnicodeError) as exc:
        raise HTTPException(status_code=422, detail="Unsupported model URL.") from exc


def _validate_model_url(url: str) -> None:
    """Allow only HTTP(S) model URLs at explicitly configured storage origins."""
    try:
        parsed = urllib.parse.urlsplit(url)
        origin = _canonical_url_origin(url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Unsupported model URL.") from exc

    if parsed.path == "" or origin not in _INFERENCE_MODEL_DOWNLOAD_ORIGINS:
        raise HTTPException(status_code=422, detail="Model URL origin is not allowed.")
    try:
        socket.getaddrinfo(parsed.hostname, parsed.port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(status_code=422, detail="Model URL host cannot be resolved.") from exc


def _open_model_url(url: str):
    opener = urllib.request.build_opener(_SafeRedirectHandler())
    return opener.open(url, timeout=300)


def _download_to_temp(url: str) -> Path:
    """Download a bounded model to a temp file, returning its path."""
    _validate_model_url(url)
    fd, tmp_name = tempfile.mkstemp(suffix=".pt")
    os.close(fd)
    tmp = Path(tmp_name)
    size = 0
    try:
        with _open_model_url(url) as resp, open(tmp, "wb") as f:
            length = resp.headers.get("Content-Length")
            if length and int(length) > _MODEL_MAX_SIZE_BYTES:
                raise ValueError("Model exceeds configured size limit.")
            while True:
                chunk = resp.read(min(1 << 20, _MODEL_MAX_SIZE_BYTES - size + 1))
                if not chunk:
                    break
                size += len(chunk)
                if size > _MODEL_MAX_SIZE_BYTES:
                    raise ValueError("Model exceeds configured size limit.")
                f.write(chunk)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return tmp


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _load_yolo_from_path(path: str):  # -> ultralytics.YOLO
    """Import and return a YOLO instance.  Wrapped so tests can monkeypatch."""
    try:
        import ultralytics
        ultralytics.settings.update({"runs_dir": "/tmp/runs", "sync": False})
    except Exception:
        pass
    from ultralytics import YOLO

    return YOLO(path)



def _validate_detections(
    detections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Reject boxes with NaN, infinity, out-of-range values, or zero dimensions.

    Returns a clean list of detection dicts.
    """
    clean: list[dict[str, Any]] = []
    for d in detections:
        x = d.get("xCenter")
        y = d.get("yCenter")
        w = d.get("width")
        h = d.get("height")
        if any(
            v is None or math.isnan(v) or math.isinf(v)
            for v in (x, y, w, h)
        ):
            continue
        # clip to [0, 1]
        d["xCenter"] = max(0.0, min(1.0, x))
        d["yCenter"] = max(0.0, min(1.0, y))
        d["width"] = max(0.0, min(1.0, w))
        d["height"] = max(0.0, min(1.0, h))
        if d["width"] <= 0.0 or d["height"] <= 0.0:
            continue
        clean.append(d)
    return clean


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


app = FastAPI(
    title="AgroLens Inference",
    version="0.1.0",
)


# ---------------------------------------------------------------------------
# endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/models/inspect")
async def inspect_model(
    model_url: str = Form(..., min_length=1, max_length=2048),  # noqa: B008
    _: None = Depends(_require_api_key),
):
    """Inspect a YOLO model from a presigned S3 GET URL, validate it is a
    detection model, and return metadata.

    *model_url* is a short-lived signed S3 URL pointing to a .pt file.
    The model download is bounded by INFERENCE_MODEL_MAX_SIZE_BYTES and
    written to a temporary file for loading.
    """
    return await asyncio.to_thread(_inspect_model, model_url)


def _inspect_model(model_url: str):
    try:
        tmp_path = _download_to_temp(model_url)
    except ValueError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc
    try:
        size_bytes = tmp_path.stat().st_size
        sha256 = _sha256_path(tmp_path)

        with _model_lock:
            model = _load_yolo_from_path(str(tmp_path))
            if getattr(model, "task", None) != "detect":
                raise HTTPException(
                    status_code=422,
                    detail=f"Model task is '{model.task}', expected 'detect'.",
                )
            classes: list[dict[str, object]] = [
                {"id": int(k), "name": str(v)} for k, v in model.names.items()
            ]
            _run_warmup(model)

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to load model: {exc}",
        ) from exc
    finally:
        tmp_path.unlink(missing_ok=True)

    return {
        "sha256": sha256,
        "task": "detect",
        "classes": classes,
        "sizeBytes": size_bytes,
    }


def _run_warmup(model: Any) -> None:
    """Run a single detection on a 1×1 black PIL image to warm up the model."""
    img = Image.new("RGB", (1, 1), color=(0, 0, 0))
    model.predict(img, verbose=False, save=False, project="/tmp/runs")


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),  # noqa: B008
    model_url: str = Form(..., min_length=1, max_length=2048),
    model_checksum: str = Form(..., min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$"),
    _: None = Depends(_require_api_key),
):
    """Run object detection on *file* using the model identified by *model_checksum*.

    *model_url* is a short-lived signed S3 URL pointing to a .pt file.
    Image size is bounded by INFERENCE_PREDICT_MAX_SIZE_BYTES.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(min(1 << 20, _PREDICT_MAX_SIZE_BYTES - total + 1))
        if not chunk:
            break
        total += len(chunk)
        if total > _PREDICT_MAX_SIZE_BYTES:
            raise HTTPException(status_code=413, detail="Image exceeds configured size limit.")
        chunks.append(chunk)
    return await asyncio.to_thread(_predict_image, b"".join(chunks), model_url, model_checksum)


def _get_model(model_url: str, model_checksum: str):
    """Called under _model_lock so concurrent cache misses load only once."""
    model_checksum = model_checksum.lower()
    model, classes = None, {}
    if model_checksum in _model_cache:
        model, classes = _model_cache[model_checksum]
    else:
        try:
            tmp_path = _download_to_temp(model_url)
        except ValueError as exc:
            raise HTTPException(status_code=413, detail=str(exc)) from exc
        try:
            if _sha256_path(tmp_path) != model_checksum:
                raise HTTPException(status_code=422, detail="Downloaded model checksum does not match model_checksum.")
            # Keep only one model in memory after the downloaded bytes are verified.
            _model_cache.clear()
            model = _load_yolo_from_path(str(tmp_path))
            if getattr(model, "task", None) != "detect":
                raise HTTPException(
                    status_code=422,
                    detail="Downloaded model is not a detection model.",
                )
            classes = dict(model.names)
            _model_cache[model_checksum] = (model, classes)
        finally:
            tmp_path.unlink(missing_ok=True)
    return model, classes


def _predict_image(raw: bytes, model_url: str, model_checksum: str):
    try:
        img = Image.open(BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        width, height = img.size
        if width <= 0 or height <= 0 or width > _IMAGE_MAX_DIMENSION or height > _IMAGE_MAX_DIMENSION:
            raise HTTPException(status_code=413, detail="Image dimensions exceed configured limit.")
        if width * height > _IMAGE_MAX_PIXELS:
            raise HTTPException(status_code=413, detail="Image pixel count exceeds configured limit.")
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail="Invalid or unsupported image.") from exc

    # ------------------------------------------------------------------
    # 3. run inference
    # ------------------------------------------------------------------
    # Cache replacement and YOLO prediction share a lock: model instances are
    # mutable, and concurrent callers must not duplicate loads or predictions.
    with _model_lock:
        model, classes = _get_model(model_url, model_checksum)
        t0 = time.perf_counter()
        results = model.predict(
            img,
            conf=0.25,
            iou=0.70,
            max_det=300,
            verbose=False,
            save=False,
            project="/tmp/runs",
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # ------------------------------------------------------------------
    # 4. extract detections (xywhn normalized)
    # ------------------------------------------------------------------
    detections: list[dict[str, Any]] = []
    # results is a list; each element has .boxes (or None).
    for r in results:
        if r.boxes is None:
            continue
        # xywhn: normalized [x_center, y_center, width, height]
        for box in r.boxes:
            xywhn = box.xywhn[0].tolist() if hasattr(box, "xywhn") else []
            if len(xywhn) < 4:
                continue
            cls_id = int(box.cls.item()) if hasattr(box.cls, "item") else int(box.cls)
            conf = float(box.conf.item()) if hasattr(box.conf, "item") else float(box.conf)
            detections.append(
                {
                    "classId": cls_id,
                    "className": classes.get(cls_id, "unknown"),
                    "confidence": round(conf, 4),
                    "xCenter": round(float(xywhn[0]), 6),
                    "yCenter": round(float(xywhn[1]), 6),
                    "width": round(float(xywhn[2]), 6),
                    "height": round(float(xywhn[3]), 6),
                }
            )

    detections = _validate_detections(detections)

    return {
        "detections": detections,
        "width": width,
        "height": height,
        "inferenceMs": round(elapsed_ms, 2),
    }
